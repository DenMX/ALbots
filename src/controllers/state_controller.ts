import { MapName, MonsterName, Observer, PingCompensatedCharacter } from "alclient";
import { StateStrategy } from "../common_functions/state_strategy";
import { WANTED_EVENTS } from "../classes_configs/events_and_spots";

export class StateController {
    private bots: StateStrategy[]

    private serverObserver: Observer

    constructor(bots: StateStrategy[]) {
        this.bots = bots
        // this.serverObserver = serverObserver
        this.checkEventBuff()
        this.checkEvents()
    }

    private async checkEvents() {
        for(let bot of this.bots) {
            let b = bot.stateBot
            let events = Object.keys(b.S).filter( e => WANTED_EVENTS.has(e as MonsterName | MapName))
            if(events.length) {
                events.forEach( (e) => {
                    bot.addStateToScheduler({
                    state_type: "event",
                    wantedMob: WANTED_EVENTS.get(e as MonsterName | MapName),
                    eventName: e as MonsterName | MapName
                })
                })
                
            }
        }
    }

    private async checkEventBuff() {
        for(const bot of this.bots) {
            if(bot.stateBot.S.holidayseason && !bot.stateBot.s.holidayspirit)
            {
                await bot.stateBot.smartMove("main").catch(console.warn)
                await bot.stateBot.getHolidaySpirit()
            }
        }
        setTimeout(this.checkEventBuff, 5000)
    }
}