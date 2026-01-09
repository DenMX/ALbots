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

export class StateStrategy extends ManageItems { // class for 1 function? mv to statekeeper

    private current_state : State

    private last_state: State

    private state_scheduler: State[] = []

    private default_state: State = {
        wantedMob: "spider",
        state_type: "farm"
    }

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        setTimeout(() => this.initState(), 1000)
    }

    private async initState() {
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

    private async loadState() {
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
                console.log(`State saved in DB. ${this.bot.name}`)
            }
            catch(ex) {
                console.error("Error while saving state in DB")
                console.error(ex)
            }
        }
        fs.writeFileSync(`../${this.bot.name}_state.json`, JSON.stringify(this.current_state), "utf-8")
        console.warn(`State saved in json. ${this.bot.name}`)   
        setTimeout(this.saveState, 2000)     
    }

    public async startQuest() {
        if(this.bot.smartMoving) return setTimeout(this.startQuest, 1000)
        if(this.bot.target && Constants.ONE_SPAWN_MONSTERS.includes(this.bot.getTargetEntity().type)) return setTimeout(this.startQuest, 1000)
        if(["boss", "event"].includes(this.current_state.state_type)) return setTimeout(this.startQuest, 1000)
        await this.bot.smartMove("monsterhunter")
        await this.bot.getMonsterHuntQuest()
        if(this.current_state.state_type == "farm" && this.last_state != this.current_state) {
            this.last_state = this.current_state
        }
        this.current_state = {wantedMob: this.bot.s.monsterhunt!.id, state_type: "quest"}
        await this.bot.smartMove(this.bot.s.monsterhunt!.id)
    }

    private async checkState() {
        if( this.bot.smartMoving) return setTimeout(this.checkState, 1000)
        if(!this.current_state)  this.current_state = this.default_state
        let wanted_monster: MonsterName[]
        if(this.current_state.wantedMob && typeof this.current_state.wantedMob === "string" ) wanted_monster = [this.current_state.wantedMob]
        else if(this.current_state.wantedMob) wanted_monster = this.current_state.wantedMob as MonsterName[]
        if(this.state_scheduler.length<1 && this.current_state.state_type == "farm" && this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length>0) return setTimeout(this.checkState, 1000)
        this.sortScheduler()
        if(this.current_state.state_type == "farm") {
            if(this.state_scheduler.length>0){
                if(this.state_scheduler[0].state_type != "farm" && this.last_state != this.current_state) this.last_state = this.current_state
                this.current_state = this.state_scheduler.shift()!
                if(this.current_state.location) {
                    this.bot.smartMove(this.current_state.location)
                }
                else {
                    if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                    else wanted_monster = this.current_state.wantedMob
                    await this.bot.smartMove(wanted_monster[0])
                    return setTimeout(this.checkState, 1000)
                }
            }
            else if(this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length < 1) {
                if(this.current_state.location) await this.bot.smartMove(this.current_state.location)
                else await this.bot.smartMove(wanted_monster[0])
                return setTimeout(this.checkState, 1000)
            }
        }
        else if(this.current_state.state_type == "boss" || this.current_state.state_type == "event"){
            // we still fighting
            if(this.bot.getEntities().filter( e=> wanted_monster.includes(e.type)).length>0) {
                return setTimeout(this.checkState, 1000)
            }                
            // wanted mobs not found
            else if(this.bot.getEntities().filter( e=> wanted_monster.includes(e.type)).length<1) {
                // if we are too far moving to mob
                if(!this.current_state.location || Tools.distance(this.current_state.location, this.bot) > 400) {
                    if (this.current_state.location) await this.bot.smartMove(this.current_state.location)
                    else await this.bot.smartMove(wanted_monster[0])
                }
                // if we still not found monster return to other tasks or farm
                if(this.bot.getEntities().filter( e=> wanted_monster.includes(e.type)).length<1) {
                    if(this.state_scheduler.length>0) {
                        this.current_state = this.state_scheduler.shift()!
                        if(this.current_state.location) {
                            await this.bot.smartMove(this.current_state.location)
                            return setTimeout(this.checkState, 1000)
                        }
                        else {
                            if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                            else wanted_monster = this.current_state.wantedMob
                            await this.bot.smartMove(wanted_monster[0])
                            return setTimeout(this.checkState, 1000)
                        }
                    }
                    else {
                        let state = (this.last_state != null) ? this.last_state : this.default_state
                        this.current_state = state
                        if(this.current_state.location) {
                            await this.bot.smartMove(this.current_state.location)
                        }
                        else {
                            if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                            else wanted_monster = this.current_state.wantedMob
                            await this.bot.smartMove(wanted_monster[0])
                            return setTimeout(this.checkState, 1000)
                        }
                    }
                }
            }
        }
        else if(this.current_state.state_type == "quest") {
            if(this.bot.s.monsterhunt && this.bot.s.monsterhunt.c == 0) {
                await this.bot.smartMove("monsterhunter")
                await this.bot.finishMonsterHuntQuest()
            }
            else if(this.bot.s.monsterhunt && this.bot.s.monsterhunt.c > 0) {
                if(this.state_scheduler.length>0) {
                    this.last_state = this.current_state
                    this.current_state = this.state_scheduler.shift()!
                    if(this.current_state.location) {
                        await this.bot.smartMove(this.current_state.location)
                    }
                    else {
                        if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                        else wanted_monster = this.current_state.wantedMob
                        await this.bot.smartMove(wanted_monster[0])
                    }
                    return setTimeout(this.checkState, 1000)
                }
                else if(this.bot.getEntities().filter( e => wanted_monster.includes(e.type)).length <1) {
                    await this.bot.smartMove(wanted_monster[0])
                }
                return setTimeout(this.checkState, 1000)
            }
            if(!this.bot.s.monsterhunt) {
                if(this.state_scheduler.length<1){
                    await this.bot.smartMove("monsterhunter")
                    await this.bot.getMonsterHuntQuest()
                    this.current_state = {state_type: "quest", wantedMob: this.bot.s.monsterhunt!.id}
                    await this.bot.smartMove(this.bot.s.monsterhunt!.id)
                    return setTimeout(this.checkState, 1000)
                }
                else {
                    this.current_state = this.state_scheduler.shift()!
                    if(this.current_state.location) {
                        await this.bot.smartMove(this.current_state.location)
                    }
                    else {
                        if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                        else wanted_monster = this.current_state.wantedMob
                        await this.bot.smartMove(wanted_monster[0])
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
                if(curr.state_type == "event" || next.state_type == "event") {
                    return (curr.state_type == "event") ? -1 : 1;
                }
                else if(curr.state_type =="boss" || next.state_type == "boss") {
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
        let target = this.bot.getTargetEntity()
        let entities = this.bot.getEntities()
        if(entities.length<1) return setTimeout(this.getTargetLoop, 500)
        if(!target || (target && target.willBurnToDeath())) {
            entities = this.sortEntities(entities)
            this.bot.target = entities[0].id
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

    private sortEntities(entities: Entity[], filter?: MobsSortFilter): Entity[] {
        let target = this.bot.getTargetEntity()
        
        entities.sort(
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
        return entities
    }
}