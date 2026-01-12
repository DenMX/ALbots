import { Rogue, Game } from "alclient"
import * as CF from "../../src/common_functions/common_functions"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"

export class RogueAttackStrategy extends StateStrategy {

    private rogue: Rogue
    constructor(bot: Rogue, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        this.rogue = bot
        
        this.basicAttackLoop = this.basicAttackLoop.bind(this)
        this.stubLoop = this.stubLoop.bind(this)

        this.basicAttackLoop()
        this.stubLoop()
    }

    private async basicAttackLoop() {
        if(!this.rogue.canUse("attack")) return setTimeout(this.basicAttackLoop, 500)
        if(this.rogue.isOnCooldown("attack")) return setTimeout(this.basicAttackLoop, Math.max(1, this.rogue.getCooldown("attack")))
        
        let target = this.rogue.getTargetEntity()
        if(!this.rogue.target) return setTimeout(this.basicAttackLoop, 500)

        if(this.rogue.isOnCooldown("scare") && !target.target) return setTimeout(this.basicAttackLoop, this.rogue.getCooldown("scare")) 
        if(!target?.target && CF.calculate_monster_dps(this.rogue, target)/CF.calculate_hps(this.rogue) >=2) return setTimeout(this.basicAttackLoop, 500)
               
        await this.rogue.basicAttack(target.id).catch(console.warn)
        return setTimeout(this.basicAttackLoop, Math.max(1, this.rogue.getCooldown("attack")))
    }

    private async stubLoop() {
        if(!this.rogue.canUse("quickpunch")) return setTimeout(this.stubLoop, 500)
        if(this.rogue.isOnCooldown("quickpunch")) return setTimeout(this.stubLoop, Math.max(1,this.rogue.getCooldown("quickpunch")))
        
        let target = this.rogue.getTargetEntity()
        if(!target) return setTimeout(this.stubLoop, 500)
        
        if(!target.target && CF.calculate_monster_dps(this.rogue, target)/CF.calculate_hps(this.rogue) >=2) return setTimeout(this.stubLoop, 500)
        if(this.rogue.isOnCooldown("scare") && !target.target) return setTimeout(this.stubLoop, this.rogue.getCooldown("scare"))
        if(this.rogue.slots.mainhand){
            let weaponSkill
            if(Game.G.items[this.rogue.slots.mainhand.name].wtype == "fist" && this.rogue.mp - Game.G.skills.quickpunch.mp! > this.rogue.mp_cost * 2) {
                weaponSkill = this.rogue.quickPunch
            }
            if(Game.G.items[this.rogue.slots.mainhand.name].wtype == "dagger" && this.rogue.mp - Game.G.skills.quickstab.mp! > this.rogue.mp_cost * 2) {
                weaponSkill = this.rogue.quickStab
            }
            await weaponSkill(target.id).catch(console.warn)
            return setTimeout(this.stubLoop, Math.max(1,this.rogue.getCooldown("quickpunch")))
        }
        return setTimeout(this.stubLoop, 500)
    }
}