import type { Counter } from "prom-client"
import type {
    ChestOpenedData,
    CharacterData,
    DeathData,
    EntitiesData,
    GameLogData,
    GameResponseData,
    HitData,
    LimitDCReportData,
    PingCompensatedCharacter,
    UpgradeData,
} from "alclient"
import type { Socket } from "socket.io-client"
import type { StateController } from "../controllers/state_controller"
import type { IState } from "../controllers/state_interface"
import { StateStrategy } from "../common_functions/state_strategy"
import type { MemoryStorage } from "../common_functions/memory_storage"
import {
    type BotLabels,
    botCc,
    botChestsPending,
    botGold,
    botGoldPerHour,
    botInventoryEmpty,
    botLabels,
    botLevel,
    botLimitDcLimit,
    botLimitDcTotal,
    botPartySize,
    botPingMs,
    botRip,
    botUp,
    botXp,
    botXpPerHour,
    botXpRatio,
    botState,
    characterDeathsTotal,
    chestsOpenedTotal,
    damageDealtTotal,
    damageTakenTotal,
    disconnectsTotal,
    gameErrorsTotal,
    healDoneTotal,
    hitsTotal,
    itemsLootedTotal,
    killsTotal,
    lootGoldTotal,
    lootItemsTotal,
    lootNoSpaceTotal,
    merchantOperationsTotal,
    monsterKillsTotal,
    reconnectsTotal,
    setBotStateGauge,
    upgradesTotal,
} from "./registry"
import { pollCryptMetrics } from "./crypt"
import { PersistentCounters } from "./persistent_counters"
import { EntityTypeCache, sanitizeMetricLabel } from "./entity_cache"
import {
    isUsableItemLabel,
    itemInfoAtSlot,
    itemNameFromGameLog,
    PendingMerchantItems,
    resolveCraftLevel,
    resolveItemMetricName,
} from "./item_names"

type RateSample = { t: number; xp: number; gold: number }

type SocketHandlers = {
    onHit: (data: HitData) => void
    onDeath: (data: DeathData) => void
    onEntities: (data: EntitiesData) => void
    onChestOpened: (data: ChestOpenedData) => void
    onGameResponse: (data: GameResponseData) => void
    onUpgrade: (data: UpgradeData) => void
    onGameLog: (data: GameLogData) => void
    onPlayer: (data: CharacterData) => void
    onGameError: (data: string | { message: string }) => void
    onLimitDc: (data: LimitDCReportData) => void
    onDisconnect: (data: unknown) => void
    onDisconnectReason: (data: unknown) => void
}

const RATE_WINDOW_MS = 10 * 60 * 1000
const XP_SAMPLE_MS = 5 * 60 * 1000
const DEATH_FLUSH_MS = 500
const DEATH_DEDUPE_MS = 8_000

type DeathCauseSource = "monster" | "slain" | "hit" | "rip"

type PendingDeath = {
    labels: BotLabels
    cause: string
    map: string
    priority: number
    timer: ReturnType<typeof setTimeout>
}

export class MetricsCollector {
    private handlers = new Map<string, SocketHandlers>()
    private rateSamples = new Map<string, RateSample[]>()
    private knownCharacters = new Set<string>()
    private labelByCharacter = new Map<string, BotLabels>()
    private entityCache = new EntityTypeCache()
    private pendingMerchantItems = new PendingMerchantItems()
    private pendingDeaths = new Map<string, PendingDeath>()
    private lastDeathAt = new Map<string, number>()
    private wasRip = new Map<string, boolean>()
    private lastXpSampleAt = new Map<string, number>()

    constructor(
        private stateController: StateController,
        private memoryStorage: MemoryStorage,
        private persistent?: PersistentCounters,
    ) {}

