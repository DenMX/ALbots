import {Tools, Game, Mage } from "alclient"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"
import * as CF from "../common_functions/common_functions"

export class MageAttackStrategy extends StateStrategy {

    private mage : Mage

    constructor(bot: Mage, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage) 

        this.attackLoop = this.attackLoop.bind(this)
        this.useReflectionShieldLoop = this.useReflectionShieldLoop.bind(this)
        this.useEnergizeLoop = this.useEnergizeLoop.bind(this)

        this.attackLoop()
        this.useReflectionShieldLoop()
        this.useEnergizeLoop()
    }

    

    private async attackLoop() {
        if( !this.mage.canUse("attack") ) return setTimeout(this.attackLoop, 500)
        if( this.mage.isOnCooldown("attack") ) return setTimeout(this.attackLoop, Math.max(1, this.mage.getCooldown("attack")))
        let target = this.mage.getTargetEntity()
        if( !target ) return setTimeout(this.attackLoop, 1000)

        if( !target.target && this.mage.isOnCooldown("scare") ) return setTimeout(this.attackLoop, this.mage.getCooldown("scare"))
        if( !target.target && CF.calculate_monster_dps(this.mage, target) / CF.calculate_hps(this.mage) >= 2 ) return setTimeout(this.attackLoop, 500)

        await this.mage.basicAttack(target.id).catch(console.warn)
        return setTimeout(this.attackLoop, Math.max(1, this.mage.getCooldown("attack")))
        
    }

    private async useReflectionShieldLoop() {
        if(this.mage.isOnCooldown("reflection")) return setTimeout(this.useReflectionShieldLoop, Math.max(1,this.mage.getCooldown("reflection")))
        if(!this.mage.canUse("reflection") || this.mage.smartMoving) return setTimeout(this.useReflectionShieldLoop, 2000)
        let mobsTargetingParty = this.mage.getEntities({targetingPartyMember: true})
        if(mobsTargetingParty.length>0) {
            let mob = mobsTargetingParty[0]
            if (mob.damage_type == "magical" ) {
                await this.mage.applyReflection(mob.target).catch(console.warn)
                return setTimeout(this.useReflectionShieldLoop, Math.max(1,this.mage.getCooldown("reflection")))
            }
        }
        else if(this.mage.getEntities({targetingMe: true}).length>0) {
            await this.mage.applyReflection(this.mage.name).catch(console.warn)
            return setTimeout(this.useReflectionShieldLoop, Math.max(1,this.mage.getCooldown("reflection")))
        }
        return setTimeout(this.useReflectionShieldLoop, 2000)
    }

    private async useEnergizeLoop() {
        if(this.mage.isOnCooldown("energize")) return setTimeout(this.useEnergizeLoop, Math.max( 1, this.mage.getCooldown("energize")))
        if(!this.mage.canUse("energize") || this.mage.smartMoving) return setTimeout(this.useEnergizeLoop, 2000)
        
        for( let k of Object.keys(this.mage.partyData.party)) {
            let member = this.mage.partyData.party[k]
            if(Tools.distance(member, this.mage)<Game.G.skills["energize"].range && (member.type == "warrior" || member.type == "ranger")) {
                await this.mage.energize(k, 1).catch(console.warn)
                return setTimeout(this.useEnergizeLoop, Math.max(1, this.mage.getCooldown("energize")))
            }
        }
        
    }

}