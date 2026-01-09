import {Tools, Game, Mage } from "alclient"
import { ManageItems } from "../common_functions/manage_items_strategy"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"

export class MageAttackStrategy extends StateStrategy {

    private mage : Mage

    constructor(bot: Mage, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage) 
        this.attackLoop()
        this.useReflectionShieldLoop()
        this.useEnergizeLoop()
    }

    

    private async attackLoop() {
        if (!this.mage.canUse("attack")) return setTimeout(this.attackLoop, Math.max(1, this.mage.getCooldown("attack")))
        let target = this.mage.getTargetEntity()
        if(!target) return setTimeout(this.attackLoop, 1000)

        if(!target.target && this.mage.isOnCooldown("scare")) return setTimeout(this.attackLoop, this.mage.getCooldown("scare"))

        await this.mage.basicAttack(target.id).catch(er => console.warn(er))
        return setTimeout(this.attackLoop, this.mage.getCooldown("attack"))
        
    }

    private async useReflectionShieldLoop() {
        if(this.mage.isOnCooldown("reflection")) return setTimeout(this.useReflectionShieldLoop, this.mage.getCooldown("reflection"))
        if(!this.mage.canUse("reflection") || this.mage.smartMoving) return setTimeout(this.useReflectionShieldLoop, 2000)
        if(this.mage.getEntities({targetingPartyMember: true}).length>0) {
            let mob = this.mage.getEntities({targetingPartyMember: true})[0]
            let target = mob.target
            if (mob.damage_type == "magical" ) {
                await this.mage.applyReflection(target).catch(ex => console.warn(ex))
                return setTimeout(this.useReflectionShieldLoop, this.mage.getCooldown("reflection"))
            }
        }
        else if(this.mage.getEntities({targetingMe: true}).length>0) {
            await this.mage.applyReflection(this.mage.name).catch(ex => console.warn(ex))
            return setTimeout(this.useReflectionShieldLoop, this.mage.getCooldown("reflection"))
        }
        return setTimeout(this.useReflectionShieldLoop, 2000)
    }

    private async useEnergizeLoop() {
        if(this.mage.getCooldown("energize")) return setTimeout(this.useEnergizeLoop, this.mage.getCooldown("energize"))
        if(!this.mage.canUse("energize") || this.mage.smartMoving) return setTimeout(this.useEnergizeLoop, 2000)
        
        for( let k of Object.keys(this.mage.partyData.party)) {
            let member = this.mage.partyData.party[k]
            if(Tools.distance(member, this.mage)<Game.G.skills["energize"].range && (member.type == "warrior" || member.type == "ranger")) {
                await this.mage.energize(k, 1).catch(ex => console.warn(ex))
                return setTimeout(this.useEnergizeLoop, this.mage.getCooldown("energize"))
            }
        }
        
    }

}