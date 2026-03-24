import { Constants, Game, MapName, MonsterName, Observer, PingCompensatedCharacter, ServerData, ServerIdentifier, ServerRegion, Tools } from "alclient";
import { State, StateStrategy } from "../common_functions/state_strategy";
import { WANTED_EVENTS } from "../configs/events_and_spots";
import { DEFAULT_SERVER_REGION, DEFAULT_SERVER_NAME, MemoryStorage } from "../common_functions/memory_storage";
import { IState } from "./state_interface";
import { debugLog, startBotWithStrategy, MY_CHARACTERS } from "../common_functions/common_functions";
import * as CF from "../common_functions/common_functions"

export class StateController {
    private bots: IState[]

    private serverObservers: Observer[] = []

    private serversToObserve: ServerData[] = [
        Game.servers.ASIA.I,
        Game.servers.EU.I,
        Game.servers.EU.II,
        Game.servers.US.I,
        Game.servers.US.II,
        Game.servers.US.III,
    ]
    private memoryStorage: MemoryStorage

    constructor(bots: IState[], memoryStorage: MemoryStorage) {
        this.bots = bots
        this.memoryStorage = memoryStorage
        // this.serverObserver = serverObserver
        this.checkEvents = this.checkEvents.bind(this)
        this.checkSendItems = this.checkSendItems.bind(this)
        this.reconnect = this.reconnect.bind(this)
        this.disconnectFirst = this.disconnectFirst.bind(this)
        this.manageCharactersLoop = this.manageCharactersLoop.bind(this)
        
        this.checkSendItems()

        for(let i of bots) {
            let bot = i.getBot()
            bot.socket.on("disconnect", (data) => this.reconnect(data, bot))
            bot.socket.on("code_eval", (data) => this.manageCommand(data, bot))
            
            // if(bot instanceof StateStrategy) {
            //     (i as StateStrategy).startQuest()
            // }
        }

        this.serversToObserve.forEach( server => {
            const observer = new Observer(server, Game.G, Game.user.userAuth )
            this.serverObservers.push(observer)
            observer.connect(true, true).catch(console.warn)

        })
        
        this.checkEvents()
        this.manageCharactersLoop()
        // setTimeout(this.disconnectFirst, 30_000)
    }

