import { ItemName, PingCompensatedCharacter, Ranger, Tools } from "alclient"
import * as CI from "../classes_configs/items"
import { PartyStrategy } from "./party_strategy"
import { MemberExpression } from "typescript"
import { MemoryStorage } from "./memory_storage"

export class ResuplyStrategy extends PartyStrategy {

    //POTS
    private MPOTS_CAP = 9000
    private HPOTS_CAP = 5000

    private scrolls_cap: Map<ItemName,number> = new Map([
        ["scroll0", 500],
        ["scroll1", 50],
        ["scroll2", 10],
        ["cscroll0", 200],
        ["cscroll1", 50],
        ["cscroll2", 5]
    ])
   

    private ressuplyFunction: Function[] = [
        this.resupplyPots,
        this.usePotionsLoop,
        this.scareLoop, 
        // this.useElixirsLoop,
        this.checkTomeOfProtection,
        this.resuplyScrolls
    ]

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        setTimeout(() => this.initialize(), 5000)
        bot.socket.on("death", this.respawnStrat.bind(this))
        
    }

    private async initialize() {
        for(let fn of this.ressuplyFunction){
            await fn().catch(console.error)
        }
    }

    private async respawnStrat() {
        
        setTimeout(this.bot.respawn, 15000)
        setTimeout(() => {
            this.bot.smartMove("monsterhunter")
            this.checkTomeOfProtection()
        }, 15500)
    }

    private async checkTomeOfProtection(){
        if(this.bot.locateItem("xptome") === undefined && this.bot.gold > 3200000) {
            if(this.bot.locateItem("computer") === undefined) {
                await this.bot.smartMove("premium")
            }
            await this.bot.buy("xptome")
        }
    }

    private getBotitems() : CI.ItemsConfig {
        switch(this.bot.name){
            case "Archealer":
                return CI.ArchealerItems
            case "Warious":
                return CI.WariousItems
            case "arMAGEdon":
                return CI.arMAGEdonItems
            case "aRanDonDon":
                return CI.aRanDonDon
            case "aRogDonDon":
                return CI.aRogDonDon
            default:
                throw(`There is no config for ${this.bot.name}. Check Resupply strategy.`)
        }
    }

    private async useElixirsLoop() {
        if(this.bot.slots.elixir?.expires) return setTimeout( () => this.useElixirsLoop(), Date.parse(this.bot.slots.elixir.expires) - Date.now())
        if(!this.bot.slots || (this.bot.slots.elixir?.expires &&  Date.parse(this.bot.slots.elixir.expires) - Date.now() < 60000 )) {
            await this.bot.equip(this.bot.locateItem(this.getBotitems().elixir))
        }
        return setTimeout( () => this.useElixirsLoop(), 2000)
    }

    private async usePotionsLoop() {
        if(this.bot.hp < this.bot.max_hp * 0.5) {
            let hpot = this.bot.locateItem("hpot1")
            hpot>=0 ? await this.bot.usePotion(hpot).catch(ex => console.warn(ex)) : await this.bot.regenHP().catch(ex => console.warn(ex))
            return setTimeout( () => this.usePotionsLoop(), Math.max(500,this.bot.getCooldown("regen_hp")))
        }
        if(this.bot.mp < this.bot.max_mp-500) {
            let mpot = this.bot.locateItem("mpot1")
            mpot>=0 ? await this.bot.usePotion(mpot).catch(ex => console.warn(ex)) : await this.bot.regenMP().catch(ex => console.warn(ex))
            return setTimeout( () => this.usePotionsLoop(), Math.max(500,this.bot.getCooldown("regen_hp")))
        }
        return setTimeout( () => this.usePotionsLoop(), Math.max(500,this.bot.getCooldown("regen_hp")))
    }

    private async resupplyPots() {
        if(!this.bot.items) return setTimeout( () => this.resupplyPots(), 5000)
        let hpot = this.bot.items[this.bot.locateItem("hpot1")]?.q || 0// let hpot = this.getBot.items[this.bot.locateItem("hpot1")]?.q || 0
        let mpot = this.bot.items[this.bot.locateItem("mpot1")]?.q || 0
        if(this.bot.locateItem("computer") >= 0) {
            if(this.HPOTS_CAP > hpot) await this.bot.buy("hpot1", this.HPOTS_CAP - hpot).catch(ex => console.warn(ex))
            if(this.MPOTS_CAP > mpot) await this.bot.buy("mpot1", this.MPOTS_CAP - mpot).catch(ex => console.warn(ex))
        }
        else {
            if(mpot < 100) {
                await this.bot.smartMove("main")
                await this.bot.buy("hpot1", this.HPOTS_CAP - hpot).catch(ex => console.warn(ex))
                await this.bot.buy("mpot1", this.MPOTS_CAP - mpot).catch(ex => console.warn(ex))
            }
        }
        return setTimeout(() => {this.resupplyPots()}, 5000)
    }

    private async resuplyScrolls() {
        if(this.bot.ctype != "merchant") return
        let scrollsCount: ItemName[] =[
            "scroll0",
            "scroll1",
            "scroll2",
            "cscroll0",
            "cscroll1",
            "cscroll2"
        ]

        scrollsCount.forEach( async (e) => {
            let scroll_count =this.bot.countItem(e as ItemName)
            if(scroll_count< this.scrolls_cap[e] && this.bot.canBuy(e)) this.bot.buy(e,this.scrolls_cap[e]-scroll_count).catch(console.warn)
        
        })
    }

    private async scareLoop() {
        if(this.bot.isOnCooldown("scare")) return setTimeout( () => this.scareLoop(), this.bot.getCooldown("scare"))
        if(this.bot.hp < this.bot.max_hp * 0.4) {
            if(this.bot.slots.orb?.name != "jacko") {
                let cur_orb = this.bot.slots.orb
                let jacko_idx = this.bot.locateItem("jacko")
                if(jacko_idx>=0) {
                    await this.bot.equip(jacko_idx).catch(ex => console.warn(ex))
                    await this.bot.scare().catch(ex => console.warn(ex))
                    await this.bot.equip(this.bot.locateItem(cur_orb!.name, undefined, {returnHighestLevel: true})).catch(ex => console.warn(ex))
                    return setTimeout( () => this.scareLoop(), this.bot.getCooldown("scare"))
                }
            }
            else {
                await this.bot.scare()
                return setTimeout( () => this.scareLoop(), this.bot.getCooldown("scare"))
            }
        }
        return setTimeout( () => this.scareLoop(), 1000)
    } 

}