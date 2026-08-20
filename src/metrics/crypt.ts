import type { MemoryStorage } from "../common_functions/memory_storage"
import {
    cryptActive,
    cryptBossesKilled,
    cryptBossesSeen,
    cryptLevelUpWaitSeconds,
    cryptSkipInProgress,
    cryptWaypointIndex,
    cryptsCompletedTotal,
    cryptsOpenedTotal,
} from "./registry"

export function recordCryptOpened() {
    cryptsOpenedTotal.inc()
}

export function recordCryptCompleted(result: "clean" | "recleared" | "failed" | "unknown") {
    cryptsCompletedTotal.inc({ result })
}

export function pollCryptMetrics(memoryStorage: MemoryStorage) {
    const activeId = memoryStorage.getActiveCryptInstance
    cryptActive.set(activeId ? 1 : 0)

    const progress = memoryStorage.getCryptWantedProgress()
    cryptBossesSeen.set(progress.seen)
    cryptBossesKilled.set(progress.killed)
    cryptWaypointIndex.set(memoryStorage.getCryptWaypointIndex)

    const waitMs = memoryStorage.getCryptLevelUpRemainingMs
    cryptLevelUpWaitSeconds.set(waitMs > 0 ? waitMs / 1000 : 0)
    cryptSkipInProgress.set(memoryStorage.isCryptSkipInProgress ? 1 : 0)
}
