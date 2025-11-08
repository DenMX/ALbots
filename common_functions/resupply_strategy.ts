import { ItemName, PingCompensatedCharacter, Ranger, Tools } from "alclient"
import * as CI from "../classes_configs/items"

export class ResuplyStrategy {

    private bot: PingCompensatedCharacter

    //POTS
    private MPOTS_CAP = 9000
    private HPOTS_CAP = 5000
    //SCROLLS
    private SCROLL0_CAP = 100
    private SCROLL1_CAP = 20
    private SCROLL2_CAP = 2
    private CSCROLL0_CAP = 20
    private CSCROLL1_CAP = 5
    private CSCROLL2_CAP = 0

    private ressuplyFunction: Function[] = [
        this.resupplyPots,
        this.usePotionsLoop,
        this.scareLoop, 
        this.useElixirsLoop,
        this.checkTomeOfProtection
    ]

    constructor (bot: PingCompensatedCharacter) {
        this.bot = bot
        for(let fn of this.ressuplyFunction){
            fn()
        }
        bot.socket.on("death", this.respawnStrat)
        
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
        if(this.bot.slots.elixir?.expires) return setTimeout(this.useElixirsLoop, Date.parse(this.bot.slots.elixir.expires) - Date.now())
        if(!this.bot.slots || (this.bot.slots.elixir?.expires &&  Date.parse(this.bot.slots.elixir.expires) - Date.now() < 60000 )) {
            await this.bot.equip(this.bot.locateItem(this.getBotitems().elixir))
        }
        return setTimeout(this.useElixirsLoop, 2000)
    }

    private async usePotionsLoop() {
        if(this.bot.hp < this.bot.max_hp * 0.5) {
            let hpot = this.bot.locateItem("hpot1")
            hpot>=0 ? await this.bot.usePotion(hpot).catch(ex => console.warn(ex)) : await this.bot.regenHP().catch(ex => console.warn(ex))
            return setTimeout(this.usePotionsLoop, Math.max(500,this.bot.getCooldown("regen_hp")))
        }
        if(this.bot.mp < this.bot.max_mp-500) {
            let mpot = this.bot.locateItem("mpot1")
            mpot>=0 ? await this.bot.usePotion(mpot).catch(ex => console.warn(ex)) : await this.bot.regenMP().catch(ex => console.warn(ex))
            return setTimeout(this.usePotionsLoop, Math.max(500,this.bot.getCooldown("regen_hp")))
        }
        return setTimeout(this.usePotionsLoop, Math.max(500,this.bot.getCooldown("regen_hp")))
    }

    private async resupplyPots(bot: PingCompensatedCharacter) {
        let hpot = bot.items[bot.locateItem("hpot1")]?.q || 0
        let mpot = bot.items[bot.locateItem("mpot1")]?.q || 0
        if(bot.locateItem("computer") >= 0) {
            if(this.HPOTS_CAP > hpot) await bot.buy("hpot1", this.HPOTS_CAP - hpot).catch(ex => console.warn(ex))
            if(this.MPOTS_CAP > mpot) await bot.buy("mpot1", this.MPOTS_CAP - mpot).catch(ex => console.warn(ex))
        }
        else {
            if(mpot < 100) {
                await bot.smartMove("main")
                await bot.buy("hpot1", this.HPOTS_CAP - hpot).catch(ex => console.warn(ex))
                await bot.buy("mpot1", this.MPOTS_CAP - mpot).catch(ex => console.warn(ex))
            }
        }
        return setTimeout(() => {this.resupplyPots(bot)}, 1000)
    }

    private async scareLoop(bot: PingCompensatedCharacter) {
        if(bot.isOnCooldown("scare")) return setTimeout(this.scareLoop, bot.getCooldown("scare"))
        if(bot.hp < bot.max_hp * 0.4) {
            if(bot.slots.orb?.name != "jacko") {
                let cur_orb = bot.slots.orb
                let jacko_idx = bot.locateItem("jacko")
                if(jacko_idx>=0) {
                    await bot.equip(jacko_idx).catch(ex => console.warn(ex))
                    await bot.scare().catch(ex => console.warn(ex))
                    await bot.equip(bot.locateItem(cur_orb!.name, undefined, {returnHighestLevel: true})).catch(ex => console.warn(ex))
                    return setTimeout(this.scareLoop, bot.getCooldown("scare"))
                }
            }
            else {
                await bot.scare()
                return setTimeout(this.scareLoop, bot.getCooldown("scare"))
            }
        }
        return setTimeout(this.scareLoop, 1000)
    } 

}