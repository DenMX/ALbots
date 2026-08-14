import { PingCompensatedCharacter, Game, Merchant, Tools, Database, EntityModel, Constants, MonsterName, Item, Pathfinder, ItemName } from "alclient"
import * as MIC from "../configs/manage_items_configs"
import * as CF from "../common_functions/common_functions"
import { ManageItems } from "../common_functions/manage_items_strategy"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"
import { IState } from "../controllers/state_interface"
import { ActiveCryptModel } from "../database/active_crypt/active_crypt.model"
import * as Items from "../configs/character_items_configs"
import {
    BOSS_CHECK_ROUTE,
    CRYPT_BLACKLIST,
    CRYPT_DOOR,
    CRYPT_DOOR_APPROACH,
    CRYPT_ENTRANCE,
    CRYPT_LEVEL_UP_WAIT_MS,
    CRYPT_MOB_DETECT_RANGE,
    CRYPT_ROUTE,
    CRYPT_SEASON_MONTHS,
    isCryptWantedMonster,
    CRYPT_WAYPOINT_ARRIVE_RANGE,
    SPECIAL_ALWAYS_WANTED,
    SPECIAL_MONSTERS,
} from "../configs/events_and_spots"


export type State = {
    state_type: string
}
export class MerchantStrategy extends ManageItems implements IState {

    private job_scheduler: Function[] = []

    private DEFAULT_STATE: string =  "Idle"

    private merch_state : State = {state_type: this.DEFAULT_STATE}

    private CYBERLAND_COOLDOWN: number = 1000 * 60 * 30

    private lastCyberLandCheck: number = 0
    private readonly CRAFT_FROM_BANK_INTERVAL_MS = 10 * 60 * 1000
    private readonly CRAFT_FROM_INVENTORY_INTERVAL_MS = 10 * 60 * 1000
    /** Don't open crypt below this gold (character + bank). */
    private readonly CRYPT_MIN_GOLD = 300_000_000

    /** Bumped by skipcrypt so in-flight openCryptJob won't verify/reassign the old instance. */
    private cryptAbortToken = 0
    private skipCryptInProgress = false

    public getStateType(): string {
        return this.merch_state.state_type
    }

    private getStateBot(state: IState | undefined | null): PingCompensatedCharacter | undefined {
        try {
            return state?.getBot?.()
        } catch {
            return undefined
        }
    }

    private getPartyBotsOnServer(): IState[] {
        const bots = this.getMemoryStorage?.getStateController?.getBots
        if (!bots) return []
        return bots.filter((s): s is IState => {
            const b = this.getStateBot(s)
            return !!b
                && b.serverData.region === this.bot.serverData.region
                && b.serverData.name === this.bot.serverData.name
                && b.id !== this.bot.id
        })
    }

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        super(bot,memoryStorage)

        this.checkInventory = this.checkInventory.bind(this)
        this.checkPartyInventory = this.checkPartyInventory.bind(this)
        this.checkBankUpgrades = this.checkBankUpgrades.bind(this)
        this.checkScheduler = this.checkScheduler.bind(this)
        this.shovelInventory = this.shovelInventory.bind(this)
        this.fishing = this.fishing.bind(this)
        this.mining = this.mining.bind(this)
        this.checkWeapon = this.checkWeapon.bind(this)
        this.monitoringSpecialsLoop = this.monitoringSpecialsLoop.bind(this)
        this.shouldCheckBossesLoop = this.shouldCheckBossesLoop.bind(this)
        this.checkBosses = this.checkBosses.bind(this)
        this.mluckLoop = this.mluckLoop.bind(this)
        this.fastRunLoop = this.fastRunLoop.bind(this)
        this.checkPontyLoop = this.checkPontyLoop.bind(this)
        this.checkCyberLandLoop = this.checkCyberLandLoop.bind(this)
        this.checkCyberLand = this.checkCyberLand.bind(this)
        this.switchTradeStandLoop = this.switchTradeStandLoop.bind(this)
        this.exchangeItemsFromBankLoop = this.exchangeItemsFromBankLoop.bind(this)
        this.craftItemsFromBankLoop = this.craftItemsFromBankLoop.bind(this)
        this.craftItemsFromInventoryLoop = this.craftItemsFromInventoryLoop.bind(this)
        this.openCryptJob = this.openCryptJob.bind(this)

        this.checkInventory()
        this.job_scheduler.push(this.checkBankUpgrades)
        this.checkPartyInventory()
        this.checkScheduler(true)
        this.monitoringSpecialsLoop()
        this.shouldCheckBossesLoop()
        this.mluckLoop()
        this.fastRunLoop()
        this.checkPontyLoop()
        this.checkCyberLandLoop()
        this.switchTradeStandLoop()

        if(this.bot.isOnCooldown("fishing")) setTimeout(() => {this.job_scheduler.push(this.fishing)}, Math.max(1,this.bot.getCooldown("fishing")))
        else this.job_scheduler.push(this.fishing)

        if(this.bot.isOnCooldown("mining")) setTimeout(() => {this.job_scheduler.push(this.mining)}, Math.max(1,this.bot.getCooldown("mining")))
        else this.job_scheduler.push(this.mining)