    attachBot(bot: PingCompensatedCharacter, state?: IState) {
        if (!bot?.socket || !bot.id) return
        this.detachBot(bot.id)

        const labels = botLabels(bot)
        this.knownCharacters.add(bot.id)
        this.labelByCharacter.set(bot.id, labels)

        const onHit = (data: HitData) => this.handleHit(bot, labels, data)
        const onDeath = (data: DeathData) => this.handleDeath(bot, labels, data)
        const onEntities = (data: EntitiesData) => this.handleEntities(data)
        const onChestOpened = (data: ChestOpenedData) => this.handleChestOpened(bot, labels, data)
        const onGameResponse = (data: GameResponseData) => this.handleGameResponse(bot, labels, data)
        const onUpgrade = (data: UpgradeData) => this.handleUpgrade(bot, labels, data)
        const onGameLog = (data: GameLogData) => this.handleGameLog(bot, labels, data)
        const onPlayer = (data: CharacterData) => this.handlePlayer(bot, labels, data)
        const onGameError = () => gameErrorsTotal.inc(labels)
        const onLimitDc = (data: LimitDCReportData) => this.handleLimitDc(labels, data)
        const onDisconnect = (data: unknown) => {
            const reason = normalizeReason(data)
            disconnectsTotal.inc({ ...labels, reason })
            botUp.set(labels, 0)
        }
        const onDisconnectReason = (data: unknown) => {
            disconnectsTotal.inc({ ...labels, reason: normalizeReason(data) })
            botUp.set(labels, 0)
        }

        const socket = bot.socket as Socket
        socket.on("hit", onHit)
        socket.on("death", onDeath)
        socket.on("entities", onEntities)
        socket.on("chest_opened", onChestOpened)
        socket.on("game_response", onGameResponse)
        socket.on("upgrade", onUpgrade)
        socket.on("game_log", onGameLog)
        socket.on("player", onPlayer)
        socket.on("game_error", onGameError)
        socket.on("limitdcreport", onLimitDc)
        socket.on("disconnect", onDisconnect)
        socket.on("disconnect_reason", onDisconnectReason)

        this.handlers.set(bot.id, {
            onHit,
            onDeath,
            onEntities,
            onChestOpened,
            onGameResponse,
            onUpgrade,
            onGameLog,
            onPlayer,
            onGameError,
            onLimitDc,
            onDisconnect,
            onDisconnectReason,
        })

        if (state) this.pollBot(bot, state)
    }

    detachBot(characterId: string) {
        const h = this.handlers.get(characterId)
        if (!h) return

        for (const strat of this.stateController.getBots) {
            const bot = strat?.getBot?.()
            if (bot?.id !== characterId || !bot.socket) continue
            const socket = bot.socket as Socket
            socket.off("hit", h.onHit)
            socket.off("death", h.onDeath)
            socket.off("entities", h.onEntities)
            socket.off("chest_opened", h.onChestOpened)
            socket.off("game_response", h.onGameResponse)
            socket.off("upgrade", h.onUpgrade)
            socket.off("game_log", h.onGameLog)
            socket.off("player", h.onPlayer)
            socket.off("game_error", h.onGameError)
            socket.off("limitdcreport", h.onLimitDc)
            socket.off("disconnect", h.onDisconnect)
            socket.off("disconnect_reason", h.onDisconnectReason)
            break
        }

        this.handlers.delete(characterId)
        this.rateSamples.delete(characterId)
        this.removeBotGauges(characterId)
        this.labelByCharacter.delete(characterId)
        this.pendingMerchantItems.clear(characterId)
        this.recentExchangeKeys.delete(characterId)
        this.flushCharacterDeath(characterId)
        this.lastDeathAt.delete(characterId)
        this.wasRip.delete(characterId)
        this.lastXpSampleAt.delete(characterId)
        this.knownCharacters.delete(characterId)
    }

    recordReconnect(bot: PingCompensatedCharacter) {
        reconnectsTotal.inc(botLabels(bot))
    }

    /** Called before bot.exchange(idx) — records input item for metrics. */
    noteExchangeInput(bot: PingCompensatedCharacter, itemName: string) {
        this.noteCraftInput(bot, "exchange", itemName)
    }

    noteCraftInput(
        bot: PingCompensatedCharacter,
        operation: "upgrade" | "compound" | "exchange",
        itemName: string,
        level?: number,
    ) {
        if (!bot?.id || !itemName) return
        const craftLevel = operation === "exchange" ? level : (level ?? 0)
        this.pendingMerchantItems.remember(bot.id, operation, itemName, craftLevel)
    }

    noteCraftResult(bot: PingCompensatedCharacter, operation: "upgrade" | "compound", success: boolean) {
        if (!bot?.id) return
        this.recordMerchantOp(bot, botLabels(bot), operation, success ? "success" : "fail")
    }

