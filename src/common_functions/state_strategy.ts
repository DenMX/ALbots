import { Database, Entity, MonsterName, PingCompensatedCharacter, Game, Tools, IPosition, Constants, MapName, Pathfinder, ServerRegion, ServerIdentifier } from "alclient"
import { StateModel } from "../database/state/state.model"
import { IState } from "../controllers/state_interface"
import { calculate_hps, calculate_monster_dps, debugLog } from "./common_functions"
import fs from "fs"
import { DEFAULT_SERVER_NAME, DEFAULT_SERVER_REGION, MemoryStorage } from "./memory_storage"
import { ManageItems } from "./manage_items_strategy"

export type MobsSortFilter = {
    sortSpawns? : boolean,

}

export type State = {
    wantedMob: MonsterName | MonsterName[],
    state_type: "farm" | "event" | "boss" | "quest",
    location?: IPosition
    eventName?: MonsterName | MapName
    server: {region: ServerRegion, name: ServerIdentifier}
}

export class StateStrategy extends ManageItems implements IState {

    private current_state : State

    private last_state: State

    private state_scheduler: State[] = []

    private default_state: State = {
        wantedMob: "spider",
        state_type: "farm",
        server: {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME}
    }

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        super(bot as PingCompensatedCharacter, memoryStorage)
        
        //bind context functions
        this.getTargetLoop = this.getTargetLoop.bind(this)
        this.checkState = this.checkState.bind(this)
        this.saveState = this.saveState.bind(this)
        this.kiteLoop = this.kiteLoop.bind(this)
        this.switchState = this.switchState.bind(this)



