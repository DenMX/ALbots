import { Constants, MapName, MonsterName, Observer, Tools } from "alclient";
import { StateStrategy } from "../common_functions/state_strategy";
import { startBotWithStrategy } from "../common_functions/common_functions"
import { WANTED_EVENTS } from "../configs/events_and_spots";
import { MemoryStorage } from "../common_functions/memory_storage";
import { IState } from "./state_interface";

export class StateController {
    private bots: IState[]

    private serverObserver: Observer

    private memoryStorage: MemoryStorage

    constructor(bots: IState[], memoryStorage: MemoryStorage) {
        this.bots = bots
        this.memoryStorage = memoryStorage
        // this.serverObserver = serverObserver
        this.checkEvents = this.checkEvents.bind(this)
        this.checkSendItems = this.checkSendItems.bind(this)
        this.reconnect = this.reconnect.bind(this)
        this.checkEvents()
        this.checkSendItems()

        for(let i of bots) {
            let bot = i.getBot()
            bot.socket.on("disconnect", (data) => this.reconnect(data, bot))
        }
    }

    public get getBots() {
        return this.bots
    }

    public addNewBot(state: IState) {
        this.bots.push(state)
        let bot = state.getBot()
        bot.socket.on("disconnect", (data) => this.reconnect(data, bot))
        this.memoryStorage.addEventListners(bot)
    }

    private async reconnect(data, bot) {
        console.warn(`${bot.name} disconnected. Cause:\n${JSON.stringify(data)}`)
        let new_bot
        try{

            for(let i = 0; i<this.bots.length; i++) {
                let state = this.bots[i]
                if( state.getBot().name == bot.name ) {
                    new_bot = await startBotWithStrategy(bot.ctype, bot.name, bot.serverData.ServerRegion, bot.serverData.name, this.memoryStorage)
                    this.bots[i] = new_bot
                    this.memoryStorage.addEventListners(new_bot.getBot())
                    new_bot.getBot().socket.on("disconnect", (data) => this.reconnect(data, new_bot.getBot()))
                    break
                }
            }
        }
        catch(ex) {
            if(new_bot) {
                const newBotChar = new_bot.getBot()
                newBotChar.socket.removeAllListeners("disconnect")
                newBotChar.disconnect()
            }

            console.error(`Couldn't recconect ${bot?.name}\n Cause:\n${ex}`)
            let wait = /wait_(\d+)_seconds/.exec(ex)
            if(wait && wait[1]) {
                setTimeout( () => this.reconnect(ex, bot), Number.parseInt(wait[1]))
            }
            else if (/limits/.test(ex)) {
                setTimeout( () => this.reconnect(ex, bot), Constants.RECONNECT_TIMEOUT_MS )
            }
            else if (/nouser/.test(ex)) {
                throw new Error(`Authorization failed for ${bot.name}! No longer trying to reconnect...`);
            }
            else {
                setTimeout( () => this.reconnect(ex, bot), 10_000)
            }
        }

    }

    private async checkEvents() {
        for(let bot of this.bots) {
            let b = bot.getBot()
            let events = Object.keys(b.S).filter( e => b.S[e].live != false  && WANTED_EVENTS.has(e as MonsterName | MapName))
            if(events.length && bot instanceof StateStrategy) {
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
        let merchant = this.bots.filter( e => e.getBot().ctype == "merchant")[0]?.getBot()
        if( !merchant ) return setTimeout( this.checkSendItems, 1000 )
        
        for(const i of this.bots) {
            let bot = i.getBot()
            if( merchant.serverData.name != bot.serverData.name || merchant.serverData.region != bot.serverData.region ) continue;
            if( Tools.distance(merchant,bot) > Constants.NPC_INTERACTION_DISTANCE ) continue
            if(i instanceof StateStrategy) i.sendItems(merchant.name)
        }

        setTimeout( this.checkSendItems, 10000 )
    }
}