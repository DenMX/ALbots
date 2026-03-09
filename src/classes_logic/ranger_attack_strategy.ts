import {Tools, Game, Ranger, SkillName, ItemName, ItemSentGRDataObject, SlotType, Entity} from "alclient"
import * as CF from "../../src/common_functions/common_functions"
import * as Items from "../configs/character_items_configs"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"
import { RangerWeaponConfig, WEAPON_CONFIGS } from "../configs/character_items_configs"
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
        if(this.deactivate) return
        if(this.ranger.isOnCooldown("attack")) {
            return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("attack")))
        }
        if(!this.ranger.canUse("attack")) {
            return setTimeout(this.basicAttackLoop, 300)
        }
        let healTarget = this.bot.getPlayers({isPartyMember: true, withinRange: "attack", isDead: false}).filter( e => e.hp < e.max_hp * 0.45).sort( (a,b) => a.hp - b.hp)[0]
        if(healTarget && (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_weapon) {
            await this.switchWeapon("heal")
            await this.bot.basicAttack(healTarget.id).catch(debugLog)
            return setTimeout(this.basicAttackLoop, Math.max(1,this.ranger.getCooldown("attack")))
        }
        
        let mobsTargetingMe = this.bot.getEntities({targetingMe: true})
        
        if( this.bot.c.town ) {
            return setTimeout(this.basicAttackLoop, 15000)
        }
        
        
        if(this.ranger.getEntities({targetingMe: true, targetingPartyMember: true}).length < 1 && this.ranger.isOnCooldown("scare")) {
            return setTimeout(this.basicAttackLoop, Math.max(1,this.ranger.getCooldown("scare")))
        }
        
        let targetsForFiveShot = this.getTargets("5shot")
        let targetsForThreeShot = this.getTargets("3shot")
        
        if(this.ranger.canUse("5shot") && targetsForFiveShot.length>3) {
            if(WEAPON_CONFIGS[this.bot.name]?.mass_mainhand) await this.switchWeapon("mass")
            await this.ranger.fiveShot(targetsForFiveShot[0]?.id,targetsForFiveShot[1]?.id,targetsForFiveShot[2]?.id,targetsForFiveShot[3]?.id,targetsForFiveShot[4]?.id).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("5shot")))
        }
        if(this.ranger.canUse("3shot") && targetsForThreeShot.length>1) {
            if(WEAPON_CONFIGS[this.bot.name]?.mass_mainhand) await this.switchWeapon("mass")
            await this.ranger.threeShot(targetsForThreeShot[0]?.id,targetsForThreeShot[1]?.id,targetsForThreeShot[2]?.id).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("3shot")))
        }
        let target = this.ranger.getTargetEntity()
        if(!target) {
            return setTimeout(this.basicAttackLoop, 500)
        }
        if(!target?.target && CF.calculate_monster_dps(this, target, true)/CF.calculate_hps(this.ranger) >=0.95) {
            return setTimeout(this.basicAttackLoop, 500)
        }
        if(Tools.distance(this.ranger, target)> this.ranger.range*0.8) {
            if( !this.ranger.smartMoving && !this.ranger.moving ) {
                let location = CF.getHalfWay(this.ranger, target)
                CF.moveHalfWay(this.ranger, location)
                return setTimeout(this.basicAttackLoop, 500)
            }
        }
        if(Tools.distance(this.ranger,target) < this.ranger.range) {
            if(CF.calculate_monster_dps(this,target)/CF.calculate_hps(this.ranger)>=2) {
                return setTimeout(this.basicAttackLoop, 500)
            }
            if(WEAPON_CONFIGS[this.bot.name]?.solo_mainhand) await this.switchWeapon("solo")
            if(target.armor - this.ranger.apiercing < 250) await this.ranger.basicAttack(this.ranger.target).catch(CF.debugLog) 
            else await this.ranger.piercingShot(this.ranger.target).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        return setTimeout(this.basicAttackLoop, this.ranger.frequency)
    }

    private async switchWeapon(weaponConfig: "heal" | "mass" | "solo") {
        if(weaponConfig == "heal") {
            if(this.bot.slots.mainhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_weapon?.name
               && this.bot.slots.offhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_offhand?.name) return
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_weapon?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_weapon?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_offhand?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(console.warn)
            return
        }
        else if(weaponConfig == "mass") {
            if(this.bot.slots.mainhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_mainhand?.name
               && this.bot.slots.offhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_offhand?.name) return
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_mainhand?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_mainhand?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_offhand?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(console.warn)
            return
        }
        else if(weaponConfig == "solo") {
            if(this.bot.slots.mainhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.solo_mainhand?.name
               && this.bot.slots.offhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.solo_offhand?.name) return
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.solo_mainhand?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.solo_mainhand?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.solo_offhand?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.solo_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(console.warn)
            return
        }
    }

    private getTargets(skill : SkillName) : Entity[] {
        if(!["5shot", "3shot"].includes(skill)) return this.ranger.getEntities({withinRange: this.ranger.range})
        let final_targets: Entity[] = []
        let pcourage = this.bot.getEntities({targetingMe: true}).filter( e => e.damage_type == "pure").length
        let mcourage = this.bot.getEntities({targetingMe: true}).filter( e => e.damage_type == "magical").length
        let courage = this.bot.getEntities({targetingMe: true}).filter( e => e.damage_type == "physical").length
        let dps = CF.calculate_monsters_dps(this, this, this.bot.getEntities({targetingMe: true}))
        if (dps> this.bot.max_hp*0.2) return final_targets
        for(const entity of this.ranger.getEntities()) {
            if(entity.abilities.stone && !entity.target) continue
            if(this.bot.getEntities().filter(e => e.abilities.stone && !e.target && Tools.distance(e, entity)<40).length>0) continue
            if(!entity.target && this.ranger.canKillInOneShot(entity, skill)) final_targets.push(entity)
            if(entity.isAttackingPartyMember(this.ranger) || entity.target == this.ranger.id) final_targets.push(entity)
            if(!entity.target && !this.ranger.canKillInOneShot(entity, skill) && dps+CF.calculate_monster_dps(this, entity)< this.bot.hp/5) {
                switch(entity.damage_type) {
                    case "physical":
                        if(courage < this.ranger.courage || entity.target) {
                            final_targets.push(entity)
                            if(!entity.target) courage++
                        }
                        break
                    case "magical":
                        if(mcourage < this.ranger.mcourage || entity.target) {
                            final_targets.push(entity)
                            if(!entity.target) mcourage++
                        }
                        break
                    case "pure":
                        if(pcourage < this.ranger.pcourage || entity.target) {
                            final_targets.push(entity)
                            if(!entity.target) pcourage++
                        }
                        break
                }
            }
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
        if(this.deactivate) return
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
        if(this.deactivate) return
        if(!this.ranger.canUse("supershot")) {
            return setTimeout(this.useSupershotLoop, Math.max(2000, this.ranger.getCooldown("supershot")))
        }
        if(this.ranger.isOnCooldown("supershot")) {
            return setTimeout(this.useSupershotLoop, Math.max(1, this.ranger.getCooldown("supershot")))
        }
        let target = this.ranger.getTargetEntity()
        if(!target) {
            return setTimeout(this.useSupershotLoop, 500)
        }
        if(!target.target && CF.calculate_monster_dps(this,target)/CF.calculate_hps(this.ranger)>=0.95) {
            return setTimeout(this.useSupershotLoop, 500)
        }
        if(this.ranger.mp > this.ranger.max_mp * 0.6) {
            await this.ranger.superShot(target.id).catch(console.warn)
            return setTimeout(this.useSupershotLoop, Math.max(1,this.ranger.getCooldown("supershot")))
        }

        return setTimeout(this.useSupershotLoop, Math.max(1000, this.ranger.getCooldown("supershot")))
    }

    private async useMarkLoop() {
        if(this.deactivate) return
        if( !this.ranger.canUse("huntersmark") ) {
            return setTimeout(this.useMarkLoop, 500)
        }
        if( this.ranger.isOnCooldown("huntersmark") ) {
            return setTimeout(this.useMarkLoop, Math.max(1, this.ranger.getCooldown("huntersmark")))
        }
        
        let target = this.ranger.getTargetEntity()
        
        if( !target || target?.hp< 15000 ) {
            return setTimeout(this.useMarkLoop, 500)
        }
        
        await this.ranger.huntersMark(target.id).catch(console.warn)
        return setTimeout(this.useMarkLoop, Math.max(1000, this.ranger.getCooldown("huntersmark")))
    }
}