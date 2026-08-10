import { Database, Entity, MonsterName, PingCompensatedCharacter, Game, Tools, IPosition, Constants, MapName, Pathfinder, ServerRegion, ServerIdentifier, ItemName } from "alclient"
import { StateModel } from "../database/state/state.model"
import { IState } from "../controllers/state_interface"
import { calculate_hps, calculate_monster_dps, calculate_monsters_dps, calculate_my_dps, debugLog, MY_CHARACTERS } from "./common_functions"
import fs from "fs"
import { DEFAULT_SERVER_NAME, DEFAULT_SERVER_REGION, MemoryStorage } from "./memory_storage"
import { ManageItems } from "./manage_items_strategy"
import {
    CRYPT_BLACKLIST,
    CRYPT_DOOR,
    CRYPT_ENTRANCE,
    CRYPT_ALLY_NEAR_RANGE,
    CRYPT_FOLLOW_RANGE,
    CRYPT_KITE_ABILITIES,
    CRYPT_MOB_DETECT_RANGE,
    CRYPT_OVERWHELM_RATIO,
    CRYPT_PARTY_WAIT_RANGE,
    CRYPT_PRIEST_PULL_RANGE,
    CRYPT_PULL_PACK_RANGE,
    CRYPT_ROUTE,
    CRYPT_SAFE_PULL_RATIO,
    CRYPT_SEPARATE_RANGE,
    CRYPT_AVOID_MOB_RANGE,
    isCryptWantedMonster,
    CRYPT_WAYPOINT_ARRIVE_RANGE,
    CRYPT_WAYPOINT_SYNC_RANGE,
    SPECIAL_MONSTERS,
    WANTED_EVENTS,
} from "../configs/events_and_spots"

/** Present in G.items; may be missing from older alclient ItemName unions */
const TEST_ORB = "test_orb" as ItemName
const JACKO = "jacko" as ItemName

export type MobsSortFilter = {
    sortSpawns? : boolean,

}

export type State = {
    wantedMob: MonsterName | MonsterName[],
    state_type: "farm" | "event" | "boss" | "quest" | "crypt",
    location?: IPosition
    eventName?: MonsterName | MapName
    server?: {region: ServerRegion, name: ServerIdentifier}
    /** Crypt instance id from alclient `character.in` */
    instanceId?: string
}

export type RawState = Partial<State> | null | undefined

export class StateStrategy extends ManageItems implements IState {

    private current_state : State

    private last_state: State

    private state_scheduler: State[] = []

    private default_state: State = {
        wantedMob: "dryad",
        state_type: "farm",
        server: {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME}
    }

    private cryptPartyReady = false

    /** Snapshot of MemoryStorage.cryptGeneration when this crypt run was accepted. */
    private cryptRunGeneration = -1

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        super(bot as PingCompensatedCharacter, memoryStorage)
        
        //bind context functions
        this.getTarget = this.getTarget.bind(this)
        this.checkState = this.checkState.bind(this)
        this.saveState = this.saveState.bind(this)
        this.kiteLoop = this.kiteLoop.bind(this)
        this.switchState = this.switchState.bind(this)
        this.onEntityDeath = this.onEntityDeath.bind(this)

        this.bot.socket.on("death", this.onEntityDeath)