    private disconnectFirst(){
        if(this.bots[0].getBot().ready) {
            console.debug(`Disconnecting ${this.bots[0].getBot().id}`)
            this.bots[0].getBot().disconnect()
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
        if(bot instanceof StateStrategy) {
            bot.startQuest()
        }
    }

    private deactivateStrategy(bot: PingCompensatedCharacter) {
        for(const strat of this.bots) {
            if(strat.getBot().id != bot.id) continue
            return strat.deactivateStrat()
        }
    }

    private async reconnect(data, bot) {
        console.warn(`${Date.now()} ${bot.name} disconnected. Cause:\n${JSON.stringify(data)}`)
        this.deactivateStrategy(bot)
        let new_bot
        try{

            for(let i = 0; i<this.bots.length; i++) {
                let state = this.bots[i]
                if( state.getBot().name == bot.name ) {
                    const sRegion = bot.serverData?.ServerRegion ?? bot.serverData?.region
                    const sID = bot.serverData?.name
                    new_bot = await startBotWithStrategy(bot.ctype, bot.name, sRegion, sID, this.memoryStorage)
                    this.bots[i] = new_bot
                    console.warn(`${Date.now()} Bot started. ${i} in bots list, ready: ${new_bot.getBot().ready}. Length of bots ${this.bots.length}.`)
                    this.memoryStorage.addEventListners(new_bot.getBot())
                    new_bot.getBot().socket.on("disconnect", (data) => this.reconnect(data, new_bot.getBot()))
                    new_bot.getBot().socket.on("code_eval", (data) => this.manageCommand(data, new_bot.getBot()))
                    // if(new_bot instanceof StateStrategy) {
                    //     new_bot.startQuest()
                    // }
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
            let wait = /wait_(\d+)_seconds/.exec(String(ex))
            if(wait && wait[1]) {
                setTimeout( () => this.reconnect(ex, bot), Number.parseInt(wait[1]))
            }
            else if (/limits/.test(String(ex))) {
                setTimeout( () => this.reconnect(ex, bot), Constants.RECONNECT_TIMEOUT_MS )
            }
            else if (/nouser/.test(String(ex))) {
                throw new Error(`Authorization failed for ${bot.name}! No longer trying to reconnect...`);
            }
            else {
                setTimeout( () => this.reconnect(data, bot), 10_000)
            }
        }
    }



    private getWantedEvents() {
        let wantedEvents: { serverRegion: ServerRegion, serverName: ServerIdentifier, eventName: MonsterName | MapName }[] = []
        this.serverObservers.forEach( (observer) => {
            wantedEvents.push(...Object.keys(observer.S).filter( e => observer.S[e].live != false  && WANTED_EVENTS[e] && (WANTED_EVENTS[e].wantedOnOtherServer || (observer.serverData.region == DEFAULT_SERVER_REGION && observer.serverData.name == DEFAULT_SERVER_NAME))).map( e => ({
                serverRegion: observer.serverData.region,
                serverName: observer.serverData.name,
                eventName: e as MonsterName | MapName
            })))
        })
        wantedEvents.sort((a, b) => {
            if(a.serverRegion != b.serverRegion && a.serverName != b.serverName) {
                return (a.serverRegion == DEFAULT_SERVER_REGION && a.serverName == DEFAULT_SERVER_NAME) ? -1 : 1
            }
            if(WANTED_EVENTS[a.eventName]?.wantedOnOtherServer && !WANTED_EVENTS[b.eventName]?.wantedOnOtherServer) {
                return (WANTED_EVENTS[a.eventName]?.wantedOnOtherServer == true) ? -1 : 1
            }
            return 0
        })
        return wantedEvents
    }

    private async checkEvents() {

        let wantedEvents = this.getWantedEvents()
        if(wantedEvents.length == 0) return setTimeout(this.checkEvents, 10 * 1000)
        if(this.bots.filter( e => e.getStateType() != "event" && e instanceof StateStrategy).length < 1) return setTimeout(this.checkEvents, 10 * 1000)
        const mostWantedEvent = wantedEvents[0]
        let wantedCharacters = Object.keys(MY_CHARACTERS).filter( e => MY_CHARACTERS.get(e)?.server.region == mostWantedEvent.serverRegion && MY_CHARACTERS.get(e)?.server.name == mostWantedEvent.serverName)
        if(wantedCharacters.length < 3) {
            if(!wantedCharacters.includes("Archealer")) {
                wantedCharacters.push("Archealer")
            }
            if(wantedCharacters.length < 3 && !wantedCharacters.includes("arMAGEdon")) {
                wantedCharacters.push("arMAGEdon")
            }
        }
        for(const char of this.bots) {
            if(char.getBot().ctype == "merchant") continue
            if(!wantedCharacters.includes(char.getBot().id)) {
                this.stopCharacter(char.getBot().id)
                continue
            }
            const bot = char.getBot()
            if(bot.serverData.region != mostWantedEvent.serverRegion || bot.serverData.name != mostWantedEvent.serverName) {
                await this.stopCharacter(bot.id)
                await this.addNewBot(await startBotWithStrategy(
                    char.getBot().ctype,
                    char.getBot().id,
                    mostWantedEvent.serverRegion,
                    mostWantedEvent.serverName,
                    this.memoryStorage
                ));
                (this.bots.find( e => e.getBot().id == bot?.id) as StateStrategy)?.addStateToScheduler({
                    state_type: "event",
                    wantedMob: WANTED_EVENTS[mostWantedEvent.eventName].monsters,
                    eventName: mostWantedEvent.eventName,
                    server: {region: mostWantedEvent.serverRegion, name: mostWantedEvent.serverName}
                } as State)
            }
            else {
                (char as StateStrategy).addStateToScheduler({
                    state_type: "event",
                    wantedMob: WANTED_EVENTS[mostWantedEvent.eventName].monsters,
                    eventName: mostWantedEvent.eventName,
                    server: {region: mostWantedEvent.serverRegion, name: mostWantedEvent.serverName}
                } as State)
            }

        }
        
        setTimeout(this.checkEvents, 10 * 1000)
    }

    private async manageCharactersLoop() {
        if(this.getWantedEvents().length == 0) return setTimeout(this.manageCharactersLoop, 10 * 1000)
        for(const char of this.bots) {
            //not management merchant
            if(char.getBot().ctype == "merchant") continue
            const bot = char.getBot()
            //main setup character
            if(MY_CHARACTERS.get(bot.id)?.isMainSetup == true) continue
            console.debug(`Stopping ${bot.id} cause not in main setup and no events`)
            this.stopCharacter(bot.id)
        }
        for(const char of MY_CHARACTERS.keys()) {
            if(this.bots.find( e => e.getBot().id == char)) continue
            if(MY_CHARACTERS.get(char)?.isMainSetup != true)
            console.debug(`Starting ${char} cause no events`)
            this.addNewBot(await startBotWithStrategy(
                MY_CHARACTERS.get(char)?.ctype,
                char,
                MY_CHARACTERS.get(char)?.server.region,
                MY_CHARACTERS.get(char)?.server.name,
                this.memoryStorage
            ))
        }
        setTimeout(this.manageCharactersLoop, 10 * 1000)
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

    /*
    * @param start - start Warious ASIA I
    * @param stop - stop Warious
    * @param farm - farm Warious dryad  
    // commands farm quest start shutdown
    */
    private async manageCommand(data: string, sourceBot: PingCompensatedCharacter) {
        if (!data) return
        if (data.split(" ").length < 1) return
        const parts = data.split(" ")
        const command = parts[0]
        const name = parts[1]
        switch (command) {
            case "start":
                if(this.bots.length>=4) return console.debug(`${name} too many bots`)
                if(!CF.MY_CHARACTERS.get(name)) return console.debug(`${name} unknown character`)
                // if (!parts[2] || !parts[3]) return console.error(`Cannot start without server: ${data}`)
                return this.addNewBot(await startBotWithStrategy(
                    CF.MY_CHARACTERS.get(name)?.ctype,
                    name,
                    parts[2] as unknown as ServerRegion,
                    parts[3] as unknown as ServerIdentifier,
                    this.memoryStorage
                ))
            case "stop":
                const botState = this.bots.find( e => e.getBot().id == name)
                if(!botState) return
                name.split(',').forEach( e => this.stopCharacter(e))
                break
            case "quest":
                if (!name) return console.error(`Cannot start quest without ids: ${data}`)
                for(const id of name.split(',')) {
                    const botState = this.bots.find(e => e.getBot().id == id)
                    if(botState && botState instanceof StateStrategy) (botState as StateStrategy).startQuest()
                }
                break
            case "farm": 
                if (data.split(" ").length < 3) return console.error(`Cannot set farm without mobs: ${data}`)
                for(const id of name.split(',')) {
                    const botState = this.bots.find( e => e.getBot().id == id)
                    if(botState && botState instanceof StateStrategy) {
                        botState.addStateToScheduler({
                            state_type: "farm",
                            wantedMob: data.split(' ')[2].split(',').filter( e => Game.G.monsters[e as MonsterName]) as MonsterName[]
                        } as State)
                    }
                }
                break;
            case "tank":
                if(!name || name == "") return console.error(`Cannot switch tank without name: ${data}`)
                this.memoryStorage.setCurrentTank = name
                break
            case "partyleader":
                if(!name || name == "") return console.error(`Cannot switch party leader without name: ${data}`)
                this.memoryStorage.setCurrentPartyLeader = name
                break
            // case "looter":
            //     if(data.split(' ').length<2) return console.error(`Cannot switch looter without name: ${data}`)
            //     this.memoryStorage.setCurrentLooter = data.split(' ')[1]
            //     break
            default:
                console.error(`${sourceBot?.id} unknown command ${command}\n${JSON.stringify(data)}`)
        }
    }

    private stopCharacter(name: string) {
        const botState = this.bots.find( e => e.getBot().id == name)
        if(!botState) return
        const botToStop = botState.getBot()
        botState.deactivateStrat()
        botToStop.socket.off("disconnect")
        console.debug(`${name} shutdown. ${this.bots.length} bots left`)
        let newList = []
        for(let i=0; i<this.bots.length; i++) {
            if(this.bots[i].getBot().id == name) continue
            newList.push(this.bots[i])
        }
        this.bots = newList
        console.debug(`${name} shutdown. ${this.bots.length} bots left`)
        return botToStop.disconnect()
    }
}