        //trigger started functions
        this.kiteLoop()
        this.runLoops()
    }

    public getStateType() : string {
        return this.current_state.eventName ? this.current_state.eventName as string : this.current_state.state_type as string
    }

    private async runLoops() {
        await this.loadState()
        this.getTargetLoop()
        this.checkState()
        if(this.deactivate) return
        setTimeout(this.saveState, 2000)
    }

    public addStateToScheduler(state: State) {
        if(this.state_scheduler.some( e => e.state_type == state.state_type && e.wantedMob == state.wantedMob)) {
            console.debug(`${this.bot.name} state ${state.state_type} ${state.wantedMob} already in scheduler`)
            return
        }
        this.state_scheduler.push(state)
    }

    public get currentState() {
        return this.current_state
    }

    public set currentState(state: State) {
        if(this.current_state.state_type == "farm") {
            this.last_state = this.current_state
            this.current_state = state
        }
    }

    public get stateScheduler() {
        return this.state_scheduler
    }

    public get stateBot() {
        return this.bot
    }

    private async checkEventBuff() {
    
        if(this.bot.S.holidayseason && !this.bot.s.holidayspirit)
        {
            await this.bot.smartMove("main", {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.warn)
            await this.bot.getHolidaySpirit()
        }
    }

    private async kiteLoop() {
        if(this.deactivate) return
        if(this.bot.isDisabled() || this.bot.rip) return setTimeout(this.kiteLoop, 1000)
        if(this.bot.moving || this.bot.smartMoving) return setTimeout(this.kiteLoop, 1000)
        
        const mobsTargetingMe = this.bot.getEntities({targetingMe: true})
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
        
        if(currentTank == this.bot.id && hasLargeDistanceBetweenMobs) {
            // console.debug('Slightly moving to pull mobs together')
            await this.bot.move(this.bot.x + Math.random()*50 - 20, this.bot.y + Math.random()*50 - 20, {disableErrorLogs: true}).catch(debugLog)
        }
        else if(currentTank != this.bot.id) await this.kite()
        
        
        setTimeout(this.kiteLoop, 1000)
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
            } else {
                // Если нельзя дойти напрямую, используем smartMove
                await this.bot.smartMove(kitePosition).catch(debugLog)
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
                    } else {
                        await this.bot.smartMove(testPosition).catch(debugLog)
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
                            } else {
                                await this.bot.smartMove(fallbackPosition).catch(console.warn)
                            }
                            return
                        }
                    }
                }
            }
        }
    }

    private async loadState() {

        return this.current_state = {
            wantedMob: "spider",
            state_type: "quest",
            server: {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME}
        }
        // load saved in DB
        if(Database.connection) {
            try{
                const savedState = await StateModel.findOne({
                    botId: this.bot.id
                }).exec()
                if(savedState) {
                    this.current_state = {
                        wantedMob: savedState.wantedMob,
                        state_type: savedState.state_type as "farm" | "event" | "boss" | "quest",
                        location: savedState.location,
                        server: {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME}
                    }
                }
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
                this.current_state = JSON.parse(fileData)
            }
            catch(ex) {
                console.error(`Error while loading state\n${ex}`)
                this.current_state = this.default_state
            }
        }
        
    }

    private async saveState() {
        if(this.deactivate) return
        if(this.current_state.state_type == "event" || this.current_state.state_type == "boss") {
            return setTimeout(this.saveState, Constants.MONGO_UPDATE_MS)
        }
        if(Database.connection) {
            try {
                const stateData = {
                botId: this.bot.id,
                wantedMob: this.current_state.wantedMob,
                state_type: this.current_state.state_type,
                location: this.current_state.location,
                server: this.current_state.server || {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME}
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
        
        this.state_scheduler.push({wantedMob: this.bot.s.monsterhunt!.id, state_type: "quest", server: {region: this.bot.serverData.region, name: this.bot.serverData.name}})
    }

    private switchState() {
        this.current_state = (this.state_scheduler.length>0) ? this.state_scheduler.shift() : this.last_state ?? this.default_state
    }

    private async checkState() {
        if(this.deactivate) return

        // WE ARE SMARTMOVING => EXIT
        if( this.bot.smartMoving || this.bot.rip) return setTimeout(this.checkState, 1000)

        if(this.bot.getEntities().filter( e=> Constants.SPECIAL_MONSTERS.includes(e.type) && (calculate_monster_dps(this.bot,e)/calculate_hps(this.bot) < 0.95 || e.target)).length>0) return setTimeout(this.checkState, 1000)

        // CHECK EVENT BUFF IF IT EXPIRED
        await this.checkEventBuff()

        // DOUBLE CHECL IF WE MISSING CURRENT STATE => APPLY DEFAULT
        if(!this.current_state)  this.current_state = this.default_state

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
                
                //SAVING CURRENT STATE IF NEW ONE IS NOT FARM AND CURRENT FARM ^
                if(this.state_scheduler[0].state_type != "farm" && this.last_state != this.current_state) this.last_state = this.current_state

                //GET NEW STATE FROM SCHEDULER
                this.switchState()
                return this.checkState()
                
            }
            //WE HAVE NO OTHER TASKS AND HAVE NO WANTED MOBS NEAR => SMART MOVING
            else if(this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length < 1) {
                console.log("there is no monsters, going search some")
                if(this.current_state.location) await this.bot.smartMove(this.current_state.location, {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.warn)
                else await this.bot.smartMove(wanted_monster[0], {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.warn)
                return setTimeout(this.checkState, 1000)
            }
        }
        // CURRENT STATE BOSS || EVENT
        else if(this.current_state.state_type == "boss" || this.current_state.state_type == "event"){
            // we still fighting
            if(this.bot.getEntities().filter( e=> Constants.SPECIAL_MONSTERS.includes(e.type)).length>0) {
                return setTimeout(this.checkState, 1000)
            }                
            // wanted mobs not found
            else if(this.bot.getEntities().filter( e=> Constants.SPECIAL_MONSTERS.includes(e.type)).length<1) {
                if(this.current_state.state_type == "event") {
                    if( this.bot.S[this.current_state?.eventName] && this.bot.S[this.current_state.eventName]?.live != false) {
                        await this.bot.smartMove(this.bot.S[this.current_state.eventName], {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.error)
                        return setTimeout(this.checkState, 1000)
                    }
                    else {
                        this.switchState()// double check
                        return setTimeout(this.checkState, 1000)
                    }
                }
                else {
                    console.debug(`${this.bot.name} checking state ${this.current_state.state_type} ${this.current_state.wantedMob}`)
                    // if we are too far moving to mob
                    if(Tools.distance(this.current_state.location, this.bot) > 400) {
                        console.debug(`${this.bot.name} too far from ${this.current_state.location.toString()}`)
                        // for bosses we should have location
                        await this.bot.smartMove(this.current_state.location, {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.warn)
                    }
                    const currentBoss = this.bot.getEntities().filter( e=> e.type == this.current_state.wantedMob)[0]
                    console.debug(`${this.bot.name} current boss: ${currentBoss?.type}\n
                        target: ${currentBoss?.target} dps: ${calculate_monster_dps(this.bot,currentBoss,true)} hps: ${calculate_hps(this.bot)} ratio: ${calculate_monster_dps(this.bot,currentBoss,true)/calculate_hps(this.bot)}`)
                    // if we smartmoved and still not found or boss is OP
                    if( !currentBoss ) {
                        console.debug(`${this.bot.name} not found ${this.current_state.wantedMob}`)
                        this.switchState()
                        return setTimeout(this.checkState, 1000)
                
                    }
                    else if (currentBoss && !currentBoss.target && calculate_monster_dps(this.bot,currentBoss,true)/calculate_hps(this.bot) > 1) {
                        console.debug(`${this.bot.name} found ${this.current_state.wantedMob} but it is OP`)
                        this.switchState()
                        return setTimeout(this.checkState, 1000)
                    }
                }
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
                await this.bot.smartMove("monsterhunter", {useBlink: this.bot.ctype == "mage"}).catch(console.warn)
                await this.bot.finishMonsterHuntQuest()
            }
            //Quest not completed
            else if(this.bot.s.monsterhunt && this.bot.s.monsterhunt.c > 0) {
                if(this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length <1) {
                    await this.bot.smartMove(wanted_monster[0], {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.warn)
                }
                const questMonsters = this.bot.getEntities().filter( e => e.type == this.bot.s.monsterhunt?.id && calculate_monster_dps(this.bot,e)/calculate_hps(this.bot) < 1)
                if(questMonsters.length<1) {
                    this.switchState()
                }
                return setTimeout(this.checkState, 1000)
            }
            //Quest not started
            if(!this.bot.s.monsterhunt) {
                if(this.state_scheduler.length<1){
                    await this.bot.smartMove("monsterhunter", {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.warn)
                    await this.bot.getMonsterHuntQuest()
                    this.current_state = {state_type: "quest", wantedMob: this.bot.s.monsterhunt?.id, server: {region: this.bot.serverData.region, name: this.bot.serverData.name}}
                    await this.bot.smartMove(this.bot.s.monsterhunt!.id, {useBlink: this.bot.ctype == "mage", avoidTownWarps: this.bot.ctype == "mage"}).catch(console.warn)
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
            if(curr.state_type!=next.state_type ) {
                if(curr.state_type!=next.state_type && (curr.state_type == "event" || next.state_type == "event")) {
                    return (curr.state_type == "event") ? -1 : 1;
                }
                else if(curr.state_type!=next.state_type && (curr.state_type =="boss" || next.state_type != "boss")) {
                    return (curr.state_type == "boss") ? -1 : 1;
                }
            }
            return 0
        })
    }

    public getWantedMob(): MonsterName|MonsterName[] {
        return this.current_state.wantedMob
    }

    private getTargetLoop() {
        if(this.deactivate) return
        //we want to switch if target will die 
        //we want to select boss instead of regular mob
        //we want to switch on spawned mob instead of boss
        //we want to switch target if another map
        //prioritize boss => mobs targeting party => wantedMob => lowest hp => distance
        //we don't want to targeting mob with dps more than 2x hps
        // console.log(`Target loop, ${this.bot.target}`)
        let target = this.bot.getTargetEntity()
        let entities = this.bot.getEntities().filter( e => e.xp > 0 && (calculate_monster_dps(this.bot,e)/calculate_hps(this.bot) < 1 || e.target))
        if(entities.length<1) {
            return setTimeout(this.getTargetLoop, 500)
        }
        try {
            if(!target || (target && target.willBurnToDeath()) || target.map != this.bot.map) {
                // console.log("Searching target")
                entities = this.sortEntities(entities)
                this.bot.target = entities[0].id
                // console.log(`Target found?: ${this.bot.target}`)
            }
            else if(target && target.spawns) {
                entities = this.sortEntities(entities, {sortSpawns: true})
                if(entities[0].id != target.id) this.bot.target = entities[0].id
            }
            else if (target && !Constants.SPECIAL_MONSTERS.includes(target.type)) {
                entities = this.sortEntities(entities)
                if(!Constants.SPECIAL_MONSTERS.includes(target.type) && Constants.SPECIAL_MONSTERS.includes(entities[0].type)) {
                    this.bot.target = entities[0].id
                    if(this.bot.smartMoving) this.bot.stopSmartMove().catch(debugLog)
                }
            }
            else if (target && target.map != this.bot.map) {
                entities = this.sortEntities(entities)
                this.bot.target = entities[0].id
            }
        }
        catch(ex) {
            console.warn(ex)
        }
        finally {
            setTimeout(this.getTargetLoop, 500)
        }
        
    }

    private sortEntities(entities: Entity[], filter?: MobsSortFilter): Entity[] {
        let target = this.bot.getTargetEntity()
        
        entities = entities.filter(e=> !e.s.fullguard && !e.willBurnToDeath() && !e.willDieToProjectiles(this.bot, this.bot.projectiles, this.bot.players, this.bot.entities))
        return entities.sort(
            (curr, next) => {
                let dist_current = Tools.distance(this.bot, curr)
                let dist_next = Tools.distance(this.bot, next)
                let wantedMob
                if(this.current_state?.wantedMob && typeof this.current_state.wantedMob === "string") wantedMob = [this.current_state.wantedMob]
                else if(this.current_state?.wantedMob ) wantedMob = this.current_state.wantedMob
                if(filter?.sortSpawns && target.spawns) {
                    if(target.spawns.some(spawn => spawn[1] == curr.type)!= target.spawns.some(spawn => spawn[1] == next.type)) {
                        return (target.spawns.some(spawn => spawn[1] == curr.type) && target.spawns.some(spawn => spawn[1] != next.type)) ? -1 : 1;
                    }
                }
                if(Constants.SPECIAL_MONSTERS.includes(curr.type)!=Constants.SPECIAL_MONSTERS.includes(next.type)) {
                    return (Constants.SPECIAL_MONSTERS.includes(curr.type) && !Constants.SPECIAL_MONSTERS.includes(next.type)) ? -1 : 1;
                }
                
                if(curr.isAttackingUs(this.bot)!=next.isAttackingUs(this.bot)) {
                    return (curr.isAttackingUs(this.bot) && !next.isAttackingUs(this.bot)) ? -1 : 1;
                }
                if(curr.isAttackingPartyMember(this.bot)!=next.isAttackingPartyMember(this.bot)) {
                    return (curr.isAttackingPartyMember(this.bot) && !next.isAttackingPartyMember(this.bot)) ? -1 : 1;
                }
                if(wantedMob && curr.type!=next.type && (wantedMob.includes(curr.type) || wantedMob.includes(next.type))) {
                    return (wantedMob.includes(curr.type)) ? -1 : 1;
                }
                if(curr.s.cursed!=next.s.cursed) {
                    return (curr.s.cursed && !next.s.cursed) ? -1 : 1;
                }
                if(curr.s.marked!=next.s.marked) {
                    return (curr.s.marked && !next.s.marked) ? -1 : 1;
                }
                if(dist_current != dist_next) return (dist_current < dist_next) ? -1 : 1;
                if(curr.hp != next.hp) {
                    return (curr.hp < next.hp) ? -1 : 1;
                }
                return 0;
        })
    }
}