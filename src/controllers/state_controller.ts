import { CharacterType, Constants, Game, ItemName, MapName, MonsterName, Observer, PingCompensatedCharacter, ServerData, ServerIdentifier, ServerRegion, Tools } from "alclient";
import { State, StateStrategy } from "../common_functions/state_strategy";
import { PartyStrategy } from "../common_functions/party_strategy";
import { MerchantStrategy } from "../classes_logic/merchant_strategy";
import { WANTED_EVENTS } from "../configs/events_and_spots";
import { DEFAULT_SERVER_REGION, DEFAULT_SERVER_NAME, MemoryStorage } from "../common_functions/memory_storage";
import { IState } from "./state_interface";
import { debugLog, startBotWithStrategy, MY_CHARACTERS } from "../common_functions/common_functions";
import * as CF from "../common_functions/common_functions"
import { getMetricsRuntime } from "../metrics/index"

export class StateController {
    private bots: IState[]

    /** Персонажи в процессе подключения — не запускать повторно (ingame / дубли). */
    private pendingBotStarts = new Set<string>()
    /** После Failed: ingame — пауза перед повторной попыткой. */
    private botStartBlockedUntil = new Map<string, number>()

    /** Не переключать ростер сразу после пропажи ивента в observer (фликер S). */
    private lastWantedEventAt = 0
    private static readonly EVENT_GRACE_MS = 30_000
    private static readonly INGAME_RETRY_MS = 120_000
    private static readonly BOT_START_TIMEOUT_MS = 45_000

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
        this.checkSendItems = this.checkSendItems.bind(this)
        this.reconnect = this.reconnect.bind(this)
        this.disconnectFirst = this.disconnectFirst.bind(this)
        this.manageCharactersLoop = this.manageCharactersLoop.bind(this)
        
        this.checkSendItems()

        for(let i of bots) {
            const bot = this.getBotFromState(i)
            if(!bot?.socket) continue
            bot.socket.on("disconnect", (data) => this.reconnect(data, bot))
            bot.socket.on("code_eval", (data) => this.manageCommand(data, bot))
            getMetricsRuntime()?.attachBot(bot, i)
        }

        this.serversToObserve.forEach( server => {
            const observer = new Observer(server, Game.G, Game.user.userAuth )
            this.serverObservers.push(observer)
            observer.connect(true, true).catch(console.warn)

        })
        