        this.checkWeapon()
        this.job_scheduler.push(this.exchangeItemsFromBankLoop)
        this.job_scheduler.push(this.craftItemsFromBankLoop)
        this.craftItemsFromInventoryLoop()
        // Delay first crypt open so combat bots can load state from DB
        this.scheduleCryptOpen(30_000)
        // If crypt was opened before restart, resume remaining level-up wait / assign
        void this.resumeCryptLevelUpSchedule()
    }

    /**
     * After restart: reload wait from DB and re-queue party assign when due.
     */
    private async resumeCryptLevelUpSchedule() {
        try {
            await this.getMemoryStorage.ensureActiveCryptLoaded()
            const instanceId = this.getMemoryStorage.getActiveCryptInstance
            if (!instanceId || !this.getMemoryStorage.isCryptPartyAssignPending) return
            const delayMs = this.getMemoryStorage.getCryptLevelUpRemainingMs
            const openedAt = this.getMemoryStorage.getCryptOpenedAt
            console.debug(
                `Resuming crypt ${instanceId} level-up`
                + (openedAt ? ` (opened ${new Date(openedAt).toISOString()})` : "")
                + ` — party in ${Math.round(delayMs / 60_000)}m`,
            )
            this.queueCryptPartyAfterLevelUp(instanceId, this.cryptAbortToken, delayMs)
        } catch (ex) {
            console.warn(`resumeCryptLevelUpSchedule: ${ex}`)
        }
    }

    private async fishing() {
        if(this.deactivate) return
        if(this.bot.esize < 2) {
            return setTimeout(() => {this.job_scheduler.push(this.fishing)}, 60_000)
        }
        if(!this.bot.hasItem("rod") && this.bot.slots.mainhand?.name != "rod") {
            this.changeMerchState("Crafting rod")
            await this.craftTool("rod")
        }
        if(this.bot.hasItem("rod")) {
            this.changeMerchState("Fishing")
            try {
                if (this.bot.stand) await this.bot.closeMerchantStand().catch(CF.debugLog)
                await this.bot.smartMove({x: -1132, y: -289, map:"main"}, { getWithin: 5, numAttempts: 5 })
                while(!this.bot.isOnCooldown("fishing")) {
                    if(!this.bot.hasItem("rod")) {
                        this.changeMerchState(this.DEFAULT_STATE)
                        return setTimeout(() => {this.job_scheduler.push(this.fishing)}, 60_000)
                    }
                    if(this.bot.slots.mainhand?.name != "rod") {
                        if(this.bot.slots.offhand) await this.bot.unequip("offhand").catch(CF.debugLog)
                        await this.bot.equip(this.bot.locateItem("rod"), "mainhand").catch(CF.debugLog)
                    }
                    if(!this.bot.c.fishing) {
                        await (this.bot as Merchant).fish().catch(CF.debugLog)
                    }
                }
            }
            catch(ex) {
                console.debug(ex)
            }
            finally {
                this.changeMerchState(this.DEFAULT_STATE)
            }
        } else {
            this.changeMerchState(this.DEFAULT_STATE)
        }
        setTimeout(() => {this.job_scheduler.push(this.fishing)}, Math.max(60_000, this.bot.getCooldown("fishing")))
    }



    private async mining() {
        if(this.deactivate) return
        if(this.bot.esize < 2) {
            return setTimeout(() => {this.job_scheduler.push(this.mining)}, 60_000)
        }
        if(!this.bot.hasItem("pickaxe") && this.bot.slots.mainhand?.name != "pickaxe") {
            this.changeMerchState("Crafting pickaxe")
            await this.craftTool("pickaxe")
        }
        if(this.bot.hasItem("pickaxe")) {
            this.changeMerchState("Mining")
            try {
                await this.bot.smartMove({x: -159, y: -177, map:"woffice"})
                while(!this.bot.isOnCooldown("mining")) {
                    if(!this.bot.hasItem("pickaxe")) {
                        this.changeMerchState(this.DEFAULT_STATE)
                        return setTimeout(() => {this.job_scheduler.push(this.mining)}, 60_000)
                    }
                    if(this.bot.slots.mainhand?.name != "pickaxe") {
                        if(this.bot.slots.offhand) await this.bot.unequip("offhand").catch(CF.debugLog)
                        await this.bot.equip(this.bot.locateItem("pickaxe"), "mainhand").catch(CF.debugLog)
                    }
                    if(!this.bot.c.mining) {
                        await (this.bot as Merchant).mine().catch(CF.debugLog)
                    }
                }
            }
            catch(ex) {
                console.debug(ex)
            }
            finally {
                this.changeMerchState(this.DEFAULT_STATE)
            }
        } else {
            this.changeMerchState(this.DEFAULT_STATE)
        }
        setTimeout(() => {this.job_scheduler.push(this.mining)}, Math.max(60_000, this.bot.getCooldown("mining")))
    }



    private async craftTool(tool: "rod" | "pickaxe") {
        if(this.deactivate) return
        try {
            if(!this.bot.hasItem("spidersilk")){
                if(!this.bot.map.startsWith("bank")) await this.bot.smartMove("bank")
                const packWithTool = this.locateItemsInBank(this.bot, tool, {returnLowestQuantity: true})
                if(packWithTool && packWithTool[0]?.[0]) {
                    await this.bot.smartMove(packWithTool[0][0], {getWithin: 9999})
                    await this.bot.withdrawItem(packWithTool[0][0], packWithTool[0][1][0])
                    return
                }
                const webPack = this.locateItemsInBank(this.bot, "spidersilk", {returnLowestQuantity: true})
                console.debug(`Spidersilk pack: ${JSON.stringify(webPack)}`)
                if(!webPack || !webPack[0]?.[0]) return console.error("No spidersilk in bank")
                await this.bot.smartMove(webPack[0][0], {getWithin: 9999})
                await this.bot.withdrawItem(webPack[0][0], webPack[0][1][0])
            }
            await this.bot.smartMove("main")
            for(const item of Game.G.craft[tool].items) {
                if(item[1] == "spidersilk") continue
                await this.bot.buy(item[1], item[0])
            }
            if(!this.bot.hasItem(["computer","supercomputer"])) {
                await this.bot.smartMove("goo", {getWithin: 100})
            }
            await this.bot.craft(tool)
        }
        catch(ex) {
            console.error(`Error crafting tool ${tool}:\n${ex}`)
            this.changeMerchState(this.DEFAULT_STATE)
        }
        
    }

    private async checkWeapon() {
        if(this.deactivate) return
        if(this.bot.slots.mainhand?.name == "rod" && this.merch_state.state_type == "Fishing") return setTimeout(this.checkWeapon, 1000)
        if(this.bot.slots.mainhand?.name == "pickaxe" && this.merch_state.state_type == "Mining") return setTimeout(this.checkWeapon, 1000)
        if(this.bot.slots.mainhand?.name != Items.WEAPON_CONFIGS[this.bot.id].fast_mainhand?.name) await this.bot.equip(this.bot.locateItem(Items.WEAPON_CONFIGS[this.bot.id].fast_mainhand?.name, undefined, {level: Items.WEAPON_CONFIGS[this.bot.id].fast_mainhand?.level}), "mainhand").catch(CF.debugLog)
        if(this.bot.slots.offhand?.name != Items.WEAPON_CONFIGS[this.bot.id].fast_offhand?.name) await this.bot.equip(this.bot.locateItem(Items.WEAPON_CONFIGS[this.bot.id].fast_offhand?.name, undefined, {level: Items.WEAPON_CONFIGS[this.bot.id].fast_offhand?.level}), "offhand").catch(CF.debugLog)
        setTimeout(this.checkWeapon, 1000)
    }

    /**
     * Calling function from scheduler. Loop
     * @param setNextTimeout default true, to make it easy for loop and let not running multiple loops when caling it twice
     */
    private async checkScheduler(setNextTimeout: boolean = true) {
        if(this.deactivate) return
        if(this.DEFAULT_STATE == this.merch_state.state_type && this.job_scheduler.length>0) {
            let fn = this.job_scheduler.shift()
            await fn()
        }
        // Idle follow must not depend on an empty queue — skip-jobs used to re-queue forever
        if (this.DEFAULT_STATE == this.merch_state.state_type) {
            await this.moveToPartyLeaderIfNeeded()
        }

        if(setNextTimeout == true) {
            setTimeout(this.checkScheduler, 1000)
        }
    }

    /** Go to party leader when idle and too far / on another map. */
    private async moveToPartyLeaderIfNeeded(minDistance = 300) {
        if (this.bot.smartMoving || this.bot.moving) return
        if (this.merch_state.state_type !== this.DEFAULT_STATE) return
        const party = this.bot.partyData?.party
        if (!party || !this.bot.partyData?.list?.length) return

        const leaderId = this.getMemoryStorage.getCurrentPartyLeader
        let target = (leaderId && leaderId !== this.bot.id && party[leaderId])
            ? party[leaderId]
            : undefined
        if (!target) {
            const otherId = this.bot.partyData.list.find(e => e !== this.bot.id)
            if (otherId) target = party[otherId]
        }
        if (!target) return
        if (target.map === this.bot.map && Tools.distance(this.bot, target) <= minDistance) return
        await this.bot.smartMove(target, { getWithin: 100 }).catch(CF.debugLog)
    }

    

    private async checkBankUpgrades() {
        if(this.deactivate) return
        if(this.bot.esize<10) {
            return setTimeout(() => {this.job_scheduler.push(this.checkBankUpgrades)}, 60_000)
        }
        if(  this.bot.gold > this.GOLD_AMOUNT_FOR_CHECK_BANK){
            this.changeMerchState("Upgrading bank")
            await this.upgradeItemsFromBank()
            this.changeMerchState(this.DEFAULT_STATE)
        }

        setTimeout(() => {this.job_scheduler.push(this.checkBankUpgrades)}, 5 * 60_000)
    }

    /**
     * Changing state and moving scheduler when new state is default
     * @param state 
     */
    private changeMerchState(state: string) {
        this.merch_state.state_type = state
        this.addLog(`State was changed to ${state}`, false)
        if(this.DEFAULT_STATE == state) {
            void this.moveToPartyLeaderIfNeeded(400)
        }
        
    }

    /**
     * Simple check esize and push shovel in scheduler
     * @returns shove in scheduler
     */
    private async checkInventory() {
        if(this.deactivate) return
        // console.debug(`Checking inventory: ${this.bot.esize}`)
        if(this.bot.esize<2) {
            if( this.bot.hasItem(["computer", "supercomputer"])) {
                await this.sellTrash()
                await this.upgradeItems()
                await this.compoundItems()
            }
            if(this.job_scheduler.includes(this.shovelInventory)) {
                return setTimeout(this.checkInventory, 5000)
            }
            if(this.bot.esize<2) this.job_scheduler.push(this.shovelInventory)
        }
        if(this.bot.esize<20 && this.bot.hasItem(["computer", "supercomputer"])) {
            await this.sellTrash()
            // await this.resuplyScrolls()
            await this.upgradeItems()
            await this.compoundItems()
        }
        setTimeout(this.checkInventory, 1000)//10sec
                
    }


    private async shovelInventory() {
        try {
            if(!this.bot.hasItem(["computer","supercomputer"])) {
                this.changeMerchState("Move main")
                await this.bot.smartMove(CF.UPGRADE_POSITION)
            }    
            this.changeMerchState("selling")
            await this.sellTrash()
            this.changeMerchState("upgrading")
            await this.upgradeItems()
            this.changeMerchState("compounding")
            await this.compoundItems()
            this.changeMerchState("exchanging")
            await this.exchangeItems()
            
            if(!this.canUpgradeItems() && this.bot.esize < 5) {
                this.changeMerchState("Going to bank")
                let bot = this.bot
                await bot.smartMove("bank")
                this.changeMerchState("Store")
                await this.storeItems()
                await this.sellTrashFromBank()
                if ( this.bot.gold > this.GOLD_AMOUNT_FOR_CHECK_BANK) {
                    this.changeMerchState("Upgrading bank")
                    await this.upgradeItemsFromBank()
                    this.changeMerchState(this.DEFAULT_STATE)
                }
            }
        }
        catch(ex) {
            console.debug(ex)
        }
        finally {
            this.changeMerchState(this.DEFAULT_STATE)
        }
    }

    private async sellTrashFromBank() {
        if( (!this.bot.bank && !this.getMemoryStorage.getBank) || this.bot.esize<=0 ) return
        this.changeMerchState("Collecting trash")

        for(const itemName of MIC.ITEMS_TO_SELL) {
            let idx = this.locateItemsInBank(this.bot, itemName, {level: 0})
            if(idx) {
                for(const pack of idx) {
                    await this.bot.smartMove(pack[0], {getWithin: 9999}).catch(console.warn)
                    pack[1].forEach( (e) => this.bot.withdrawItem(pack[0], e).catch(console.warn))
                }
            }            
            if(this.bot.esize<1) break
        }

        this.changeMerchState("Go selling")
        await this.bot.smartMove("main").catch(console.warn)
        this.changeMerchState("selling")
        this.sellTrash()
        this.changeMerchState(this.DEFAULT_STATE)
    }

    private async monitoringSpecialsLoop() {
        if(this.deactivate) return console.debug("Monitoring specials loop is deactivated")
        const mageState = this.getMemoryStorage.getStateController?.getBots.find( e => {
            const b = e?.getBot?.()
            return b && b.serverData.region == this.bot.serverData.region && b.serverData.name == this.bot.serverData.name && b.ctype == "mage"
        })
        if( !mageState ) {
            // console.debug("No mage on the server while monitoring specials loop is running")
            return setTimeout(this.monitoringSpecialsLoop, 10_000)
        }
        const mage = mageState.getBot?.()
        if(!mage) return setTimeout(this.monitoringSpecialsLoop, 10_000)
        const specials = this.bot.getEntities().filter( e => SPECIAL_MONSTERS.includes(e.type))
        const wantedSpecials = this.bot.getEntities().filter( e => SPECIAL_ALWAYS_WANTED.includes(e.type))

        if(wantedSpecials.length>0) {
            wantedSpecials.forEach( e => {
                this.getMemoryStorage?.getStateController?.getBots
                .filter( botState => {
                    const b = botState?.getBot?.()
                    return b && b.serverData.region == this.bot.serverData.region && b.serverData.name == this.bot.serverData.name && botState instanceof StateStrategy
                })
                .forEach( botState => {
                    if(!(botState as StateStrategy).stateScheduler.some( bState => bState.state_type == "boss" && bState.wantedMob.includes(e.type)) && !(botState as StateStrategy).currentState.wantedMob.includes(e.type)) {
                        let state = botState as StateStrategy
                        state.addStateToScheduler( {
                            state_type: "boss",
                            wantedMob: [e.type],
                            location: {map: e.map, x: e.x, y: e.y},
                            server: {region: this.bot.serverData.region, name: this.bot.serverData.name}
                        } )
                        console.debug(`${e.type} added to scheduler`)
                    }
                })
            })
            
        }

        if(specials.length<1) return setTimeout(this.monitoringSpecialsLoop, 1000)

        const stateBots = this.getMemoryStorage?.getStateController?.getBots.filter( botState => {
            const b = this.getStateBot(botState)
            return b && b.serverData.region == this.bot.serverData.region && b.serverData.name == this.bot.serverData.name && botState instanceof StateStrategy
        })
        if(stateBots && stateBots.length>0 && stateBots.some( e => e.getStateType() == "quest")) {
            return setTimeout(this.monitoringSpecialsLoop, 1000)
        }
        
        for( const special of specials) {
            if(mage.getEntities().filter( e => e.id == special.id).length>0) {
                console.debug(`${special.type} is already in the world`)
                continue
            }
            if((mageState as StateStrategy).stateScheduler.some( e => e.state_type == "boss" && e.wantedMob.includes(special.type))) {
                console.debug(`${special.type} is already in scheduler`)
                continue
            }
            const priest = this.getMemoryStorage.getStateController?.getBots.find( e => {
                const b = this.getStateBot(e)
                return b && b.serverData.region == this.bot.serverData.region && b.serverData.name == this.bot.serverData.name && b.ctype == "priest"
            }) as StateStrategy | undefined
            const priestBot = priest ? this.getStateBot(priest) : undefined

            if(!priestBot || CF.calculate_monster_dps(priest, special) > CF.calculate_hps(priestBot)) {
                console.debug(`${special.type} is too OP for priest`)
                continue
            }

            
            (mageState as StateStrategy).addStateToScheduler( {
                state_type: "boss",
                wantedMob: [special.type],
                location: {map: special.map, x: special.x, y: special.y},
                server: {region: this.bot.serverData.region, name: this.bot.serverData.name}
            } )
            console.debug(`${special.type} added to scheduler`)
        }
        console.debug("Specials checked")
        setTimeout(this.monitoringSpecialsLoop, 1000)
    }

    

    private shouldCheckBossesLoop() {
        if(this.deactivate) return console.debug("Should check bosses loop is deactivated")
        const controllerBots = this.getMemoryStorage?.getStateController?.getBots
        if(!controllerBots) return setTimeout(this.shouldCheckBossesLoop, 10_000)

        if( controllerBots
            .filter( e => {
                const b = this.getStateBot(e)
                return b && b.serverData.region == this.bot.serverData.region && b.serverData.name == this.bot.serverData.name && b.ctype == "mage" && e.getStateType?.() != "event"
            })
            .length < 1
        ) 
        {
            // console.debug("No mage on the server while loop is running")
            return setTimeout(this.shouldCheckBossesLoop, 10_000)
        }
        for(const botState of controllerBots) {
            if(!botState) continue
            const bot = this.getStateBot(botState)
            if(!bot || bot.serverData.region != this.bot.serverData.region || bot.serverData.name != this.bot.serverData.name || bot.id == this.bot.id) continue
            if((botState as StateStrategy).getStateType?.() == "quest") return setTimeout(this.shouldCheckBossesLoop, 60_000)
        }
        console.debug("Should check bosses loop is running")
        this.job_scheduler.push(this.checkBosses)        
    }

    private async checkBosses() {
        if( this.deactivate) return console.debug("Check bosses is deactivated")
        const magesOnServer = this.getMemoryStorage.getStateController?.getBots?.filter( e => {
            const b = this.getStateBot(e)
            return b && b.serverData.region == this.bot.serverData.region && b.serverData.name == this.bot.serverData.name && b.ctype == "mage"
        }) ?? []
        if (magesOnServer.length < 1) {
            // console.debug("No mage on the server")
            return setTimeout(this.shouldCheckBossesLoop, 10_000)
        }
        this.changeMerchState("Checking bosses")
        console.debug('Checking bosses')
        try {
            for(const boss of BOSS_CHECK_ROUTE) {
                console.debug(`Checking ${boss.name}`)
                //SEARCH LAST SEEN TIME OF BOSS IN entities Mongodb
                if(Database.connection) {
                    let boss_last_notice = await EntityModel.findOne({type: boss.name, serverRegion: this.bot.serverData.region, serverIdentifier: this.bot.serverData.name}).exec()
                    if(boss_last_notice && Date.now() - boss_last_notice.lastSeen < Game.G.monsters[boss.name].respawn ) {
                            console.debug(`${boss.name} is seen ${Date.now() - boss_last_notice.lastSeen} ago, waiting for respawn in ${Game.G.monsters[boss.name].respawn}ms wich is ${Game.G.monsters[boss.name].respawn+boss_last_notice.lastSeen}. Date now is ${Date.now()}`)
                            continue
                    }
                    console.debug(`${boss.name} is not seen, moving to ${boss.location}`)
                    await this.bot.smartMove(boss.location).catch(CF.debugLog)
                }
                else {
                    console.debug(`No database connection while checking bosses`)
                    await this.bot.smartMove(boss.location).catch(CF.debugLog)
                }
            }
        }
        catch(ex) {
            console.debug(ex)
        }
        finally {
            this.changeMerchState(this.DEFAULT_STATE)
            setTimeout(this.shouldCheckBossesLoop, 10_000)
        }

        
    }

    public getWantedMob(): MonsterName | MonsterName[] {
        return undefined;
    }

    private checkPartyInventory() {
        if(this.deactivate) return
        // console.debug("checking party")
        const bots = this.getPartyBotsOnServer()
        if(!bots.length) {
            return setTimeout(() => {this.job_scheduler.push(this.checkPartyInventory)}, 10_000)
        }
        // console.debug(`Bots on the same server: ${bots?.length}`)
        for(const b of bots) {
            const bot = this.getStateBot(b)
            if(!bot) continue
            // console.debug(`Checking ${bot.name} inventory`)
            // MAKING PERSONAL ITEMS LIST
            let hpot = MIC.HPOTS_CAP - bot.countItem("hpot1")
            let mpot = MIC.MPOTS_CAP - bot.countItem("mpot1")
            
            let notPersonalItems = CF.getBotNotPersonalItemsList(bot)
            // console.debug(`${bot.name} has ${notPersonalItems.length} NOT personal items`)

            if( notPersonalItems.length>5) {

                console.debug(`Creating task for ${bot.name}`)

                this.job_scheduler.push( async() => {
                    if(!this.bot.hasItem(["computer", "supercomputer"])) {
                        this.changeMerchState("Move to main")
                        await this.bot.smartMove("main").catch(console.warn)
                        await this.bot.buy("hpot1", hpot).catch(console.warn)
                        await this.bot.buy("mpot1", mpot).catch(console.warn)
                    }
                    this.changeMerchState(`Smartmoving to ${bot.name}`)
                    await this.bot.smartMove(bot).catch(console.warn)
                    this.changeMerchState('Getting items') // ЗАВИС В ЭТОМ СОСТОЯНИИ?
                    await this.bot.sendItem( bot.name, this.bot.locateItem("hpot1"), hpot ).catch(console.warn)
                    await this.bot.sendItem( bot.name, this.bot.locateItem("mpot1"), mpot ).catch(console.warn)
                    this.changeMerchState(this.DEFAULT_STATE)
                })
            }
                
        }

        setTimeout(()=>{this.job_scheduler.push(this.checkPartyInventory)}, 60 * 1000)
    }

    private async mluckLoop() {
        if(this.deactivate) return
        if(this.bot.isOnCooldown("mluck")) return setTimeout(this.mluckLoop, Math.max(1,this.bot.getCooldown("mluck")))
        if(!this.bot.canUse("mluck")) return setTimeout(this.mluckLoop, 1000)
        const players = this.bot.getPlayers({withinRange: "mluck"}).filter( e => (!e.s?.mluck || (!e.s?.mluck?.strong && e.s?.mluck?.ms < 600_000) || (e.s?.mluck?.f == this.bot.id && e.s?.mluck?.ms < 900_000)) )
        if (players.length>0) {
            await (this.bot as Merchant).mluck(players[0].id).catch(CF.debugLog)
            return setTimeout(this.mluckLoop, Math.max(1,this.bot.getCooldown("mluck")))
        }
        setTimeout(this.mluckLoop, 1000)
    }

    private async fastRunLoop() {
        if(this.deactivate) return
        if(this.bot.isOnCooldown("mcourage")) return setTimeout(this.fastRunLoop, Math.max(1, this.bot.getCooldown("mcourage")))
        if(!this.bot.smartMoving || !this.bot.canUse("mcourage")) return setTimeout(this.fastRunLoop, 1000)
        if(this.bot.smartMoving) await (this.bot as Merchant).merchantCourage().catch(CF.debugLog)
        return setTimeout(this.fastRunLoop, Math.max(100, this.bot.getCooldown("mcourage")))
    }

    private async checkPontyLoop() {
        if(this.deactivate) return
        if(Pathfinder.locateNPC("secondhands").every((loc) => { return Tools.squaredDistance(this.bot, loc) > Constants.NPC_INTERACTION_DISTANCE_SQUARED })) return setTimeout(this.checkPontyLoop, 1000)
        const pontyItems = await this.bot.getPontyItems().catch(CF.debugLog)
        // console.debug(`Ponty items ${pontyItems}`)
        if(!pontyItems || pontyItems.length<1) return setTimeout(this.checkPontyLoop, 1000)
        // console.debug(`Ponty 1st item:\n ${JSON.stringify(pontyItems[0])}`)
        for(const item of pontyItems) {
            if(!MIC.BUY_FROM_PONTY.get(item.name)) continue
            const itemPrice = new Item(item, Game.G).calculateValue()*Game.G.multipliers.secondhands_mult
           if(MIC.BUY_FROM_PONTY.get(item.name) && this.bot.gold*0.2 >= itemPrice && itemPrice >= MIC.BUY_FROM_PONTY.get(item.name)) {
            console.debug(`Buying ${item.name} from ponty for ${itemPrice}`)
            await this.bot.buyFromPonty(item).catch(CF.debugLog)
           }
        }
        setTimeout(this.checkPontyLoop, 1000)
    }

    private checkCyberLandLoop() {
        if(this.deactivate) return
        if(Date.now() - this.lastCyberLandCheck < this.CYBERLAND_COOLDOWN) return setTimeout(this.checkCyberLandLoop, this.CYBERLAND_COOLDOWN - (Date.now() - this.lastCyberLandCheck))
        this.job_scheduler.push(this.checkCyberLand)
    }

    private async checkCyberLand() {
        if(this.deactivate) return
        this.changeMerchState("Checking CyberLand")
        await this.bot.smartMove("cyberland").catch(CF.debugLog)
        await this.bot.socket.emit("eval", {command: "give spares"});
        await CF.sleep(500)
        this.bot.chests.forEach( e => this.bot.openChest(e.id).catch(CF.debugLog))
        this.changeMerchState(this.DEFAULT_STATE)
        this.lastCyberLandCheck = Date.now()
        setTimeout(this.checkCyberLandLoop, this.CYBERLAND_COOLDOWN)
    }

    private async switchTradeStandLoop() {
        if(this.deactivate) return
        if(this.bot.stand && (this.bot.moving || this.bot.smartMoving) ) this.bot.closeMerchantStand().catch(CF.debugLog)
        else if(!this.bot.stand && !this.bot.moving && !this.bot.smartMoving) this.bot.openMerchantStand().catch(CF.debugLog)
        setTimeout(this.switchTradeStandLoop, 500)
    }

    private async exchangeItemsFromBankLoop() {
        if(this.deactivate) return
        if(this.bot.esize<5 || !this.hasItemsToExchange()) {
            // Delayed requeue — never sync-repush (blocked idle party follow)
            setTimeout(() => {this.job_scheduler.push(this.exchangeItemsFromBankLoop)}, 60_000)
            return
        }
        this.changeMerchState("Exchanging items from bank")
        await this.exchangeItemsFromBank().catch(console.debug)
        await this.bot.smartMove("main").catch(console.debug)
        this.exchangeItems()
        this.changeMerchState(this.DEFAULT_STATE)
        setTimeout(() => {this.job_scheduler.push(this.exchangeItemsFromBankLoop)}, 60_000)
    }

    private getCraftRecipe(itemName: ItemName): {name: ItemName, quantity: number}[] {
        const recipe = new Map<ItemName, number>()

        const gameRecipe = (Game.G.craft as Record<string, { items?: [number, ItemName][] }>)[itemName]?.items
        if (gameRecipe?.length) {
            for (const [quantity, name] of gameRecipe) {
                recipe.set(name, (recipe.get(name) ?? 0) + quantity)
            }
        }

        const extraItems = MIC.ITEMS_TO_CRAFT[itemName]?.items
        if (extraItems?.length) {
            for (const item of extraItems) {
                recipe.set(item.name, (recipe.get(item.name) ?? 0) + item.quantity)
            }
        }

        return Array.from(recipe, ([name, quantity]) => ({ name, quantity }))
    }

    private canBuyFromVendor(itemName: ItemName): boolean {
        const npcs = Object.values(Game.G.npcs ?? {})
        for (const npc of npcs as { items?: (ItemName | { name?: ItemName })[] }[]) {
            const items = npc?.items
            if (!items?.length) continue
            if (items.some((i) => (typeof i === "string" ? i : i?.name) === itemName)) return true
        }
        return false
    }

    private getVendorNpcId(itemName: ItemName): string | undefined {
        for (const [npcId, npc] of Object.entries(Game.G.npcs ?? {})) {
            const items = (npc as { items?: (ItemName | { name?: ItemName })[] })?.items
            if (!items?.length) continue
            if (items.some((i) => (typeof i === "string" ? i : i?.name) === itemName)) return npcId
        }
        return undefined
    }

    private async moveToMainForCrafting() {
        if (this.bot.map !== "main") {
            await this.bot.smartMove("main").catch(console.warn)
        }
    }

    private async moveToVendorIfNeeded(itemName: ItemName) {
        if (this.bot.hasItem(["computer", "supercomputer"])) return
        const npcId = this.getVendorNpcId(itemName)
        if (!npcId) return
        const loc = Pathfinder.locateNPC(npcId as never)?.[0]
        if (!loc) return
        if (Tools.squaredDistance(this.bot, loc) <= Constants.NPC_INTERACTION_DISTANCE_SQUARED) return
        await this.bot.smartMove(loc, { getWithin: Constants.NPC_INTERACTION_DISTANCE - 5 }).catch(console.warn)
    }

    private countItemInBank(itemName: ItemName): number {
        const packs = this.locateItemsInBank(this.bot, itemName)
        if (!packs?.length) return 0
        let total = 0
        const bank = this.getMergedBankInfo()
        if (!bank) return 0
        for (const [packName, slots] of packs) {
            for (const slot of slots) {
                const itm = bank[packName]?.[slot]
                if (!itm) continue
                total += itm.q ?? 1
            }
        }
        return total
    }

    private async withdrawItemFromBank(itemName: ItemName, quantity: number): Promise<void> {
        if (quantity <= 0) return
        const packs = this.locateItemsInBank(this.bot, itemName)
        for (const [packName, slots] of packs) {
            if (quantity <= 0) break
            await this.bot.smartMove(packName, {getWithin: 9999}).catch(console.warn)
            for (const slot of slots) {
                if (quantity <= 0) break
                const bankItem = this.getMergedBankInfo()?.[packName]?.[slot]
                if (!bankItem) continue
                await this.bot.withdrawItem(packName, slot).catch(console.warn)
                quantity -= (bankItem.q ?? 1)
            }
        }
    }

    private getMaxCraftCount(recipe: {name: ItemName, quantity: number}[]): number {
        if (!recipe.length) return 0
        let maxCrafts = Number.MAX_SAFE_INTEGER
        for (const ingredient of recipe) {
            if (ingredient.quantity <= 0) continue
            const available = this.bot.countItem(ingredient.name)
            const possible = Math.floor(available / ingredient.quantity)
            if (possible < maxCrafts) maxCrafts = possible
        }
        if (maxCrafts === Number.MAX_SAFE_INTEGER) return 0
        return Math.max(0, maxCrafts)
    }

    private async craftItemsFromBankLoop() {
        if(this.deactivate) return
        if(this.bot.esize < 10) {
            return setTimeout(() => { this.job_scheduler.push(this.craftItemsFromBankLoop) }, this.CRAFT_FROM_BANK_INTERVAL_MS)
        }

        const craftTargets = Object.keys(MIC.ITEMS_TO_CRAFT) as ItemName[]
        if(craftTargets.length < 1) {
            return setTimeout(() => { this.job_scheduler.push(this.craftItemsFromBankLoop) }, this.CRAFT_FROM_BANK_INTERVAL_MS)
        }

        try {
            if(!this.bot.map.startsWith("bank")) await this.bot.smartMove("bank").catch(console.warn)
            for (const target of craftTargets) {
                let isCraftingStateSet = false
                try {
                if (this.bot.esize < 3) break
                const recipe = this.getCraftRecipe(target)
                if (!recipe.length) {
                    this.addLog(`не найден рецепт крафта для ${target}`, false)
                    continue
                }

                let canCraft = true
                for (const ingredient of recipe) {
                    const total = this.bot.countItem(ingredient.name) + this.countItemInBank(ingredient.name)
                    if (total >= ingredient.quantity) continue
                    if (!this.canBuyFromVendor(ingredient.name)) {
                        canCraft = false
                        this.addLog(`Skip craft ${target}: missing ${ingredient.name} x${ingredient.quantity - total}`, false)
                        break
                    }
                }
                if (!canCraft) continue

                for (const ingredient of recipe) {
                    const needInInventory = ingredient.quantity - this.bot.countItem(ingredient.name)
                    if (needInInventory > 0) {
                        await this.withdrawItemFromBank(ingredient.name, needInInventory)
                    }
                    const stillMissing = ingredient.quantity - this.bot.countItem(ingredient.name)
                    if (stillMissing > 0 && this.canBuyFromVendor(ingredient.name)) {
                        await this.moveToMainForCrafting()
                        await this.moveToVendorIfNeeded(ingredient.name)
                        await this.bot.buy(ingredient.name, stillMissing).catch(console.warn)
                    }
                }

                const ready = recipe.every((ingredient) => this.bot.countItem(ingredient.name) >= ingredient.quantity)
                if (!ready) continue

                await this.moveToMainForCrafting()
                if (this.bot.map !== "main") {
                    this.addLog(`Skip craft ${target}: cannot reach main`, false)
                    continue
                }
                this.changeMerchState("Crafting from bank")
                isCraftingStateSet = true
                let crafted = 0
                const craftsToDo = this.getMaxCraftCount(recipe)
                for (let i = 0; i < craftsToDo; i++) {
                    try {
                        await this.bot.craft(target)
                        crafted++
                    } catch (ex) {
                        console.warn(`craft ${target} failed on #${i + 1}: ${ex}`)
                        break
                    }
                }
                if (crafted > 0) this.addLog(`Crafted ${target} x${crafted}`, false)
                if(!this.bot.map.startsWith("bank")) await this.bot.smartMove("bank").catch(console.warn)
                } finally {
                    if (isCraftingStateSet) this.changeMerchState(this.DEFAULT_STATE)
                }
            }
        } catch (ex) {
            console.warn(`craftItemsFromBankLoop: ${ex}`)
        } finally {
            this.changeMerchState(this.DEFAULT_STATE)
            setTimeout(() => { this.job_scheduler.push(this.craftItemsFromBankLoop) }, this.CRAFT_FROM_BANK_INTERVAL_MS)
        }
    }

    private async craftItemsFromInventoryLoop() {
        if(this.deactivate) return

        const craftTargets = Object.keys(MIC.ITEMS_TO_CRAFT) as ItemName[]
        if(craftTargets.length < 1) {
            return setTimeout(this.craftItemsFromInventoryLoop, this.CRAFT_FROM_INVENTORY_INTERVAL_MS)
        }

        try {
            for (const target of craftTargets) {
                if (this.bot.esize < 2) break
                const recipe = this.getCraftRecipe(target)
                if (!recipe.length) continue

                let canCraftOrBuy = true
                for (const ingredient of recipe) {
                    const have = this.bot.countItem(ingredient.name)
                    if (have >= ingredient.quantity) continue
                    if (!this.canBuyFromVendor(ingredient.name)) {
                        canCraftOrBuy = false
                        break
                    }
                }
                if (!canCraftOrBuy) continue

                for (const ingredient of recipe) {
                    const missing = ingredient.quantity - this.bot.countItem(ingredient.name)
                    if (missing <= 0) continue
                    await this.moveToMainForCrafting()
                    await this.moveToVendorIfNeeded(ingredient.name)
                    await this.bot.buy(ingredient.name, missing).catch(console.warn)
                }

                const ready = recipe.every((ingredient) => this.bot.countItem(ingredient.name) >= ingredient.quantity)
                if (!ready) continue

                const craftsToDo = this.getMaxCraftCount(recipe)
                if (craftsToDo < 1) continue

                await this.moveToMainForCrafting()
                for (let i = 0; i < craftsToDo; i++) {
                    try {
                        await this.bot.craft(target)
                    } catch (ex) {
                        console.warn(`inventory craft ${target} failed on #${i + 1}: ${ex}`)
                        break
                    }
                }
            }
        } catch (ex) {
            console.warn(`craftItemsFromInventoryLoop: ${ex}`)
        } finally {
            setTimeout(this.craftItemsFromInventoryLoop, this.CRAFT_FROM_INVENTORY_INTERVAL_MS)
        }
    }

    private isCryptSeason(): boolean {
        return CRYPT_SEASON_MONTHS.includes(new Date().getMonth())
    }

    private getCombatStateBots(): StateStrategy[] {
        return this.getPartyBotsOnServer().filter((s): s is StateStrategy =>
            s instanceof StateStrategy && this.getStateBot(s)?.ctype !== "merchant"
        )
    }

    private getMerchantGoldTotal(): number {
        // Pocket only — bank.gold in memory/Mongo is often stale and was bypassing the gate
        return this.bot.gold ?? 0
    }

    private canAffordCrypt(): boolean {
        return this.getMerchantGoldTotal() >= this.CRYPT_MIN_GOLD
    }

    private areCombatBotsFarming(): boolean {
        const combat = this.getCombatStateBots()
        if (combat.length < 1) return false
        return combat.every(s => s.currentState?.state_type === "farm")
    }

    private scheduleCryptOpen(delayMs: number) {
        setTimeout(() => {
            if (!this.job_scheduler.includes(this.openCryptJob)) {
                this.job_scheduler.push(this.openCryptJob)
            }
        }, delayMs)
    }

    private async waitForBankInfo(timeoutMs = 5000): Promise<boolean> {
        const started = Date.now()
        while (Date.now() - started < timeoutMs) {
            if (this.bot.bank || this.getMemoryStorage.getBank) return true
            await CF.sleep(100)
        }
        return !!(this.bot.bank || this.getMemoryStorage.getBank)
    }

    private async withdrawCryptKey(): Promise<boolean> {
        if (this.bot.hasItem("cryptkey")) return true

        // Live bot.bank is only the current floor. Visit all floors so keys in
        // bank_b / bank_u are found; locateItemsInBank merges with MemoryStorage.
        const bankMaps = ["bank", "bank_b", "bank_u"] as const
        for (const map of bankMaps) {
            if (this.bot.map !== map) {
                await this.bot.smartMove(map).catch(CF.debugLog)
            }
            await this.waitForBankInfo()

            let packs: ReturnType<typeof this.locateItemsInBank> = []
            try {
                packs = this.locateItemsInBank(this.bot, "cryptkey")
            } catch (ex) {
                console.warn(`locate cryptkey on ${map}: ${ex}`)
                continue
            }
            if (!packs?.length) {
                console.debug(`No cryptkey found while on ${this.bot.map}`)
                continue
            }

            const [packName, slots] = packs[0]
            console.debug(`Withdrawing cryptkey from ${packName}[${slots[0]}] (map=${this.bot.map})`)
            await this.bot.smartMove(packName, { getWithin: 9999 }).catch(CF.debugLog)
            await this.bot.withdrawItem(packName, slots[0]).catch(console.warn)
            if (this.bot.hasItem("cryptkey")) return true
        }

        return this.bot.hasItem("cryptkey")
    }

    private assignCryptToParty(instanceId: string) {
        // Force-reactivate even if party released/finished this id (merchant reclear)
        this.getMemoryStorage.clearCryptLevelUpWait()
        this.getMemoryStorage.reopenActiveCrypt(instanceId)
        const cryptState = {
            state_type: "crypt" as const,
            wantedMob: [] as MonsterName[],
            instanceId,
            server: {
                region: this.bot.serverData.region,
                name: this.bot.serverData.name,
            },
        }
        for (const botState of this.getCombatStateBots()) {
            const cur = botState.currentState
            // Already on this crypt — leave alone
            if (cur?.state_type === "crypt" && cur.instanceId === instanceId) continue
            // Farm/quest: switch immediately (scheduler-only left stragglers stuck farming)
            if (cur?.state_type === "farm" || cur?.state_type === "quest") {
                botState.currentState = cryptState
                continue
            }
            botState.addStateToScheduler(cryptState)
        }
        console.debug(`Assigned crypt ${instanceId} to party`)
    }

    /** Prevents duplicate setTimeouts for the same instance across resume/open. */
    private cryptLevelUpAssignScheduledId: string | undefined

    /**
     * After open: register level-up wait and queue party assign later (merchant stays free).
     */
    private scheduleCryptPartyAfterLevelUp(instanceId: string, abortToken: number) {
        this.getMemoryStorage.beginCryptLevelUpWait(instanceId, CRYPT_LEVEL_UP_WAIT_MS)
        console.debug(
            `Crypt ${instanceId}: waiting ${Math.round(CRYPT_LEVEL_UP_WAIT_MS / 3_600_000)}h for mob level-up before party`,
        )
        this.queueCryptPartyAfterLevelUp(instanceId, abortToken, CRYPT_LEVEL_UP_WAIT_MS)
    }

    private queueCryptPartyAfterLevelUp(instanceId: string, abortToken: number, delayMs: number) {
        if (this.cryptLevelUpAssignScheduledId === instanceId) return
        this.cryptLevelUpAssignScheduledId = instanceId
        setTimeout(() => {
            this.cryptLevelUpAssignScheduledId = undefined
            if (this.deactivate) return
            if (abortToken !== this.cryptAbortToken) return
            if (this.getMemoryStorage.getActiveCryptInstance !== instanceId) return
            if (!this.getMemoryStorage.isCryptPartyAssignPending
                && !this.getMemoryStorage.isCryptLevelUpWaiting) {
                // Already assigned / cleared
                return
            }
            this.job_scheduler.push(() => this.runCryptAfterLevelUp(instanceId, abortToken))
        }, Math.max(0, delayMs))
    }

    /** Assign party → wait clear → verify → finish (runs after level-up wait). */
    private async runCryptAfterLevelUp(instanceId: string, abortToken: number) {
        if (this.deactivate) return
        if (abortToken !== this.cryptAbortToken) return
        if (this.getMemoryStorage.getActiveCryptInstance !== instanceId) {
            console.debug(`runCryptAfterLevelUp: active crypt changed, skip ${instanceId}`)
            return
        }
        try {
            this.assignCryptToParty(instanceId)
            this.changeMerchState("Waiting crypt clear")
            const cleared = await this.waitUntilPartyLeftCrypt()
            if (abortToken !== this.cryptAbortToken) return
            if (!cleared) {
                console.warn("Timed out waiting for party crypt clear")
                this.scheduleCryptOpen(10 * 60_000)
                return
            }

            let verifyResult = await this.verifyCrypt(instanceId)
            while (verifyResult === "needs_clear") {
                if (abortToken !== this.cryptAbortToken) return
                this.changeMerchState("Waiting crypt reclear")
                await this.waitUntilPartyLeftCrypt()
                if (abortToken !== this.cryptAbortToken) return
                verifyResult = await this.verifyCrypt(instanceId)
            }

            if (abortToken !== this.cryptAbortToken) return
            this.getMemoryStorage.finishActiveCrypt(instanceId)
            this.scheduleCryptOpen(verifyResult === "clean" ? 60_000 : 10 * 60_000)
        } catch (ex) {
            console.warn(`runCryptAfterLevelUp: ${ex}`)
            this.scheduleCryptOpen(10 * 60_000)
        } finally {
            this.changeMerchState(this.DEFAULT_STATE)
        }
    }

    /** Pull any combat bots that drifted to farm back into the active crypt. */
    private recallCryptStragglers(instanceId: string): number {
        this.getMemoryStorage.reopenActiveCrypt(instanceId)
        let recalled = 0
        const cryptState = {
            state_type: "crypt" as const,
            wantedMob: [] as MonsterName[],
            instanceId,
            server: {
                region: this.bot.serverData.region,
                name: this.bot.serverData.name,
            },
        }
        for (const botState of this.getCombatStateBots()) {
            const cur = botState.currentState
            if (cur?.state_type === "crypt" && cur.instanceId === instanceId) continue
            const queued = botState.stateScheduler?.some(
                s => s.state_type === "crypt" && s.instanceId === instanceId,
            )
            if (queued && cur?.state_type !== "farm" && cur?.state_type !== "quest") continue
            if (cur?.state_type === "farm" || cur?.state_type === "quest") {
                botState.currentState = cryptState
                recalled++
            } else if (!queued) {
                botState.addStateToScheduler(cryptState)
                recalled++
            }
        }
        if (recalled > 0) {
            console.debug(`Recalled ${recalled} straggler(s) to crypt ${instanceId}`)
        }
        return recalled
    }

    private async waitUntilPartyLeftCrypt(timeoutMs = 45 * 60_000): Promise<boolean> {
        const started = Date.now()
        while (Date.now() - started < timeoutMs) {
            if (this.deactivate) return false
            const stillInCrypt = this.getCombatStateBots().some(s => {
                const b = this.getStateBot(s)
                if (!b) return false
                return s.currentState?.state_type === "crypt" || b.map === "crypt"
            })
            if (!stillInCrypt) return true
            await CF.sleep(2000)
        }
        return false
    }

    /**
     * code_eval `skipcrypt`: party leaves current dungeon; merchant withdraws key,
     * opens a fresh crypt, and assigns it to combat bots.
     */
    public async skipCurrentCryptAndOpenNew() {
        if (this.deactivate) return
        if (this.skipCryptInProgress) {
            console.debug("skipcrypt already in progress")
            return
        }
        this.skipCryptInProgress = true
        const token = ++this.cryptAbortToken
        try {
            console.debug("skipcrypt: aborting current crypt and opening a new one")
            this.getMemoryStorage.beginCryptSkip()

            for (const botState of this.getCombatStateBots()) {
                await botState.abortCryptRun()
            }

            this.changeMerchState("Skip crypt — waiting leave")
            await this.waitUntilPartyLeftCrypt(90_000)
            if (token !== this.cryptAbortToken) return

            if (this.bot.map === "crypt") {
                await this.bot.leaveMap().catch(CF.debugLog)
            }

            if (!this.isCryptSeason()) {
                console.debug("skipcrypt: crypt season inactive")
                this.getMemoryStorage.endCryptSkip()
                return
            }

            if (!this.canAffordCrypt()) {
                console.warn(
                    `skipcrypt: not enough pocket gold (${this.getMerchantGoldTotal()} < ${this.CRYPT_MIN_GOLD})`,
                )
                this.getMemoryStorage.endCryptSkip()
                this.scheduleCryptOpen(10 * 60_000)
                return
            }

            this.changeMerchState("Skip crypt — getting key")
            const hasKey = await this.withdrawCryptKey()
            if (token !== this.cryptAbortToken) return
            if (!hasKey) {
                console.warn("skipcrypt: no cryptkey in bank/inventory")
                this.getMemoryStorage.endCryptSkip()
                this.scheduleCryptOpen(0)
                return
            }
            if (!this.canAffordCrypt()) {
                console.warn(
                    `skipcrypt: not enough pocket gold after bank (${this.getMerchantGoldTotal()} < ${this.CRYPT_MIN_GOLD})`,
                )
                this.getMemoryStorage.endCryptSkip()
                this.scheduleCryptOpen(10 * 60_000)
                return
            }

            this.changeMerchState("Skip crypt — opening")
            if (!(await this.enterCrypt())) {
                console.warn("skipcrypt: failed to open crypt")
                this.getMemoryStorage.endCryptSkip()
                this.scheduleCryptOpen(5 * 60_000)
                return
            }
            if (token !== this.cryptAbortToken) return

            const instanceId = this.bot.in
            if (!instanceId || this.bot.map !== "crypt") {
                console.warn("skipcrypt: opened but instance id missing")
                this.getMemoryStorage.endCryptSkip()
                this.scheduleCryptOpen(5 * 60_000)
                return
            }

            console.debug(`skipcrypt: opened new crypt ${instanceId}`)
            this.getMemoryStorage.endCryptSkip()
            if (this.bot.map === "crypt") await this.bot.leaveMap().catch(CF.debugLog)
            this.scheduleCryptPartyAfterLevelUp(instanceId, token)
            // Clear/verify continue in runCryptAfterLevelUp after 3h
        } catch (ex) {
            console.warn(`skipcrypt: ${ex}`)
            this.scheduleCryptOpen(10 * 60_000)
        } finally {
            this.getMemoryStorage.endCryptSkip()
            this.skipCryptInProgress = false
            this.changeMerchState(this.DEFAULT_STATE)
        }
    }

    private cryptHasWantedMobs(): boolean {
        return this.bot.getEntities({ withinRange: CRYPT_MOB_DETECT_RANGE }).some(e =>
            e.map === "crypt"
            && isCryptWantedMonster(e)
            && e.xp > 0
        )
    }

    private async enterCrypt(instanceId?: string): Promise<boolean> {
        if (this.bot.map === "crypt" && (!instanceId || this.bot.in === instanceId)) return true

        if (this.bot.map === "crypt" && instanceId && this.bot.in !== instanceId) {
            await this.bot.leaveMap().catch(CF.debugLog)
        }

        // Open/join only via cave door — never enter from main/bank
        let atDoor = false
        for (let attempt = 0; attempt < 3; attempt++) {
            await this.bot.smartMove(CRYPT_DOOR_APPROACH, { getWithin: 20, numAttempts: 5 }).catch(CF.debugLog)
            atDoor = this.bot.map === "cave"
                && Tools.distance(this.bot, CRYPT_DOOR) <= Constants.DOOR_REACH_DISTANCE * 2
            if (atDoor) break
            console.warn(`enterCrypt: not at cave door (map=${this.bot.map}), retry ${attempt + 1}`)
        }
        if (!atDoor) {
            console.warn(`enterCrypt: failed to reach crypt door from ${this.bot.map}`)
            return false
        }

        try {
            if (instanceId) await this.bot.enter("crypt", instanceId)
            else await this.bot.enter("crypt")
        } catch (ex) {
            console.warn(`enter crypt failed: ${ex}`)
            return false
        }
        // map narrowed to "cave" before enter — read fresh after transition
        const mapNow = this.bot.map as string
        return mapNow === "crypt" && (!instanceId || this.bot.in === instanceId)
    }

    private async verifyCrypt(instanceId: string): Promise<"clean" | "needs_clear" | "failed"> {
        this.changeMerchState("Verifying crypt")
        try {
            if (!(await this.enterCrypt(instanceId))) {
                console.warn(`Merchant crypt verify enter failed`)
                return "failed"
            }

            for (const waypoint of [CRYPT_ENTRANCE, ...CRYPT_ROUTE]) {
                if (this.deactivate) return "failed"
                // Move inside instance without `in` (avoids leave+re-enter)
                await this.bot.smartMove(
                    { map: "crypt", x: waypoint.x, y: waypoint.y },
                    {
                        getWithin: CRYPT_WAYPOINT_ARRIVE_RANGE,
                        avoidTownWarps: true,
                        avoidMaps: ["main", "cave"],
                    },
                ).catch(CF.debugLog)
                if (this.cryptHasWantedMobs()) {
                    console.debug("Merchant found wanted crypt bosses, recalling party")
                    this.assignCryptToParty(instanceId)
                    if (this.bot.map === "crypt") await this.bot.leaveMap().catch(CF.debugLog)
                    return "needs_clear"
                }
            }

            if (this.bot.map === "crypt") await this.bot.leaveMap().catch(CF.debugLog)
            return "clean"
        } catch (ex) {
            console.warn(`verifyCrypt error: ${ex}`)
            return "failed"
        }
    }

    /** True if a crypt run is still in progress (memory, DB flag, state, or bots). */
    private async hasActiveCrypt(): Promise<boolean> {
        await this.getMemoryStorage.ensureActiveCryptLoaded()
        const activeId = this.getMemoryStorage.getActiveCryptInstance
        if (activeId) return true
        if (this.getCombatStateBots().some(s => {
            const b = this.getStateBot(s)
            if (!b) return false
            if (s.currentState?.state_type === "crypt") return true
            if (s.stateScheduler?.some(st => st.state_type === "crypt")) return true
            if (b.map === "crypt") return true
            return false
        })) return true

        // Fallback: read active_crypt collection directly
        if (Database.connection) {
            try {
                const doc = await ActiveCryptModel.findOne({ key: "crypt", active: true }).lean<{
                    instanceId?: string
                }>()
                if (doc?.instanceId) {
                    this.getMemoryStorage.restoreActiveCrypt(doc.instanceId)
                    console.debug(`Restored active crypt from DB flag: ${doc.instanceId}`)
                    return true
                }
            } catch (ex) {
                console.warn(`hasActiveCrypt DB check: ${ex}`)
            }
        }
        return false
    }

    private async openCryptJob() {
        if (this.deactivate) return
        if (this.skipCryptInProgress) {
            this.scheduleCryptOpen(5_000)
            return
        }
        const runToken = this.cryptAbortToken
        try {
            if (!this.isCryptSeason()) {
                console.debug("Crypt season inactive, retry in 12h")
                this.scheduleCryptOpen(12 * 60 * 60_000)
                return
            }

            if (!this.canAffordCrypt()) {
                console.warn(
                    `Crypt skipped — pocket gold ${this.getMerchantGoldTotal()} < ${this.CRYPT_MIN_GOLD}`,
                )
                this.scheduleCryptOpen(10 * 60_000)
                return
            }

            // Don't spend another key while a crypt is already open / assigned
            if (await this.hasActiveCrypt()) {
                const activeId = this.getMemoryStorage.getActiveCryptInstance
                if (activeId && this.getMemoryStorage.isCryptLevelUpWaiting) {
                    console.debug(
                        `Crypt ${activeId} leveling up (${Math.round(this.getMemoryStorage.getCryptLevelUpRemainingMs / 60_000)}m left)`,
                    )
                    // Ensure assign is scheduled after restart (idempotent)
                    this.queueCryptPartyAfterLevelUp(activeId, this.cryptAbortToken, this.getMemoryStorage.getCryptLevelUpRemainingMs)
                } else if (activeId && this.getMemoryStorage.isCryptPartyAssignPending) {
                    console.debug(`Crypt ${activeId} level-up done — queueing party assign`)
                    this.queueCryptPartyAfterLevelUp(activeId, this.cryptAbortToken, 0)
                } else if (activeId) {
                    // Always pull farm stragglers back — don't wait for the whole party to farm
                    this.recallCryptStragglers(activeId)
                } else {
                    console.debug("Active crypt exists (in party/state/DB), skip open; retry in 60s")
                }
                this.scheduleCryptOpen(60_000)
                return
            }

            if (!this.areCombatBotsFarming()) {
                console.debug("Combat bots not farming, retry crypt in 60s")
                this.scheduleCryptOpen(60_000)
                return
            }

            this.changeMerchState("Getting crypt key")
            const hasKey = await this.withdrawCryptKey()
            if (!hasKey) {
                console.debug("No cryptkey in bank/inventory, requeue openCrypt immediately")
                this.scheduleCryptOpen(0)
                return
            }

            // Re-check after bank trip — gold may have been deposited
            if (!this.canAffordCrypt()) {
                console.warn(
                    `Crypt aborted after bank — pocket gold ${this.getMerchantGoldTotal()} < ${this.CRYPT_MIN_GOLD}`,
                )
                this.scheduleCryptOpen(10 * 60_000)
                return
            }

            // Re-check after bank trip — party may have resumed crypt meanwhile
            if (await this.hasActiveCrypt()) {
                console.debug("Active crypt appeared while withdrawing key, skip open")
                this.scheduleCryptOpen(60_000)
                return
            }
            if (runToken !== this.cryptAbortToken) return

            this.changeMerchState("Opening crypt")
            // Entering without instance consumes cryptkey and creates a new dungeon
            if (!(await this.enterCrypt())) {
                console.warn("Failed to open crypt")
                this.scheduleCryptOpen(5 * 60_000)
                return
            }
            if (runToken !== this.cryptAbortToken) return

            const instanceId = this.bot.in
            if (!instanceId || this.bot.map !== "crypt") {
                console.warn("Crypt opened but instance id missing")
                this.scheduleCryptOpen(5 * 60_000)
                return
            }

            console.debug(`Opened crypt instance: ${instanceId}`)
            if (this.bot.map === "crypt") await this.bot.leaveMap().catch(CF.debugLog)
            this.scheduleCryptPartyAfterLevelUp(instanceId, runToken)
            // Assign / clear / verify happen in runCryptAfterLevelUp after 3h
        } catch (ex) {
            console.warn(`openCryptJob: ${ex}`)
            this.scheduleCryptOpen(10 * 60_000)
        } finally {
            this.changeMerchState(this.DEFAULT_STATE)
        }
    }
    
}