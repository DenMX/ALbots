import type { PingCompensatedCharacter } from "alclient"

const KILL_DEDUPE_MS = 15_000

export class EntityTypeCache {
    private types = new Map<string, string>()
    private recentKillIds = new Map<string, number>()

    noteEntities(bot: PingCompensatedCharacter) {
        for (const entity of bot.getEntities()) {
            if (entity?.id && entity.type) {
                this.types.set(entity.id, String(entity.type))
            }
        }
    }

    noteMonsterEntities(monsters: Array<{ id?: string; type?: string }> | undefined) {
        for (const monster of monsters ?? []) {
            if (monster?.id && monster.type) {
                this.types.set(monster.id, String(monster.type))
            }
        }
    }

    resolveMonsterType(bot: PingCompensatedCharacter, entityId: string | undefined): string | null {
        if (!entityId || entityId === bot.id) return null
        if (bot.getPlayers().some((p) => p.id === entityId || p.name === entityId)) return null

        const cached = this.types.get(entityId)
        if (cached) return cached

        const live = bot.getEntities().find((e) => e.id === entityId)
        if (live?.type) {
            this.types.set(entityId, String(live.type))
            return String(live.type)
        }
        return null
    }

    /** Returns true if this kill id was not counted recently. */
    wasRecentlyKilled(entityId: string): boolean {
        const now = Date.now()
        for (const [id, at] of this.recentKillIds) {
            if (now - at > KILL_DEDUPE_MS) this.recentKillIds.delete(id)
        }
        return this.recentKillIds.has(entityId)
    }

    markKill(entityId: string) {
        this.recentKillIds.set(entityId, Date.now())
    }
}

export function sanitizeMetricLabel(value: string, maxLen = 48): string {
    return value.replace(/[^a-zA-Z0-9_\-:+./]/g, "_").slice(0, maxLen) || "unknown"
}
