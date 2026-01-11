import { MapName, MonsterName, Observer, PingCompensatedCharacter } from "alclient";
import { StateStrategy } from "../common_functions/state_strategy";
import { WANTED_EVENTS } from "../classes_configs/events_and_spots";

export class StateController {
    private bots: StateStrategy[]

    private serverObserver: Observer

    constructor(bots: StateStrategy[]) {
        this.bots = bots
        // this.serverObserver = serverObserver
        this.checkEvents = this.checkEvents.bind(this)
        this.checkEvents()
    }

    private async checkEvents() {
        for(let bot of this.bots) {
            let b = bot.stateBot
            let events = Object.keys(b.S).filter( e => b.S[e].live != false  && WANTED_EVENTS.has(e as MonsterName | MapName))
            if(events.length) {
                events.forEach( (e) => {
                    bot.addStateToScheduler({
                        state_type: "event",
                        wantedMob: WANTED_EVENTS.get(e as MonsterName),
                        eventName: e as MonsterName | MapName
                    })
                    console.log(`Found event for ${b.name}:`)
                    console.log(JSON.stringify(e))
                })
                
            }
        }
        setTimeout(this.checkEvents, 60 * 1000)
    }
}