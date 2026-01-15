import { Constants, MapName, MonsterName, Observer, Tools } from "alclient";
import { StateStrategy } from "../common_functions/state_strategy";
import { WANTED_EVENTS } from "../configs/events_and_spots";
import { MemoryStorage } from "../common_functions/memory_storage";

export class StateController {
    private bots: StateStrategy<String>[]

    private serverObserver: Observer

    private memoryStorage: MemoryStorage

    constructor(bots: StateStrategy<String>[], memoryStorage: MemoryStorage) {
        this.bots = bots
        this.memoryStorage = memoryStorage
        // this.serverObserver = serverObserver
        this.checkEvents = this.checkEvents.bind(this)
        this.checkSendItems = this.checkSendItems.bind(this)
        this.checkEvents()
        this.checkSendItems()
    }

    private async checkEvents() {
        for(let bot of this.bots) {
            let b = bot.stateBot
            let events = Object.keys(b.S).filter( e => b.S[e].live != false  && WANTED_EVENTS.has(e as MonsterName | MapName))
            if(events.length) {
                events.forEach( (e) => {
                    if(bot.currentState?.eventName != e && !bot.stateScheduler.some( s => s.eventName == e)) {
                        bot.addStateToScheduler({
                            state_type: "event",
                            wantedMob: WANTED_EVENTS.get(e as MonsterName),
                            eventName: e as MonsterName | MapName
                        })
                        console.log(`Found event for ${b.name}:`)
                        console.log(JSON.stringify(e))
                    }
                })
                
            }
        }
        setTimeout(this.checkEvents, 60 * 1000)
    }

    private checkSendItems() {
        let merchant = this.memoryStorage.getActiveBots.filter( e => e.ctype == "merchant")[0]
        if( !merchant ) return setTimeout( this.checkSendItems, 1000 )
        
        for(const i of this.bots) {
            let bot = i.stateBot
            if( merchant.serverData.name != bot.serverData.name || merchant.serverData.region != bot.serverData.region ) continue;
            if( Tools.distance(merchant,bot) > Constants.NPC_INTERACTION_DISTANCE ) continue
            i.sendItems(merchant.name)
        }

        setTimeout( this.checkSendItems, 10000 )
    }
}