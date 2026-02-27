import {Tools, Game, Mage, Constants } from "alclient"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"
import * as CF from "../common_functions/common_functions"
import { calculate_monster_dps, calculate_hps, debugLog } from "../common_functions/common_functions"

export class MageAttackStrategy extends StateStrategy {

    private mage : Mage

    constructor(bot: Mage, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage) 
        
        this.mage = bot;

        this.attackLoop = this.attackLoop.bind(this)
        this.useReflectionShieldLoop = this.useReflectionShieldLoop.bind(this)
        this.useEnergizeLoop = this.useEnergizeLoop.bind(this)
        this.magiportCheckLoop = this.magiportCheckLoop.bind(this)

        this.attackLoop()
        this.useReflectionShieldLoop()
        this.useEnergizeLoop()
        this.magiportCheckLoop()
    }

    

    private async attackLoop() {
        if(this.deactivate) return
        if( !this.mage.canUse("attack") ) {
            return setTimeout(this.attackLoop, 500)
        }
        if( this.mage.isOnCooldown("attack") ) {
            return setTimeout(this.attackLoop, Math.max(1, this.mage.getCooldown("attack")))
        }
        let mobsTargetingMe = this.bot.getEntities({targetingMe: true})
        let totalDps = 0
        mobsTargetingMe.forEach( e => totalDps+= CF.calculate_monster_dps(this.bot, e))
        if( this.bot.c.town && this.bot.hp > totalDps*15 ) {
            return setTimeout(this.attackLoop, 5000)
        }
        let target = this.mage.getTargetEntity()
        if( !target ) {
            return setTimeout(this.attackLoop, 1000)
        }

        if( !target.target && this.mage.isOnCooldown("scare") ) {
            return setTimeout(this.attackLoop, this.mage.getCooldown("scare"))
        }
        if( !target.target && calculate_monster_dps(this.mage, target, true) / calculate_hps(this.mage) >= 2 ) {
            return setTimeout(this.attackLoop, 500)
        }
        
        if(Tools.distance(this.mage, target) >  this.mage.range) {
            let location = CF.getHalfWay(this.mage, target)
            if(!this.mage.moving && !this.mage.smartMoving) CF.moveHalfWay(this.mage, location)
            return setTimeout(this.attackLoop, 500)
        }
        
        await this.mage.basicAttack(target.id).catch(debugLog)
        return setTimeout(this.attackLoop, Math.max(1, this.mage.getCooldown("attack")))
        
    }

    private async useReflectionShieldLoop() {
        if(this.deactivate) return
        if(this.mage.isOnCooldown("reflection")) {
            return setTimeout(this.useReflectionShieldLoop, Math.max(1,this.mage.getCooldown("reflection")))
        }
        if(!this.mage.canUse("reflection") || this.mage.smartMoving) {
            return setTimeout(this.useReflectionShieldLoop, 2000)
        }
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
        if(this.deactivate) return
        if(this.mage.isOnCooldown("energize")) {
            return setTimeout(this.useEnergizeLoop, Math.max( 1, this.mage.getCooldown("energize")))
        }
        if(!this.mage.canUse("energize") || this.mage.smartMoving || !this.mage.partyData) {
            return setTimeout(this.useEnergizeLoop, 2000)
        }
        
        for( let k of Object.keys(this.mage.partyData.party)) {
            let member = this.mage.partyData.party[k]
            if(Tools.distance(member, this.mage)<Game.G.skills["energize"].range && (member.type == "warrior" || member.type == "ranger")) {
                await this.mage.energize(k, 1).catch(console.warn)
                return setTimeout(this.useEnergizeLoop, Math.max(1, this.mage.getCooldown("energize")))
            }
        }
        
    }

    private async magiportCheckLoop() {
        if(this.deactivate) return
        if(this.mage.isOnCooldown("magiport")) return setTimeout(this.magiportCheckLoop, Math.max(1, this.mage.getCooldown("magiport")))
        if(this.mage.mp < Game.G.skills["magiport"].mp) return setTimeout(this.magiportCheckLoop, 2000)
        if(!this.mage.canUse("magiport") || this.mage.smartMoving) {
            return setTimeout(this.magiportCheckLoop, 2000)
        }

        const stateBots = this.getMemoryStorage?.getStateController?.getBots
        .filter( 
            e => e.getBot().serverData.region == this.bot.serverData.region && e.getBot().serverData.name == this.bot.serverData.name && e.getBot().name != this.bot.id && e.getBot().ctype != "merchant" 
        )
        if(!stateBots) return setTimeout(this.magiportCheckLoop, 2000)
        for(const botState of stateBots) {
            if(this.mage.mp < Game.G.skills["magiport"].mp) break
            let bot = botState.getBot()
            // SUMMON WHEN WE HAVE SPECIALS NEAR AND OTHER DOESN'T
            if(this.bot.getEntities().filter( e => Constants.SPECIAL_MONSTERS.includes(e.type)).length>0 && bot.getEntities().filter( e => Constants.SPECIAL_MONSTERS.includes(e.type)).length<1) {
                await this.mage.magiport(bot.id).catch(console.debug)
                if(bot.smartMoving) bot.stopSmartMove()
                bot.acceptMagiport(this.bot.id).catch(console.debug)
                if(this.currentState.state_type == "boss" || this.currentState.state_type == "event") (botState as StateStrategy).currentState = this.currentState
                continue
            }
            // SUMMON IF WE HAVE SAME FARM STATE MONSTERTYPE AND WE ARE ON SPOT
            if(this.currentState.state_type == "farm" && this.currentState.wantedMob == (botState as StateStrategy).currentState.wantedMob) {
                let wantedMonsters = (typeof this.currentState.wantedMob === "string") ? [this.currentState.wantedMob] : this.currentState.wantedMob
                if(this.bot.getEntities().filter( e => wantedMonsters.includes(e.type)).length>0 && bot.getEntities().filter( e => wantedMonsters.includes(e.type)).length<1) {
                    await this.mage.magiport(bot.id).catch(console.debug)
                    if(bot.smartMoving) bot.stopSmartMove()
                    bot.acceptMagiport(this.bot.id).catch(console.debug)
                    continue
                }
            }
        }
        
        return setTimeout(this.magiportCheckLoop, 2000)
    }

}