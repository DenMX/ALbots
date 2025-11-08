import {Tools, Game, Ranger, SkillName, ItemName, ItemSentGRDataObject, SlotType} from "alclient"
import * as CF from "../common_functions/common_functions"
import * as Items from "../classes_configs/items"

export class RangerAttackStrategy {

    private bot : Ranger

    constructor(bot: Ranger) {
        this.bot = bot
        this.basicAttackLoop()
        this.useSupershotLoop()
        this.useMarkLoop()
        this.changeWeapon()
    }

    private async basicAttackLoop() {

        if(this.bot.canUse("attack")) return setTimeout(this.basicAttackLoop, this.bot.frequency)
        if(!this.bot.target) return setTimeout(this.basicAttackLoop, 500)
        if(!this.bot.getTargetEntity().target && CF.calculate_monster_dps(this.bot, this.bot.getTargetEntity())/CF.calculate_hps(this.bot) >=2) return setTimeout(this.basicAttackLoop, 500)
        
        if(this.bot.getEntities({targetingMe: true, targetingPartyMember: true}).length < 1 && this.bot.isOnCooldown("scare")) return setTimeout(this.basicAttackLoop, this.bot.getCooldown("scare"))
        
        let targets = this.bot.getEntities({targetingPartyMember: true}).filter( e => CF.isInRange(e, this.bot))
        
        if(targets.length>3) {
            await this.bot.fiveShot(targets[0].id, targets[1].id, targets[2].id, targets[3].id, targets[4].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.bot.getCooldown("attack"))
        }
        else if(targets.length>1) {
            await this.bot.threeShot(targets[0].id, targets[1].id, targets[2].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.bot.getCooldown("attack"))
        }
        else if(this.bot.getEntities({targetingMe: true}).length>3) {
            targets = this.bot.getEntities({targetingMe: true})
            await this.bot.fiveShot(targets[0].id, targets[1].id, targets[2].id, targets[3].id, targets[4].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.bot.getCooldown("attack"))
        }
        else if(this.bot.getEntities({targetingMe: true}).length>1) {
            targets = this.bot.getEntities({targetingMe: true})
            await this.bot.threeShot(targets[0].id, targets[1].id, targets[2].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.bot.getCooldown("attack"))
        }
        else if(this.bot.getEntities({canKillInOneShot: "5shot"}).length>3) {
            targets = this.bot.getEntities({canKillInOneShot: "5shot"})
            await this.bot.fiveShot(targets[0].id, targets[1].id, targets[2].id, targets[3].id, targets[4].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.bot.getCooldown("attack"))
        }
        else if(this.bot.getEntities({canKillInOneShot: "3shot"}).length>1) {
            targets = this.bot.getEntities({canKillInOneShot: "3shot"})
            await this.bot.threeShot(targets[0].id, targets[1].id, targets[2].id).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.bot.getCooldown("attack"))
        }
        else if(this.bot.target && Tools.distance(this.bot,this.bot.getTargetEntity()) < this.bot.range) {
            this.bot.getTargetEntity().armor - this.bot.apiercing < 250 ? await this.bot.basicAttack(this.bot.target).catch(ex => console.warn(ex)) : await this.bot.piercingShot(this.bot.target).catch( ex => console.warn(ex))
            return setTimeout(this.basicAttackLoop, this.bot.getCooldown("attack"))
        }
        return setTimeout(this.basicAttackLoop, this.bot.frequency)
    }

    private async changeWeapon() {
        let needChangeMainhand = false
        let needChangeOffhand = false
        if(this.bot.getEntities({targetingMe: true, targetingPartyMember: true}).length>1) {
            if(this.bot.slots.mainhand?.name != Items.aRanDonDon.mass_mainhand!.name) needChangeMainhand = true
            if(this.bot.slots.offhand?.name != Items.aRanDonDon.mass_offhand!.name) needChangeOffhand = true
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( let i = 0; i< this.bot.items.length; i++) {
                let item = this.bot.items[i]
                if(!item) continue
                if(item.name == Items.aRanDonDon.mass_mainhand!.name && item.level == Items.aRanDonDon.mass_mainhand!.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == Items.aRanDonDon.mass_offhand!.name && item.level == Items.aRanDonDon.mass_offhand!.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.bot.equipBatch(equipBatch)
        }
        else {
            if(this.bot.slots.mainhand?.name != Items.aRanDonDon.solo_mainhand!.name) needChangeMainhand = true
            if(this.bot.slots.offhand?.name != Items.aRanDonDon.solo_offhand!.name) needChangeOffhand = true
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( let i = 0; i< this.bot.items.length; i++) {
                let item = this.bot.items[i]
                if(!item) continue
                if(item.name == Items.aRanDonDon.solo_mainhand!.name && item.level == Items.aRanDonDon.solo_mainhand!.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == Items.aRanDonDon.solo_offhand!.name && item.level == Items.aRanDonDon.solo_offhand!.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.bot.equipBatch(equipBatch)
        }
        return setTimeout(this.changeWeapon, 500)
    }

    private async useSupershotLoop() {
        if(!this.bot.canUse("supershot")) return setTimeout(this.useSupershotLoop, Math.max(2000, this.bot.getCooldown("supershot")))

        if(this.bot.target && this.bot.mp > this.bot.max_mp * 0.6) {
            await this.bot.superShot(this.bot.target).catch(ex => console.warn(ex))
            return setTimeout(this.useSupershotLoop, this.bot.getCooldown("supershot"))
        }

        return setTimeout(this.useSupershotLoop, Math.max(1000, this.bot.getCooldown("supershot")))
    }

    private async useMarkLoop() {
        if(!this.bot.canUse("huntersmark") || !this.bot.target) return setTimeout(this.useMarkLoop, Math.max(1000, this.bot.getCooldown("huntersmark")))
        await this.bot.huntersMark(this.bot.target).catch( ex => console.warn(ex))
        return setTimeout(this.useMarkLoop, Math.max(1000, this.bot.getCooldown("huntersmark")))
    }
}