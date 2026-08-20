import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client"

export const registry = new Registry()

collectDefaultMetrics({ register: registry, prefix: "albots_process_" })

export const botUp = new Gauge({
    name: "albots_up",
    help: "1 if character socket is connected and ready",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botRip = new Gauge({
    name: "albots_rip",
    help: "1 if character is dead (rip)",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botPingMs = new Gauge({
    name: "albots_ping_ms",
    help: "Round-trip ping to game server in milliseconds",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botCc = new Gauge({
    name: "albots_cc",
    help: "Character load (cc)",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botInventoryEmpty = new Gauge({
    name: "albots_inventory_empty",
    help: "Empty inventory slots (esize)",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botLevel = new Gauge({
    name: "albots_level",
    help: "Character level (sampled every 5 minutes)",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botGold = new Gauge({
    name: "albots_gold",
    help: "Gold on character",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botXp = new Gauge({
    name: "albots_xp",
    help: "XP within current level (sampled every 5 minutes)",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botXpRatio = new Gauge({
    name: "albots_xp_ratio",
    help: "XP progress within current level (0–1, sampled every 5 minutes)",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botXpPerHour = new Gauge({
    name: "albots_xp_per_hour",
    help: "Estimated XP per hour from recent samples",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botGoldPerHour = new Gauge({
    name: "albots_gold_per_hour",
    help: "Estimated gold per hour from recent samples",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botState = new Gauge({
    name: "albots_state",
    help: "1 for the active strategy state_type label",
    labelNames: ["character", "ctype", "server", "state_type"] as const,
    registers: [registry],
})

export const botPartySize = new Gauge({
    name: "albots_party_size",
    help: "Party member count",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botChestsPending = new Gauge({
    name: "albots_chests_pending",
    help: "Chests visible and not yet opened",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botLimitDcTotal = new Gauge({
    name: "albots_limitdc_total",
    help: "Last limitdcreport total socket messages",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const botLimitDcLimit = new Gauge({
    name: "albots_limitdc_limit",
    help: "Last limitdcreport call limit (climit)",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const disconnectsTotal = new Counter({
    name: "albots_disconnects_total",
    help: "Socket disconnect events",
    labelNames: ["character", "ctype", "server", "reason"] as const,
    registers: [registry],
})

export const reconnectsTotal = new Counter({
    name: "albots_reconnects_total",
    help: "Successful bot reconnects after disconnect",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const damageDealtTotal = new Counter({
    name: "albots_damage_dealt_total",
    help: "Damage dealt to entities",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const damageTakenTotal = new Counter({
    name: "albots_damage_taken_total",
    help: "Damage taken by character",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const healDoneTotal = new Counter({
    name: "albots_heal_done_total",
    help: "Healing done to others",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const killsTotal = new Counter({
    name: "albots_kills_total",
    help: "Entity kills credited to character",
    labelNames: ["character", "ctype", "server", "source"] as const,
    registers: [registry],
})

export const monsterKillsTotal = new Counter({
    name: "albots_monster_kills_total",
    help: "Monster kills by type",
    labelNames: ["character", "ctype", "server", "monster"] as const,
    registers: [registry],
})

export const itemsLootedTotal = new Counter({
    name: "albots_items_looted_total",
    help: "Items received from chests and exchanges",
    labelNames: ["character", "ctype", "server", "item", "source"] as const,
    registers: [registry],
})

export const merchantOperationsTotal = new Counter({
    name: "albots_merchant_operations_total",
    help: "Merchant upgrade, compound, and exchange operations",
    labelNames: ["character", "operation", "result", "item", "received", "level"] as const,
    registers: [registry],
})

export const hitsTotal = new Counter({
    name: "albots_hits_total",
    help: "Hit events by result",
    labelNames: ["character", "ctype", "server", "result"] as const,
    registers: [registry],
})

export const chestsOpenedTotal = new Counter({
    name: "albots_chests_opened_total",
    help: "Chests opened by this character (opener)",
    labelNames: ["character", "ctype", "server", "party"] as const,
    registers: [registry],
})

export const lootGoldTotal = new Counter({
    name: "albots_loot_gold_total",
    help: "Gold from chest_opened events",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const lootItemsTotal = new Counter({
    name: "albots_loot_items_total",
    help: "Item slots received from chests opened by this character",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const lootNoSpaceTotal = new Counter({
    name: "albots_loot_no_space_total",
    help: "Failed chest opens due to full inventory",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const characterDeathsTotal = new Counter({
    name: "albots_character_deaths_total",
    help: "Character deaths by killer and map",
    labelNames: ["character", "ctype", "server", "cause", "map"] as const,
    registers: [registry],
})

export const gameErrorsTotal = new Counter({
    name: "albots_game_errors_total",
    help: "game_error socket events",
    labelNames: ["character", "ctype", "server"] as const,
    registers: [registry],
})

export const upgradesTotal = new Counter({
    name: "albots_upgrades_total",
    help: "Upgrade/compound/exchange results",
    labelNames: ["character", "ctype", "server", "type", "result"] as const,
    registers: [registry],
})

export const cryptsOpenedTotal = new Counter({
    name: "albots_crypts_opened_total",
    help: "Crypt instances opened (cryptkey spent, level-up wait started)",
    registers: [registry],
})

export const cryptsCompletedTotal = new Counter({
    name: "albots_crypts_completed_total",
    help: "Crypt runs finished after party left and merchant verify",
    labelNames: ["result"] as const,
    registers: [registry],
})

export const cryptActive = new Gauge({
    name: "albots_crypt_active",
    help: "1 while a crypt instance is active in MemoryStorage",
    registers: [registry],
})

export const cryptBossesSeen = new Gauge({
    name: "albots_crypt_bosses_seen",
    help: "Wanted crypt bosses seen this run",
    registers: [registry],
})

export const cryptBossesKilled = new Gauge({
    name: "albots_crypt_bosses_killed",
    help: "Wanted crypt bosses killed this run",
    registers: [registry],
})

export const cryptWaypointIndex = new Gauge({
    name: "albots_crypt_waypoint_index",
    help: "Current crypt route waypoint index (shared party progress)",
    registers: [registry],
})

export const cryptLevelUpWaitSeconds = new Gauge({
    name: "albots_crypt_level_up_wait_seconds",
    help: "Seconds until party assign after crypt open (0 if not waiting)",
    registers: [registry],
})

export const cryptSkipInProgress = new Gauge({
    name: "albots_crypt_skip_in_progress",
    help: "1 while skipcrypt is running",
    registers: [registry],
})

export type BotLabels = {
    character: string
    ctype: string
    server: string
}

export function botLabels(bot: { id: string; ctype: string; serverData?: { region?: string; name?: string } }): BotLabels {
    const region = bot.serverData?.region ?? "?"
    const name = bot.serverData?.name ?? "?"
    return {
        character: bot.id,
        ctype: bot.ctype ?? "?",
        server: `${region}${name}`,
    }
}

const STATE_TYPES = ["farm", "event", "boss", "quest", "crypt", "hazard", "unknown"] as const

export function setBotStateGauge(labels: BotLabels, stateType: string | undefined) {
    const active = stateType && STATE_TYPES.includes(stateType as typeof STATE_TYPES[number])
        ? stateType
        : "unknown"
    for (const st of STATE_TYPES) {
        botState.set({ ...labels, state_type: st }, st === active ? 1 : 0)
    }
}