    pollAll() {
        const active = new Set<string>()

        for (const strat of this.stateController.getBots) {
            let bot: PingCompensatedCharacter | undefined
            try {
                bot = strat?.getBot?.()
            } catch {
                continue
            }
            if (!bot?.id) continue
            active.add(bot.id)
            if (!this.handlers.has(bot.id)) this.attachBot(bot, strat)
            this.pollBot(bot, strat)
        }

        for (const id of [...this.knownCharacters]) {
            if (!active.has(id)) this.detachBot(id)
        }

        pollCryptMetrics(this.memoryStorage)
    }

    private pollBot(bot: PingCompensatedCharacter, state?: IState) {
        this.entityCache.noteEntities(bot)
        const qExchange = bot.q?.exchange
        if (qExchange?.name) {
            this.pendingMerchantItems.remember(bot.id, "exchange", String(qExchange.name))
        }
        const qUpgrade = bot.q?.upgrade
        if (qUpgrade) {
            const info = itemInfoAtSlot(bot, qUpgrade.num)
            if (info.name) this.pendingMerchantItems.remember(bot.id, "upgrade", info.name, info.level)
        }
        const qCompound = bot.q?.compound
        if (qCompound) {
            let info = itemInfoAtSlot(bot, qCompound.num)
            if (!info.name && qCompound.nums?.[0] != null) {
                info = itemInfoAtSlot(bot, qCompound.nums[0])
            }
            if (info.name) this.pendingMerchantItems.remember(bot.id, "compound", info.name, info.level)
        }
        const labels = botLabels(bot)
        const connected = !!(bot.ready && bot.socket?.connected)
        botUp.set(labels, connected ? 1 : 0)
        const rip = !!bot.rip
        const wasRip = this.wasRip.get(bot.id)
        this.wasRip.set(bot.id, rip)
        if (rip && wasRip === false) this.recordCharacterDeath(bot, labels, "unknown", "rip")
        botRip.set(labels, rip ? 1 : 0)
        botPingMs.set(labels, bot.ping ?? 0)
        botCc.set(labels, bot.cc ?? 0)
        botInventoryEmpty.set(labels, bot.esize ?? 0)
        botGold.set(labels, bot.gold ?? 0)
        botChestsPending.set(labels, bot.chests?.size ?? 0)
        botPartySize.set(labels, bot.partyData?.list?.length ?? 0)

        const rates = this.updateRates(bot.id, bot.xp ?? 0, bot.gold ?? 0)
        botGoldPerHour.set(labels, rates.goldPerHour)
        if (this.shouldSampleXp(bot.id)) {
            botLevel.set(labels, bot.level ?? 0)
            botXp.set(labels, bot.xp ?? 0)
            const maxXp = bot.max_xp ?? 0
            botXpRatio.set(labels, maxXp > 0 ? (bot.xp ?? 0) / maxXp : 0)
            botXpPerHour.set(labels, rates.xpPerHour)
        }

        let stateType: string | undefined
        if (state instanceof StateStrategy) {
            stateType = state.currentState?.state_type
        } else if (state) {
            stateType = state.getStateType?.()
        }
        setBotStateGauge(labels, stateType)
    }

    private updateRates(characterId: string, xp: number, gold: number) {
        const now = Date.now()
        let samples = this.rateSamples.get(characterId) ?? []
        samples.push({ t: now, xp, gold })
        const cutoff = now - RATE_WINDOW_MS
        samples = samples.filter((s) => s.t >= cutoff)
        this.rateSamples.set(characterId, samples)

        if (samples.length < 2) return { xpPerHour: 0, goldPerHour: 0 }

        const first = samples[0]
        const last = samples[samples.length - 1]
        const dt = last.t - first.t
        if (dt <= 0) return { xpPerHour: 0, goldPerHour: 0 }

        const xpPerHour = ((last.xp - first.xp) * 3_600_000) / dt
        const goldPerHour = ((last.gold - first.gold) * 3_600_000) / dt
        return { xpPerHour, goldPerHour }
    }

    private shouldSampleXp(botId: string): boolean {
        const now = Date.now()
        const last = this.lastXpSampleAt.get(botId) ?? 0
        if (now - last < XP_SAMPLE_MS) return false
        this.lastXpSampleAt.set(botId, now)
        return true
    }

    private handleEntities(data: EntitiesData) {
        this.entityCache.noteMonsterEntities(data.monsters)
    }

    private noteMonsterKill(bot: PingCompensatedCharacter, labels: BotLabels, entityId: string | undefined) {
        if (!entityId || this.entityCache.wasRecentlyKilled(entityId)) return
        const monster = this.entityCache.resolveMonsterType(bot, entityId)
        if (!monster) return
        this.entityCache.markKill(entityId)
        this.incPersistent("albots_monster_kills_total", {
            ...labels,
            monster: sanitizeMetricLabel(monster),
        }, monsterKillsTotal)
    }

