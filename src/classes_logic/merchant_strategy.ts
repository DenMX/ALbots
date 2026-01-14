import { ItemData, PingCompensatedCharacter} from "alclient"
import * as MIC from "../configs/manage_items_configs"
import * as CF from "../common_functions/common_functions"
import * as CharacterItems from "../configs/character_items_configs"
import { ManageItems } from "../common_functions/manage_items_strategy"
import { MemoryStorage } from "../common_functions/memory_storage"

export type State = {
    state_type: string
}
export class MerchantStrategy extends ManageItems {

    private job_scheduler: Function[] = []

    private DEFAULT_STATE : State = { state_type: "Idle"}

    private merch_state : State = this.DEFAULT_STATE

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        super(bot,memoryStorage)

        this.checkInventory = this.checkInventory.bind(this)
        this.checkPartyInventory = this.checkPartyInventory.bind(this)
        this.checkBankUpgrades = this.checkBankUpgrades.bind(this)
        this.checkScheduler = this.checkScheduler.bind(this)
        this.shovelInventory = this.shovelInventory.bind(this)

        
        // if(!super.getMemoryStorage.getBank) {
        //     this.job_scheduler.push(async() => {
        //         console.debug("going load bank in memory")
        //         this.changeMerchState("Loading bank")
        //         await bot.smartMove("bank").catch(console.warn)
        //         if(!bot.bank) await bot.smartMove("bank_b").catch(console.warn)
        //         this.job_scheduler.push(this.checkBankUpgrades)
        //         this.changeMerchState(this.DEFAULT_STATE.state_type)
        //     })
        // }

        this.checkInventory()
        this.checkPartyInventory()
        this.checkScheduler(true)
    }

    /**
     * Calling function from scheduler. Loop
     * @param setNextTimeout default true, to make it easy for loop and let not running multiple loops when caling it twice
     */
    private async checkScheduler(setNextTimeout?: boolean) {
        if(setNextTimeout === undefined) setNextTimeout=true
        console.debug(`Scheduler loop. in queue ${this.job_scheduler.length} tasks`)
        console.debug(this.job_scheduler.toString())
        if(this.DEFAULT_STATE.state_type == this.merch_state.state_type && this.job_scheduler.length>0) {
            let fn = this.job_scheduler.shift()
            await fn()
        }

        if(setNextTimeout == true) setTimeout(this.checkScheduler, 1000)
    }

    private async checkBankUpgrades() {
        if(this.bot.esize<10) return setTimeout(() => {this.job_scheduler.push(this.checkBankUpgrades)}, 10 * 60 * 1000) //10min cooldown


        setTimeout(() => {this.job_scheduler.push(this.checkBankUpgrades)}, 10 * 60 * 1000) //10min cooldown
    }

    /**
     * Changing state and moving scheduler when new state is default
     * @param state 
     */
    private changeMerchState(state: string) {
        this.merch_state.state_type = state
        console.debug(`State was changed to ${state}`)
        if(this.DEFAULT_STATE.state_type == state) this.checkScheduler(false)
    }

    /**
     * Simple check esize and push shovel in scheduler
     * @returns shove in scheduler
     */
    private async checkInventory() {
        console.debug(`Checking inventory: ${this.bot.esize}`)
        if(this.bot.esize<2) {
            if( this.bot.hasItem(["computer", "supercomputer"])) {
                await this.sellTrash()
                await this.upgradeItems()
                await this.compoundItems()
            }
            if(this.job_scheduler.includes(this.shovelInventory)) return setTimeout(this.checkInventory, 5000)
            if(this.bot.esize<2) this.job_scheduler.push(this.shovelInventory)
        }
        if(this.bot.esize<20 && this.bot.hasItem(["computer", "supercomputer"])) {
            await this.sellTrash()
            await this.resuplyScrolls()
            await this.upgradeItems()
            await this.compoundItems()
            await this.exchangeItems()
        }
        setTimeout(this.checkInventory, 10 * 1000)//10sec
                
    }


    private async shovelInventory() {
        if(!this.bot.hasItem(["computer","supercomputer"])) {
            this.changeMerchState("Move main")
            await this.bot.smartMove("main").catch(console.warn)
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
        await bot.smartMove("bank").catch(console.warn)
        this.changeMerchState("Store")
        await this.storeItems()
        await this.sellTrashFromBank()
        this.changeMerchState(this.DEFAULT_STATE.state_type)
    }

    private async sellTrashFromBank() {
        if( !this.bot.map.startsWith("bank") || this.bot.esize<=0 ) return
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
        this.changeMerchState(this.DEFAULT_STATE.state_type)
    }

    private checkPartyInventory() {
        console.debug("checking party")
        let bots = super.getMemoryStorage.getActiveBots.filter( e => e.serverData.region == this.bot.serverData.region && e.serverData.name == this.bot.serverData.name )
        console.debug(`Bots on the same server: ${bots.length}`)
        for(const bot of bots) {
            if(bot.name == this.bot.name) continue
            // console.debug(`Checking ${bot.name} inventory`)
            // MAKING PERSONAL ITEMS LIST
            let hpot = MIC.HPOTS_CAP - bot.countItem("hpot1")
            let mpot = MIC.MPOTS_CAP - bot.countItem("mpot1")
            
            let notPersonalItems = CF.getBotNotPersonalItemsList(bot)
            console.debug(`${bot.name} has ${notPersonalItems.length} NOT personal items`)

            if( notPersonalItems.length>5) {

                console.debug(`Creating task for ${bot.name}`)
                let hpot = MIC.HPOTS_CAP - bot.countItem("hpot1")
                let mpot = MIC.MPOTS_CAP - bot.countItem("mpot1")

                this.job_scheduler.push( async() => {
                    if(!this.bot.hasItem(["computer", "supercomputer"])) {
                        this.changeMerchState("Move to main")
                        this.bot.smartMove("main").catch(console.warn)
                        await this.bot.buy("hpot1", hpot).catch(console.warn)
                        await this.bot.buy("mpot1", mpot).catch(console.warn)
                    }
                    this.changeMerchState(`Smartmoving to ${bot.name}`)
                    await this.bot.smartMove(bot).catch(console.warn)
                    this.changeMerchState('Getting items')
                    await this.bot.sendItem( bot.name, this.bot.locateItem("hpot1"), hpot ).catch(console.warn)
                    await this.bot.sendItem( bot.name, this.bot.locateItem("mpot1"), mpot ).catch(console.warn)
                    this.changeMerchState(this.DEFAULT_STATE.state_type)
                    if(!this.job_scheduler.includes(this.checkPartyInventory))setTimeout(this.checkPartyInventory, 30 * 1000)
                })
                return
            }
                
        }

        setTimeout(()=>{this.job_scheduler.push(this.checkPartyInventory)}, 30 * 1000)
    }

    
    
}