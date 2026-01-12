import { Database, Entity, MonsterName, PingCompensatedCharacter, Game, Tools, IPosition, Constants, MapName } from "alclient"
import { StateModel } from "../database/state/state.model"
import fs from "fs"
import { MemoryStorage } from "./memory_storage"
import { ManageItems } from "./manage_items_strategy"

export type MobsSortFilter = {
    sortSpawns? : boolean,

}

export type State = {
    wantedMob: MonsterName | MonsterName[],
    state_type: "farm" | "event" | "boss" | "quest",
    location?: IPosition
    eventName?: MonsterName | MapName
}

export class StateStrategy extends ManageItems {

    private current_state : State

    private last_state: State

    private state_scheduler: State[] = []

    private default_state: State = {
        wantedMob: "spider",
        state_type: "farm"
    }

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        super(bot as PingCompensatedCharacter, memoryStorage)
        
        //bind context functions
        this.getTargetLoop = this.getTargetLoop.bind(this)
        this.checkState = this.checkState.bind(this)
        this.saveState = this.saveState.bind(this)


        //trigger started functions
        
        this.runLoops()
    }

    private async runLoops() {
        await this.loadState()
        this.getTargetLoop()
        this.checkState()
        setTimeout(this.saveState, 2000)
    }

    public addStateToScheduler(state: State) {
        this.state_scheduler.push(state)
    }

    public get stateBot() {
        return this.bot
    }

    private async checkEventBuff() {
    
        if(this.bot.S.holidayseason && !this.bot.s.holidayspirit)
        {
            await this.bot.smartMove("main").catch(console.warn)
            await this.bot.getHolidaySpirit()
        }
    }

    private async loadState() {

        return this.current_state = {
            wantedMob: "goo",
            state_type: "farm"
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
                        location: savedState.location
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
        if(this.current_state.state_type == "event" || this.current_state.state_type == "boss") return setTimeout(this.saveState, Constants.MONGO_UPDATE_MS)
        if(Database.connection) {
            try {
                const stateData = {
                botId: this.bot.id,
                wantedMob: this.current_state.wantedMob,
                state_type: this.current_state.state_type,
                location: this.current_state.location
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
        if(this.bot.smartMoving) return setTimeout(this.startQuest, 1000)
        if(this.bot.target && Constants.ONE_SPAWN_MONSTERS.includes(this.bot.getTargetEntity().type)) return setTimeout(this.startQuest, 1000)
        if(["boss", "event"].includes(this.current_state.state_type)) return setTimeout(this.startQuest, 1000)
        await this.bot.smartMove("monsterhunter").catch(console.warn)
        await this.bot.getMonsterHuntQuest()
        if(this.current_state.state_type == "farm" && this.last_state != this.current_state) {
            this.last_state = this.current_state
        }
        this.current_state = {wantedMob: this.bot.s.monsterhunt!.id, state_type: "quest"}
        await this.bot.smartMove(this.bot.s.monsterhunt!.id).catch(console.warn)
    }

    private async checkState() {
        // console.log(`Check state, smartmoving: ${this.bot.smartMoving}`)
        // WE ARE SMARTMOVING => EXIT
        if( this.bot.smartMoving) return setTimeout(this.checkState, 1000)

        // console.log(`Check state continue. Current state: ${this.current_state.state_type} : ${this.current_state.wantedMob}`)
        
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
                this.current_state = this.state_scheduler.shift()
                
                //SMARTMOVING TO THE POINT
                if(this.current_state.location) {
                    this.bot.smartMove(this.current_state.location).catch(console.warn)
                }
                else if( this.current_state.state_type == "event" && 
                    this.current_state.eventName &&
                    (this.bot.S[this.current_state.eventName]?.live != "false")) {
                        console.log(`State: ${this.current_state.state_type}, event name: ${this.current_state.eventName}`)
                        await this.bot.smartMove(this.bot.S[this.current_state.eventName]).catch(console.error)
                        return setTimeout(this.checkState, 1000)
                }
                else {
                    console.error(`We are trying to smartmove to ${this.current_state.wantedMob.toString()}`)
                }
            }
            //WE HAVE NO OTHER TASKS AND HAVE NO WANTED MOBS NEAR => SMART MOVING
            else if(this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length < 1) {
                if(this.current_state.location) await this.bot.smartMove(this.current_state.location).catch(console.warn)
                else await this.bot.smartMove(wanted_monster[0]).catch(console.warn)
                return setTimeout(this.checkState, 1000)
            }
        }
        // CURRENT STATE BOSS || EVENT
        else if(this.current_state.state_type == "boss" || this.current_state.state_type == "event"){
            // we still fighting
            if(this.bot.getEntities().filter( e=> Constants.ONE_SPAWN_MONSTERS.includes(e.type)).length>0) {
                return setTimeout(this.checkState, 1000)
            }                
            // wanted mobs not found
            else if(this.bot.getEntities().filter( e=> Constants.ONE_SPAWN_MONSTERS.includes(e.type)).length<1) {
                // if we are too far moving to mob
                if(!this.current_state.location || Tools.distance(this.current_state.location, this.bot) > 400) {
                    // for bosses we should have location
                    if (this.current_state.location) await this.bot.smartMove(this.current_state.location).catch(console.warn)
                    // for events we should check if it still going on
                    else if(this.current_state.state_type=="event" && this.current_state.eventName) {
                        // smartmoving on event if it still active
                        if(this.bot.S[this.current_state.eventName]) await this.bot.smartMove(this.bot.S[this.current_state.eventName]).catch(console.error) 
                        // else changing current state and exit
                        else {
                            this.current_state = (this.state_scheduler.length>0) ? this.state_scheduler.shift() : this.last_state
                            if(!this.current_state) this.current_state = this.default_state // double check
                            return setTimeout(this.checkState, 1000)
                        }
                    }
                }
                // if we smartmoved and still not found monster return to other tasks or farm
                if(this.bot.getEntities().filter( e=> Constants.ONE_SPAWN_MONSTERS.includes(e.type)).length<1) {
                    if(this.state_scheduler.length>0) 
                        this.current_state = this.state_scheduler.shift()
                    else 
                        this.current_state = (this.last_state != undefined) ? this.last_state : this.default_state
                    return setTimeout(this.checkState, 1000)
                }
            }
        }
        else if(this.current_state.state_type == "quest") {
            if(this.bot.s.monsterhunt && this.bot.s.monsterhunt.c == 0) {
                await this.bot.smartMove("monsterhunter").catch(console.warn)
                await this.bot.finishMonsterHuntQuest()
            }
            else if(this.bot.s.monsterhunt && this.bot.s.monsterhunt.c > 0) {
                if(this.state_scheduler.length>0) {
                    this.last_state = this.current_state
                    this.current_state = this.state_scheduler.shift()!
                    if(this.current_state.location) {
                        await this.bot.smartMove(this.current_state.location).catch(console.warn)
                    }
                    else {
                        if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                        else wanted_monster = this.current_state.wantedMob
                        await this.bot.smartMove(wanted_monster[0]).catch(console.warn)
                    }
                    return setTimeout(this.checkState, 1000)
                }
                else if(this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length <1) {
                    await this.bot.smartMove(wanted_monster[0]).catch(console.warn)
                }
                return setTimeout(this.checkState, 1000)
            }
            if(!this.bot.s.monsterhunt) {
                if(this.state_scheduler.length<1){
                    await this.bot.smartMove("monsterhunter").catch(console.warn)
                    await this.bot.getMonsterHuntQuest()
                    this.current_state = {state_type: "quest", wantedMob: this.bot.s.monsterhunt!.id}
                    await this.bot.smartMove(this.bot.s.monsterhunt!.id).catch(console.warn)
                    return setTimeout(this.checkState, 1000)
                }
                else {
                    this.current_state = this.state_scheduler.shift()!
                    if(this.current_state.location) {
                        await this.bot.smartMove(this.current_state.location).catch(console.warn)
                    }
                    else {
                        if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                        else wanted_monster = this.current_state.wantedMob
                        await this.bot.smartMove(wanted_monster[0]).catch(console.warn)
                    }
                    return setTimeout(this.checkState, 1000)
                }
            }
        }
        console.warn("Not any scenario of state was processing")
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

    private getTargetLoop() {
        //we want to switch if target will die 
        //we want to select boss instead of regular mob
        //we want to switch on spawned mob instead of boss
        //we want to switch target if another map
        //prioritize boss => mobs targeting party => wantedMob => lowest hp => distance
        //we don't want to targeting mob with dps more than 2x hps
        // console.log(`Target loop, ${this.bot.target}`)
        let target = this.bot.getTargetEntity()
        let entities = this.bot.getEntities()
        if(entities.length<1) return setTimeout(this.getTargetLoop, 500)
        try {
            if(!target || (target && target.willBurnToDeath())) {
                console.log("Searching target")
                entities = this.sortEntities(entities)
                this.bot.target = entities[0].id
                // console.log(`Target found?: ${this.bot.target}`)
            }
            else if(target && target.spawns) {
                entities = this.sortEntities(entities, {sortSpawns: true})
                if(entities[0].id != target.id) this.bot.target = entities[0].id
            }
            else if (target && !Constants.ONE_SPAWN_MONSTERS.includes(target.type)) {
                entities = this.sortEntities(entities)
                if(!Constants.ONE_SPAWN_MONSTERS.includes(target.type) && Constants.ONE_SPAWN_MONSTERS.includes(entities[0].type)) this.bot.target = entities[0].id
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
        
        entities = entities.filter(e=> !e.s.fullguard)
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
                if(Constants.ONE_SPAWN_MONSTERS.includes(curr.type)!=Constants.ONE_SPAWN_MONSTERS.includes(next.type)) {
                    return (Constants.ONE_SPAWN_MONSTERS.includes(curr.type) && !Constants.ONE_SPAWN_MONSTERS.includes(next.type)) ? -1 : 1;
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
                if(curr.hp != next.hp) {
                    return (curr.hp < next.hp) ? -1 : 1;
                }
                if(dist_current != dist_next) return (dist_current < dist_next) ? -1 : 1;
                return 0;
        })
    }
}