import type { PingCompensatedCharacter } from "alclient"
import type { StateController } from "../controllers/state_controller"
import type { MemoryStorage } from "../common_functions/memory_storage"
import type { IState } from "../controllers/state_interface"
import { loadMetricsConfig } from "./config"
import { MetricsCollector } from "./collector"
import { PersistentCounters } from "./persistent_counters"
import {
    characterDeathsTotal,
    itemsLootedTotal,
    merchantOperationsTotal,
    monsterKillsTotal,
} from "./registry"
import { startMetricsServer, type MetricsServerHandle } from "./server"

export type MetricsRuntime = {
    attachBot(bot: PingCompensatedCharacter, state?: IState): void
    detachBot(characterId: string): void
    recordReconnect(bot: PingCompensatedCharacter): void
    noteExchangeInput(bot: PingCompensatedCharacter, itemName: string): void
    noteCraftInput(bot: PingCompensatedCharacter, operation: "upgrade" | "compound" | "exchange", itemName: string, level?: number): void
    noteCraftResult(bot: PingCompensatedCharacter, operation: "upgrade" | "compound", success: boolean): void
    stop(): Promise<void>
}

let active: MetricsRuntime | null = null

export function getMetricsRuntime(): MetricsRuntime | null {
    return active
}

export function startMetrics(
    stateController: StateController,
    memoryStorage: MemoryStorage,
    credentialsPath = "./credentials.json",
): MetricsRuntime | null {
    const config = loadMetricsConfig(credentialsPath)
    if (!config.enabled) {
        console.log("Metrics: disabled (set metrics.enabled in credentials.json)")
        return null
    }

    const persistent = new PersistentCounters(config.statePath)
    persistent.load()
    persistent.restore("albots_merchant_operations_total", merchantOperationsTotal)
    persistent.restore("albots_character_deaths_total", characterDeathsTotal)
    persistent.restore("albots_items_looted_total", itemsLootedTotal)
    persistent.restore("albots_monster_kills_total", monsterKillsTotal)

    const collector = new MetricsCollector(stateController, memoryStorage, persistent)
    const server = startMetricsServer(config.host, config.port)
    persistent.startAutoSave(30_000)

    for (const strat of stateController.getBots) {
        try {
            const bot = strat?.getBot?.()
            if (bot) collector.attachBot(bot, strat)
        } catch {
            /* bot not ready */
        }
    }

    const pollTimer = setInterval(() => collector.pollAll(), config.pollIntervalMs)
    pollTimer.unref?.()

    const runtime: MetricsRuntime = {
        attachBot(bot, state) {
            collector.attachBot(bot, state)
        },
        detachBot(characterId) {
            collector.detachBot(characterId)
        },
        recordReconnect(bot) {
            collector.recordReconnect(bot)
        },
        noteExchangeInput(bot, itemName) {
            collector.noteExchangeInput(bot, itemName)
        },
        noteCraftInput(bot, operation, itemName, level) {
            collector.noteCraftInput(bot, operation, itemName, level)
        },
        noteCraftResult(bot, operation, success) {
            collector.noteCraftResult(bot, operation, success)
        },
        async stop() {
            clearInterval(pollTimer)
            collector.pollAll()
            persistent.stop()
            await server.stop()
            active = null
        },
    }

    active = runtime
    console.log(
        `Metrics: enabled on ${config.host}:${config.port}, poll ${config.pollIntervalMs}ms, state ${config.statePath}`,
    )
    return runtime
}
