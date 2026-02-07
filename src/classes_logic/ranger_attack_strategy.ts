import {Tools, Game, Ranger, SkillName, ItemName, ItemSentGRDataObject, SlotType, Entity} from "alclient"
import * as CF from "../../src/common_functions/common_functions"
import * as Items from "../configs/character_items_configs"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"
import { debugLog } from "../common_functions/common_functions"

export class RangerAttackStrategy extends StateStrategy {

    private ranger : Ranger

    constructor(bot: Ranger, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        this.ranger = bot

        this.basicAttackLoop = this.basicAttackLoop.bind(this)
        this.useSupershotLoop = this.useSupershotLoop.bind(this)
        this.useMarkLoop = this.useMarkLoop.bind(this)
        this.changeWeapon = this.changeWeapon.bind(this)


        this.basicAttackLoop()
        this.useSupershotLoop()
        this.useMarkLoop()
        // this.changeWeapon()
    }

    private async basicAttackLoop() {
        if(this.ranger.isOnCooldown("attack")) return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("attack")))
        if(!this.ranger.canUse("attack")) return setTimeout(this.basicAttackLoop, 300)
        let mobsTargetingMe = this.bot.getEntities({targetingMe: true})
        let totalDps = 0
        mobsTargetingMe.forEach( e => totalDps+= CF.calculate_monster_dps(this.bot, e))
        if( this.bot.c.town && this.bot.hp > totalDps*15 ) return setTimeout(this.basicAttackLoop, 5000)
        let target = this.ranger.getTargetEntity()
        if(!target) return setTimeout(this.basicAttackLoop, 500)
        if(!target?.target && CF.calculate_monster_dps(this.ranger, this.ranger.getTargetEntity())/CF.calculate_hps(this.ranger) >=2) return setTimeout(this.basicAttackLoop, 500)
        
        if(this.ranger.getEntities({targetingMe: true, targetingPartyMember: true}).length < 1 && this.ranger.isOnCooldown("scare")) return setTimeout(this.basicAttackLoop, Math.max(1,this.ranger.getCooldown("scare")))
        
        let targetsForFiveShot = this.getTargets("5shot")
        let targetsForThreeShot = this.getTargets("3shot")
        
        if(this.ranger.canUse("5shot") && targetsForFiveShot.length>3) {
            await this.ranger.fiveShot(targetsForFiveShot[0]?.id,targetsForFiveShot[1]?.id,targetsForFiveShot[2]?.id,targetsForFiveShot[3]?.id,targetsForFiveShot[4]?.id).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("5shot")))
        }
        if(this.ranger.canUse("3shot") && targetsForThreeShot.length>1) {
            await this.ranger.threeShot(targetsForThreeShot[0]?.id,targetsForThreeShot[1]?.id,targetsForThreeShot[2]?.id).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("3shot")))
        }
        if(Tools.distance(this.ranger, target)> this.ranger.range) {
            if( !this.ranger.smartMoving && !this.ranger.moving ) {
                let location = CF.getHalfWay(this.ranger, target)
                CF.moveHalfWay(this.ranger, location)
                return setTimeout(this.basicAttackLoop, 500)
            }
        }
        if(Tools.distance(this.ranger,target) < this.ranger.range) {
            if(CF.calculate_monster_dps(this.ranger,target)/CF.calculate_hps(this.ranger)>=2) return setTimeout(this.basicAttackLoop, 500)
            if(target.armor - this.ranger.apiercing < 250) await this.ranger.basicAttack(this.ranger.target).catch(CF.debugLog) 
            else await this.ranger.piercingShot(this.ranger.target).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        return setTimeout(this.basicAttackLoop, this.ranger.frequency)
    }

    private getTargets(skill : SkillName) : Entity[] {
        if(!["5shot", "3shot"].includes(skill)) return this.ranger.getEntities({withinRange: this.ranger.range})
        let final_targets: Entity[] = []
        for(const entity of this.ranger.getEntities()) {
            if(!entity.target && this.ranger.canKillInOneShot(entity, skill)) final_targets.push(entity)
            if(entity.isAttackingPartyMember(this.ranger) || entity.target == this.ranger.id) final_targets.push(entity)
        }
        return final_targets.sort( (curr, next) => {
            let curr_distance = Tools.distance(curr, this.ranger)
            let next_distance = Tools.distance(next, this.ranger)
            if(curr.s.cursed != next.s.cursed) {
                return (curr.s.cursed?.ms) ? -1 : 1
            }
            if(curr.s.marked != next.s.marked) {
                return (curr.s.marked?.ms) ? -1 : 1
            }
            if(curr_distance != next_distance) {
                return (curr_distance < next_distance) ? -1 : 1;
            }
            return 0
        })
    }

    private async changeWeapon() {
        if(!Items.WEAPON_CONFIGS[this.ranger.name]) return
        let needChangeMainhand = false
        let needChangeOffhand = false
        let botWC = Items.WEAPON_CONFIGS[this.bot.name]
        if(this.ranger.getEntities({targetingMe: true, targetingPartyMember: true}).length>1) {
            if(this.ranger.slots.mainhand?.name != botWC.mass_mainhand?.name) needChangeMainhand = true
            if(this.ranger.slots.offhand?.name != botWC.mass_offhand?.name) needChangeOffhand = true
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {

                if(item.name == botWC.mass_mainhand?.name && item.level == botWC.mass_mainhand?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == botWC.mass_offhand?.name && item.level == botWC.mass_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(console.warn)
        }
        else {
            if(this.ranger.slots.mainhand?.name != botWC.solo_mainhand?.name) needChangeMainhand = true
            if(this.ranger.slots.offhand?.name != botWC.solo_offhand?.name) needChangeOffhand = true
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {
                if(item.name == botWC.solo_mainhand?.name && item.level == botWC.solo_mainhand?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == botWC.solo_offhand?.name && item.level == botWC.solo_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(console.warn)
        }
        return setTimeout(this.changeWeapon, 500)
    }

    private async useSupershotLoop() {
        if(!this.ranger.canUse("supershot")) return setTimeout(this.useSupershotLoop, Math.max(2000, this.ranger.getCooldown("supershot")))
        if(this.ranger.isOnCooldown("supershot")) return setTimeout(this.useSupershotLoop, Math.max(1, this.ranger.getCooldown("supershot")))
        let target = this.ranger.getTargetEntity()
        if(!target) return setTimeout(this.useSupershotLoop, 500)
        if(!target.target && CF.calculate_monster_dps(this.ranger,target)/CF.calculate_hps(this.ranger)>=2) return setTimeout(this.useSupershotLoop, 500)
        if(this.ranger.mp > this.ranger.max_mp * 0.6) {
            await this.ranger.superShot(target.id).catch(console.warn)
            return setTimeout(this.useSupershotLoop, Math.max(1,this.ranger.getCooldown("supershot")))
        }

        return setTimeout(this.useSupershotLoop, Math.max(1000, this.ranger.getCooldown("supershot")))
    }

    private async useMarkLoop() {
        if( !this.ranger.canUse("huntersmark") ) return setTimeout(this.useMarkLoop, 500)
        if( this.ranger.isOnCooldown("huntersmark") ) return setTimeout(this.useMarkLoop, Math.max(1, this.ranger.getCooldown("huntersmark")))
        
        let target = this.ranger.getTargetEntity()
        
        if( !target || target?.hp< 15000 ) return setTimeout(this.useMarkLoop, 500)
        
        await this.ranger.huntersMark(target.id).catch(console.warn)
        return setTimeout(this.useMarkLoop, Math.max(1000, this.ranger.getCooldown("huntersmark")))
    }
}