        this.manageCharactersLoop()
    }

    private getBotFromState(state: IState | undefined | null): PingCompensatedCharacter | undefined {
        try {
            return state?.getBot?.()
        } catch {
            return undefined
        }
    }

    private hasBotOnServer(id: string, server: { region: ServerRegion, name: ServerIdentifier }): boolean {
        return this.bots.some((s) => {
            const b = this.getBotFromState(s)
            return b?.id === id
                && b.serverData?.region === server.region
                && b.serverData?.name === server.name
        })
    }

    private disconnectFirst(){
        const bot = this.getBotFromState(this.bots[0])
        if(bot?.ready) {
            console.debug(`Disconnecting ${bot.id}`)
            bot.disconnect()
        }
    }

    public get getBots() {
        return this.bots
    }

    public addNewBot(state: IState) {
        try {
            const bot = this.getBotFromState(state)
            if(!bot?.socket) {
                console.warn("addNewBot: strategy has no connected character")
                return
            }
            if(this.bots.some((s) => this.getBotFromState(s)?.id === bot.id)) {
                console.warn(`addNewBot: ${bot.id} already in bots list`)
                return
            }
            this.bots.push(state)
            bot.socket.on("disconnect", (data) => this.reconnect(data, bot))
            bot.socket.on("code_eval", (data) => this.manageCommand(data, bot));
            getMetricsRuntime()?.attachBot(bot, state)
        }
        catch(ex) {
            console.error(`Error adding new bot:\n${ex}`)
        }
        
    }

    private deactivateStrategy(bot: PingCompensatedCharacter) {
        for(const strat of this.bots) {
            const stratBot = this.getBotFromState(strat)
            if(!stratBot || stratBot.id != bot.id) continue
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
                const stateBot = this.getBotFromState(state)
                if( stateBot?.name == bot.name ) {
                    const sRegion = bot.serverData?.ServerRegion ?? bot.serverData?.region
                    const sID = bot.serverData?.name
                    new_bot = await startBotWithStrategy(bot.ctype, bot.name, sRegion, sID, this.memoryStorage)
                    this.bots[i] = new_bot
                    const reconnected = this.getBotFromState(new_bot)
                    if(!reconnected?.socket) break
                    console.warn(`${Date.now()} Bot started. ${i} in bots list, ready: ${reconnected.ready}. Length of bots ${this.bots.length}.`)
                    // this.memoryStorage.addEventListners(reconnected)
                    reconnected.socket.on("disconnect", (data) => this.reconnect(data, reconnected))
                    reconnected.socket.on("code_eval", (data) => this.manageCommand(data, reconnected))
                    getMetricsRuntime()?.attachBot(reconnected, new_bot)
                    getMetricsRuntime()?.recordReconnect(reconnected)
                    break
                }
            }
        }
        catch(ex) {
            if(new_bot) {
                const newBotChar = this.getBotFromState(new_bot)
                if(newBotChar?.socket) {
                    newBotChar.socket.removeAllListeners("disconnect")
                    newBotChar.disconnect()
                }
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



    private isEventLiveFlag(info: { live?: boolean } | undefined): boolean {
        // Events are present in `S` even when the `live` flag field is missing.
        // Desired semantics:
        // - if the event object doesn't exist in `S` -> not live
        // - if it exists but `live` is missing -> treat as live
        // - only `live === false` means the event is ended
        if (!info) return false
        return info.live !== false
    }

    /** Prefer connected bots' S — observers often keep a dead event as live. */
    private isWantedEventLive(
        serverRegion: ServerRegion,
        serverName: ServerIdentifier,
        eventName: string,
    ): boolean {
        const botsOnServer = this.bots
            .map(s => this.getBotFromState(s))
            .filter((b): b is PingCompensatedCharacter =>
                !!b
                && b.serverData?.region === serverRegion
                && b.serverData?.name === serverName,
            )
        const withServerInfo = botsOnServer.filter(b => b.S && Object.keys(b.S).length > 0)
        if (withServerInfo.length > 0) {
            return withServerInfo.some(b => this.isEventLiveFlag(b.S[eventName]))
        }
        const observer = this.serverObservers.find(o =>
            o.serverData.region === serverRegion && o.serverData.name === serverName,
        )
        return this.isEventLiveFlag(observer?.S?.[eventName])
    }

    private getWantedEvents() {
        let wantedEvents: { serverRegion: ServerRegion, serverName: ServerIdentifier, eventName: MonsterName | MapName, monsters: MonsterName[] }[] = []
        this.serverObservers.forEach((observer) => {
            const onHome =
                observer.serverData.region == DEFAULT_SERVER_REGION
                && observer.serverData.name == DEFAULT_SERVER_NAME
            for (const eventName of Object.keys(WANTED_EVENTS) as (MonsterName | MapName)[]) {
                const cfg = WANTED_EVENTS[eventName]
                if (!cfg) continue
                if (!cfg.wantedOnOtherServer && !onHome) continue
                if (!this.isWantedEventLive(observer.serverData.region, observer.serverData.name, eventName)) continue
                wantedEvents.push({
                    serverRegion: observer.serverData.region,
                    serverName: observer.serverData.name,
                    eventName,
                    monsters: cfg.monsters,
                })
            }
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
        wantedEvents.forEach( e => { console.debug(`Found event ${e.eventName} on ${e.serverRegion} ${e.serverName}`) })
        return wantedEvents
    }

    private isActiveEventState(char: IState): boolean {
        if (!(char instanceof StateStrategy)) return false
        const strat = char as StateStrategy
        if (strat.currentState?.state_type === "event") return true
        return strat.stateScheduler?.some((s) => s.state_type === "event") ?? false
    }

    private async startBotWithTimeout(
        ctype: CharacterType | undefined,
        id: string,
        region: ServerRegion,
        name: ServerIdentifier,
    ): Promise<IState | undefined> {
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`start timeout ${id} ${region} ${name}`)),
                StateController.BOT_START_TIMEOUT_MS,
            )
        })
        try {
            return await Promise.race([
                startBotWithStrategy(ctype, id, region, name, this.memoryStorage),
                timeout,
            ])
        } finally {
            if (timer) clearTimeout(timer)
        }
    }

    private async manageCharactersLoop() {
        try {
            await this.syncRoster()
        } catch (ex) {
            console.error("manageCharactersLoop failed:", ex)
        } finally {
            setTimeout(this.manageCharactersLoop, 10 * 1000)
        }
    }

    private async syncRoster() {
        // Hazard locks roster + activities — no event server hopping
        if (this.memoryStorage.isHazardActive) return

        let wantedEvents = this.getWantedEvents()
        if (wantedEvents.length > 0) {
            this.lastWantedEventAt = Date.now()
        } else if (Date.now() - this.lastWantedEventAt < StateController.EVENT_GRACE_MS) {
            console.debug("Event grace period — skip roster change")
            return
        }
        // GETTING WANTED BOTS
        let wantedBots = []
        if(wantedEvents.length == 0) {
            let wantedCharacters = Array.from(MY_CHARACTERS.keys()).filter( e => MY_CHARACTERS.get(e)?.isMainSetup == true)
            wantedCharacters.forEach( e => wantedBots.push({id: e, server: {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME}}))
            wantedBots.push({id: "MerchanDiser", server: {region: DEFAULT_SERVER_REGION, name: DEFAULT_SERVER_NAME}})
        }
        else {
            const mostWantedEvent = wantedEvents[0]
            Array.from(MY_CHARACTERS.keys())
            .filter( e => MY_CHARACTERS.get(e)?.server.region == mostWantedEvent.serverRegion && MY_CHARACTERS.get(e)?.server.name == mostWantedEvent.serverName && MY_CHARACTERS.get(e)?.ctype != "merchant")
            .forEach( e => wantedBots.push({id: e, server: {region: mostWantedEvent.serverRegion, name: mostWantedEvent.serverName}}))
            if(wantedBots.length < 3 && !wantedBots.some( e => e.id == "Archealer")) {
                wantedBots.push({id: "Archealer", server: {region: mostWantedEvent.serverRegion, name: mostWantedEvent.serverName}})
            }
            if(wantedBots.length < 3 && !wantedBots.some( e => e.id == "arMAGEdon")) {
                wantedBots.push({id: "arMAGEdon", server: {region: mostWantedEvent.serverRegion, name: mostWantedEvent.serverName}})
            }
            if(wantedBots.length < 3 && !wantedBots.some( e => e.id == "Warious")) {
                wantedBots.push({id: "Warious", server: {region: mostWantedEvent.serverRegion, name: mostWantedEvent.serverName}})
            }
            wantedBots.push({id: "MerchanDiser", server: {region: mostWantedEvent.serverRegion, name: mostWantedEvent.serverName}})
            console.debug('Wanted bots with events: ' + wantedBots.map( e => e.id).join(', '))
        }
        // STOPPING UNWANTED BOTS
        for(const char of this.bots) {
            const bot = this.getBotFromState(char)
            if(!bot) continue
            const onWantedRoster = wantedBots.some(e =>
                e.id == bot.id
                && e.server.region == bot.serverData.region
                && e.server.name == bot.serverData.name,
            )
            if (onWantedRoster) continue

            // No live events: always bring home — don't let leftover event state block stop
            if (wantedEvents.length === 0) {
                if (char instanceof StateStrategy) {
                    (char as StateStrategy).clearEventStates()
                }
                console.debug(`Stopping ${bot.id} — returning to ${DEFAULT_SERVER_REGION} ${DEFAULT_SERVER_NAME}`)
                this.stopCharacter(bot.id)
                continue
            }

            // During events: keep bots finishing event only on the event's server
            if (this.isActiveEventState(char)) {
                const ev = wantedEvents[0]
                if (
                    bot.serverData.region === ev.serverRegion
                    && bot.serverData.name === ev.serverName
                ) {
                    continue
                }
            }

            console.debug(`Stopping ${bot.id} cause not in wanted roster`)
            this.stopCharacter(bot.id)
        }
        // STARTING WANTED BOTS
        for(const bot of wantedBots) {
            if(this.hasBotOnServer(bot.id, bot.server)) continue
            if(this.pendingBotStarts.has(bot.id)) continue
            if((this.botStartBlockedUntil.get(bot.id) ?? 0) > Date.now()) continue

            console.debug(`Starting ${bot.id}`)
            this.pendingBotStarts.add(bot.id)
            let state: IState | undefined
            try {
                state = await this.startBotWithTimeout(
                    MY_CHARACTERS.get(bot.id)?.ctype,
                    bot.id,
                    bot.server.region,
                    bot.server.name,
                )
            } catch (ex) {
                if (/ingame/i.test(String(ex))) {
                    this.botStartBlockedUntil.set(bot.id, Date.now() + StateController.INGAME_RETRY_MS)
                    console.warn(`${bot.id} already ingame — retry in ${StateController.INGAME_RETRY_MS / 1000}s`)
                } else if (/timed out/i.test(String(ex))) {
                    this.botStartBlockedUntil.set(bot.id, Date.now() + StateController.INGAME_RETRY_MS)
                    console.warn(`${bot.id} start timed out — retry in ${StateController.INGAME_RETRY_MS / 1000}s`)
                } else {
                    console.error(`Error starting ${bot.id}:`, ex)
                }
            } finally {
                this.pendingBotStarts.delete(bot.id)
            }
            if(state) this.addNewBot(state)
        }

        if(wantedEvents.length > 0 && !this.memoryStorage.isHazardActive) {
            const mostWantedEvent = wantedEvents[0]
            this.bots.filter( e => this.getBotFromState(e)?.ctype != "merchant").
            forEach( e => {
                if (!(e instanceof StateStrategy)) return
                e.addStateToScheduler({
                    state_type: "event",
                    wantedMob: WANTED_EVENTS[mostWantedEvent.eventName].monsters,
                    eventName: mostWantedEvent.eventName,
                    server: {region: mostWantedEvent.serverRegion, name: mostWantedEvent.serverName}
                } as State)
            })
        }
    }

    private checkSendItems() {
        let merchant = this.bots.filter( e => e && e?.getBot()?.ctype == "merchant")[0]?.getBot()
        if( !merchant ) return setTimeout( this.checkSendItems, 1000 )
        
        for(const i of this.bots) {
            const bot = this.getBotFromState(i)
            if(!bot) continue
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
    * @param skipcrypt - leave current crypt; merchant opens a new one and assigns party
    * @param hazard - hazard Archealer firestaff | hazard stop
    // commands farm quest start shutdown skipcrypt hazard
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
                const started = await startBotWithStrategy(
                    CF.MY_CHARACTERS.get(name)?.ctype,
                    name,
                    parts[2] as unknown as ServerRegion,
                    parts[3] as unknown as ServerIdentifier,
                    this.memoryStorage
                )
                if(started) return this.addNewBot(started)
                return
            case "stop":
                const botState = this.bots.find( e => this.getBotFromState(e)?.id == name)
                if(!botState) return
                name.split(',').forEach( e => this.stopCharacter(e))
                break
            case "quest":
                if (!name) return console.error(`Cannot start quest without ids: ${data}`)
                for(const id of name.split(',')) {
                    const botState = this.bots.find(e => this.getBotFromState(e)?.id == id)
                    if(botState && botState instanceof StateStrategy) (botState as StateStrategy).startQuest()
                }
                break
            case "farm": 
                if (data.split(" ").length < 3) return console.error(`Cannot set farm without mobs: ${data}`)
                for(const id of name.split(',')) {
                    const botState = this.bots.find( e => this.getBotFromState(e)?.id == id)
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
            case "skipcrypt": {
                const merchant = this.bots.find((s): s is MerchantStrategy => s instanceof MerchantStrategy)
                if (!merchant) return console.error("skipcrypt: no merchant strategy online")
                merchant.skipCurrentCryptAndOpenNew().catch(ex => console.warn(`skipcrypt failed: ${ex}`))
                break
            }
            case "hazard": {
                // hazard stop | hazard Archealer firestaff
                if (!name) return console.error(`hazard usage: hazard <char> <weapon> | hazard stop`)
                if (name === "stop") {
                    this.stopHazardActivity()
                    break
                }
                const weapon = parts[2]
                if (!weapon) return console.error(`hazard usage: hazard <char> <weapon> | hazard stop`)
                const gItem = Game.G.items[weapon]
                if (!gItem) return console.error(`hazard: unknown weapon ${weapon}`)
                if (!CF.MY_CHARACTERS.get(name) && !this.bots.some(s => this.getBotFromState(s)?.id === name)) {
                    return console.error(`hazard: unknown character ${name}`)
                }
                const runnerBot = this.bots.map(s => this.getBotFromState(s)).find(b => b?.id === name)
                const ctype = runnerBot?.ctype ?? CF.MY_CHARACTERS.get(name)?.ctype
                if (!this.canHazardTitleWeapon(weapon as ItemName, ctype)) {
                    return console.error(
                        `hazard: ${weapon} cannot equip in mainhand/doublehand`
                        + (ctype ? ` for ${ctype}` : ""),
                    )
                }
                this.startHazardActivity(name, weapon as ItemName)
                break
            }
            // case "looter":
            //     if(data.split(' ').length<2) return console.error(`Cannot switch looter without name: ${data}`)
            //     this.memoryStorage.setCurrentLooter = data.split(' ')[1]
            //     break
            default:
                console.error(`${sourceBot?.id} unknown command ${command}\n${JSON.stringify(data)}`)
        }
    }

    public startHazardActivity(runner: string, weapon: ItemName) {
        this.memoryStorage.startHazard(runner, weapon)
        for (const s of this.bots) {
            if (!(s instanceof StateStrategy)) continue
            if (this.getBotFromState(s)?.ctype === "merchant") continue
            s.enterHazardState()
        }
        console.log(`hazard started: runner=${runner} weapon=${weapon}`)
    }

    public stopHazardActivity() {
        if (!this.memoryStorage.isHazardActive) return
        this.memoryStorage.stopHazard()
        for (const s of this.bots) {
            if (!(s instanceof StateStrategy)) continue
            s.leaveHazardState()
        }
        console.log("hazard stopped")
    }

    /** Title weapon must be equippable in mainhand or doublehand for the runner's class. */
    private canHazardTitleWeapon(weapon: ItemName, ctype?: string): boolean {
        const item = Game.G.items[weapon]
        if (!item || item.type !== "weapon" || !item.wtype) return false
        const wtype = item.wtype
        if (ctype && Game.G.classes[ctype as keyof typeof Game.G.classes]) {
            const cls = Game.G.classes[ctype as keyof typeof Game.G.classes]
            return !!(cls.mainhand?.[wtype] || cls.doublehand?.[wtype])
        }
        // Runner offline — accept if any combat class can wield it in main/double
        for (const c of ["ranger", "warrior", "mage", "priest", "rogue"] as const) {
            const cls = Game.G.classes[c]
            if (cls?.mainhand?.[wtype] || cls?.doublehand?.[wtype]) return true
        }
        return false
    }

    private stopCharacter(name: string) {
        const botState = this.bots.find( e => this.getBotFromState(e)?.id == name)
        if(!botState) return
        const botToStop = this.getBotFromState(botState)
        if(!botToStop) return
        botState.deactivateStrat()
        getMetricsRuntime()?.detachBot(name)
        botToStop.socket.off("disconnect")
        this.botStartBlockedUntil.delete(name)
        console.debug(`${name} shutdown. ${this.bots.length} bots left`)
        let newList = []
        for(let i=0; i<this.bots.length; i++) {
            if(this.getBotFromState(this.bots[i])?.id == name) continue
            newList.push(this.bots[i])
        }
        this.bots = newList
        console.debug(`${name} shutdown. ${this.bots.length} bots left`)
        return botToStop.disconnect()
    }
}