    private handleHit(bot: PingCompensatedCharacter, labels: BotLabels, data: HitData) {
        if (data.miss) {
            if (data.hid === bot.id) hitsTotal.inc({ ...labels, result: "miss" })
            return
        }
        if (data.evade) {
            if (data.id === bot.id) hitsTotal.inc({ ...labels, result: "evade" })
            return
        }
        if (data.reflect) return

        if (data.hid === bot.id) {
            if (data.damage) damageDealtTotal.inc(labels, data.damage)
            if (data.heal) healDoneTotal.inc(labels, data.heal)
            if (data.kill) {
                killsTotal.inc({ ...labels, source: "hit" })
                this.noteMonsterKill(bot, labels, data.id)
            }
            if (data.damage || data.heal) hitsTotal.inc({ ...labels, result: "hit" })
        }

        if (data.id === bot.id) {
            if (data.damage) damageTakenTotal.inc(labels, data.damage)
            if (data.kill) {
                killsTotal.inc({ ...labels, source: "death" })
                const monster = data.hid ? this.entityCache.resolveMonsterType(bot, data.hid) : null
                if (monster) {
                    this.recordCharacterDeath(bot, labels, monster, "monster")
                } else {
                    this.recordCharacterDeath(bot, labels, this.resolveKillerCause(bot, data.hid), "hit")
                }
                botRip.set(labels, 1)
            }
        }
    }

    private resolveKillerCause(bot: PingCompensatedCharacter, hid?: string): string {
        if (!hid) return "combat"
        const monster = this.entityCache.resolveMonsterType(bot, hid)
        if (monster) return monster
        if (hid === bot.id) return "self"
        const player = bot.getPlayers().find((p) => p.id === hid)
        if (player?.id) return player.id
        return hid
    }

    private deathCausePriority(source: DeathCauseSource): number {
        if (source === "monster") return 4
        if (source === "slain") return 3
        if (source === "hit") return 2
        return 1
    }

    private recordCharacterDeath(
        bot: PingCompensatedCharacter,
        labels: BotLabels,
        cause: string,
        source: DeathCauseSource,
    ) {
        if (!bot?.id) return
        const now = Date.now()
        const pending = this.pendingDeaths.get(bot.id)
        if (!pending && now - (this.lastDeathAt.get(bot.id) ?? 0) < DEATH_DEDUPE_MS) return

        const map = sanitizeMetricLabel(String(bot.map ?? "unknown"), 32)
        const normalized = sanitizeMetricLabel(cause || "unknown")
        const priority = this.deathCausePriority(source)

        if (pending) {
            if (priority > pending.priority || (isWeakDeathCause(pending.cause) && !isWeakDeathCause(normalized))) {
                pending.cause = normalized
                pending.priority = Math.max(pending.priority, priority)
            }
            if (map !== "unknown") pending.map = map
            return
        }

        const next: PendingDeath = {
            labels: { ...labels },
            cause: normalized,
            map,
            priority,
            timer: setTimeout(() => this.flushCharacterDeath(bot.id), DEATH_FLUSH_MS),
        }
        next.timer.unref?.()
        this.pendingDeaths.set(bot.id, next)
    }

    private flushCharacterDeath(characterId: string) {
        const pending = this.pendingDeaths.get(characterId)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pendingDeaths.delete(characterId)
        this.lastDeathAt.set(characterId, Date.now())
        this.incPersistent("albots_character_deaths_total", {
            ...pending.labels,
            cause: pending.cause,
            map: pending.map,
        }, characterDeathsTotal)
    }

    private handleDeath(bot: PingCompensatedCharacter, labels: BotLabels, data: DeathData) {
        if (!data.points?.[bot.id]) return
        this.noteMonsterKill(bot, labels, data.id)
    }

