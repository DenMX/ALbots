import { PingCompensatedCharacter, Game, Merchant, Tools, Database, EntityModel, Constants, MonsterName } from "alclient"
import * as MIC from "../configs/manage_items_configs"
import * as CF from "../common_functions/common_functions"
import { ManageItems } from "../common_functions/manage_items_strategy"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"
import { IState } from "../controllers/state_interface"
import * as Items from "../configs/character_items_configs"
import { BOSS_CHECK_ROUTE } from "../configs/events_and_spots"


export type State = {
    state_type: string
}
export class MerchantStrategy extends ManageItems implements IState {

    private job_scheduler: Function[] = []

    private DEFAULT_STATE: string =  "Idle"

    private merch_state : State = {state_type: this.DEFAULT_STATE}

    public getStateType(): string {
        return this.merch_state.state_type
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

        this.checkInventory()
        this.job_scheduler.push(this.checkBankUpgrades)
        this.checkPartyInventory()
        this.checkScheduler(true)
        this.monitoringSpecialsLoop()
        this.shouldCheckBossesLoop()

        if(this.bot.isOnCooldown("fishing")) setTimeout(() => {this.job_scheduler.push(this.fishing)}, Math.max(1,this.bot.getCooldown("fishing")))
        else this.job_scheduler.push(this.fishing)

        if(this.bot.isOnCooldown("mining")) setTimeout(() => {this.job_scheduler.push(this.mining)}, Math.max(1,this.bot.getCooldown("mining")))
        else this.job_scheduler.push(this.mining)

        this.checkWeapon()
    }

