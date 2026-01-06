import { Database, Entity, MonsterName, PingCompensatedCharacter, Game, Tools, IPosition, Constants } from "alclient"
import * as CF from "./common_functions"
import { StateModel } from "../database/state/state.model"
import fs from "fs"
import { ResuplyStrategy } from "./resupply_strategy"
import { ManageItems } from "./manage_items_strategy"

export type MobsSortFilter = {
    sortSpawns? : boolean,

}

export type State = {
    wantedMob: MonsterName | MonsterName[],
    state_type: "farm" | "event" | "boss" | "quest",
    location?: IPosition
}

export class StateStrategy extends ManageItems { // class for 1 function? mv to statekeeper

    private current_state : State

    private last_state: State

    private state_scheduler: State[] = []

    private default_state: State = {
        wantedMob: "spider",
        state_type: "farm"
    }

    constructor (bot: PingCompensatedCharacter) {
        super(bot)
        this.loadState()
        this.getTargetLoop()
        this.checkState()
        setTimeout(this.saveState, 2000)
    }

    public addStateToScheduler(state: State) {
        this.state_scheduler.push(state)
    }

    private async loadState() {
        // load saved in DB
        if(Database.connection) {
            try{
                const savedState = await StateModel.findOne({
                    botId: super.getBot().id
                }).exec()
                if(savedState) {
                    this.current_state = {
                        wantedMob: savedState.wantedMob,
                        state_type: savedState.state_type as "farm" | "event" | "boss" | "quest",
                        location: savedState.location
                    }
                }
                return console.warn(`${super.getBot().name} loaded state from MONGO`)
            }
            catch(ex){
                console.error("Error while loading state from DB")
                console.error(ex)
            }
        }
        if( !this.current_state ) {
            try {
                let fileData = fs.readFileSync(`../${super.getBot().name}_state.json`, 'utf-8')
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
                botId: super.getBot().id,
                wantedMob: this.current_state.wantedMob,
                state_type: this.current_state.state_type,
                location: this.current_state.location
                }
                const result = await StateModel.findOneAndUpdate(
                    { botId: super.getBot().id},
                    stateData,
                    {
                        upsert: true,
                        new: true,
                        runValidators: true,
                        setDefaultsOnInsert: true
                    }
                ).exec()
                console.log(`State saved in DB. ${super.getBot().name}`)
            }
            catch(ex) {
                console.error("Error while saving state in DB")
                console.error(ex)
            }
        }
        fs.writeFileSync(`../${super.getBot().name}_state.json`, JSON.stringify(this.current_state), "utf-8")
        console.warn(`State saved in json. ${super.getBot().name}`)   
        setTimeout(this.saveState, 2000)     
    }

    public async startQuest() {
        if(super.getBot().smartMoving) return setTimeout(this.startQuest, 1000)
        if(super.getBot().target && Constants.ONE_SPAWN_MONSTERS.includes(super.getBot().getTargetEntity().type)) return setTimeout(this.startQuest, 1000)
        if(["boss", "event"].includes(this.current_state.state_type)) return setTimeout(this.startQuest, 1000)
        await super.getBot().smartMove("monsterhunter")
        await super.getBot().getMonsterHuntQuest()
        if(this.current_state.state_type == "farm" && this.last_state != this.current_state) {
            this.last_state = this.current_state
        }
        this.current_state = {wantedMob: super.getBot().s.monsterhunt!.id, state_type: "quest"}
        await super.getBot().smartMove(super.getBot().s.monsterhunt!.id)
    }

    private async checkState() {
        if( super.getBot().smartMoving) return setTimeout(this.checkState, 1000)
        let wanted_monster: MonsterName[]
        if(typeof this.current_state.wantedMob === "string" ) wanted_monster = [this.current_state.wantedMob]
        else wanted_monster = this.current_state.wantedMob
        if(this.state_scheduler.length<1 && this.current_state.state_type == "farm" && super.getBot().getEntities().filter( e => wanted_monster.includes(e.type)).length>0) return setTimeout(this.checkState, 1000)
        this.sortScheduler()
        if(this.current_state.state_type == "farm") {
            if(this.state_scheduler.length>0){
                if(this.state_scheduler[0].state_type != "farm" && this.last_state != this.current_state) this.last_state = this.current_state
                this.current_state = this.state_scheduler.shift()!
                if(this.current_state.location) {
                    super.getBot().smartMove(this.current_state.location)
                }
                else {
                    if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                    else wanted_monster = this.current_state.wantedMob
                    await super.getBot().smartMove(wanted_monster[0])
                    return setTimeout(this.checkState, 1000)
                }
            }
            else if(super.getBot().getEntities().filter( e => wanted_monster.includes(e.type)).length < 1) {
                if(this.current_state.location) await super.getBot().smartMove(this.current_state.location)
                else await super.getBot().smartMove(wanted_monster[0])
                return setTimeout(this.checkState, 1000)
            }
        }
        else if(this.current_state.state_type == "boss" || this.current_state.state_type == "event"){
            // we still fighting
            if(super.getBot().getEntities().filter( e=> wanted_monster.includes(e.type)).length>0) {
                return setTimeout(this.checkState, 1000)
            }                
            // wanted mobs not found
            else if(super.getBot().getEntities().filter( e=> wanted_monster.includes(e.type)).length<1) {
                // if we are too far moving to mob
                if(!this.current_state.location || Tools.distance(this.current_state.location, super.getBot()) > 400) {
                    if (this.current_state.location) await super.getBot().smartMove(this.current_state.location)
                    else await super.getBot().smartMove(wanted_monster[0])
                }
                // if we still not found monster return to other tasks or farm
                if(super.getBot().getEntities().filter( e=> wanted_monster.includes(e.type)).length<1) {
                    if(this.state_scheduler.length>0) {
                        this.current_state = this.state_scheduler.shift()!
                        if(this.current_state.location) {
                            await super.getBot().smartMove(this.current_state.location)
                            return setTimeout
                        }
                        else {
                            if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                            else wanted_monster = this.current_state.wantedMob
                            await super.getBot().smartMove(wanted_monster[0])
                            return setTimeout(this.checkState, 1000)
                        }
                    }
                    else {
                        let state = (this.last_state != null) ? this.last_state : this.default_state
                        this.current_state = state
                        if(this.current_state.location) {
                            await super.getBot().smartMove(this.current_state.location)
                        }
                        else {
                            if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                            else wanted_monster = this.current_state.wantedMob
                            await super.getBot().smartMove(wanted_monster[0])
                            return setTimeout(this.checkState, 1000)
                        }
                    }
                }
            }
        }
        else if(this.current_state.state_type == "quest") {
            if(super.getBot().s.monsterhunt && super.getBot().s.monsterhunt.c == 0) {
                await super.getBot().smartMove("monsterhunter")
                await super.getBot().finishMonsterHuntQuest()
            }
            else if(super.getBot().s.monsterhunt && super.getBot().s.monsterhunt.c > 0) {
                if(this.state_scheduler.length>0) {
                    this.last_state = this.current_state
                    this.current_state = this.state_scheduler.shift()!
                    if(this.current_state.location) {
                        await super.getBot().smartMove(this.current_state.location)
                    }
                    else {
                        if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                        else wanted_monster = this.current_state.wantedMob
                        await super.getBot().smartMove(wanted_monster[0])
                    }
                    return setTimeout(this.checkState, 1000)
                }
                else if(super.getBot().getEntities().filter( e => wanted_monster.includes(e.type)).length <1) {
                    await super.getBot().smartMove(wanted_monster[0])
                }
                return setTimeout(this.checkState, 1000)
            }
            if(!super.getBot().s.monsterhunt) {
                if(this.state_scheduler.length<1){
                    await super.getBot().smartMove("monsterhunter")
                    await super.getBot().getMonsterHuntQuest()
                    this.current_state = {state_type: "quest", wantedMob: super.getBot().s.monsterhunt!.id}
                    await super.getBot().smartMove(super.getBot().s.monsterhunt!.id)
                    return setTimeout(this.checkState, 1000)
                }
                else {
                    this.current_state = this.state_scheduler.shift()!
                    if(this.current_state.location) {
                        await super.getBot().smartMove(this.current_state.location)
                    }
                    else {
                        if(typeof this.current_state.wantedMob === "string") wanted_monster = [this.current_state.wantedMob]
                        else wanted_monster = this.current_state.wantedMob
                        await super.getBot().smartMove(wanted_monster[0])
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
        let target = super.getBot().getTargetEntity()
        let entities = super.getBot().getEntities()
        if(entities.length<1) return setTimeout(this.getTargetLoop, 500)
        if(!target || (target && target.willBurnToDeath())) {
            entities = this.sortEntities(entities)
            super.getBot().target = entities[0].id
        }
        else if(target && target.spawns) {
            entities = this.sortEntities(entities, {sortSpawns: true})
            if(entities[0].id != target.id) super.getBot().target = entities[0].id
        }
        else if (target && !Constants.ONE_SPAWN_MONSTERS.includes(target.type)) {
            entities = this.sortEntities(entities)
            if(!Constants.ONE_SPAWN_MONSTERS.includes(target.type) && Constants.ONE_SPAWN_MONSTERS.includes(entities[0].type)) super.getBot().target = entities[0].id
        }
        else if (target && target.map != super.getBot().map) {
            entities = this.sortEntities(entities)
            super.getBot().target = entities[0].id
        }
    }

    private sortEntities(entities: Entity[], filter?: MobsSortFilter): Entity[] {
        let target = super.getBot().getTargetEntity()
        
        entities.sort(
            (curr, next) => {
                let dist_current = Tools.distance(super.getBot(), curr)
                let dist_next = Tools.distance(super.getBot(), next)
                let wantedMob
                if(typeof this.current_state.wantedMob === "string") wantedMob = [this.current_state.wantedMob]
                else wantedMob = this.current_state.wantedMob
                if(filter?.sortSpawns && target.spawns) {
                    if(target.spawns.some(spawn => spawn[1] == curr.type)!= target.spawns.some(spawn => spawn[1] == next.type)) {
                        return (target.spawns.some(spawn => spawn[1] == curr.type) && target.spawns.some(spawn => spawn[1] != next.type)) ? -1 : 1;
                    }
                }
                if(Constants.ONE_SPAWN_MONSTERS.includes(curr.type)!=Constants.ONE_SPAWN_MONSTERS.includes(next.type)) {
                    return (Constants.ONE_SPAWN_MONSTERS.includes(curr.type) && !Constants.ONE_SPAWN_MONSTERS.includes(next.type)) ? -1 : 1;
                }
                if(curr.isAttackingUs(super.getBot())!=next.isAttackingUs(super.getBot())) {
                    return (curr.isAttackingUs(super.getBot()) && !next.isAttackingUs(super.getBot())) ? -1 : 1;
                }
                if(curr.isAttackingPartyMember(super.getBot())!=next.isAttackingPartyMember(super.getBot())) {
                    return (curr.isAttackingPartyMember(super.getBot()) && !next.isAttackingPartyMember(super.getBot())) ? -1 : 1;
                }
                if(curr.type!=next.type && (wantedMob.includes(curr.type) || wantedMob.includes(next.type))) {
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