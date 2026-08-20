import { BankInfo, BankModel, Database, PingCompensatedCharacter, ServerIdentifier, ServerRegion, MonsterName, ItemName } from "alclient";
import fs from "fs"
import { StateController } from "../controllers/state_controller";
import { ActiveCryptModel } from "../database/active_crypt/active_crypt.model";
import { isCryptWantedMonster } from "../configs/events_and_spots";
import { debugLog } from "./common_functions";
import { recordCryptOpened } from "../metrics/crypt";

export const DEFAULT_SERVER_REGION: ServerRegion = "ASIA"
export const DEFAULT_SERVER_NAME: ServerIdentifier = "I"

export class MemoryStorage {
    
    private bank: BankInfo

    private lastDepositGold: number

    private readonly DEPOSIT_GOLD_THRESHOLD: number = 3_600_000; // 1 hour

    private secretKey: string

    private default_party_leader: string = "Archealer"

    private current_party_leader: string

    private default_tank: string = "Archealer"

    private current_tank: string

    private default_looter: string = this.default_tank

    private current_looter: string 

    private stateController: StateController

    /** Active crypt instance id (`character.in`) shared with party */
    private activeCryptInstance: string | undefined

    /** Last finished instance — blocks combat ticks from re-activating the same id */
    private finishedCryptInstanceId: string | undefined

    /** Shared crypt route progress — all combat bots rally/advance together */
    private cryptWaypointIndex = 0

    private cryptDbReady = false

    /**
     * Bumped on skipcrypt. Combat bots ignore/restore only matching generation,
     * so in-flight handleCryptState can't revive the skipped instance.
     */
    private cryptGeneration = 0

    /** True while merchant is skipping / opening a replacement crypt. */
    private cryptSkipInProgress = false

    /**
     * Until this timestamp, crypt is open/active but party must not enter —
     * waiting for mobs to level up after open. Persisted to Mongo. 0 = cleared.
     */
    private cryptLevelUpUntil = 0

    /** Epoch ms when the active crypt was opened (persisted). */
    private cryptOpenedAt = 0

    /** Wanted crypt boss entity ids seen this run */
    private cryptWantedSeenIds = new Set<string>()
    /** Wanted crypt boss entity ids confirmed dead this run */
    private cryptWantedKilledIds = new Set<string>()

    /** firehazard run: character applying burn + weapon being titled */
    private hazardRunner: string | undefined
    private hazardWeapon: ItemName | undefined
    /** Latest firehazard progress for the runner (equip title weapon before last kill). */
    private hazardCount = 0
    private hazardNeeded = 20_000

    constructor() {
        this.loadBankFromMongo = this.loadBankFromMongo.bind(this)
        this.updateBank = this.updateBank.bind(this)
        this.loadActiveCryptFromMongo = this.loadActiveCryptFromMongo.bind(this)
        this.persistActiveCryptToMongo = this.persistActiveCryptToMongo.bind(this)
        
        let credentialFile = fs.readFileSync(`./credentials.json`, 'utf-8')
        this.secretKey = JSON.parse(credentialFile).apiToken

        this.current_party_leader = this.default_party_leader
        this.current_tank = this.default_tank
        this.current_looter = this.default_looter

        this.loadBankFromMongo().catch(console.warn)
        this.loadActiveCryptFromMongo().catch(console.warn)
    }

    private safeFetch(url: string, settings: RequestInit, label: string) {
        fetch(url, settings)
            .then((response) => console.log(`${label}: ${response.status}`))
            .catch((ex) => console.warn(`${label} failed: ${ex}`))
    }

