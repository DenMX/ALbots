import {Tools, Game, Ranger, SkillName, ItemName, ItemSentGRDataObject, SlotType} from "alclient"
import * as CF from "../../src/common_functions/common_functions"
import * as Items from "../classes_configs/items"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"

export class RangerAttackStrategy extends StateStrategy {

    private ranger : Ranger

    constructor(bot: Ranger, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        this.ranger = bot
        this.basicAttackLoop()
        this.useSupershotLoop()
        this.useMarkLoop()
        this.changeWeapon()
    }

    private async basicAttackLoop() {

        if(!this.ranger.canUse("attack")) return setTimeout(this.basicAttackLoop, this.ranger.frequency)
        if(!this.ranger.target) return setTimeout(this.basicAttackLoop, 500)
        if(!this.ranger.getTargetEntity().target && CF.calculate_monster_dps(this.ranger, this.ranger.getTargetEntity())/CF.calculate_hps(this.ranger) >=2) return setTimeout(this.basicAttackLoop, 500)
        
        if(this.ranger.getEntities({targetingMe: true, targetingPartyMember: true}).length < 1 && this.ranger.isOnCooldown("scare")) return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("scare"))
        
        let targets = this.ranger.getEntities({targetingPartyMember: true, withinRange: "attack"})
        
        if(targets.length>3 && this.ranger.canUse("5shot")) {
            await this.ranger.fiveShot(targets[0].id, targets[1].id, targets[2].id, targets[3].id, targets[4].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        else if(targets.length>1 && this.ranger.canUse("3shot")) {
            await this.ranger.threeShot(targets[0].id, targets[1].id, targets[2].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        else if(this.ranger.getEntities({targetingMe: true}).length>3 && this.ranger.canUse("5shot")) {
            targets = this.ranger.getEntities({targetingMe: true})
            await this.ranger.fiveShot(targets[0].id, targets[1].id, targets[2].id, targets[3].id, targets[4].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        else if(this.ranger.getEntities({targetingMe: true}).length>1 && this.ranger.canUse("3shot"))  {
            targets = this.ranger.getEntities({targetingMe: true})
            await this.ranger.threeShot(targets[0].id, targets[1].id, targets[2].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        else if(this.ranger.getEntities({canKillInOneShot: "5shot"}).length>3 && this.ranger.canUse("5shot")) {
            targets = this.ranger.getEntities({canKillInOneShot: "5shot"})
            await this.ranger.fiveShot(targets[0].id, targets[1].id, targets[2].id, targets[3].id, targets[4].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        else if(this.ranger.getEntities({canKillInOneShot: "3shot"}).length>1 && this.ranger.canUse("3shot")) {
            targets = this.ranger.getEntities({canKillInOneShot: "3shot"})
            await this.ranger.threeShot(targets[0].id, targets[1].id, targets[2].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        else if(this.ranger.target && Tools.distance(this.ranger,this.ranger.getTargetEntity()) < this.ranger.range) {
            this.ranger.getTargetEntity().armor - this.ranger.apiercing < 250 ? await this.ranger.basicAttack(this.ranger.target).catch(ex => console.warn(ex)) : await this.ranger.piercingShot(this.ranger.target).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        return setTimeout(this.basicAttackLoop, this.ranger.frequency)
    }

    private async changeWeapon() {
        let needChangeMainhand = false
        let needChangeOffhand = false
        if(this.ranger.getEntities({targetingMe: true, targetingPartyMember: true}).length>1) {
            if(this.ranger.slots.mainhand?.name != Items.aRanDonDon.mass_mainhand!.name) needChangeMainhand = true
            if(this.ranger.slots.offhand?.name != Items.aRanDonDon.mass_offhand!.name) needChangeOffhand = true
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( let i = 0; i< this.ranger.items.length; i++) {
                let item = this.ranger.items[i]
                if(!item) continue
                if(item.name == Items.aRanDonDon.mass_mainhand!.name && item.level == Items.aRanDonDon.mass_mainhand!.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == Items.aRanDonDon.mass_offhand!.name && item.level == Items.aRanDonDon.mass_offhand!.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch)
        }
        else {
            if(this.ranger.slots.mainhand?.name != Items.aRanDonDon.solo_mainhand!.name) needChangeMainhand = true
            if(this.ranger.slots.offhand?.name != Items.aRanDonDon.solo_offhand!.name) needChangeOffhand = true
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( let i = 0; i< this.ranger.items.length; i++) {
                let item = this.ranger.items[i]
                if(!item) continue
                if(item.name == Items.aRanDonDon.solo_mainhand!.name && item.level == Items.aRanDonDon.solo_mainhand!.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == Items.aRanDonDon.solo_offhand!.name && item.level == Items.aRanDonDon.solo_offhand!.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch)
        }
        return setTimeout(this.changeWeapon, 500)
    }

    private async useSupershotLoop() {
        if(!this.ranger.canUse("supershot")) return setTimeout(this.useSupershotLoop, Math.max(2000, this.ranger.getCooldown("supershot")))

        if(this.ranger.target && this.ranger.mp > this.ranger.max_mp * 0.6) {
            await this.ranger.superShot(this.ranger.target).catch(ex => console.warn(ex))
            return setTimeout(this.useSupershotLoop, this.ranger.getCooldown("supershot"))
        }

        return setTimeout(this.useSupershotLoop, Math.max(1000, this.ranger.getCooldown("supershot")))
    }

    private async useMarkLoop() {
        if(!this.ranger.canUse("huntersmark") || !this.ranger.target) return setTimeout(this.useMarkLoop, Math.max(1000, this.ranger.getCooldown("huntersmark")))
        await this.ranger.huntersMark(this.ranger.target).catch( ex => console.warn(ex))
        return setTimeout(this.useMarkLoop, Math.max(1000, this.ranger.getCooldown("huntersmark")))
    }
}