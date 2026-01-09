import { Rogue, Game } from "alclient"
import * as CF from "../../src/common_functions/common_functions"
import { ManageItems } from "../common_functions/manage_items_strategy"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"

export class RogueAttackStrategy extends StateStrategy {

    private rogue: Rogue
    constructor(bot: Rogue, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        this.rogue = bot
        this.basicAttackLoop()
        this.stubLoop()
    }

    private async basicAttackLoop() {
        if(!this.rogue.target) return setTimeout(this.basicAttackLoop, 500)
        if(!this.rogue.getTargetEntity().target && CF.calculate_monster_dps(this.rogue, this.rogue.getTargetEntity())/CF.calculate_hps(this.rogue) >=2) return setTimeout(this.basicAttackLoop, 500)
        if(this.rogue.isOnCooldown("scare") && !this.rogue.getTargetEntity().target) return setTimeout(this.basicAttackLoop, this.rogue.getCooldown("scare"))
        if(!this.rogue.canUse("attack")) return setTimeout(this.basicAttackLoop, Math.max(50, this.rogue.getCooldown("attack")))        
        await this.rogue.basicAttack(this.rogue.target).catch( ex => console.warn(ex) )
        return setTimeout(this.basicAttackLoop, Math.max(50, this.rogue.getCooldown("attack")))
    }

    private async stubLoop() {
        if(!this.rogue.target) return setTimeout(this.stubLoop, 500)
        if(!this.rogue.getTargetEntity().target && CF.calculate_monster_dps(this.rogue, this.rogue.getTargetEntity())/CF.calculate_hps(this.rogue) >=2) return setTimeout(this.stubLoop, 500)
        if(this.rogue.isOnCooldown("scare") && !this.rogue.getTargetEntity().target) return setTimeout(this.stubLoop, this.rogue.getCooldown("scare"))
        if(this.rogue.slots.mainhand){
            if(Game.G.items[this.rogue.slots.mainhand.name].wtype == "fist" && this.rogue.canUse("quickpunch") && this.rogue.mp - Game.G.skills.quickpunch.mp! > this.rogue.mp_cost * 2) {
                await this.rogue.quickPunch(this.rogue.target).catch( ex => console.warn(ex))
                return setTimeout(this.stubLoop, this.rogue.getCooldown("quickpunch"))
            }
            if(Game.G.items[this.rogue.slots.mainhand.name].wtype == "dagger" && this.rogue.canUse("quickstab") && this.rogue.mp - Game.G.skills.quickstab.mp! > this.rogue.mp_cost * 2) {
                await this.rogue.quickStab(this.rogue.target).catch( ex => console.warn(ex))
                return setTimeout(this.stubLoop, this.rogue.getCooldown("quickstab"))
            }
        }
        return setTimeout(this.stubLoop, 500)
    }
}