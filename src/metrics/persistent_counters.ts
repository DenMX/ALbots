import fs from "fs"
import type { Counter } from "prom-client"

type StoredCounter = {
    name: string
    labels: Record<string, string>
    value: number
}

type StoreFile = {
    counters?: StoredCounter[]
    savedAt?: string
}

export class PersistentCounters {
    private totals = new Map<string, number>()
    private dirty = false
    private saveTimer?: ReturnType<typeof setInterval>

    constructor(private filePath: string) {}

    static key(name: string, labels: Record<string, string>): string {
        const parts = Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`)
        return `${name}|${parts.join("|")}`
    }

    load() {
        try {
            const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as StoreFile
            if (!Array.isArray(raw.counters)) return
            for (const row of raw.counters) {
                if (!row?.name || typeof row.value !== "number" || row.value <= 0) continue
                if (!row.labels || typeof row.labels !== "object") continue
                this.totals.set(PersistentCounters.key(row.name, row.labels), row.value)
            }
        } catch {
            /* first run */
        }
    }

    restore(name: string, counter: Counter<string>) {
        for (const [key, value] of this.totals) {
            if (!key.startsWith(`${name}|`)) continue
            const labels = PersistentCounters.labelsFromKey(key, name)
            counter.inc(labels, value)
        }
    }

    inc(name: string, labels: Record<string, string>, counter: Counter<string>, delta = 1) {
        if (delta <= 0) return
        counter.inc(labels, delta)
        const key = PersistentCounters.key(name, labels)
        this.totals.set(key, (this.totals.get(key) ?? 0) + delta)
        this.dirty = true
    }

    save() {
        if (!this.dirty) return
        const counters: StoredCounter[] = []
        for (const [key, value] of this.totals) {
            if (value <= 0) continue
            const sep = key.indexOf("|")
            if (sep <= 0) continue
            const name = key.slice(0, sep)
            counters.push({
                name,
                labels: PersistentCounters.labelsFromKey(key, name),
                value,
            })
        }
        counters.sort((a, b) => PersistentCounters.key(a.name, a.labels).localeCompare(
            PersistentCounters.key(b.name, b.labels),
        ))
        const payload: StoreFile = { counters, savedAt: new Date().toISOString() }
        fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2))
        this.dirty = false
    }

    startAutoSave(intervalMs = 30_000) {
        this.saveTimer = setInterval(() => this.save(), intervalMs)
        this.saveTimer.unref?.()
    }

    stop() {
        if (this.saveTimer) clearInterval(this.saveTimer)
        this.save()
    }

    private static labelsFromKey(key: string, name: string): Record<string, string> {
        const prefix = `${name}|`
        const labels: Record<string, string> = {}
        if (!key.startsWith(prefix)) return labels
        const rest = key.slice(prefix.length)
        if (!rest) return labels
        for (const part of rest.split("|")) {
            const eq = part.indexOf("=")
            if (eq <= 0) continue
            labels[part.slice(0, eq)] = part.slice(eq + 1)
        }
        return labels
    }
}