        //trigger started functions
        this.runLoops()
        this.kiteLoop()
    }

    private onEntityDeath(data: { id?: string } | string) {
        const id = typeof data === "string" ? data : data?.id
        if (id) this.memoryStorage.noteCryptWantedKilled(id)
    }

    public getStateType() : string {
        return this.current_state?.eventName ? this.current_state.eventName as string : this.current_state?.state_type as string
    }

    private async runLoops() {
        if(this.bot.ctype != "merchant")await this.loadState()
        // this.getTargetLoop()
        await this.checkState()
        if(this.deactivate) return
        setTimeout(this.saveState, 2000)
    }

    public addStateToScheduler(state: State) {
        if (state.state_type === "crypt") {
            // Only skip if already queued — current crypt must still be re-queued on event interrupt
            if (this.state_scheduler.some(e => e.state_type === "crypt" && e.instanceId === state.instanceId)) {
                console.debug(`${this.bot.name} crypt ${state.instanceId} already scheduled`)
                return
            }
            this.state_scheduler.push(state)
            return
        }
        if(this.state_scheduler.some( e => e.state_type == state.state_type && e.wantedMob == state.wantedMob)) {
            console.debug(`${this.bot.name} state ${state.state_type} ${state.wantedMob} already in scheduler`)
            return
        }
        // Already running this event — don't queue a second copy (blocks home return)
        if (
            state.state_type === "event"
            && this.current_state?.state_type === "event"
            && this.current_state.eventName === state.eventName
        ) {
            return
        }
        this.state_scheduler.push(state)
    }

    /** Drop event from current + scheduler so roster can move the bot home. */
    public clearEventStates() {
        this.state_scheduler = this.state_scheduler.filter(s => s.state_type !== "event")
        if (this.current_state?.state_type === "event") {
            const fallback = this.last_state?.state_type !== "event"
                ? this.last_state
                : this.default_state
            this.current_state = fallback ?? this.default_state
            this.addLog(`${this.bot.name} cleared event → ${this.current_state.state_type}`)
        }
    }

    public get currentState() {
        return this.current_state
    }

    public set currentState(state: State) {
        if(this.current_state.state_type == "farm" || this.current_state.state_type == "quest") {
            this.last_state = this.current_state
            this.current_state = state
            if (state.state_type === "crypt") {
                this.cryptPartyReady = false
                this.cryptRunGeneration = this.memoryStorage.getCryptGeneration
                this.memoryStorage.setCryptWaypointIndex = 0
            }
        }
        else if (state.state_type === "crypt") {
            this.addStateToScheduler(state)
        }
        else if(!this.state_scheduler.some( e => e.state_type == state.state_type && e.wantedMob == state.wantedMob)) {
            this.state_scheduler.push(state)
        }
    }

    public get stateScheduler() {
        return this.state_scheduler
    }

    public get stateBot() {
        return this.bot
    }

    private async checkEventBuff() {
        // Never leave crypt / interrupt crypt run for holiday spirit
        if (this.current_state?.state_type === "crypt" || this.bot.map === "crypt") return

        if (this.bot.S.holidayseason && !this.bot.s.holidayspirit) {
            await this.bot.smartMove("main", {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.warn)
            await this.bot.getHolidaySpirit()
        }
    }

    private async kiteLoop() {
        if(this.deactivate) return
        if(this.bot.isDisabled() || this.bot.rip) return setTimeout(this.kiteLoop, 1000)
        if(this.bot.moving || this.bot.smartMoving) return setTimeout(this.kiteLoop, 1000)

        // Always kite monsters with dismissal / dangerous auras (portal, weakness, etc.)
        const kiteThreat = this.bot.getEntities({
            targetingMe: true,
        }).find(e => this.shouldKiteMonster(e))
            ?? (() => {
                const t = this.bot.getTargetEntity()
                return t && this.shouldKiteMonster(t) ? t : undefined
            })()
        if (kiteThreat && Tools.distance(this.bot, kiteThreat) < this.getSafeKiteDistance(kiteThreat)) {
            await this.kiteAwayFrom(kiteThreat)
            return setTimeout(this.kiteLoop, 1000)
        }
        
        const mobsTargetingMe = this.bot.getEntities({targetingMe: true}).filter(e => !e.moving)
        if(mobsTargetingMe.length < 1) return setTimeout(this.kiteLoop, 1000)
        let currentTank = this.memoryStorage.getCurrentTank
        
        // Проверяем, есть ли между монстрами, таргетящими нас, дистанция больше 25
        let hasLargeDistanceBetweenMobs = false
        if(mobsTargetingMe.length > 1) {
            out: for(let i = 0; i < mobsTargetingMe.length; i++) {
                for(let j = i + 1; j < mobsTargetingMe.length; j++) {
                    if(mobsTargetingMe[i].map === mobsTargetingMe[j].map) {
                        const distance = Tools.distance(mobsTargetingMe[i], mobsTargetingMe[j])
                        if(distance > 35) {
                            hasLargeDistanceBetweenMobs = true
                            break out
                        }
                    }
                }
            }
        }

        if((currentTank != this.bot.id && this.bot.getEntities({targetingMe: true}).filter( e => e.hp > this.bot.attack*3).length>0) || this.bot.getEntities({targetingMe: true}).filter( e => e.attack > this.bot.max_hp*0.30).length>0) await this.kite()
        else if(currentTank == this.bot.id && hasLargeDistanceBetweenMobs) {
            // console.debug('Slightly moving to pull mobs together')
            await this.bot.move(this.bot.x + Math.random()*50 - 20, this.bot.y + Math.random()*50 - 20, {disableErrorLogs: true}).catch(debugLog)
        }
        
        
        
        setTimeout(this.kiteLoop, 1000)
    }

    /** Portal / weakness aura — stay out of radius. */
    private shouldKiteMonster(entity: Entity): boolean {
        if (!entity?.abilities) return false
        for (const key of CRYPT_KITE_ABILITIES) {
            if (entity.abilities[key as keyof typeof entity.abilities]) return true
        }
        return false
    }

    private getSafeKiteDistance(entity: Entity): number {
        let auraRadius = 0
        if (entity.abilities) {
            for (const ab of Object.values(entity.abilities)) {
                if (ab && typeof ab === "object" && "radius" in ab && typeof (ab as { radius?: number }).radius === "number") {
                    auraRadius = Math.max(auraRadius, (ab as { radius: number }).radius)
                }
            }
        }
        return Math.max(this.bot.range * 0.85, auraRadius + 40)
    }

    private async kiteAwayFrom(entity: Entity) {
        const safe = this.getSafeKiteDistance(entity)
        // Prefer positions deeper into crypt (away from entrance), never smartMove (paths to door)
        const awayFromMob = Math.atan2(this.bot.y - entity.y, this.bot.x - entity.x)
        const awayFromEntrance = Math.atan2(
            this.bot.y - CRYPT_ENTRANCE.y,
            this.bot.x - CRYPT_ENTRANCE.x,
        )
        const candidates: number[] = [
            awayFromMob,
            awayFromMob + Math.PI / 4,
            awayFromMob - Math.PI / 4,
            awayFromEntrance,
            awayFromEntrance + Math.PI / 3,
            awayFromEntrance - Math.PI / 3,
        ]
        let best: IPosition | undefined
        let bestScore = -Infinity
        for (const angle of candidates) {
            const pos: IPosition = {
                map: this.bot.map,
                x: entity.x + Math.cos(angle) * safe,
                y: entity.y + Math.sin(angle) * safe,
            }
            if (!Pathfinder.canStand(pos)) continue
            if (!Pathfinder.canWalkPath(this.bot, pos)) continue
            // Higher score = farther from entrance (don't kite toward door)
            const score = Tools.distance(pos, CRYPT_ENTRANCE)
            if (score > bestScore) {
                bestScore = score
                best = pos
            }
        }
        if (best) {
            await this.bot.move(best.x, best.y).catch(debugLog)
            return
        }
        // Last resort: small step away from mob, still no smartMove in crypt
        const fallback: IPosition = {
            map: this.bot.map,
            x: this.bot.x + Math.cos(awayFromMob) * 40,
            y: this.bot.y + Math.sin(awayFromMob) * 40,
        }
        if (Pathfinder.canStand(fallback)) {
            await this.bot.move(fallback.x, fallback.y).catch(debugLog)
        }
    }

    private async kite() {
        // console.debug(`${this.bot.name} is kiting`)
        const target = this.bot.getTargetEntity()
        if(!target || target.map !== this.bot.map) return
        
        // Радиус кайта - 70% от range бота
        const kiteRadius = this.bot.range * 0.7
        
        // Вычисляем текущее расстояние до таргета
        const currentDistance = Tools.distance(this.bot, target)
        
        // Вычисляем угол от таргета к боту для базового направления
        const angleToBot = Math.atan2(this.bot.y - target.y, this.bot.x - target.x)
        
        // Добавляем случайное смещение угла для движения вокруг таргета
        // Используем угол от 45 до 135 градусов от текущего направления
        const angleOffset = (Math.random() * 90 - 45) * (Math.PI / 180)
        const kiteAngle = angleToBot + angleOffset
        
        // Вычисляем целевую позицию вокруг таргета
        const kitePosition: IPosition = {
            map: this.bot.map,
            x: target.x + Math.cos(kiteAngle) * kiteRadius,
            y: target.y + Math.sin(kiteAngle) * kiteRadius
        }
        
        // Проверяем, можно ли стоять в найденной точке
        if(Pathfinder.canStand(kitePosition)) {
            // Проверяем, можно ли дойти напрямую
            if(Pathfinder.canWalkPath(this.bot, kitePosition)) {
                await this.bot.move(kitePosition.x, kitePosition.y).catch(debugLog)
            } else if (this.bot.map !== "crypt") {
                // Если нельзя дойти напрямую, используем smartMove
                await this.bot.smartMove(kitePosition, {avoidTownWarps: true}).catch(debugLog)
            }
        } else {
            // Если нельзя стоять в этой точке, пробуем найти ближайшую доступную точку вокруг таргета
            let foundPosition = false
            for(let angleOffset = -90; angleOffset <= 90; angleOffset += 15) {
                const testAngle = angleToBot + (angleOffset * Math.PI / 180)
                const testPosition: IPosition = {
                    map: this.bot.map,
                    x: target.x + Math.cos(testAngle) * kiteRadius,
                    y: target.y + Math.sin(testAngle) * kiteRadius
                }
                
                if(Pathfinder.canStand(testPosition)) {
                    foundPosition = true
                    if(Pathfinder.canWalkPath(this.bot, testPosition)) {
                        await this.bot.move(testPosition.x, testPosition.y).catch(debugLog)
                    } else if (this.bot.map !== "crypt") {
                        await this.bot.smartMove(testPosition, {avoidTownWarps: true}).catch(debugLog)
                    }
                    break
                }
            }
            
            // Если не нашли подходящую позицию, пробуем с меньшим радиусом
            if(!foundPosition) {
                for(let radius = kiteRadius * 0.8; radius >= kiteRadius * 0.5; radius -= kiteRadius * 0.1) {
                    for(let angleOffset = -90; angleOffset <= 90; angleOffset += 30) {
                        const testAngle = angleToBot + (angleOffset * Math.PI / 180)
                        const fallbackPosition: IPosition = {
                            map: this.bot.map,
                            x: target.x + Math.cos(testAngle) * radius,
                            y: target.y + Math.sin(testAngle) * radius
                        }
                        
                        if(Pathfinder.canStand(fallbackPosition)) {
                            if(Pathfinder.canWalkPath(this.bot, fallbackPosition)) {
                                await this.bot.move(fallbackPosition.x, fallbackPosition.y).catch(console.warn)
                            } else if (this.bot.map !== "crypt") {
                                await this.bot.smartMove(fallbackPosition, {avoidTownWarps: true}).catch(console.warn)
                            }
                            return
                        }
                    }
                }
            }
        }
    }

    private normalizeState(raw: RawState): State {
        const base = this.default_state
        // wantedMob: string | string[]
        const wantedMob =
            typeof raw?.wantedMob === "string"
                ? raw.wantedMob
                : Array.isArray(raw?.wantedMob) && raw.wantedMob.length > 0
                    ? raw.wantedMob
                    : base.wantedMob
        // state_type: только допустимые значения
        const state_type =
            raw?.state_type === "farm" ||
            raw?.state_type === "event" ||
            raw?.state_type === "boss" ||
            raw?.state_type === "quest" ||
            raw?.state_type === "crypt"
                ? raw.state_type
                : base.state_type
        // location: только если есть map/x/y нужных типов
        const location =
            raw?.location &&
            typeof raw.location.map === "string" &&
            typeof raw.location.x === "number" &&
            typeof raw.location.y === "number"
                ? raw.location
                : undefined
        // eventName опционально
        const eventName =
            typeof raw?.eventName === "string" ? raw.eventName : undefined
        // server: если нет — fallback
        const server =
            raw?.server &&
            typeof raw.server.region === "string" &&
            typeof raw.server.name === "string"
                ? raw.server
                : base.server
        const instanceId =
            typeof raw?.instanceId === "string" ? raw.instanceId : undefined
        // Crypt should not fall back to default farm mob list
        if (state_type === "crypt") {
            return {
                wantedMob: Array.isArray(raw?.wantedMob) ? raw.wantedMob : [],
                state_type,
                location,
                eventName,
                server,
                instanceId,
            }
        }
        return { wantedMob, state_type, location, eventName, server, instanceId }
    }

    private async loadState() {

        // return this.current_state = {
        //     wantedMob: "dryad",
        //     state_type: "farm",
        //     server: {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME}
        // }

        await this.memoryStorage.ensureActiveCryptLoaded()

        // load saved in DB
        if(Database.connection) {
            try{
                const savedState = await StateModel.findOne({
                    botId: this.bot.id
                }).lean<State>() ?? this.default_state
                this.current_state = this.normalizeState(savedState)
                if (this.current_state.state_type === "crypt") {
                    this.cryptPartyReady = false
                    // Don't use setter — it resets shared waypoint; only seed memory if empty
                    if (this.current_state.instanceId && !this.memoryStorage.getActiveCryptInstance) {
                        this.memoryStorage.restoreActiveCrypt(this.current_state.instanceId)
                    }
                    if (!this.canResumeCrypt()) {
                        // Keep crypt pending until back on home main setup
                        this.addStateToScheduler({ ...this.current_state })
                        this.current_state = this.default_state
                    }
                }
                this.resumeActiveCryptOnStartup()
                return console.warn(`${this.bot.name} loaded state from MONGO`)
            }
            catch(ex){
                console.error("Error while loading state from DB")
                console.error(ex)
            }
        }
        if( !this.current_state ) {
            try {
                let fileData = fs.readFileSync(`../${this.bot.name}_state.json`, 'utf-8')
                this.current_state = this.normalizeState(JSON.parse(fileData))
                if (this.current_state.state_type === "crypt" && this.current_state.instanceId
                    && !this.memoryStorage.getActiveCryptInstance) {
                    this.memoryStorage.restoreActiveCrypt(this.current_state.instanceId)
                }
            }
            catch(ex) {
                console.error(`Error while loading state\n${ex}`)
                this.current_state = this.default_state
            }
        }
        this.resumeActiveCryptOnStartup()
    }

    /** If an active crypt exists, don't stay on farm — rejoin (event/boss still take priority). */
    private ensureActiveCryptState() {
        if (this.bot.ctype === "merchant") return
        if (!this.canResumeCrypt()) return
        if (this.memoryStorage.isCryptSkipInProgress) return
        // Merchant holding party out while crypt mobs level up
        if (this.memoryStorage.isCryptLevelUpWaiting) return
        const activeId = this.memoryStorage.getActiveCryptInstance
        if (!activeId) return
        if (this.current_state?.state_type === "crypt" && this.current_state.instanceId === activeId) return
        if (this.current_state?.state_type === "event" || this.current_state?.state_type === "boss") return

        const cryptState: State = {
            state_type: "crypt",
            wantedMob: [],
            instanceId: activeId,
            server: { region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME },
        }

        if (this.current_state?.state_type === "farm" || this.current_state?.state_type === "quest") {
            this.last_state = this.current_state
            this.current_state = cryptState
            this.cryptPartyReady = false
            this.cryptRunGeneration = this.memoryStorage.getCryptGeneration
            this.addLog(`${this.bot.name} rejoining active crypt ${activeId} from ${this.last_state.state_type}`)
            return
        }

        if (!this.state_scheduler.some(s => s.state_type === "crypt" && s.instanceId === activeId)) {
            this.addStateToScheduler(cryptState)
        }
    }

    /** If active_crypt flag exists in DB/memory, force combat bots back into that instance. */
    private resumeActiveCryptOnStartup() {
        if (this.bot.ctype === "merchant") return
        if (!this.canResumeCrypt()) return
        if (this.memoryStorage.isCryptLevelUpWaiting) return

        const activeId = this.memoryStorage.getActiveCryptInstance
        if (!activeId) return

        const alreadyOnCrypt = this.current_state?.state_type === "crypt"
            && this.current_state.instanceId === activeId
        if (alreadyOnCrypt) {
            this.cryptPartyReady = false
            this.addLog(`${this.bot.name} resuming crypt ${activeId}`)
            return
        }

        const cryptState: State = {
            state_type: "crypt",
            wantedMob: [],
            instanceId: activeId,
            server: { region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME },
        }

        // Don't interrupt a live event/boss loaded from DB — queue crypt after
        if (this.current_state?.state_type === "event" || this.current_state?.state_type === "boss") {
            this.addStateToScheduler(cryptState)
            this.addLog(`${this.bot.name} queued crypt ${activeId} after ${this.current_state.state_type}`)
            return
        }

        if (this.current_state?.state_type === "farm" || this.current_state?.state_type === "quest") {
            this.last_state = this.current_state
        }
        this.current_state = cryptState
        this.cryptPartyReady = false
        this.addLog(`${this.bot.name} startup → crypt ${activeId}`)
    }

    private async saveState() {
        if(this.deactivate) return
        // Persist crypt (with instanceId) so restart can resume; skip transient event/boss
        if(this.current_state.state_type == "event" || this.current_state.state_type == "boss") {
            return setTimeout(this.saveState, Constants.MONGO_UPDATE_MS)
        }
        if(Database.connection) {
            try {
                // Prefer active/pending crypt over farm so event→farm never wipes crypt from DB
                const pendingCrypt = this.state_scheduler.find(s => s.state_type === "crypt" && s.instanceId)
                const activeId = this.memoryStorage.getActiveCryptInstance
                const saveCrypt = this.current_state.state_type === "crypt"
                    ? this.current_state
                    : pendingCrypt
                        ?? (activeId ? {
                            state_type: "crypt" as const,
                            wantedMob: [] as MonsterName[],
                            instanceId: activeId,
                            server: { region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME },
                        } : undefined)

                const stateToPersist = saveCrypt ?? this.current_state
                const stateData = {
                botId: this.bot.id,
                wantedMob: stateToPersist.wantedMob,
                state_type: stateToPersist.state_type,
                location: stateToPersist.location,
                server: stateToPersist.server ?? {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME},
                instanceId: stateToPersist.state_type === "crypt" ? stateToPersist.instanceId : undefined,
                }
                const result = await StateModel.findOneAndUpdate(
                    { botId: this.bot.id},
                    stateData,
                    {
                        upsert: true,
                        new: true,
                        runValidators: true,
                        setDefaultsOnInsert: true
                    }
                ).exec()
            }
            catch(ex) {
                console.error("Error while saving state in DB")
                console.error(ex)
            }
        }
        else {
            fs.writeFileSync(`../${this.bot.name}_state.json`, JSON.stringify(this.current_state), "utf-8")
            console.warn(`State saved in json. ${this.bot.name}`)   
        }
        setTimeout(this.saveState, Constants.MONGO_UPDATE_MS)
    }

    public async startQuest() {
        if(this.deactivate) return
        
        this.state_scheduler.push({wantedMob: this.bot.s.monsterhunt?.id ?? "goo", state_type: "quest", server: {region: this.bot.serverData.region, name: this.bot.serverData.name}})
    }

    /** Leave crypt and drop crypt states (used by code_eval skipcrypt). */
    public async abortCryptRun() {
        this.cryptRunGeneration = -1
        this.state_scheduler = this.state_scheduler.filter(s => s.state_type !== "crypt")
        this.cryptPartyReady = false
        await this.stopCryptSmartMove()
        if (this.bot.map === "crypt") {
            await this.bot.leaveMap().catch(debugLog)
        }
        if (this.current_state?.state_type === "crypt") {
            const fallback = this.last_state?.state_type !== "crypt"
                ? this.last_state
                : this.default_state
            this.current_state = fallback ?? this.default_state
            this.addLog(`${this.bot.name} aborted crypt run → ${this.current_state.state_type}`)
        }
    }

    /** Party left this instance — release active (merchant may recall/verify same id). */
    private async completeCryptRun(reason: string) {
        const id = this.current_state?.instanceId ?? this.memoryStorage.getActiveCryptInstance
        this.memoryStorage.releaseActiveCrypt(id)
        this.dropInactiveCryptResumes()
        this.cryptPartyReady = false
        await this.stopCryptSmartMove()
        if (this.bot.map === "crypt") await this.bot.leaveMap().catch(debugLog)
        this.addLog(`${this.bot.name} crypt complete (${reason})`)
        this.switchState()
    }

    /** Active was cleared by another member — leave without releasing again. */
    private async exitReleasedCrypt(reason: string) {
        this.dropInactiveCryptResumes()
        this.cryptPartyReady = false
        await this.stopCryptSmartMove()
        if (this.bot.map === "crypt") await this.bot.leaveMap().catch(debugLog)
        this.addLog(`${this.bot.name} leaving crypt (${reason})`)
        this.switchState()
    }

    /** Remove crypt from scheduler/last_state when that instance is no longer active. */
    private dropInactiveCryptResumes() {
        const activeId = this.memoryStorage.getActiveCryptInstance
        this.state_scheduler = this.state_scheduler.filter(s => {
            if (s.state_type !== "crypt") return true
            return !!activeId && s.instanceId === activeId
        })
        if (this.last_state?.state_type === "crypt") {
            if (!activeId || this.last_state.instanceId !== activeId) {
                this.last_state = this.default_state
            }
        }
    }

    /** True if skipcrypt invalidated this bot's crypt run (or skip is in progress). */
    private isCryptRunStale(): boolean {
        if (this.memoryStorage.isCryptSkipInProgress) return true
        if (this.current_state?.state_type !== "crypt") return false
        if (this.cryptRunGeneration < 0) return false
        return this.cryptRunGeneration !== this.memoryStorage.getCryptGeneration
    }

    private switchState() {
        this.dropInactiveCryptResumes()
        this.sortScheduler()
        let next = (this.state_scheduler.length > 0)
            ? this.state_scheduler.shift()
            : this.last_state ?? this.default_state
        const activeId = this.memoryStorage.getActiveCryptInstance
        // Never resume a released crypt (was looping: leave → last_state crypt → leave)
        if (next?.state_type === "crypt" && (!activeId || next.instanceId !== activeId)) {
            next = this.default_state
        }
        this.current_state = next
        if (next?.state_type === "crypt") {
            this.cryptPartyReady = false
            this.cryptRunGeneration = this.memoryStorage.getCryptGeneration
        }
        this.addLog(`Switched to state: ${JSON.stringify(this.current_state)}`)
    }

    private isCryptKillable(entity: Entity): boolean {
        if (!entity || entity.map !== "crypt") return false
        if (CRYPT_BLACKLIST.includes(entity.type)) return false
        return this.shouldAttack(entity)
    }

    private getMonsterHealPerSecond(entity: Entity): number {
        if (!entity?.abilities) return 0
        let hps = 0
        for (const [key, ab] of Object.entries(entity.abilities)) {
            if (!key.toLowerCase().includes("heal") || !ab || typeof ab !== "object") continue
            const heal = (ab as { heal?: number }).heal ?? 0
            const cooldownMs = (ab as { cooldown?: number }).cooldown ?? 1000
            if (heal > 0 && cooldownMs > 0) hps += heal / (cooldownMs / 1000)
        }
        return hps
    }

    private getPartyDps(): number {
        return this.getCombatPartyOnServer()
            .map(s => s.getBot())
            .filter(b => !!b && !b.rip)
            .reduce((sum, b) => sum + calculate_my_dps(b), 0)
    }

    /** Healer whose HPS exceeds combined party DPS (e.g. Elena a5). */
    protected isOverhealingMob(entity: Entity): boolean {
        if (!this.hasHealAbility(entity)) return false
        const healHps = this.getMonsterHealPerSecond(entity)
        if (healHps <= 0) return false
        const partyDps = this.getPartyDps()
        return partyDps <= 0 || healHps > partyDps
    }

    private getNearbyOverhealMobs() {
        return this.bot.getEntities({
            withinRange: CRYPT_MOB_DETECT_RANGE,
        }).filter(e =>
            e.map === "crypt"
            && !CRYPT_BLACKLIST.includes(e.type)
            && e.xp > 0
            && this.isOverhealingMob(e),
        )
    }

    private hasLivingAllyNearby(): boolean {
        if (this.getCombatPartyOnServer().some(s => {
            const b = s.getBot()
            return b.id !== this.bot.id
                && !b.rip
                && Tools.distance(this.bot, b) <= CRYPT_ALLY_NEAR_RANGE
        })) return true
        return this.bot.getPlayers({ isPartyMember: true }).some(p =>
            p.id !== this.bot.id
            && !p.rip
            && Tools.distance(this.bot, p) <= CRYPT_ALLY_NEAR_RANGE,
        )
    }

    private async equipTestOrb(): Promise<boolean> {
        if (this.bot.slots.orb?.name === TEST_ORB) return true
        const idx = this.bot.locateItem(TEST_ORB)
        if (idx < 0) {
            this.addLog(`${this.bot.name} needs test_orb vs overhealer but none in inventory`, false)
            return false
        }
        await this.bot.equip(idx).catch(debugLog)
        return this.bot.slots.orb?.name === TEST_ORB
    }

    protected async scareAndRetreatFrom(entity: Entity) {
        await this.stopCryptSmartMove()
        const prevOrb = this.bot.slots.orb
            ? { name: this.bot.slots.orb.name, level: this.bot.slots.orb.level }
            : undefined

        if (this.bot.slots.orb?.name !== JACKO) {
            const jackoIdx = this.bot.locateItem(JACKO)
            if (jackoIdx >= 0) await this.bot.equip(jackoIdx).catch(debugLog)
        }
        if (this.bot.canUse("scare", { ignoreEquipped: true }) || this.bot.slots.orb?.name === JACKO) {
            await this.bot.scare().catch(debugLog)
        }

        const angle = Math.atan2(this.bot.y - entity.y, this.bot.x - entity.x)
        const flee: IPosition = {
            map: "crypt",
            x: this.bot.x + Math.cos(angle) * 150,
            y: this.bot.y + Math.sin(angle) * 150,
        }
        if (Pathfinder.canStand(flee)) {
            await this.bot.move(flee.x, flee.y).catch(debugLog)
        } else {
            // Prefer next route point if walkable
            const wp = CRYPT_ROUTE[this.memoryStorage.getCryptWaypointIndex]
            if (wp) await this.moveInsideCrypt(wp)
        }

        // Prefer test_orb after flee so next approach can skip the healer
        if (this.bot.hasItem(TEST_ORB) || this.bot.slots.orb?.name === TEST_ORB) {
            await this.equipTestOrb()
        } else if (prevOrb && prevOrb.name !== JACKO) {
            const idx = this.bot.locateItem(prevOrb.name, undefined, { level: prevOrb.level })
            if (idx >= 0) await this.bot.equip(idx).catch(debugLog)
        }
        this.addLog(`${this.bot.name} scare+flee from overhealer ${entity.type}`)
    }

    /**
     * Overheal mob (heal > party DPS):
     * - test_orb on → ignore (caller continues route)
     * - else equip test_orb (and scare if alone with agro)
     * Never soft-lock the route waiting on allies to "help" kill an unkillable healer.
     */
    private async handleCryptOverhealThreats(): Promise<boolean> {
        const threats = this.getNearbyOverhealMobs()
        if (threats.length < 1) return false

        if (this.bot.slots.orb?.name === TEST_ORB) {
            // Skip healer — continue route / other killables
            return false
        }

        await this.stopCryptSmartMove()
        await this.equipTestOrb()

        const onMe = this.bot.getEntities({ targetingMe: true })
        if (onMe.length > 0 && !this.hasLivingAllyNearby()) {
            const nearest = threats.reduce((a, b) =>
                Tools.distance(this.bot, a) <= Tools.distance(this.bot, b) ? a : b,
            )
            await this.scareAndRetreatFrom(nearest)
            return true
        }

        // Orb equipped (or equip attempted) — keep walking; do not hold for overhealers
        return false
    }

    protected wantsTestOrb(): boolean {
        if (this.current_state?.state_type !== "crypt") return false
        if (this.bot.map !== "crypt") return false
        return this.getNearbyOverhealMobs().length > 0
    }

    protected isCryptCombatState(): boolean {
        return this.current_state?.state_type === "crypt"
    }

    /**
     * Non-priest: stay with priest when farther than CRYPT_FOLLOW_RANGE.
     * @returns true if this tick was spent catching up
     */
    private async followCryptLeaderIfNeeded(): Promise<boolean> {
        if (this.bot.ctype === "priest") return false
        // Don't abandon an active pull / fight to catch up
        if (this.bot.getEntities({ targetingMe: true }).length > 0) return false

        const party = this.getCombatPartyOnServer()
        const priestBot = party.find(s => s.getBot()?.ctype === "priest")?.getBot()
        if (!priestBot || priestBot.rip || priestBot.map !== "crypt" || priestBot.in !== this.bot.in) {
            return false
        }
        if (Tools.distance(this.bot, priestBot) <= CRYPT_FOLLOW_RANGE) return false

        await this.moveInsideCrypt(
            { map: "crypt", x: priestBot.x, y: priestBot.y },
            Math.max(60, CRYPT_FOLLOW_RANGE * 0.4),
        )
        this.addLog(`${this.bot.name} following priest ${priestBot.id} (crypt)`, false)
        return true
    }

    /** First route rally — priest returns here if party is incomplete or straggled. */
    private getCryptFirstPoint(): IPosition {
        return CRYPT_ENTRANCE
    }

    /**
     * Combat allies currently in this crypt instance (controller + live party players).
     * Falls back to in-game party so a missing strategy entry can't freeze the priest forever.
     */
    private getCryptCombatAlliesInInstance(instanceId: string) {
        const byId = new Map<string, { id: string; ctype?: string; x: number; y: number; map: string; in?: string; rip?: boolean }>()
        if (this.bot.map === "crypt" && this.bot.in === instanceId && !this.bot.rip) {
            byId.set(this.bot.id, this.bot)
        }
        for (const s of this.getCombatPartyOnServer()) {
            const b = s.getBot()
            if (b.map === "crypt" && b.in === instanceId && !b.rip) byId.set(b.id, b)
        }
        for (const p of this.bot.getPlayers({ isPartyMember: true, isDead: false })) {
            if (p.ctype === "merchant") continue
            if (p.map !== "crypt") continue
            if (p.in && p.in !== instanceId) continue
            byId.set(p.id, p)
        }
        return [...byId.values()]
    }

    /**
     * All expected combat bots (no merchant) alive in this crypt instance and near the priest.
     */
    private areCryptCombatAlliesNearPriest(instanceId: string, range = CRYPT_PARTY_WAIT_RANGE): boolean {
        const expected = this.getExpectedCryptCombatCount()
        const allies = this.getCryptCombatAlliesInInstance(instanceId)
        if (allies.length < expected) return false
        const priest = allies.find(a => a.ctype === "priest")
            ?? (this.bot.ctype === "priest" ? this.bot : undefined)
        if (!priest) return false
        return allies.every(a =>
            a.id === priest.id || Tools.distance(priest, a) <= range,
        )
    }

    /** Priest: only return to entrance if someone is dead/missing; otherwise hold current WP for stragglers. */
    private async priestRegroupCryptIfNeeded(instanceId: string): Promise<boolean> {
        if (this.bot.ctype !== "priest") return false
        const inFight = this.bot.getEntities({ targetingMe: true }).length > 0
            || !!this.bot.getTargetEntity()
        if (inFight) return false

        // Dead / not in instance — rally at entrance (keep waypoint index for resume)
        if (this.hasIncompleteCryptParty(instanceId)) {
            const first = this.getCryptFirstPoint()
            this.cryptPartyReady = false
            if (Tools.distance(this.bot, first) > CRYPT_WAYPOINT_ARRIVE_RANGE) {
                await this.moveInsideCrypt(first)
                this.addLog(
                    `${this.bot.name} crypt regroup → entrance (party incomplete, resume wp=${this.memoryStorage.getCryptWaypointIndex})`,
                    false,
                )
            } else {
                this.addLog(`${this.bot.name} holding crypt entrance — waiting party`, false)
            }
            return true
        }

        // Everyone alive in crypt but some lagged behind — wait on CURRENT waypoint, don't rewind
        if (!this.areCryptCombatAlliesNearPriest(instanceId)) {
            const sharedWp = this.memoryStorage.getCryptWaypointIndex
            const holdAt = sharedWp < CRYPT_ROUTE.length
                ? CRYPT_ROUTE[sharedWp]
                : this.getCryptFirstPoint()
            if (Tools.distance(this.bot, holdAt) > CRYPT_WAYPOINT_ARRIVE_RANGE) {
                await this.moveInsideCrypt(holdAt)
            } else {
                this.addLog(
                    `${this.bot.name} waiting stragglers at crypt WP ${sharedWp}`,
                    false,
                )
            }
            return true
        }
        return false
    }

    private getNearbyCryptMobs() {
        return this.getCryptCombatCandidates().filter(e => this.shouldAttack(e))
    }

    /** Crypt mobs in range (ignores DPS/tank gates — used for pack/pull decisions). */
    private getCryptCombatCandidates() {
        return this.bot.getEntities({
            withinRange: CRYPT_MOB_DETECT_RANGE,
        }).filter(e =>
            e.map === "crypt"
            && !CRYPT_BLACKLIST.includes(e.type)
            && e.xp > 0
            && !this.isOverhealingMob(e),
        )
    }

    private getExpectedCryptCombatCount(): number {
        return Array.from(MY_CHARACTERS.values())
            .filter(s => s.isMainSetup === true && s.ctype !== "merchant")
            .length
    }

    /** All combat bots on this server (including self), never merchant. */
    private getCombatPartyOnServer(): StateStrategy[] {
        const bots = this.memoryStorage?.getStateController?.getBots
        if (!bots) return []
        return bots.filter((s): s is StateStrategy => {
            if (!(s instanceof StateStrategy)) return false
            const b = s.getBot()
            return !!b
                && b.ctype !== "merchant"
                && b.serverData.region === this.bot.serverData.region
                && b.serverData.name === this.bot.serverData.name
        })
    }

    /** Move inside current crypt instance — never pass `in` (that forces leave+re-enter). */
    private async moveInsideCrypt(to: IPosition, getWithin = CRYPT_WAYPOINT_ARRIVE_RANGE) {
        // Already there — clear a stuck smartMove so the route can advance
        if (this.bot.map === "crypt" && Tools.distance(this.bot, to) <= getWithin) {
            if (this.bot.smartMoving) await this.stopCryptSmartMove()
            return
        }

        // Redirect if already smartMoving somewhere else
        if (this.bot.smartMoving) {
            const dest = this.bot.smartMoving
            if (dest.map === to.map && Tools.distance(dest, to) <= getWithin) return
            await this.stopCryptSmartMove()
        }

        // Detour around non-wanted mobs when possible
        const detour = this.getCryptAvoidDetour(to)
        if (detour) {
            await this.bot.smartMove(
                { map: "crypt", x: detour.x, y: detour.y },
                {
                    getWithin: 40,
                    avoidTownWarps: true,
                    avoidMaps: ["main", "cave"],
                },
            ).catch(debugLog)
        }

        await this.bot.smartMove(
            { map: "crypt", x: to.x, y: to.y },
            {
                getWithin,
                avoidTownWarps: true,
                avoidMaps: ["main", "cave"],
            },
        ).catch(debugLog)
    }

    /** Non-wanted crypt mobs we should path around (not objectives). */
    private getCryptMobsToAvoid() {
        return this.bot.getEntities({ withinRange: CRYPT_MOB_DETECT_RANGE }).filter(e =>
            e.map === "crypt"
            && e.xp > 0
            && !CRYPT_BLACKLIST.includes(e.type)
            && !isCryptWantedMonster(e),
        )
    }

    /**
     * If the straight path toward `to` clips a non-wanted mob, return a side-step waypoint.
     */
    private getCryptAvoidDetour(to: IPosition): IPosition | undefined {
        const avoid = this.getCryptMobsToAvoid()
        if (avoid.length < 1) return undefined

        const blockers = avoid.filter(m => {
            const distToPath = this.distancePointToSegment(m.x, m.y, this.bot.x, this.bot.y, to.x, to.y)
            return distToPath < CRYPT_AVOID_MOB_RANGE
                && Tools.distance(this.bot, m) < Tools.distance(this.bot, to)
        })
        if (blockers.length < 1) return undefined

        const nearest = blockers.reduce((a, b) =>
            Tools.distance(this.bot, a) <= Tools.distance(this.bot, b) ? a : b,
        )
        const along = Math.atan2(to.y - this.bot.y, to.x - this.bot.x)
        const sideA = along + Math.PI / 2
        const sideB = along - Math.PI / 2
        const step = CRYPT_AVOID_MOB_RANGE + 40
        for (const angle of [sideA, sideB, sideA + 0.4, sideB - 0.4]) {
            const pos: IPosition = {
                map: "crypt",
                x: nearest.x + Math.cos(angle) * step,
                y: nearest.y + Math.sin(angle) * step,
            }
            if (!Pathfinder.canStand(pos)) continue
            if (!Pathfinder.canWalkPath(this.bot, pos)) continue
            // Prefer detours that stay farther from avoid-mobs than we are now
            if (avoid.some(m => Tools.distance(pos, m) < CRYPT_AVOID_MOB_RANGE * 0.6)) continue
            return pos
        }
        return undefined
    }

    private distancePointToSegment(
        px: number, py: number,
        ax: number, ay: number,
        bx: number, by: number,
    ): number {
        const abx = bx - ax
        const aby = by - ay
        const len2 = abx * abx + aby * aby
        if (len2 < 1) return Math.hypot(px - ax, py - ay)
        let t = ((px - ax) * abx + (py - ay) * aby) / len2
        t = Math.max(0, Math.min(1, t))
        return Math.hypot(px - (ax + t * abx), py - (ay + t * aby))
    }

    private async stopCryptSmartMove() {
        if (this.bot.smartMoving) await this.bot.stopSmartMove().catch(debugLog)
    }

    private clearStaleCryptTarget() {
        const t = this.bot.getTargetEntity()
        if (!this.bot.target) return
        if (!t || t.map !== "crypt" || !this.isCryptKillable(t)) {
            this.bot.target = undefined
        }
    }

    /** Party member fighting away from the rally point (by player.target / distance). */
    private getCryptCombatMate(instanceId: string) {
        const wpIdx = this.memoryStorage.getCryptWaypointIndex
        const waypoint = (wpIdx < CRYPT_ROUTE.length ? CRYPT_ROUTE[wpIdx] : undefined) ?? CRYPT_ENTRANCE
        return this.bot.getPlayers({ isPartyMember: true }).find(p => {
            if (p.id === this.bot.id || p.rip) return false
            if (p.map !== "crypt" || (p.in && p.in !== instanceId)) return false
            if (Tools.distance(p, waypoint) <= CRYPT_PARTY_WAIT_RANGE) return false
            // Only join if we can see killables on them — stale p.target alone caused hangs
            return this.bot.getEntities().some(e => e.target === p.id && this.isCryptKillable(e))
        })
    }

    private async enterCryptInstance(instanceId: string) {
        if (this.bot.map === "crypt" && this.bot.in === instanceId) {
            await this.moveInsideCrypt(CRYPT_ENTRANCE)
            return
        }

        // Wrong instance — leave first
        if (this.bot.map === "crypt" && this.bot.in !== instanceId) {
            await this.bot.leaveMap().catch(debugLog)
        }

        // Door to crypt is on cave
        try {
            await this.bot.smartMove(CRYPT_DOOR, { getWithin: Constants.DOOR_REACH_DISTANCE })
            if (!this.bot.ready) return
            await this.bot.enter("crypt", instanceId)
        } catch (ex) {
            console.warn(`${this.bot.name} crypt enter failed: ${ex}`)
        }
    }

    private isPartyReadyAtCryptEntrance(instanceId: string): boolean {
        return this.isPartyReadyAtCryptRally(instanceId, CRYPT_ENTRANCE)
    }

    /** True if any expected combat bot is missing, dead, or not yet in this instance. */
    private hasIncompleteCryptParty(instanceId: string): boolean {
        return this.getCryptCombatAlliesInInstance(instanceId).length < this.getExpectedCryptCombatCount()
    }

    /** Full main-setup party alive in crypt and near rally (entrance or shared WP). */
    private isPartyReadyAtCryptRally(instanceId: string, rally: IPosition): boolean {
        const expected = this.getExpectedCryptCombatCount()
        const allies = this.getCryptCombatAlliesInInstance(instanceId)
        if (allies.length < expected) return false
        return allies.every(b => Tools.distance(b, rally) <= CRYPT_PARTY_WAIT_RANGE)
    }

    /**
     * Use tank (fallback: priest, then self) for crypt threat math.
     * DPS bots alone undercount HPS and overcount incoming DPS → skipped easy packs.
     */
    private getCryptTankStrategy(): StateStrategy {
        const tankId = this.memoryStorage.getCurrentTank
        const tank = this.getCombatPartyOnServer().find(s => s.getBot()?.id === tankId && !s.getBot().rip)
        if (tank) return tank
        const priest = this.getCombatPartyOnServer().find(s => s.getBot()?.ctype === "priest" && !s.getBot().rip)
        if (priest) return priest
        return this
    }

    private getCryptPackAround(focus: Entity): Entity[] {
        return this.bot.getEntities({ withinRange: CRYPT_MOB_DETECT_RANGE }).filter(e =>
            e.map === "crypt"
            && !CRYPT_BLACKLIST.includes(e.type)
            && e.xp > 0
            && !(this.isOverhealingMob(e) && this.bot.slots.orb?.name === TEST_ORB)
            && Tools.distance(e, focus) <= CRYPT_PULL_PACK_RANGE
            && (!e.target || e.id === focus.id || this.isPartyCryptTarget(e.target)),
        )
    }

    /** Whole pack is easy enough for the party to burn together (no single-pull). */
    private isCryptPackSafeToTake(mobs: Entity[]): boolean {
        if (mobs.length < 1) return true
        const tank = this.getCryptTankStrategy()
        const hps = calculate_hps(tank.getBot())
        if (hps <= 0) return false
        return calculate_monsters_dps(tank, tank, mobs) / hps < CRYPT_SAFE_PULL_RATIO
    }

    /**
     * Opening pull is safe if focus + nearby untagged pack won't overwhelm tank HPS.
     * Already-engaged mobs (have a target) are always allowed so we can finish fights.
     */
    private isCryptPullSafe(focus: Entity): boolean {
        if (focus.target) return true
        return this.isCryptPackSafeToTake(this.getCryptPackAround(focus))
    }

    protected isPartyCryptTarget(targetId: string | undefined): boolean {
        if (!targetId) return false
        if (targetId === this.bot.id) return true
        return this.getCombatPartyOnServer().some(s => s.getBot()?.id === targetId)
    }

    /** Any crypt mob already fighting our party within detect range. */
    private hasPartyCryptEngage(): boolean {
        return this.bot.getEntities({ withinRange: CRYPT_MOB_DETECT_RANGE }).some(e =>
            e.map === "crypt"
            && e.xp > 0
            && !CRYPT_BLACKLIST.includes(e.type)
            && this.isPartyCryptTarget(e.target),
        )
    }

    /** >1 killables still close enough that opening one would drag another. */
    private isCryptPackClustered(mobs: Entity[]): boolean {
        if (mobs.length < 2) return false
        for (let i = 0; i < mobs.length; i++) {
            for (let j = i + 1; j < mobs.length; j++) {
                if (Tools.distance(mobs[i], mobs[j]) < CRYPT_SEPARATE_RANGE) return true
            }
        }
        return false
    }

    private isCryptPullSeparated(focus: Entity, others: Entity[]): boolean {
        return others.every(o =>
            Tools.distance(focus, o) >= CRYPT_SEPARATE_RANGE
            && Tools.distance(this.bot, o) >= CRYPT_SEPARATE_RANGE * 0.75,
        )
    }

    /** Walk focus away from the nearest other untagged mob (deeper into crypt). */
    private async dragCryptPullAway(focus: Entity, others: Entity[]) {
        if (others.length < 1) return
        const nearestOther = others.reduce((a, b) =>
            Tools.distance(this.bot, a) <= Tools.distance(this.bot, b) ? a : b,
        )
        // Away from other mob, prefer deeper crypt (away from entrance)
        const awayFromOther = Math.atan2(this.bot.y - nearestOther.y, this.bot.x - nearestOther.x)
        const awayFromEntrance = Math.atan2(
            this.bot.y - CRYPT_ENTRANCE.y,
            this.bot.x - CRYPT_ENTRANCE.x,
        )
        const step = Math.max(80, this.bot.range * 0.6)
        const angles = [
            awayFromOther,
            awayFromOther + Math.PI / 5,
            awayFromOther - Math.PI / 5,
            (awayFromOther + awayFromEntrance) / 2,
            awayFromEntrance,
        ]
        for (const angle of angles) {
            const pos: IPosition = {
                map: "crypt",
                x: this.bot.x + Math.cos(angle) * step,
                y: this.bot.y + Math.sin(angle) * step,
            }
            if (!Pathfinder.canStand(pos)) continue
            if (!Pathfinder.canWalkPath(this.bot, pos)) continue
            await this.bot.move(pos.x, pos.y).catch(debugLog)
            return
        }
    }

    /**
     * Non-vbat clustered pack near a wanted boss: priest zap-aggros one and drags it clear.
     * Everyone else holds. vbat is fought without this separation.
     */
    private async handleCryptSinglePull(mobs: Entity[]): Promise<boolean> {
        const nonVbat = mobs.filter(e =>
            e.type !== "vbat"
            && e.xp > 0
            && !CRYPT_BLACKLIST.includes(e.type),
        )
        if (nonVbat.length < 2 || !this.isCryptPackClustered(nonVbat)) return false
        // Only pull when a wanted boss is involved — otherwise path around trash
        if (!mobs.some(e => isCryptWantedMonster(e))) return false

        const onMe = nonVbat.filter(e => e.target === this.bot.id)
        const partyTagged = nonVbat.filter(e => this.isPartyCryptTarget(e.target))
        const untagged = nonVbat.filter(e => !e.target)

        // Someone already pulled — wait until separated, then burn
        if (partyTagged.length >= 1) {
            const focus = onMe[0] ?? partyTagged[0]
            const rest = nonVbat.filter(e => e.id !== focus.id)
            if (!this.isCryptPullSeparated(focus, rest.filter(e => !this.isPartyCryptTarget(e.target)))) {
                if (onMe.length > 0) {
                    await this.stopCryptSmartMove()
                    await this.dragCryptPullAway(focus, untagged.length ? untagged : rest)
                    this.addLog(`${this.bot.name} priest-dragging ${focus.type} from pack`, false)
                    return true
                }
                return true // others wait
            }
            return false // separated — party burns the pulled mob
        }

        // Nobody tagged yet — only priest opens with zap
        if (this.bot.ctype !== "priest") return true

        const wantedNonVbat = untagged.filter(e =>
            isCryptWantedMonster(e) && e.type !== "vbat",
        )
        const focusPool = wantedNonVbat.length > 0 ? wantedNonVbat : untagged
        const focus = focusPool.reduce((a, b) =>
            Tools.distance(this.bot, a) <= Tools.distance(this.bot, b) ? a : b,
        )

        await this.stopCryptSmartMove()
        const zapRange = Math.min(
            CRYPT_PRIEST_PULL_RANGE,
            (Game.G.skills as { zapperzap?: { range?: number } }).zapperzap?.range ?? CRYPT_PRIEST_PULL_RANGE,
        )
        const dist = Tools.distance(this.bot, focus)
        if (dist > zapRange * 0.9) {
            await this.moveInsideCrypt(
                { map: "crypt", x: focus.x, y: focus.y },
                Math.max(40, zapRange * 0.7),
            )
            return true
        }

        if (this.bot.canUse("zapperzap") && !this.bot.isOnCooldown("zapperzap")) {
            const zap = (this.bot as { zapperZap?: (id: string) => Promise<unknown> }).zapperZap
            if (zap) await zap.call(this.bot, focus.id).catch(debugLog)
            this.addLog(`${this.bot.name} zap-pulling ${focus.type}`, false)
        } else if (dist > this.bot.range * 0.85) {
            await this.moveInsideCrypt(
                { map: "crypt", x: focus.x, y: focus.y },
                Math.max(20, this.bot.range * 0.7),
            )
        }
        return true
    }

    /** Fight / approach / single-pull nearby crypt killables. */
    private async handleCryptEngage(candidates: Entity[]): Promise<boolean> {
        if (candidates.length < 1) return false

        if (await this.handleCryptSinglePull(candidates)) return true

        const nearbyKillables = candidates.filter(e => this.shouldAttack(e))
        if (nearbyKillables.length < 1) return false

        // Prefer crypt objective bosses
        nearbyKillables.sort((a, b) => {
            const aw = isCryptWantedMonster(a) ? 0 : 1
            const bw = isCryptWantedMonster(b) ? 0 : 1
            if (aw != bw) return aw - bw
            return Tools.distance(this.bot, a) - Tools.distance(this.bot, b)
        })

        await this.stopCryptSmartMove()
        const inRange = nearbyKillables.filter(
            e => Tools.distance(this.bot, e) <= this.bot.range,
        )
        if (inRange.length > 0) {
            const kiteTarget = inRange.find(e => this.shouldKiteMonster(e))
            if (kiteTarget && Tools.distance(this.bot, kiteTarget) < this.getSafeKiteDistance(kiteTarget)) {
                await this.kiteAwayFrom(kiteTarget)
            }
            return true
        }
        const nearest = nearbyKillables[0]
        const approachWithin = this.shouldKiteMonster(nearest)
            ? this.getSafeKiteDistance(nearest)
            : Math.max(20, this.bot.range * 0.7)
        await this.moveInsideCrypt(
            { map: "crypt", x: nearest.x, y: nearest.y },
            approachWithin,
        )
        return true
    }

    private async scareIfCryptOverwhelmed(): Promise<boolean> {
        const targeting = this.bot.getEntities({ targetingMe: true })
        if (targeting.length < 1) return false

        const blacklist = targeting.filter(e => CRYPT_BLACKLIST.includes(e.type))
        const tank = this.getCryptTankStrategy()
        const hps = calculate_hps(tank.getBot())
        const packDps = hps > 0 ? calculate_monsters_dps(tank, tank, targeting) : 0
        const overwhelmed = hps > 0 && packDps / hps >= CRYPT_OVERWHELM_RATIO
        if (blacklist.length < 1 && !overwhelmed) return false

        if (this.bot.isOnCooldown("scare")) return false
        if (!this.bot.canUse("scare", { ignoreEquipped: true }) && this.bot.slots.orb?.name !== JACKO
            && this.bot.locateItem(JACKO) < 0) {
            return false
        }
        const focus = (blacklist.length > 0 ? blacklist : targeting).reduce((a, b) =>
            Tools.distance(this.bot, a) <= Tools.distance(this.bot, b) ? a : b,
        )
        await this.scareAndRetreatFrom(focus)
        if (blacklist.length > 0) {
            this.addLog(`${this.bot.name} scare from blacklist ${focus.type}`, false)
        }
        return true
    }

    private canResumeCrypt(): boolean {
        const settings = MY_CHARACTERS.get(this.bot.id)
        if (!settings?.isMainSetup) return false
        if (this.bot.serverData.region !== DEFAULT_SERVER_REGION) return false
        if (this.bot.serverData.name !== DEFAULT_SERVER_NAME) return false
        return true
    }

    private async deferCryptForLater(reason: string) {
        const cryptState: State = {
            state_type: "crypt",
            wantedMob: this.current_state?.wantedMob ?? [],
            instanceId: this.current_state?.instanceId ?? this.memoryStorage.getActiveCryptInstance,
            server: { region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME },
        }
        // Only queue resume if crypt is still marked active — otherwise bots loop after event
        const activeId = this.memoryStorage.getActiveCryptInstance
        if (cryptState.instanceId && activeId && cryptState.instanceId === activeId) {
            this.addStateToScheduler(cryptState)
            this.last_state = { ...cryptState }
        } else if (this.last_state?.state_type === "crypt") {
            this.last_state = this.default_state
        }
        this.addLog(`${this.bot.name} defer crypt (${reason})`)
        if (this.bot.map === "crypt") await this.bot.leaveMap().catch(debugLog)
    }

    private async handleCryptState(): Promise<boolean> {
        // skipcrypt / generation bump — stop immediately, don't revive old instance
        if (this.isCryptRunStale()) {
            await this.abortCryptRun()
            return true
        }

        // Only main composition on home server runs crypt
        if (!this.canResumeCrypt()) {
            await this.deferCryptForLater("not home main setup")
            this.current_state = this.last_state ?? this.default_state
            return true
        }

        let instanceId = this.current_state.instanceId
            ?? this.memoryStorage.getActiveCryptInstance
        if (!instanceId) {
            // Skip cleared active — leave crypt state instead of spinning forever
            if (this.memoryStorage.isCryptSkipInProgress) {
                await this.abortCryptRun()
                return true
            }
            this.addLog(`${this.bot.name} crypt state waiting for instanceId`, false)
            return true
        }

        const activeId = this.memoryStorage.getActiveCryptInstance
        // Party released / merchant cleared active — leave (don't block same-id recall)
        if (!activeId) {
            if (this.memoryStorage.isCryptSkipInProgress) {
                await this.abortCryptRun()
                return true
            }
            await this.exitReleasedCrypt("active released")
            return true
        }
        instanceId = activeId
        this.current_state.instanceId = instanceId
        if (this.cryptRunGeneration < 0) {
            this.cryptRunGeneration = this.memoryStorage.getCryptGeneration
        }
        // Do NOT re-set activeCryptInstance here — that revived finished runs after farm switch

        // Higher priority events can interrupt — re-queue crypt for after event
        this.sortScheduler()
        const eventIdx = this.state_scheduler.findIndex(s => s.state_type === "event")
        if (eventIdx >= 0) {
            if (eventIdx > 0) {
                const [ev] = this.state_scheduler.splice(eventIdx, 1)
                this.state_scheduler.unshift(ev)
            }
            await this.deferCryptForLater("event interrupt")
            this.switchState()
            return true
        }

        if (this.bot.map !== "crypt" || this.bot.in !== instanceId) {
            if (this.isCryptRunStale()) {
                await this.abortCryptRun()
                return true
            }
            // Don't reset shared waypoint — after death/respawn rejoin at last party point
            this.cryptPartyReady = false
            await this.enterCryptInstance(instanceId)
            return true
        }

        // Non-priest: stick to priest before independent combat pathing
        if (await this.followCryptLeaderIfNeeded()) return true

        // Priest: return to first point if any combat ally is dead/missing/far (ignore merchant)
        if (await this.priestRegroupCryptIfNeeded(instanceId)) return true

        const sharedWp = this.memoryStorage.getCryptWaypointIndex
        const isPriest = this.bot.ctype === "priest"
        const firstPoint = this.getCryptFirstPoint()

        // Phase 1: priest rallies at entrance; others only follow (already handled above)
        if (!this.cryptPartyReady) {
            if (isPriest) {
                if (Tools.distance(this.bot, firstPoint) > CRYPT_WAYPOINT_ARRIVE_RANGE) {
                    await this.moveInsideCrypt(firstPoint)
                    return true
                }
                if (!this.isPartyReadyAtCryptRally(instanceId, firstPoint)) {
                    const party = this.getCombatPartyOnServer()
                    const readyCount = party.filter(s => {
                        const b = s.getBot()
                        return b.map === "crypt"
                            && b.in === instanceId
                            && !b.rip
                            && Tools.distance(b, firstPoint) <= CRYPT_PARTY_WAIT_RANGE
                    }).length
                    this.addLog(
                        `${this.bot.name} waiting party at crypt first point ${readyCount}/${this.getExpectedCryptCombatCount()}`,
                        false,
                    )
                    return true
                }
                this.cryptPartyReady = true
                this.addLog(
                    `${this.bot.name} crypt party ready — resume route at wp ${this.memoryStorage.getCryptWaypointIndex}`,
                )
            } else {
                // Mark ready once priest has the full party nearby
                if (this.areCryptCombatAlliesNearPriest(instanceId)) {
                    this.cryptPartyReady = true
                } else {
                    return true
                }
            }
        }

        // Lethal pack on us — scare early (don't wait for 33% HP)
        if (await this.scareIfCryptOverwhelmed()) return true

        // Incomplete party (dead/missing): clear ready so we rally at entrance after revive
        // Stragglers only: do NOT clear cryptPartyReady (that rewound the priest to WP0)
        if (this.hasIncompleteCryptParty(instanceId)) {
            const inFight = this.bot.getEntities({ targetingMe: true }).length > 0
                || !!this.bot.getTargetEntity()
            if (!inFight) {
                this.cryptPartyReady = false
                if (!isPriest && await this.followCryptLeaderIfNeeded()) return true
                if (isPriest && await this.priestRegroupCryptIfNeeded(instanceId)) return true
                return true
            }
        } else if (!this.areCryptCombatAlliesNearPriest(instanceId)) {
            const inFight = this.bot.getEntities({ targetingMe: true }).length > 0
                || !!this.bot.getTargetEntity()
            if (!inFight) {
                if (!isPriest && await this.followCryptLeaderIfNeeded()) return true
                if (isPriest && await this.priestRegroupCryptIfNeeded(instanceId)) return true
                return true
            }
        }

        const candidates = this.getCryptCombatCandidates()
        // Track wanted bosses (vbat / a1 / a2 / a3 / a7) for clear condition
        for (const e of this.bot.getEntities({ withinRange: CRYPT_MOB_DETECT_RANGE * 2 })) {
            if (e.map === "crypt") this.memoryStorage.noteCryptWantedSeen(e.id, e.type, e.level)
        }

        // Overhealers (heal > party DPS): test_orb → skip; else equip / scare+flee
        if (await this.handleCryptOverhealThreats()) return true

        if (await this.handleCryptEngage(candidates)) return true

        this.clearStaleCryptTarget()

        // Mate pulled a fight away from the route — join them, don't wait on next WP
        // (skip while party incomplete — avoids 1vN death spiral)
        if (!this.hasIncompleteCryptParty(instanceId)) {
            const combatMate = this.getCryptCombatMate(instanceId)
            if (combatMate) {
                await this.stopCryptSmartMove()
                if (Tools.distance(this.bot, combatMate) > this.bot.range) {
                    await this.moveInsideCrypt(
                        { map: "crypt", x: combatMate.x, y: combatMate.y },
                        Math.max(40, this.bot.range * 0.6),
                    )
                }
                return true
            }
        }

        // Don't walk past fightable mobs (softer than shouldAttack — ignores tank-only / pack gates)
        const worthFighting = candidates.filter(e => this.isCryptWorthEngaging(e))
        if (worthFighting.length > 0) {
            if (await this.handleCryptEngage(candidates)) return true
            this.addLog(`${this.bot.name} holding route — ${worthFighting.length} fightable nearby`, false)
            return true
        }

        // Wanted bosses: only leave after a FULL route pass (don't bail at first kill)
        if (sharedWp >= CRYPT_ROUTE.length) {
            const prog = this.memoryStorage.getCryptWantedProgress()
            if (this.memoryStorage.areCryptWantedObjectivesComplete()) {
                await this.completeCryptRun(
                    `route done, wanted cleared (${prog.killed}/${prog.seen})`,
                )
                return true
            }
            if (prog.seen > 0) {
                // Still missing kills — sweep the route again
                this.memoryStorage.setCryptWaypointIndex = 0
                this.cryptPartyReady = false
                this.addLog(
                    `${this.bot.name} crypt resweep for wanted bosses (${prog.killed}/${prog.seen} killed)`,
                )
                return true
            }
            // No wanted bosses seen after a full pass — leave; merchant verifies
            await this.completeCryptRun("route finished (no wanted bosses seen)")
            return true
        }

        // Non-priest: never walk the shared route — only follow priest
        if (!isPriest) {
            if (await this.followCryptLeaderIfNeeded()) return true
            return true
        }

        const waypoint = CRYPT_ROUTE[sharedWp]

        // Priest walks the route alone; advance when at WP and all combat allies are nearby
        if (Tools.distance(this.bot, waypoint) > CRYPT_WAYPOINT_ARRIVE_RANGE) {
            await this.moveInsideCrypt(waypoint)
            return true
        }

        if (!this.areCryptCombatAlliesNearPriest(instanceId)) {
            this.addLog(
                `${this.bot.name} waiting allies near priest at crypt WP ${sharedWp}`,
                false,
            )
            return true
        }

        this.memoryStorage.setCryptWaypointIndex = sharedWp + 1
        this.addLog(
            `${this.bot.name} crypt waypoint ${sharedWp + 1}/${CRYPT_ROUTE.length}`,
            false,
        )
        return true
    }

    private async checkState() {
        if(this.deactivate) return

        if (this.bot.rip) return setTimeout(this.checkState, 1000)

        // DOUBLE CHECK IF WE MISSING CURRENT STATE => APPLY DEFAULT
        if(!this.current_state)  this.current_state = this.default_state

        // Active crypt still open — don't keep farming while priest waits inside
        this.ensureActiveCryptState()

        // Crypt: interrupt smartMove on mobs / party fight / stale destination
        if (this.current_state.state_type === "crypt") {
            if (this.bot.smartMoving) {
                const dest = this.bot.smartMoving
                // Arrived but smartMoving flag stuck — unblock route (common hang until restart)
                if (dest?.map === "crypt" && Tools.distance(this.bot, dest) <= CRYPT_WAYPOINT_ARRIVE_RANGE) {
                    await this.stopCryptSmartMove()
                } else {
                const hasMobs = this.getCryptCombatCandidates().some(e => this.isCryptWorthEngaging(e))
                const mateFighting = !!this.current_state.instanceId
                    && !!this.getCryptCombatMate(this.current_state.instanceId)
                let wrongDest = false
                if (this.bot.ctype === "priest") {
                    const wpIdx = this.memoryStorage.getCryptWaypointIndex
                    const instanceId = this.current_state.instanceId
                        ?? this.memoryStorage.getActiveCryptInstance
                    const incomplete = !!instanceId && this.hasIncompleteCryptParty(instanceId)
                    const toEntrance = !this.cryptPartyReady || incomplete
                    const expectedDest = toEntrance
                        ? this.getCryptFirstPoint()
                        : (wpIdx < CRYPT_ROUTE.length ? CRYPT_ROUTE[wpIdx] : undefined)
                    wrongDest = !!expectedDest && !!dest
                        && (dest.map !== "crypt" || Tools.distance(dest, expectedDest) > CRYPT_WAYPOINT_SYNC_RANGE)
                }
                // Non-priest follows priest — don't cancel smartMove for "wrong waypoint"
                if (hasMobs || mateFighting || wrongDest) {
                    await this.stopCryptSmartMove()
                } else {
                    return setTimeout(this.checkState, 400)
                }
                }
            }
            await this.handleCryptState()
            return setTimeout(this.checkState, 1000)
        }

        // WE ARE SMARTMOVING => EXIT
        if (this.bot.smartMoving) return setTimeout(this.checkState, 1000)

        // Outside crypt: hold state while specials are present
        if(this.bot.getEntities().filter( e=> SPECIAL_MONSTERS.includes(e.type) && (calculate_monster_dps(this,e)/calculate_hps(this.bot) < 0.95 || e.target)).length>0) {
            return setTimeout(this.checkState, 1000)
        }

        // CHECK EVENT BUFF IF IT EXPIRED
        await this.checkEventBuff()

        let wanted_monster: MonsterName[]
        if( typeof this.current_state.wantedMob === "string" ) wanted_monster = [this.current_state.wantedMob]
        else wanted_monster = this.current_state.wantedMob as MonsterName[]
        
        //WE ARE FARMING AND HAVE NO NEW EVENTS
        if(!this.state_scheduler.length && this.current_state.state_type == "farm" && this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length>0) return setTimeout(this.checkState, 1000)
        
        this.sortScheduler()

        // CURRENT STATE FARM 
        if(this.current_state.state_type == "farm") {

            //WE HAVE OTHER TASKS
            if(this.state_scheduler.length>0){
                // Crypt only for home main composition — keep it pending, run other tasks first
                const runnableIdx = this.state_scheduler.findIndex(
                    s => s.state_type !== "crypt" || this.canResumeCrypt()
                )
                if (runnableIdx < 0) {
                    return setTimeout(this.checkState, 1000)
                }
                if (runnableIdx > 0) {
                    const [task] = this.state_scheduler.splice(runnableIdx, 1)
                    this.state_scheduler.unshift(task)
                }
                const next = this.state_scheduler[0]
                
                //SAVING CURRENT STATE IF NEW ONE IS NOT FARM AND CURRENT FARM ^
                if(next.state_type != "farm" && this.last_state != this.current_state) this.last_state = this.current_state

                //GET NEW STATE FROM SCHEDULER
                this.switchState()
                return this.checkState()
                
            }
            //WE HAVE NO OTHER TASKS AND HAVE NO WANTED MOBS NEAR => SMART MOVING
            else if(this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length < 1) {
                console.log("there is no monsters, going search some")
                if(this.current_state.location) await this.bot.smartMove(this.current_state.location, {useBlink: this.bot.ctype == "mage", avoidTownWarps: (this.bot.ctype == "mage" || this.bot.getEntities({targetingMe: true}).length>0)}).catch(debugLog)
                else await this.bot.smartMove(wanted_monster[0], {useBlink: this.bot.ctype == "mage", avoidTownWarps: (this.bot.ctype == "mage" || this.bot.getEntities({targetingMe: true}).length>0)}).catch(debugLog)
                return setTimeout(this.checkState, 1000)
            }
        }
        // CURRENT STATE BOSS || EVENT
        else if(this.current_state.state_type == "boss" || this.current_state.state_type == "event"){
            if(this.current_state.state_type == "event") {
                const eventName = this.current_state.eventName
                const eventLive = !!(
                    eventName
                    && this.bot.S[eventName]
                    && this.bot.S[eventName]?.live != false
                )
                if (!eventLive) {
                    // Franky etc. ended — leave event even if nerfedmummy / trash remain
                    this.state_scheduler = this.state_scheduler.filter(s =>
                        !(s.state_type === "event" && s.eventName === eventName),
                    )
                    this.switchState()
                    return setTimeout(this.checkState, 1000)
                }
                // Still live: fight specials if present, else path to event
                if(this.bot.getEntities().filter( e=> SPECIAL_MONSTERS.includes(e.type)).length>0) {
                    return setTimeout(this.checkState, 1000)
                }
                let join
                if(WANTED_EVENTS[eventName]?.join) {
                    join = (eventName in Game.G.maps) ? eventName as MapName : eventName as MonsterName;
                }
                await this.bot.smartMove(join ?? this.bot.S[eventName], {useBlink: this.bot.ctype == "mage", avoidTownWarps: (this.bot.ctype == "mage" || this.bot.getEntities({targetingMe: true}).length>0)}).catch(console.warn)
                return setTimeout(this.checkState, 1000)
            }

            // boss (non-event)
            if(this.bot.getEntities().filter( e=> SPECIAL_MONSTERS.includes(e.type)).length>0) {
                return setTimeout(this.checkState, 1000)
            }
            console.debug(`${this.bot.name} checking state ${this.current_state.state_type} ${this.current_state.wantedMob}`)
            // if we are too far moving to mob
            if(Tools.distance(this.current_state.location, this.bot) > 400) {
                console.debug(`${this.bot.name} too far from ${this.current_state.location.toString()}`)
                // for bosses we should have location
                await this.bot.smartMove(this.current_state.location, {useBlink: this.bot.ctype == "mage", avoidTownWarps: (this.bot.ctype == "mage" || this.bot.getEntities({targetingMe: true}).length>0)}).catch(debugLog)
            }
            const currentBoss = this.bot.getEntities().filter( e=> wanted_monster.includes(e.type))[0]
            console.debug(`${this.bot.name} current boss: ${currentBoss?.type}\n
                target: ${currentBoss?.target} dps: ${calculate_monster_dps(this,currentBoss,true)} hps: ${calculate_hps(this.bot)} ratio: ${calculate_monster_dps(this,currentBoss,true)/calculate_hps(this.bot)}`)
            // if we smartmoved and still not found or boss is OP
            if( !currentBoss ) {
                console.debug(`${this.bot.name} not found ${this.current_state.wantedMob}`)
                this.switchState()
                return setTimeout(this.checkState, 1000)
        
            }
            else if (currentBoss && !currentBoss.target && calculate_monster_dps(this,currentBoss,true)/calculate_hps(this.bot) > 1) {
                console.debug(`${this.bot.name} found ${this.current_state.wantedMob} but it is OP`)
                this.switchState()
                return setTimeout(this.checkState, 1000)
            }
        }
        else if(this.current_state.state_type == "quest") {
            //Change state to event by priority
            if(this.state_scheduler[0]?.state_type == "event") {
                console.debug(`${this.bot.name} quest aborted, switching to ${this.state_scheduler[0].state_type}`)
                this.switchState()
                return setTimeout(this.checkState, 1000)
            }
            //Quest completed need to take rewards
            if(this.bot.s.monsterhunt && this.bot.s.monsterhunt.c == 0) {
                await this.bot.smartMove("monsterhunter", {useBlink: this.bot.ctype == "mage", avoidTownWarps: (this.bot.ctype == "mage" || this.bot.getEntities({targetingMe: true}).length>0)}).catch(debugLog)
                await this.bot.finishMonsterHuntQuest().catch(debugLog)
                if(this.state_scheduler.length<1) await this.bot.getMonsterHuntQuest().catch(debugLog)
            }
            //Quest not completed
            else if(this.bot.s.monsterhunt && this.bot.s.monsterhunt.c > 0) {
                if(!this.getWantedMobList().includes(this.bot.s.monsterhunt?.id)) {
                    this.current_state = {state_type: "quest", wantedMob: this.bot.s.monsterhunt?.id }
                }
                if(this.bot.getEntities().filter( e => this.bot.s.monsterhunt?.id == e.type).length <1) {
                    await this.bot.smartMove(this.bot.s.monsterhunt!.id, {useBlink: this.bot.ctype == "mage", avoidTownWarps: (this.bot.ctype == "mage" || this.bot.getEntities({targetingMe: true}).length>0)}).catch(debugLog)
                }
                const questMonsters = this.bot.getEntities().filter( e => e.type == this.bot.s.monsterhunt?.id )
                const questMonstersCanBeKilled = questMonsters.filter( e => this.shouldAttack(e))
                if(questMonsters?.length>1 && questMonstersCanBeKilled.length<1) {
                    this.switchState()
                    setTimeout(() => {
                        this.addStateToScheduler({state_type: "quest", wantedMob: "goo", server: {region: this.bot.serverData.region, name: this.bot.serverData.name}})
                    }, Math.max(1, this.bot.s.monsterhunt?.ms ?? 0))
                }
                return setTimeout(this.checkState, 1000)
            }
            //Quest not started
            if(!this.bot.s.monsterhunt) {
                if(this.state_scheduler.length<1){
                    await this.bot.smartMove("monsterhunter", {useBlink: this.bot.ctype == "mage", avoidTownWarps: (this.bot.ctype == "mage" || this.bot.getEntities({targetingMe: true}).length>0)}).catch(debugLog)
                    await this.bot.getMonsterHuntQuest().catch(debugLog)
                    if(!this.bot.s.monsterhunt?.id) return setTimeout(this.checkState, 1000)
                    this.current_state = {state_type: "quest", wantedMob: this.bot.s.monsterhunt?.id, server: {region: this.bot.serverData.region, name: this.bot.serverData.name}}
                    this.addLog(`Quest started: ${this.bot.s.monsterhunt?.id}`)
                    if(this.bot.s.monsterhunt?.id) await this.bot.smartMove(this.bot.s.monsterhunt.id, {useBlink: this.bot.ctype == "mage", avoidTownWarps: (this.bot.ctype == "mage" || this.bot.getEntities({targetingMe: true}).length>0)}).catch(debugLog)
                    return setTimeout(this.checkState, 1000)
                }
                else {
                    this.switchState()
                    return setTimeout(this.checkState, 1000)
                }
            }
        }
        console.warn("Not any scenario of changing state was processed, keep farming")
        return setTimeout(this.checkState, 1000)
    }

    private sortScheduler() {
        if(this.state_scheduler.length<2) return
        this.state_scheduler.sort( (curr, next) => {
            const rank = (t: State["state_type"]) => {
                if (t === "event") return 0
                if (t === "boss") return 1
                if (t === "crypt") return 2
                if (t === "quest") return 3
                return 4
            }
            return rank(curr.state_type) - rank(next.state_type)
        })
    }

    public getWantedMob(): MonsterName|MonsterName[] {
        return this.current_state?.wantedMob
    }

    protected getWantedMobList(): MonsterName[] {
        if (typeof this.current_state?.wantedMob === "string") return [this.current_state.wantedMob]
        if (Array.isArray(this.current_state?.wantedMob)) return this.current_state.wantedMob
        return []
    }

    protected getTarget(): Entity | null {
        if(this.deactivate) return
        //we want to switch if target will die 
        //we want to select boss instead of regular mob
        //we want to switch on spawned mob instead of boss
        //we want to switch target if another map
        //prioritize boss => mobs targeting party => wantedMob => lowest hp => distance
        //we don't want to targeting mob with dps more than 2x hps
        // console.log(`Target loop, ${this.bot.target}`)
        let target = this.bot.getTargetEntity()
        const wantedMob = this.getWantedMobList()
        let entities = this.bot.getEntities().filter( e => this.shouldAttack(e))
        if(entities.length<1) {
            return target
        }
        try {
            if(!target || (target && target.willBurnToDeath()) || target.map != this.bot.map || Tools.distance(this.bot, target) > this.bot.range * 1.5) {
                // console.log("Searching target")
                entities = this.sortEntities(entities)
                if (!entities[0]) return target
                this.bot.target = entities[0].id
                // console.log(`Target found?: ${this.bot.target}`)
                return entities[0]
            }
            else if(target && target["1hp"] && target.spawns) {
                entities = this.sortEntities(entities, {sortSpawns: true})
                if(entities[0].id != target.id) this.bot.target = entities[0].id
                return entities[0]
            }
            else if (target && !SPECIAL_MONSTERS.includes(target.type)) {
                entities = this.sortEntities(entities)
                if(
                    (!SPECIAL_MONSTERS.includes(target.type) && SPECIAL_MONSTERS.includes(entities[0].type))
                    || (!wantedMob.includes(target.type) && wantedMob.includes(entities[0].type))
                ) {
                    this.bot.target = entities[0].id
                    if(this.bot.ready && this.bot.smartMoving) this.bot.stopSmartMove().catch(debugLog)
                }
                return this.bot.getTargetEntity() ?? entities[0]
            }
            else if (target && target.map != this.bot.map) {
                entities = this.sortEntities(entities)
                this.bot.target = entities[0].id
                return entities[0]
            }
        }
        catch(ex) {
            console.warn(ex)
        }
        return this.bot.getTargetEntity() ?? target
    }

    private sortEntities(entities: Entity[], filter?: MobsSortFilter): Entity[] {
        let target = this.bot.getTargetEntity()
        
        entities = entities.filter(e=> !e.s.fullguard && !e.willBurnToDeath() && !e.willDieToProjectiles(this.bot, this.bot.projectiles, this.bot.players, this.bot.entities))
        let spawners: Entity[] = []
        if(filter?.sortSpawns && entities.filter( e => SPECIAL_MONSTERS.includes(e.type) && e["1hp"]).length>0) {
            spawners = entities.filter( e => SPECIAL_MONSTERS.includes(e.type) && e["1hp"] && e.spawns)
        }
        return entities.sort(
            (curr, next) => {
                let dist_current = Tools.distance(this.bot, curr)
                let dist_next = Tools.distance(this.bot, next)
                const wantedMob = this.getWantedMobList()
                let targetingCurrent = this.bot.getPlayers({isPartyMember: true}).filter( e => e.target == curr.id).length
                let targetingNext = this.bot.getPlayers({isPartyMember: true}).filter( e => e.target == next.id).length
                // SPAWNS FIRST
                if(filter?.sortSpawns && spawners.some(spawner => spawner.spawns ) ) {
                    if(spawners.some(spawner => spawner.spawns.some(spawn => spawn[1] == curr.type))!= spawners.some(spawner => spawner.spawns.some(spawn => spawn[1] == next.type))) {
                        return (spawners.some(spawner => spawner.spawns.some(spawn => spawn[1] == curr.type)) && spawners.some(spawner => spawner.spawns.some(spawn => spawn[1] != next.type))) ? -1 : 1;
                    }
                }
                // SPECIAL MONSTERS FIRST
                if((SPECIAL_MONSTERS.includes(curr.type) && !curr["1hp"]) != (SPECIAL_MONSTERS.includes(next.type) && !next["1hp"])) {
                    return (SPECIAL_MONSTERS.includes(curr.type) && !curr["1hp"]) ? -1 : 1;
                }
                // Crypt objectives: vbat / a1 / a2 / a3 / a7 first
                if (this.current_state?.state_type === "crypt") {
                    const currWanted = isCryptWantedMonster(curr)
                    const nextWanted = isCryptWantedMonster(next)
                    if (currWanted != nextWanted) return currWanted ? -1 : 1
                }
                // In crypt: prioritize healers (*heal* abilities)
                if (this.current_state?.state_type === "crypt") {
                    const currHeal = this.hasHealAbility(curr)
                    const nextHeal = this.hasHealAbility(next)
                    if (currHeal != nextHeal) return currHeal ? -1 : 1
                }
                // WANTED MOB FIRST
                if(wantedMob && curr.type!=next.type && (wantedMob.includes(curr.type) || wantedMob.includes(next.type))) {
                    return (wantedMob.includes(curr.type)) ? -1 : 1;
                }
                // CURSED AND MARKED FIRST
                if(curr.s.cursed!=next.s.cursed) return (curr.s.cursed && !next.s.cursed) ? -1 : 1;
                if(curr.s.marked!=next.s.marked) return (curr.s.marked && !next.s.marked) ? -1 : 1;
                // WICH ONE ATTAKING MOST PARTY MEMBERS FIRST
                if(targetingCurrent!=targetingNext) {
                    return (targetingCurrent && !targetingNext) ? -1 : 1;
                }
                if((dist_current < this.bot.range) != (dist_next < this.bot.range)) return (dist_current < this.bot.range) ? -1 : 1;
                if(curr.hp != next.hp) {
                    return (curr.hp < next.hp) ? -1 : 1;
                }
                return 0;
        })
    }

    private hasHealAbility(entity: Entity): boolean {
        if (!entity?.abilities) return false
        return Object.keys(entity.abilities).some(k => k.toLowerCase().includes("heal"))
    }

    /**
     * Soft "should we stop for this mob".
     * Prefer wanted bosses; don't stop the route for avoidable trash.
     */
    private isCryptWorthEngaging(entity: Entity): boolean {
        if (!entity || entity.map !== "crypt") return false
        if (CRYPT_BLACKLIST.includes(entity.type)) return false
        if (entity.xp < 1) return false
        // Never park the route on overhealers (a5/a8/…) — skip with test_orb / scare
        if (this.isOverhealingMob(entity)) return false
        if (this.isPartyCryptTarget(entity.target)) return true
        if (entity.target) return false
        // Objectives only — path around everything else
        return isCryptWantedMonster(entity)
    }

    protected shouldAttack(entity: Entity): boolean {
        if (!entity) return false
        if (this.current_state?.state_type === "crypt") {
            if (CRYPT_BLACKLIST.includes(entity.type)) return false
            if (entity.xp < 1) return false
            // Unkillable healers — never DPS them (blocks route / endless fights)
            if (this.isOverhealingMob(entity)) return false
            // Party already fighting — help finish
            if (this.isPartyCryptTarget(entity.target)) return true
            if (entity.target) return false
            // Open only objective bosses
            if (!isCryptWantedMonster(entity)) return false
            // One fight at a time unless it's another wanted we need (vbat ok with pack)
            if (this.hasPartyCryptEngage() && entity.type !== "vbat") {
                return false
            }
            return true
        }
        return super.shouldAttack(entity)
    }

    
}