    private handleChestOpened(bot: PingCompensatedCharacter, labels: BotLabels, data: ChestOpenedData) {
        if ("gone" in data && data.gone) return
        if (!("opener" in data)) return

        const isOpener = isBotRecipient(data.opener, bot)
        let lootedByThisBot = 0

        if (data.items?.length) {
            for (const raw of data.items) {
                const item = raw as { name?: string; item?: string; q?: number; looter?: string }
                const recipient = item.looter || data.opener
                if (!isBotRecipient(recipient, bot)) continue
                const name = sanitizeMetricLabel(item.name ?? item.item ?? "unknown")
                const qty = Math.max(1, item.q ?? 1)
                this.incPersistent("albots_items_looted_total", { ...labels, item: name, source: "chest" }, itemsLootedTotal, qty)
                lootedByThisBot += qty
            }
        }

        if (!isOpener) return

        chestsOpenedTotal.inc({
            ...labels,
            party: data.party ? "true" : "false",
        })
        if (data.gold) lootGoldTotal.inc(labels, data.gold)
        if (lootedByThisBot > 0) lootItemsTotal.inc(labels, lootedByThisBot)
    }

    private handleGameResponse(bot: PingCompensatedCharacter, labels: BotLabels, data: GameResponseData) {
        if (typeof data === "string") {
            if (data === "loot_no_space") lootNoSpaceTotal.inc(labels)
            return
        }
        if (data.response === "defeated_by_a_monster") {
            this.recordCharacterDeath(
                bot,
                labels,
                String(data.monster ?? "unknown"),
                "monster",
            )
            return
        }

        if (data.response === "upgrade_chance" || data.response === "compound_chance") {
            const operation = data.response === "compound_chance" ? "compound" : "upgrade"
            const itemName = data.item?.name
            if (itemName && labels.ctype === "merchant") {
                this.pendingMerchantItems.remember(bot.id, operation, itemName, data.item?.level)
            }
            return
        }

        if (
            data.response === "upgrade_success"
            || data.response === "upgrade_fail"
            || data.response === "compound_success"
            || data.response === "compound_fail"
        ) {
            const operation = data.response.startsWith("compound") ? "compound" : "upgrade"
            const result = data.response.endsWith("success") ? "success" : "fail"
            upgradesTotal.inc({ ...labels, type: operation, result })
            this.recordMerchantOp(bot, labels, operation, result, data.num, data.level)
        }
    }

    private handleUpgrade(bot: PingCompensatedCharacter, labels: BotLabels, data: UpgradeData) {
        const operation = sanitizeMetricLabel(data.type ?? "unknown")
        const result = data.success ? "success" : "fail"
        upgradesTotal.inc({
            ...labels,
            type: operation,
            result,
        })
        if (labels.ctype !== "merchant") return
        if (operation === "upgrade" || operation === "compound") {
            this.recordMerchantOp(bot, labels, operation, result)
            return
        }
        if (operation !== "exchange" || data.success) return
        this.recordMerchantOp(bot, labels, "exchange", "fail")
    }

    /** Upgrade/compound/exchange results often arrive inside player hitchhikers, not direct socket events. */
    private handlePlayer(bot: PingCompensatedCharacter, labels: BotLabels, data: CharacterData) {
        for (const hitchhiker of data.hitchhikers ?? []) {
            const [event, payload] = hitchhiker
            if (event === "game_response") {
                this.handleGameResponse(bot, labels, payload as GameResponseData)
            } else if (event === "game_log") {
                this.handleGameLog(bot, labels, payload as GameLogData)
            }
        }
    }

    private recentExchangeKeys = new Map<string, number>()
    private recentMerchantOpKeys = new Map<string, number>()

    private recordMerchantOp(
        bot: PingCompensatedCharacter,
        labels: BotLabels,
        operation: "upgrade" | "compound" | "exchange",
        result: "success" | "fail",
        slot?: number,
        attemptedLevel?: number,
    ) {
        if (labels.ctype !== "merchant") return
        const pending = this.pendingMerchantItems.peek(bot.id, operation)
        const slotInfo = itemInfoAtSlot(bot, slot)
        const item = resolveItemMetricName(bot, slot, pending?.item)
        const level = operation === "exchange"
            ? "none"
            : resolveCraftLevel(pending?.level, attemptedLevel, slotInfo.level)

        // Socket `upgrade` / hitchhikers often arrive after the slot is already empty.
        // Don't emit a junk series — wait for the call-site pending item+level.
        if (operation !== "exchange") {
            if (!isUsableItemLabel(item)) return
            if (level === "none") return
        }

        const dedupeKey = `${bot.id}:${operation}:${result}:${item}:${level}`
        const now = Date.now()
        if (now - (this.recentMerchantOpKeys.get(dedupeKey) ?? 0) < 2_000) return
        this.recentMerchantOpKeys.set(dedupeKey, now)
        this.pendingMerchantItems.take(bot.id, operation)

        this.incPersistent("albots_merchant_operations_total", {
            character: labels.character,
            operation,
            result,
            item,
            received: "none",
            level,
        }, merchantOperationsTotal)
    }

