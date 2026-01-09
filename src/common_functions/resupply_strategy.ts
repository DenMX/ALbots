import { ItemName, PingCompensatedCharacter, Ranger, Tools } from "alclient"
import * as CI from "../classes_configs/items"
import { PartyStrategy } from "./party_strategy"
import { MemberExpression } from "typescript"
import { MemoryStorage } from "./memory_storage"

export class ResuplyStrategy extends PartyStrategy {


    private active_bots: PingCompensatedCharacter[]

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
        for(let fn of this.ressuplyFunction){
            fn()
        }
        bot.socket.on("death", this.respawnStrat)
        
    }

    

    protected getActiveBots() : PingCompensatedCharacter[] {
        return this.active_bots
    }

    public async setActiveBots(bots: PingCompensatedCharacter[]) {
        this.active_bots = bots;
    }

    private async respawnStrat() {
        
        setTimeout(super.getBot.respawn, 15000)
        setTimeout(() => {
            super.getBot.smartMove("monsterhunter")
            this.checkTomeOfProtection()
        }, 15500)
    }

    private async checkTomeOfProtection(){
        if(super.getBot.locateItem("xptome") === undefined && super.getBot.gold > 3200000) {
            if(super.getBot.locateItem("computer") === undefined) {
                await super.getBot.smartMove("premium")
            }
            await super.getBot.buy("xptome")
        }
    }

    private getBotitems() : CI.ItemsConfig {
        switch(super.getBot.name){
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
                throw(`There is no config for ${super.getBot.name}. Check Resupply strategy.`)
        }
    }

    private async useElixirsLoop() {
        if(super.getBot.slots.elixir?.expires) return setTimeout(this.useElixirsLoop, Date.parse(super.getBot.slots.elixir.expires) - Date.now())
        if(!super.getBot.slots || (super.getBot.slots.elixir?.expires &&  Date.parse(super.getBot.slots.elixir.expires) - Date.now() < 60000 )) {
            await super.getBot.equip(super.getBot.locateItem(this.getBotitems().elixir))
        }
        return setTimeout(this.useElixirsLoop, 2000)
    }

    private async usePotionsLoop() {
        if(super.getBot.hp < super.getBot.max_hp * 0.5) {
            let hpot = super.getBot.locateItem("hpot1")
            hpot>=0 ? await super.getBot.usePotion(hpot).catch(ex => console.warn(ex)) : await super.getBot.regenHP().catch(ex => console.warn(ex))
            return setTimeout(this.usePotionsLoop, Math.max(500,super.getBot.getCooldown("regen_hp")))
        }
        if(super.getBot.mp < super.getBot.max_mp-500) {
            let mpot = super.getBot.locateItem("mpot1")
            mpot>=0 ? await super.getBot.usePotion(mpot).catch(ex => console.warn(ex)) : await super.getBot.regenMP().catch(ex => console.warn(ex))
            return setTimeout(this.usePotionsLoop, Math.max(500,super.getBot.getCooldown("regen_hp")))
        }
        return setTimeout(this.usePotionsLoop, Math.max(500,super.getBot.getCooldown("regen_hp")))
    }

    private async resupplyPots() {
        let hpot = super.getBot.items[super.getBot.locateItem("hpot1")]?.q || 0
        let mpot = super.getBot.items[super.getBot.locateItem("mpot1")]?.q || 0
        if(super.getBot.locateItem("computer") >= 0) {
            if(this.HPOTS_CAP > hpot) await super.getBot.buy("hpot1", this.HPOTS_CAP - hpot).catch(ex => console.warn(ex))
            if(this.MPOTS_CAP > mpot) await super.getBot.buy("mpot1", this.MPOTS_CAP - mpot).catch(ex => console.warn(ex))
        }
        else {
            if(mpot < 100) {
                await super.getBot.smartMove("main")
                await super.getBot.buy("hpot1", this.HPOTS_CAP - hpot).catch(ex => console.warn(ex))
                await super.getBot.buy("mpot1", this.MPOTS_CAP - mpot).catch(ex => console.warn(ex))
            }
        }
        return setTimeout(() => {this.resupplyPots()}, 5000)
    }

    private async resuplyScrolls() {
        if(super.getBot.ctype != "merchant") return
        let scrollsCount: ItemName[] =[
            "scroll0",
            "scroll1",
            "scroll2",
            "cscroll0",
            "cscroll1",
            "cscroll2"
        ]

        scrollsCount.forEach( async (e) => {
            let scroll_count =super.getBot.countItem(e as ItemName)
            if(scroll_count< this.scrolls_cap[e] && super.getBot.canBuy(e)) super.getBot.buy(e,this.scrolls_cap[e]-scroll_count).catch(console.warn)
        
        })
    }

    private async scareLoop() {
        if(super.getBot.isOnCooldown("scare")) return setTimeout(this.scareLoop, super.getBot.getCooldown("scare"))
        if(super.getBot.hp < super.getBot.max_hp * 0.4) {
            if(super.getBot.slots.orb?.name != "jacko") {
                let cur_orb = super.getBot.slots.orb
                let jacko_idx = super.getBot.locateItem("jacko")
                if(jacko_idx>=0) {
                    await super.getBot.equip(jacko_idx).catch(ex => console.warn(ex))
                    await super.getBot.scare().catch(ex => console.warn(ex))
                    await super.getBot.equip(super.getBot.locateItem(cur_orb!.name, undefined, {returnHighestLevel: true})).catch(ex => console.warn(ex))
                    return setTimeout(this.scareLoop, super.getBot.getCooldown("scare"))
                }
            }
            else {
                await super.getBot.scare()
                return setTimeout(this.scareLoop, super.getBot.getCooldown("scare"))
            }
        }
        return setTimeout(this.scareLoop, 1000)
    } 

}