import { Rogue, Game } from "alclient"
import * as CF from "../../src/common_functions/common_functions"

export class RogueAttackStrategy {

    private bot: Rogue
    constructor(bot: Rogue) {
        this.bot = bot
        this.basicAttackLoop()
        this.stubLoop()
    }

    public getBot(){
        return this.bot
    }

    private async basicAttackLoop() {
        if(!this.bot.target) return setTimeout(this.basicAttackLoop, 500)
        if(!this.bot.getTargetEntity().target && CF.calculate_monster_dps(this.bot, this.bot.getTargetEntity())/CF.calculate_hps(this.bot) >=2) return setTimeout(this.basicAttackLoop, 500)
        if(this.bot.isOnCooldown("scare") && !this.bot.getTargetEntity().target) return setTimeout(this.basicAttackLoop, this.bot.getCooldown("scare"))
        if(!this.bot.canUse("attack")) return setTimeout(this.basicAttackLoop, Math.max(50, this.bot.getCooldown("attack")))        
        await this.bot.basicAttack(this.bot.target).catch( ex => console.warn(ex) )
        return setTimeout(this.basicAttackLoop, Math.max(50, this.bot.getCooldown("attack")))
    }

    private async stubLoop() {
        if(!this.bot.target) return setTimeout(this.stubLoop, 500)
        if(!this.bot.getTargetEntity().target && CF.calculate_monster_dps(this.bot, this.bot.getTargetEntity())/CF.calculate_hps(this.bot) >=2) return setTimeout(this.stubLoop, 500)
        if(this.bot.isOnCooldown("scare") && !this.bot.getTargetEntity().target) return setTimeout(this.stubLoop, this.bot.getCooldown("scare"))
        if(this.bot.slots.mainhand){
            if(Game.G.items[this.bot.slots.mainhand.name].wtype == "fist" && this.bot.canUse("quickpunch") && this.bot.mp - Game.G.skills.quickpunch.mp! > this.bot.mp_cost * 2) {
                await this.bot.quickPunch(this.bot.target).catch( ex => console.warn(ex))
                return setTimeout(this.stubLoop, this.bot.getCooldown("quickpunch"))
            }
            if(Game.G.items[this.bot.slots.mainhand.name].wtype == "dagger" && this.bot.canUse("quickstab") && this.bot.mp - Game.G.skills.quickstab.mp! > this.bot.mp_cost * 2) {
                await this.bot.quickStab(this.bot.target).catch( ex => console.warn(ex))
                return setTimeout(this.stubLoop, this.bot.getCooldown("quickstab"))
            }
        }
        return setTimeout(this.stubLoop, 500)
    }
}