    public addEventListners(bot: PingCompensatedCharacter) {
        if(this.secretKey == "") {
            return console.error("Add apiToken in credentials file!")
        }
        bot.socket.on("new_map", () => this.updateBank(bot))
        bot.socket.once("tracker", (data) => {
            const url = `https://aldata.earthiverse.ca/achievements/${bot.id}/${this.secretKey}`;
            const settings = {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ max: data.max, monsters: data.monsters }),
            };
            this.safeFetch(url, settings, `Sending tracker info for ${bot.id}`)
            });
        bot.socket.emit("tracker");
    }

    private async loadBankFromMongo() {
        if(!this.stateController?.getBots.length || this.stateController?.getBots.length<1) return setTimeout(this.loadBankFromMongo, 500)
        if(Database.connection) {
            const doc = await BankModel.findOne( {
                owner: this.stateController?.getBots[0]?.getBot?.()?.owner
            }).lean<BankInfo>() ?? null
            // Keep only pack data in memory — meta fields break ALData lastUpdated if re-PUTed
            this.bank = doc ? this.bankPayloadForApi(doc) : null
            // console.debug(`Bank loaded from MONGO\nCurrent bank: ${JSON.stringify(this.bank)}`)
            setTimeout(this.loadBankFromMongo, 5000)
        }
    }

    private async loadActiveCryptFromMongo() {
        if (!Database.connection) return setTimeout(this.loadActiveCryptFromMongo, 500)
        try {
            const doc = await ActiveCryptModel.findOne({ key: "crypt" }).lean<{
                active?: boolean
                instanceId?: string
                levelUpUntil?: number
                openedAt?: number
            }>()
            if (doc?.active && doc.instanceId) {
                this.activeCryptInstance = doc.instanceId
                // Always restart route from the beginning after client load
                this.cryptWaypointIndex = 0
                this.cryptOpenedAt = doc.openedAt ?? 0
                // Keep until even if expired — merchant still needs to assign party
                this.cryptLevelUpUntil = doc.levelUpUntil ?? 0
                if (this.cryptLevelUpUntil > Date.now()) {
                    console.debug(
                        `Loaded active crypt from DB: ${doc.instanceId} (level-up wait ${Math.round((this.cryptLevelUpUntil - Date.now()) / 60_000)}m left)`,
                    )
                } else if (this.cryptLevelUpUntil > 0) {
                    console.debug(
                        `Loaded active crypt from DB: ${doc.instanceId} (level-up wait done, party assign pending)`,
                    )
                } else {
                    console.debug(`Loaded active crypt from DB: ${doc.instanceId}`)
                }
            } else {
                this.activeCryptInstance = undefined
                this.cryptWaypointIndex = 0
                this.cryptLevelUpUntil = 0
                this.cryptOpenedAt = 0
            }
            this.cryptDbReady = true
        } catch (ex) {
            console.warn(`loadActiveCryptFromMongo: ${ex}`)
            setTimeout(this.loadActiveCryptFromMongo, 1000)
        }
    }

    private async persistActiveCryptToMongo() {
        if (!Database.connection) return
        try {
            const active = !!this.activeCryptInstance
            await ActiveCryptModel.findOneAndUpdate(
                { key: "crypt" },
                {
                    key: "crypt",
                    active,
                    instanceId: this.activeCryptInstance,
                    levelUpUntil: active ? this.cryptLevelUpUntil : 0,
                    openedAt: active ? (this.cryptOpenedAt || undefined) : undefined,
                    updatedAt: new Date(),
                },
                { upsert: true, new: true },
            ).exec()
        } catch (ex) {
            console.warn(`persistActiveCryptToMongo: ${ex}`)
        }
    }

    /** Wait until DB active-crypt flag has been loaded (for merchant open check). */
    public async ensureActiveCryptLoaded(timeoutMs = 15_000): Promise<void> {
        const started = Date.now()
        while (!this.cryptDbReady && Date.now() - started < timeoutMs) {
            await new Promise(r => setTimeout(r, 100))
            if (!this.cryptDbReady && Database.connection) {
                await this.loadActiveCryptFromMongo()
            }
        }
    }

    public set setStateController(stateController: StateController) {
        this.stateController = stateController
    }

    public get getStateController() {
        return this.stateController
    }

    public get getCurrentPartyLeader() {
        return this.current_party_leader
    }

    public get getDefaultPartyLeader() {
        return this.default_party_leader
    }

    public get getDefaultTank() {
        return this.default_tank
    }

    public get getCurrentTank() {
        return this.current_tank
    }

    public get getDefaultLooter() {
        return this.default_looter
    }

    public get getCurrentLooter() {
        return this.current_looter
    }

    public set setCurrentPartyLeader(value: string) {
        this.current_party_leader = value
    }

    public set setCurrentTank(value: string) {
        this.current_tank = value
        this.current_looter = value
    } 

    public get getBank() {
        return this.bank
    }

    public get getActiveCryptInstance() {
        return this.activeCryptInstance
    }

    public isCryptInstanceFinished(instanceId: string | undefined): boolean {
        return !!instanceId && instanceId === this.finishedCryptInstanceId
    }

    /** Last released instance — recall of same id keeps route; a different id resets. */
    private lastReleasedCryptInstance: string | undefined

    /**
     * Party left the crypt for merchant verify / farm — clear active flag but allow
     * the same instanceId to be reassigned (reclear / recall).
     */
    public releaseActiveCrypt(instanceId?: string) {
        this.lastReleasedCryptInstance = instanceId ?? this.activeCryptInstance
        this.activeCryptInstance = undefined
        this.cryptLevelUpUntil = 0
        this.cryptOpenedAt = 0
        // Keep waypoint + wanted tracking so a merchant recall can resume the route
        this.persistActiveCryptToMongo().catch(console.warn)
    }

    /**
     * Merchant confirmed this crypt is done (or skip). Blocks accidental revive until
     * a different instance is opened; same id can still be force-reopened via assign.
     */
    public finishActiveCrypt(instanceId?: string) {
        const id = instanceId ?? this.activeCryptInstance
        if (id) this.finishedCryptInstanceId = id
        this.lastReleasedCryptInstance = undefined
        this.activeCryptInstance = undefined
        this.cryptLevelUpUntil = 0
        this.cryptOpenedAt = 0
        this.cryptWaypointIndex = 0
        this.resetCryptWantedTracking()
        this.persistActiveCryptToMongo().catch(console.warn)
    }

    /** Merchant reopen / assign — always wins over finished; keeps route on same-id resume. */
    public reopenActiveCrypt(instanceId: string) {
        if (this.cryptSkipInProgress) return
        const prevActive = this.activeCryptInstance
        this.finishedCryptInstanceId = undefined
        const resumeSame =
            prevActive === instanceId
            || (!prevActive && this.lastReleasedCryptInstance === instanceId)
        if (!resumeSame) {
            // Fresh crypt after leave/release of another instance — don't inherit 10/10 wanted
            this.cryptWaypointIndex = 0
            this.resetCryptWantedTracking()
            this.cryptGeneration++
        }
        this.lastReleasedCryptInstance = undefined
        this.activeCryptInstance = instanceId
        this.persistActiveCryptToMongo().catch(console.warn)
    }

    public set setActiveCryptInstance(instanceId: string | undefined) {
        // Don't let a stale combat tick revive the skipped crypt
        if (instanceId && this.cryptSkipInProgress) return
        if (instanceId) {
            // Explicit assign clears finished lock (merchant recall / new open)
            this.finishedCryptInstanceId = undefined
        }
        if (instanceId !== this.activeCryptInstance) {
            this.cryptWaypointIndex = 0
            this.resetCryptWantedTracking()
            if (instanceId) this.cryptGeneration++
        }
        this.activeCryptInstance = instanceId
        if (!instanceId) {
            this.cryptWaypointIndex = 0
            this.resetCryptWantedTracking()
        }
        this.persistActiveCryptToMongo().catch(console.warn)
    }

    public get getCryptGeneration() {
        return this.cryptGeneration
    }

    public get isCryptSkipInProgress() {
        return this.cryptSkipInProgress
    }

    /** Party must not join while merchant waits for crypt mobs to level. */
    public get isCryptLevelUpWaiting() {
        return this.cryptLevelUpUntil > Date.now()
    }

    /**
     * Level-up wait was started and party not assigned yet (until still set, even if expired).
     * Survives restart via Mongo `levelUpUntil`.
     */
    public get isCryptPartyAssignPending() {
        return this.cryptLevelUpUntil > 0 && !!this.activeCryptInstance
    }

    public get getCryptLevelUpRemainingMs() {
        return Math.max(0, this.cryptLevelUpUntil - Date.now())
    }

    public get getCryptOpenedAt() {
        return this.cryptOpenedAt
    }

    /**
     * Crypt opened — hold party out until `durationMs` so mobs can level (default 3h).
     * Persisted so restarts respect the remaining wait.
     */
    public beginCryptLevelUpWait(instanceId: string, durationMs: number) {
        this.reopenActiveCrypt(instanceId)
        this.cryptOpenedAt = Date.now()
        this.cryptLevelUpUntil = this.cryptOpenedAt + Math.max(0, durationMs)
        recordCryptOpened()
        this.persistActiveCryptToMongo().catch(console.warn)
    }

    public clearCryptLevelUpWait() {
        if (this.cryptLevelUpUntil === 0 && this.cryptOpenedAt === 0) return
        this.cryptLevelUpUntil = 0
        // Keep openedAt for logging until finish/release clears active
        this.persistActiveCryptToMongo().catch(console.warn)
    }

    /** Clear active crypt and block restores until a new instance is assigned. */
    public beginCryptSkip() {
        this.cryptSkipInProgress = true
        this.cryptGeneration++
        if (this.activeCryptInstance) {
            this.finishedCryptInstanceId = this.activeCryptInstance
        }
        this.activeCryptInstance = undefined
        this.cryptLevelUpUntil = 0
        this.cryptOpenedAt = 0
        this.cryptWaypointIndex = 0
        this.resetCryptWantedTracking()
        this.persistActiveCryptToMongo().catch(console.warn)
    }

    public endCryptSkip() {
        this.cryptSkipInProgress = false
    }

    public resetCryptWantedTracking() {
        this.cryptWantedSeenIds.clear()
        this.cryptWantedKilledIds.clear()
    }

    public noteCryptWantedSeen(id: string, type: MonsterName, level?: number) {
        if (!isCryptWantedMonster({ type, level })) return
        this.cryptWantedSeenIds.add(id)
    }

    public noteCryptWantedKilled(id: string) {
        if (!this.cryptWantedSeenIds.has(id)) return
        this.cryptWantedKilledIds.add(id)
    }

    /** True once every wanted boss we've seen this run is dead. */
    public areCryptWantedObjectivesComplete(): boolean {
        if (this.cryptWantedSeenIds.size < 1) return false
        for (const id of this.cryptWantedSeenIds) {
            if (!this.cryptWantedKilledIds.has(id)) return false
        }
        return true
    }

    public getCryptWantedProgress(): { seen: number, killed: number } {
        return {
            seen: this.cryptWantedSeenIds.size,
            killed: this.cryptWantedKilledIds.size,
        }
    }

    public get getCryptWaypointIndex() {
        return this.cryptWaypointIndex
    }

    public set setCryptWaypointIndex(index: number) {
        this.cryptWaypointIndex = Math.max(0, index)
    }

    public get isHazardActive() {
        return !!this.hazardRunner && !!this.hazardWeapon
    }

    public get getHazardRunner() {
        return this.hazardRunner
    }

    public get getHazardWeapon() {
        return this.hazardWeapon
    }

    public startHazard(runner: string, weapon: ItemName) {
        this.hazardRunner = runner
        this.hazardWeapon = weapon
        this.hazardCount = 0
        this.hazardNeeded = 20_000
    }

    public stopHazard() {
        this.hazardRunner = undefined
        this.hazardWeapon = undefined
        this.hazardCount = 0
        this.hazardNeeded = 20_000
    }

    public noteHazardProgress(count: number, needed: number) {
        if (typeof count === "number") this.hazardCount = count
        if (typeof needed === "number" && needed > 0) this.hazardNeeded = needed
    }

    public get getHazardCount() {
        return this.hazardCount
    }

    public get getHazardNeeded() {
        return this.hazardNeeded
    }

    /** True when next burn kill may complete the achievement — lock title weapon. */
    public get isHazardTitleWeaponCritical() {
        if (!this.isHazardActive) return false
        return this.hazardNeeded - this.hazardCount <= 1
    }

    /** Restore active instance from DB; route always starts at waypoint 0. */
    /** Merchant DB fallback only — must not mark crypt DB as loaded (would skip levelUpUntil). */
    public restoreActiveCrypt(instanceId: string) {
        if (this.cryptSkipInProgress) return
        if (instanceId === this.finishedCryptInstanceId) return
        this.activeCryptInstance = instanceId
        this.cryptWaypointIndex = 0
    }

    /** Strip Mongo/meta fields — ALData does `...bank` after `lastUpdated: Date.now()`, so a stale lastUpdated freezes the API. */
    private bankPayloadForApi(bank: BankInfo): BankInfo {
        const {
            _id: _omitId,
            __v: _omitV,
            owner: _omitOwner,
            lastUpdated: _omitLastUpdated,
            ...packs
        } = bank as BankInfo & {
            _id?: unknown
            __v?: unknown
            owner?: unknown
            lastUpdated?: unknown
        }
        return packs as BankInfo
    }

    private async updateBank(bot: PingCompensatedCharacter) {
        if (!bot.map.startsWith("bank")) return
        if (!bot.bank) {
            setTimeout(() => { this.updateBank(bot) }, 100)
            return
        }

        // bot.bank is only the current floor — merge, don't wipe other floors
        this.bank = {
            ...this.bankPayloadForApi(this.bank ?? {} as BankInfo),
            ...bot.bank,
        } as BankInfo

        if (this.secretKey == "") return console.error("Create api_token.txt")
        const url = `https://aldata.earthiverse.ca/bank/${bot.owner}/${this.secretKey}`
        const settings: RequestInit = {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            // Never send lastUpdated/owner/_id — ALData would overwrite its fresh lastUpdated
            body: JSON.stringify(this.bankPayloadForApi(this.bank)),
        }
        this.safeFetch(url, settings, `Sending bank status for ${bot.id}`)

        if (bot.gold > 1_800_000_000 && (!this.lastDepositGold || Date.now() - this.lastDepositGold > this.DEPOSIT_GOLD_THRESHOLD)) {
            bot.depositGold(bot.gold * 0.05).catch(debugLog)
            this.lastDepositGold = Date.now()
        }
    }
}
