import { PingCompensatedCharacter} from "alclient"
import * as items from "../configs/manage_items_configs"
import { ManageItems } from "../common_functions/manage_items_strategy"
import { MemoryStorage } from "../common_functions/memory_storage"


export class MerchantStrategy extends ManageItems {

    private job_scheduler: Function[] = []

    private DEFAULT_STATE = "Idle"

    private merch_state : string = this.DEFAULT_STATE

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        super(bot,memoryStorage)
        this.checkInventory()
        this.checkPartyInventory()
        if(!super.getMemoryStorage.getBank) {
            this.job_scheduler.push(async() => {
                await bot.smartMove("bank").catch(console.warn)
                if(!bot.bank) await bot.smartMove("bank_b").catch(console.warn)
                this.job_scheduler.push(this.checkBankUpgrades)
            })
        }
        
    }

    /**
     * Calling function from scheduler. Loop
     * @param setNextTimeout default true, to make it easy for loop and let not running multiple loops when caling it twice
     */
    private async checkScheduler(setNextTimeout?: boolean) {
        if(setNextTimeout === undefined) setNextTimeout=true
        
        if(this.DEFAULT_STATE == this.merch_state && this.job_scheduler.length>0) {
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
        this.merch_state = state
        console.log(`State was changed to ${state}`)
        if(this.DEFAULT_STATE == state) this.checkScheduler(false)
    }

    /**
     * Simple check esize and push shovel in scheduler
     * @returns shove in scheduler
     */
    private async checkInventory() {
        if(this.bot.esize<2) {
            await super.sellTrash()
            if(this.job_scheduler.includes(this.shovelInventory)) return setTimeout(this.checkInventory, 5000)
            if(this.bot.esize<2) this.job_scheduler.push(this.shovelInventory)
        }
        setTimeout(this.checkInventory, 10 * 1000)//10sec
                
    }


    private async shovelInventory() {
        this.changeMerchState("Going to bank")
        let bot = this.bot
        await bot.smartMove("bank").catch(console.warn)
        this.changeMerchState("Try to store items")
        await super.storeItems()
        this.changeMerchState(this.DEFAULT_STATE)
    }

    private checkPartyInventory() {
        let bots = super.getMemoryStorage.getActiveBots
        for(const bot of bots) {
            if(bot.name == this.bot.name) continue
            if(Object.values(bot.getItems()).filter( e => !items.DONT_SEND_ITEMS.includes(e.name) && !e.isLocked()).length>5) {
                this.job_scheduler.push(async() => {
                    this.changeMerchState(`Smartmoving to ${bot.name}`)
                    await this.bot.smartMove(bot).catch(console.warn)
                    this.changeMerchState('Getting items')
                    for(const [idx, item] of bot.getItems()) {
                        if(items.DONT_SEND_ITEMS.includes(item.name)) continue
                        if(item.isLocked()) continue
                        await bot.sendItem(this.bot.name,idx,item.q)
                    }
                    this.changeMerchState(this.DEFAULT_STATE)
                })
            }
                
        }

        setTimeout(()=>{this.job_scheduler.push(this.checkPartyInventory)}, 30 * 1000)
    }
    
}