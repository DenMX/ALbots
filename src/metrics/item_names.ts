import type { PingCompensatedCharacter } from "alclient"
import { sanitizeMetricLabel } from "./entity_cache"

const PENDING_MERCHANT_TTL_MS = 60_000

type PendingMerchantItem = {
    item: string
    level: string
    operation: "upgrade" | "compound" | "exchange"
    at: number
}

export class PendingMerchantItems {
    private pending = new Map<string, PendingMerchantItem>()

    private key(botId: string, operation: PendingMerchantItem["operation"]) {
        return `${botId}:${operation}`
    }

    remember(
        botId: string,
        operation: PendingMerchantItem["operation"],
        item: string,
        level?: number | string,
    ) {
        const key = this.key(botId, operation)
        const existing = this.peek(botId, operation)
        const nextItem = sanitizeMetricLabel(item)
        const nextLevel = normalizeItemLevel(level)
        this.pending.set(key, {
            item: isUsableItemLabel(nextItem) ? nextItem : (existing?.item ?? nextItem),
            level: nextLevel !== "none" ? nextLevel : (existing?.level ?? "none"),
            operation,
            at: Date.now(),
        })
    }

    peek(botId: string, operation: PendingMerchantItem["operation"]): PendingMerchantItem | undefined {
        const entry = this.pending.get(this.key(botId, operation))
        if (!entry) return undefined
        if (Date.now() - entry.at > PENDING_MERCHANT_TTL_MS) return undefined
        return entry
    }

    take(botId: string, operation: PendingMerchantItem["operation"]): PendingMerchantItem | undefined {
        const key = this.key(botId, operation)
        const entry = this.pending.get(key)
        if (!entry) return undefined
        if (Date.now() - entry.at > PENDING_MERCHANT_TTL_MS) {
            this.pending.delete(key)
            return undefined
        }
        this.pending.delete(key)
        return entry
    }

    clear(botId: string) {
        for (const operation of ["upgrade", "compound", "exchange"] as const) {
            this.pending.delete(this.key(botId, operation))
        }
    }
}

/** Resolve internal item id from an inventory slot (handles upgrade/compound placeholders). */
export function itemInfoAtSlot(bot: PingCompensatedCharacter, slot: number | undefined): {
    name?: string
    level?: number
} {
    if (slot == null || slot < 0) return {}
    const item = bot.items[slot]
    if (!item) return {}
    if (item.name && item.name !== "placeholder") {
        return { name: String(item.name), level: item.level }
    }

    const placeholder = item.p
    if (typeof placeholder === "object" && placeholder !== null) {
        const p = placeholder as { name?: string; level?: number }
        const name = p.name && p.name !== "placeholder" ? String(p.name) : undefined
        return {
            name,
            level: typeof p.level === "number" ? p.level : item.level,
        }
    }
    return { level: item.level }
}

export function itemNameAtSlot(bot: PingCompensatedCharacter, slot: number | undefined): string | undefined {
    return itemInfoAtSlot(bot, slot).name
}

export function resolveItemMetricName(
    bot: PingCompensatedCharacter,
    slot: number | undefined,
    pending?: string,
): string {
    const fromPending = isUsableItemLabel(pending) ? pending : undefined
    const fromSlot = itemNameAtSlot(bot, slot)
    const fromLive = isUsableItemLabel(fromSlot) ? fromSlot : undefined
    return sanitizeMetricLabel(fromPending ?? fromLive ?? "unknown")
}

export function isUsableItemLabel(value: string | undefined): value is string {
    return !!value && value !== "unknown" && value !== "placeholder" && value !== "none"
}

export function resolveCraftLevel(
    pendingLevel?: string,
    attemptedLevel?: number,
    slotLevel?: number,
): string {
    if (pendingLevel && pendingLevel !== "none") return pendingLevel
    const fromAttempt = normalizeItemLevel(attemptedLevel)
    if (fromAttempt !== "none") return fromAttempt
    return normalizeItemLevel(slotLevel)
}

export function normalizeItemLevel(level: number | string | undefined): string {
    if (typeof level === "number" && Number.isFinite(level)) return String(Math.trunc(level))
    if (typeof level === "string" && /^\d+$/.test(level)) return level
    return "none"
}

/** game_log often uses display names — normalize common ones to item ids when obvious. */
export function itemNameFromGameLog(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return "unknown"
    return normalizeReceivedLabel(trimmed)
}

/** Normalize exchange output from game_log (e.g. "200,000 gold" → "200_000_gold"). */
export function normalizeReceivedLabel(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return "unknown"

    const goldMatch = /^([\d,._\s]+)\s*gold$/i.exec(trimmed)
    if (goldMatch) {
        const amount = goldMatch[1].replace(/[,\s._]/g, "")
        if (amount) return sanitizeMetricLabel(`${amount}_gold`)
    }

    if (/^[a-z0-9_]+$/i.test(trimmed)) return sanitizeMetricLabel(trimmed)

    const compact = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "")
    const aliases: Record<string, string> = {
        gemstonering: "cring",
        gemstoneearring: "cearring",
        gem0: "gem0",
        gem1: "gem1",
        gem2: "gem2",
        gem3: "gem3",
    }
    if (aliases[compact]) return aliases[compact]

    return sanitizeMetricLabel(trimmed)
}