    private recordExchangeSuccess(
        bot: PingCompensatedCharacter,
        labels: BotLabels,
        receivedRaw: string,
    ) {
        const pending = this.pendingMerchantItems.take(bot.id, "exchange")
        if (!pending) return

        const received = itemNameFromGameLog(receivedRaw)
        const dedupeKey = `${bot.id}:${pending.item}:${received}`
        const now = Date.now()
        if (now - (this.recentExchangeKeys.get(dedupeKey) ?? 0) < 2_000) return
        this.recentExchangeKeys.set(dedupeKey, now)

        this.incPersistent("albots_items_looted_total", { ...labels, item: received, source: "exchange" }, itemsLootedTotal)
        if (labels.ctype !== "merchant") return
        this.incPersistent("albots_merchant_operations_total", {
            character: labels.character,
            operation: "exchange",
            result: "success",
            item: pending.item,
            received,
            level: "none",
        }, merchantOperationsTotal)
    }

    private handleGameLog(bot: PingCompensatedCharacter, labels: BotLabels, data: GameLogData) {
        const message = gameLogMessage(data)
        if (!message) return
        const slain = /^Slain by (.+)$/.exec(message)
        if (slain) {
            this.recordCharacterDeath(bot, labels, slain[1], "slain")
            return
        }

        if (!this.pendingMerchantItems.peek(bot.id, "exchange")) return

        const itemReceived = /^Received (?:a |an )(.+?)(?:\s+\(|$|!|\.)/i.exec(message)
        const goldReceived = /^Received ([\d,._\s]+ gold)$/i.exec(message)
        const receivedRaw = itemReceived?.[1]?.trim() ?? goldReceived?.[1]?.trim()
        if (receivedRaw) {
            this.recordExchangeSuccess(bot, labels, receivedRaw)
        }
    }

    private handleLimitDc(labels: BotLabels, data: LimitDCReportData) {
        if (typeof data.total === "number") botLimitDcTotal.set(labels, data.total)
        if (typeof data.climit === "number") botLimitDcLimit.set(labels, data.climit)
    }

    private incPersistent(
        name: string,
        labels: Record<string, string>,
        counter: Counter<string>,
        delta = 1,
    ) {
        if (this.persistent) {
            this.persistent.inc(name, labels, counter, delta)
            return
        }
        counter.inc(labels, delta)
    }

    private removeBotGauges(characterId: string) {
        const labels = this.labelByCharacter.get(characterId)
        if (!labels) return
        botUp.remove(labels)
        botRip.remove(labels)
        botPingMs.remove(labels)
        botCc.remove(labels)
        botInventoryEmpty.remove(labels)
        botLevel.remove(labels)
        botGold.remove(labels)
        botXp.remove(labels)
        botXpRatio.remove(labels)
        botXpPerHour.remove(labels)
        botGoldPerHour.remove(labels)
        botPartySize.remove(labels)
        botChestsPending.remove(labels)
        botLimitDcTotal.remove(labels)
        botLimitDcLimit.remove(labels)
        for (const st of ["farm", "event", "boss", "quest", "crypt", "hazard", "unknown"]) {
            botState.remove({ ...labels, state_type: st })
        }
    }
}

function isWeakDeathCause(cause: string): boolean {
    return cause === "combat" || cause === "unknown" || cause === "self" || /^\d+$/.test(cause)
}

function normalizeReason(data: unknown): string {
    if (data == null) return "unknown"
    if (typeof data === "string") return data.slice(0, 64)
    try {
        return JSON.stringify(data).slice(0, 64)
    } catch {
        return "unknown"
    }
}

function gameLogMessage(data: GameLogData): string | null {
    if (typeof data === "string") return data
    if (typeof data === "object" && data && "message" in data && typeof data.message === "string") {
        return data.message
    }
    return null
}

function isBotRecipient(recipient: string | undefined, bot: PingCompensatedCharacter): boolean {
    if (!recipient) return false
    const botAny = bot as PingCompensatedCharacter & { name?: string; characterID?: string }
    return recipient === bot.id
        || recipient === botAny.name
        || recipient === botAny.characterID
}
