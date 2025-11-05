import {Tools, Game, Mage } from "alclient"

export class MageAttackStrategy {

    private bot : Mage

    constructor(bot: Mage) {
        this.bot = bot
        this.attackLoop()
        this.useReflectionShieldLoop()
        this.useEnergizeLoop()
    }

    public getBot() {
        return this.bot
    }

    private async attackLoop() {
        if (!this.bot.canUse("attack")) return setTimeout(this.attackLoop, Math.max(1, this.bot.getCooldown("attack")))
        let target = this.bot.getTargetEntity()
        if(!target) return setTimeout(this.attackLoop, 1000)

        if(!target.target && this.bot.isOnCooldown("scare")) return setTimeout(this.attackLoop, this.bot.getCooldown("scare"))

        await this.bot.basicAttack(target.id).catch(er => console.warn(er))
        return setTimeout(this.attackLoop, this.bot.getCooldown("attack"))
        
    }

    private async useReflectionShieldLoop() {
        if(this.bot.isOnCooldown("reflection")) return setTimeout(this.useReflectionShieldLoop, this.bot.getCooldown("reflection"))
        if(!this.bot.canUse("reflection") || this.bot.smartMoving) return setTimeout(this.useReflectionShieldLoop, 2000)
        if(this.bot.getEntities({targetingPartyMember: true}).length>0) {
            let mob = this.bot.getEntities({targetingPartyMember: true})[0]
            let target = mob.target
            if (mob.damage_type == "magical" ) {
                await this.bot.applyReflection(target).catch(ex => console.warn(ex))
                return setTimeout(this.useReflectionShieldLoop, this.bot.getCooldown("reflection"))
            }
        }
        else if(this.bot.getEntities({targetingMe: true}).length>0) {
            await this.bot.applyReflection(this.bot.name).catch(ex => console.warn(ex))
            return setTimeout(this.useReflectionShieldLoop, this.bot.getCooldown("reflection"))
        }
        return setTimeout(this.useReflectionShieldLoop, 2000)
    }

    private async useEnergizeLoop() {
        if(this.bot.getCooldown("energize")) return setTimeout(this.useEnergizeLoop, this.bot.getCooldown("energize"))
        if(!this.bot.canUse("energize") || this.bot.smartMoving) return setTimeout(this.useEnergizeLoop, 2000)
        
        for( let k of Object.keys(this.bot.partyData.party)) {
            let member = this.bot.partyData.party[k]
            if(Tools.distance(member, this.bot)>320 && (member.type == "warrior" || member.type == "ranger")) {
                await this.bot.energize(k, 1).catch(ex => console.warn(ex))
                return setTimeout(this.useEnergizeLoop, this.bot.getCooldown("energize"))
            }
        }
        
    }

}