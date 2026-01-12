import { ItemName, PingCompensatedCharacter, Ranger, Tools } from "alclient"
import * as CI from "../configs/character_items_configs"
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
        super(bot as PingCompensatedCharacter, memoryStorage)
        //bind
        this.resupplyPots = this.resupplyPots.bind(this)
        this.usePotionsLoop = this.usePotionsLoop.bind(this)
        this.scareLoop = this.scareLoop.bind(this)
        this.useElixirsLoop = this.useElixirsLoop.bind(this)
        this.checkTomeOfProtection = this.checkTomeOfProtection.bind(this)
        this.resuplyScrolls = this.resuplyScrolls.bind(this)
        this.respawnStrat = this.respawnStrat.bind(this)
        this.stayAlive = this.stayAlive.bind(this)

        this.resupplyPots()
        this.usePotionsLoop()
        this.scareLoop()
        // this.useElixirsLoop()
        this.resuplyScrolls()
        this.stayAlive()
        
    }

    private async stayAlive(){
        if(this.bot.rip) {
            this.respawnStrat()
            return setTimeout(this.stayAlive,20000)
        }
        return setTimeout(this.stayAlive, 1000)
    }

    private async respawnStrat() {
        await this.bot.respawn().catch(console.warn)
        if(!this.bot.rip) {
            return this.checkTomeOfProtection()
        }
        setTimeout( () => this.bot.respawn(), 15000)
        setTimeout(() => {
            this.checkTomeOfProtection()
        }, 15500)
    }

    private async checkTomeOfProtection(){
        if(this.bot.smartMoving) return setTimeout( () => this.checkTomeOfProtection(), 5000)
        if(this.bot.locateItem("xptome") === undefined && this.bot.gold > 3200000) {
            if(!this.bot.hasItem(["computer","supercomputer"])) {
                await this.bot.smartMove("premium").catch(console.warn)
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
            await this.bot.equip(this.bot.locateItem(this.getBotitems()?.elixir))
        }
        return setTimeout( () => this.useElixirsLoop(), 2000)
    }

    private async usePotionsLoop() {
        // console.log("Use potions loop")
        if(!this.bot.canUse("use_hp")) return setTimeout(this.usePotionsLoop, 1000)
        if(this.bot.isOnCooldown("use_hp")) return setTimeout( () => this.usePotionsLoop(), Math.max(1,this.bot.getCooldown("regen_hp")))
        if(this.bot.hp < this.bot.max_hp * 0.5) {
            let hpot = this.bot.locateItem("hpot1")
            hpot>=0 ? await this.bot.usePotion(hpot).catch(console.warn) : await this.bot.regenHP().catch(console.warn)
            // console.log("Regening HP")
            return setTimeout( () => this.usePotionsLoop(), Math.max(1,this.bot.getCooldown("regen_hp")))
        }
        if(this.bot.mp < this.bot.max_mp-500) {
            let mpot = this.bot.locateItem("mpot1")
            mpot>=0 ? await this.bot.usePotion(mpot).catch(console.warn) : await this.bot.regenMP().catch(console.warn)
            // console.log("Regening MP")
            return setTimeout( () => this.usePotionsLoop(), Math.max(1,this.bot.getCooldown("regen_hp")))
        }
        if(this.bot.hp<this.bot.max_hp*0.9) {
            let hpot = this.bot.locateItem("hpot1")
            hpot>=0 ? await this.bot.usePotion(hpot).catch(console.warn) : await this.bot.regenHP().catch(console.warn)
            // console.log("Regening HP")
            return setTimeout( () => this.usePotionsLoop(), Math.max(1,this.bot.getCooldown("regen_hp")))
        }
        return setTimeout( () => this.usePotionsLoop(), 1000)
    }

    private async resupplyPots() {
        // console.log("Ressuply pots loop")
        if(!this.bot.items) return setTimeout( () => this.resupplyPots(), 5000)
        let hpot = this.bot.items[this.bot.locateItem("hpot1")]?.q || 0// let hpot = this.getBot.items[this.bot.locateItem("hpot1")]?.q || 0
        let mpot = this.bot.items[this.bot.locateItem("mpot1")]?.q || 0
        if(this.bot.hasItem(["computer","supercomputer"])) {
            if(this.HPOTS_CAP > hpot && this.bot.canBuy("hpot1", {quantity: this.HPOTS_CAP - hpot}) ) await this.bot.buy("hpot1", this.HPOTS_CAP - hpot).catch(console.warn)
            if(this.MPOTS_CAP > mpot && this.bot.canBuy("mpot1", {quantity: this.MPOTS_CAP - mpot}) ) await this.bot.buy("mpot1", this.MPOTS_CAP - mpot).catch(console.warn)
        }
        else {
            if(mpot < 100 && !this.bot.smartMoving && !this.bot.moving) {
                await this.bot.smartMove("main").catch(console.warn)
                await this.bot.buy("hpot1", this.HPOTS_CAP - hpot).catch(console.warn)
                await this.bot.buy("mpot1", this.MPOTS_CAP - mpot).catch(console.warn)
            }
        }
        return setTimeout( () => this.resupplyPots(), 5000)
    }

    private async resuplyScrolls() {
        if(this.bot.ctype != "merchant") return
        console.log("Ressuply scrolls loop")
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
        // console.log("Scare loop")
        if(!this.bot.canUse("scare")) return setTimeout(this.scareLoop, 1000)
        if(this.bot.isOnCooldown("scare")) return setTimeout( () => this.scareLoop(), Math.max(1, this.bot.getCooldown("scare")))
        if(this.bot.hp < this.bot.max_hp * 0.4) {
            if(this.bot.slots.orb?.name != "jacko") {
                let cur_orb = this.bot.slots.orb
                let jacko_idx = this.bot.locateItem("jacko")
                if(jacko_idx>=0) {
                    await this.bot.equip(jacko_idx).catch(console.warn)
                    await this.bot.scare().catch(console.warn)
                    if(cur_orb) await this.bot.equip(this.bot.locateItem(cur_orb.name, undefined, {returnHighestLevel: true})).catch(console.warn)
                    return setTimeout( () => this.scareLoop(), Math.max(1,this.bot.getCooldown("scare")))
                }
            }
            else {
                await this.bot.scare().catch(console.warn)
                return setTimeout( () => this.scareLoop(), Math.max(1,this.bot.getCooldown("scare")))
            }
        }
        return setTimeout( () => this.scareLoop(), 1000)
    } 

}