    private async fishing() {
        if(this.deactivate) return
        if(this.bot.esize < 2) return setTimeout(() => {this.job_scheduler.push(this.fishing)}, 1000)
        if(!this.bot.hasItem("rod") && this.bot.slots.mainhand?.name != "rod") {
            this.changeMerchState("Crafting rod")
            await this.craftTool("rod")
        }
        if(this.bot.hasItem("rod")) {
            this.changeMerchState("Fishing")
            try {
                await this.bot.smartMove({x: -1132, y: -289, map:"main"})
                while(!this.bot.isOnCooldown("fishing")) {
                    if(!this.bot.hasItem("rod")) {
                        this.changeMerchState(this.DEFAULT_STATE)
                        return this.job_scheduler.push(this.fishing)
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
        }
        setTimeout(() => {this.job_scheduler.push(this.fishing)}, Math.max(1,this.bot.getCooldown("fishing")))
    }



    private async mining() {
        if(this.deactivate) return
        if(this.bot.esize < 2) return setTimeout(() => {this.job_scheduler.push(this.mining)}, 1000)
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
                        return this.job_scheduler.push(this.mining)
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
        }
        setTimeout(() => {this.job_scheduler.push(this.mining)}, Math.max(1,this.bot.getCooldown("mining")))
    }



    private async craftTool(tool: "rod" | "pickaxe") {
        if(this.deactivate) return
        if(!this.bot.hasItem("spidersilk")){
            if(!this.bot.map.startsWith("bank")) await this.bot.smartMove("bank").catch(console.warn)
            const packWithTool = this.locateItemsInBank(this.bot, tool, {returnLowestQuantity: true})
            if(packWithTool && packWithTool[0]?.[0]) {
                await this.bot.smartMove(packWithTool[0][0], {getWithin: 9999}).catch(console.warn)
                await this.bot.withdrawItem(packWithTool[0][0], packWithTool[0][1][0]).catch(console.warn)
                return
            }
            const webPack = this.locateItemsInBank(this.bot, "spidersilk", {returnLowestQuantity: true})
            console.debug(`Spidersilk pack: ${JSON.stringify(webPack)}`)
            if(!webPack || !webPack[0]?.[0]) return console.error("No spidersilk in bank")
            await this.bot.smartMove(webPack[0][0], {getWithin: 9999}).catch(console.warn)
            await this.bot.withdrawItem(webPack[0][0], webPack[0][1][0]).catch(console.warn)
        }
        await this.bot.smartMove("main").catch(console.warn)
        for(const item of Game.G.craft[tool].items) {
            if(item[1] == "spidersilk") continue
            await this.bot.buy(item[1], item[0])
        }
        if(!this.bot.hasItem(["computer","supercomputer"])) {
            await this.bot.smartMove("goo", {getWithin: 100}).catch(CF.debugLog)
        }
        await this.bot.craft(tool).catch(CF.debugLog)
    }

    private async checkWeapon() {
        if(this.deactivate) return
        if(this.bot.slots.mainhand?.name == "rod" && this.merch_state.state_type == "Fishing") return setTimeout(this.checkWeapon, 1000)
        if(this.bot.slots.mainhand?.name == "pickaxe" && this.merch_state.state_type == "Mining") return setTimeout(this.checkWeapon, 1000)
        if(this.bot.slots.mainhand?.name != Items.WEAPON_CONFIGS[this.bot.id].fast_mainhand?.name) await this.bot.equip(this.bot.locateItem(Items.WEAPON_CONFIGS[this.bot.id].fast_mainhand?.name), "mainhand").catch(CF.debugLog)
        if(this.bot.slots.offhand?.name != Items.WEAPON_CONFIGS[this.bot.id].fast_offhand?.name) await this.bot.equip(this.bot.locateItem(Items.WEAPON_CONFIGS[this.bot.id].fast_offhand?.name), "offhand").catch(CF.debugLog)
        setTimeout(this.checkWeapon, 1000)
    }

    /**
     * Calling function from scheduler. Loop
     * @param setNextTimeout default true, to make it easy for loop and let not running multiple loops when caling it twice
     */
    private async checkScheduler(setNextTimeout: boolean = true) {
        if(this.deactivate) return
        // console.debug(`Scheduler loop. in queue ${this.job_scheduler.length} tasks`)
        // console.debug(this.job_scheduler.toString())
        if(this.DEFAULT_STATE == this.merch_state.state_type && this.job_scheduler.length>0) {
            let fn = this.job_scheduler.shift()
            await fn()
        }

        if(setNextTimeout == true) {
            setTimeout(this.checkScheduler, 1000)
        }
    }

    

    private async checkBankUpgrades() {
        if(this.deactivate) return
        if(this.bot.esize<10) {
            return setTimeout(() => {this.job_scheduler.push(this.checkBankUpgrades)}, 5 * 1000) //10min cooldown
        }

        this.changeMerchState("Upgrading bank")
        await this.upgradeItemsFromBank()
        this.changeMerchState(this.DEFAULT_STATE)

        setTimeout(() => {this.job_scheduler.push(this.checkBankUpgrades)}, 5 * 1000) //10min cooldown
    }

    /**
     * Changing state and moving scheduler when new state is default
     * @param state 
     */
    private changeMerchState(state: string) {
        this.merch_state.state_type = state
        // console.debug(`State was changed to ${state}`)
        if(this.DEFAULT_STATE == state && this.job_scheduler.length<1) {
            let partyMember = this.bot.partyData?.party[this.bot.partyData?.list.filter(e => e != this.bot.id)[0]]
            if(partyMember && !this.bot.smartMoving && (Tools.distance(this.bot, partyMember) > 400 || partyMember.map != this.bot.map)) this.bot.smartMove(partyMember, {getWithin: 100}).catch(console.debug)
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
            await this.resuplyScrolls()
            await this.upgradeItems()
            await this.compoundItems()
            await this.exchangeItems()
        }
        setTimeout(this.checkInventory, 1000)//10sec
                
    }


    private async shovelInventory() {
        try {
            if(!this.bot.hasItem(["computer","supercomputer"])) {
                this.changeMerchState("Move main")
                await this.bot.smartMove(CF.UPGRADE_POSITION)
                this.changeMerchState("selling")
                await this.sellTrash()
                this.changeMerchState("upgrading")
                await this.upgradeItems()
                this.changeMerchState("compounding")
                await this.compoundItems()
                this.changeMerchState("exchanging")
                await this.exchangeItems()
            }
            this.changeMerchState("Going to bank")
            let bot = this.bot
            await bot.smartMove("bank")
            this.changeMerchState("Store")
            await this.storeItems()
            await this.sellTrashFromBank()
            this.changeMerchState("Upgrading bank")            
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
            let idx = this.locateItemsInBank(this.bot, itemName)
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
        const mageState = this.getMemoryStorage.getStateController?.getBots.filter( e => e.getBot().serverData.region == this.bot.serverData.region && e.getBot().serverData.name == this.bot.serverData.name && e.getBot().ctype == "mage")[0]
        if( !mageState ) {
            console.debug("No mage on the server while monitoring specials loop is running")
            return setTimeout(this.monitoringSpecialsLoop, 10_000)
        }
        const mage = mageState.getBot()
        const specials = this.bot.getEntities().filter( e => Constants.SPECIAL_MONSTERS.includes(e.type))
        if(specials.length<1) return setTimeout(this.monitoringSpecialsLoop, 1000)
        
        for( const special of specials) {
            if(mage.getEntities().filter( e => e.id == special.id).length>0) {
                console.debug(`${special.type} is already in the world`)
                continue
            }
            if((mageState as StateStrategy).stateScheduler.some( e => e.state_type == "boss" && e.wantedMob.includes(special.type))) {
                console.debug(`${special.type} is already in scheduler`)
                continue
            }
            const priest = this.getMemoryStorage.getStateController?.getBots.filter( e => e.getBot().serverData.region == this.bot.serverData.region && e.getBot().serverData.name == this.bot.serverData.name && e.getBot().ctype == "priest")[0].getBot()
            
            if(!priest || CF.calculate_monster_dps(priest, special) > CF.calculate_hps(priest)) {
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
        if( this.getMemoryStorage.getStateController?.getBots
            .filter( e => e.getBot().serverData.region == this.bot.serverData.region && e.getBot().serverData.name == this.bot.serverData.name && e.getBot().ctype == "mage")
            .length < 1
        ) 
        {
            console.debug("No mage on the server while loop is running")
            return setTimeout(this.shouldCheckBossesLoop, 10_000)
        }
        console.debug("Should check bosses loop is running")
        this.job_scheduler.push(this.checkBosses)        
    }

    private async checkBosses() {
        if( this.deactivate) return console.debug("Check bosses is deactivated")
        if( this.getMemoryStorage.getStateController?.getBots
            .filter( e => e.getBot().serverData.region == this.bot.serverData.region && e.getBot().serverData.name == this.bot.serverData.name && e.getBot().ctype == "mage")
            .length < 1
        ) {
            console.debug("No mage on the server")
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
        let bots = super.getMemoryStorage.getStateController?.getBots.filter( e => e.getBot().serverData.region == this.bot.serverData.region && e.getBot().serverData.name == this.bot.serverData.name )
        if(!bots) {
            return setTimeout(() => {this.job_scheduler.push(this.checkPartyInventory)}, 10_000)
        }
        // console.debug(`Bots on the same server: ${bots?.length}`)
        for(const b of bots) {
            let bot = b.getBot() 
            if(bot.name == this.bot.name) continue
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
                        this.bot.smartMove("main").catch(console.warn)
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

    
    
}