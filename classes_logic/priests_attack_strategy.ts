import { Priest, ItemName, Tools, Player, Game} from "alclient"
import * as Items from "../classes_configs/items.ts"
import * as CF from "../common_functions/common_functions.ts"

export class PriestsAttackStrategy {

    private bot: Priest
    constructor (bot: Priest) {
        this.bot = bot
        this.attackOrHealLoop()
        this.useZap()
        this.useDarkBlessingLoop()
        this.useCurseLoop()
    }

    public getBot(){
        return this.bot
    }

    private async attackOrHealLoop() {
        if(this.bot.isOnCooldown("attack")) return setTimeout(this.attackOrHealLoop, this.bot.getCooldown("attack"))
        if(!this.bot.canUse("attack")) return setTimeout(this.attackOrHealLoop, Math.max(1, this.bot.getCooldown("attack")))
        let healTarget = this.whoNeedsHeal()
        let playerHealTartget = this.bot.players.get(healTarget)
        if(healTarget !== "null") {
            if(!this.bot.smartMoving && playerHealTartget && Tools.distance(playerHealTartget,this.bot)> this.bot.range) {
                await this.bot.move( 
                    this.bot.x + (playerHealTartget.x - this.bot.x)/2,
                    this.bot.y + (playerHealTartget.y - this.bot.y)/2
                )
            }
            if(playerHealTartget && Tools.distance(playerHealTartget, this.bot)<= this.bot.range) {
                this.bot.healSkill(playerHealTartget.id).catch( ex => console.error(ex))
            }
        }
        if(this.bot.isOnCooldown("attack")) return setTimeout(this.attackOrHealLoop, this.bot.getCooldown("attack"))
        let target = this.bot.getTargetEntity()
        if(target && Tools.distance(target, this.bot)<= this.bot.range) {
            await this.bot.basicAttack(target.id).catch( ex => console.error(ex))
            return setTimeout(this.attackOrHealLoop, this.bot.getCooldown("attack"))
        }
        return setTimeout(this.attackOrHealLoop, Math.min(this.bot.frequency, this.bot.getCooldown("attack")))
    }

    private async useCurseLoop() {
        if(!this.bot.target || this.bot.smartMoving) return setTimeout(this.useCurseLoop, 2000)
        if(this.bot.getCooldown("curse")) return setTimeout(this.useCurseLoop, this.bot.getCooldown("curse"))
        await this.bot.curse(this.bot.target).catch(ex => console.warn(ex))
        return setTimeout(this.useCurseLoop, this.bot.getCooldown("curse"))
    }

    private whoNeedsHeal()  {
        if(this.bot.hp < this.bot.max_hp*0.7 && this.bot.getEntities({targetingMe: true}).length>0) return this.bot.name
        let players_near = Object.values(this.bot.players).filter( e=> Tools.distance(this.bot, e) < this.bot.range * 2 && e.name)
        for(let player of players_near) {
            if(this.bot.partyData.list.includes(player.name) && player.hp < player.max_hp*0.8) return player.name
            if(!this.bot.partyData.list.includes(player.name) && player.hp<player.max_hp*0.6 && Tools.distance(player, this.bot)<=this.bot.range) return player.name
        }
        return "null"
    }

    public async pullMobsFromParty() {
        let mobs_targeting_party = this.bot.getEntities({targetingPartyMember: true, targetingMe: false})
        if(mobs_targeting_party.length<1) return setTimeout(this.pullMobsFromParty, 1000)
        let players : Map<string, number> = new Map()
        let player_with_more_mobs = 'null'
        for (let pm of this.bot.partyData.list) {
            players.set(pm,0)
        }
        for(let mob of mobs_targeting_party) {
            if(!player_with_more_mobs) player_with_more_mobs = mob.target
            let playerCount = players.get(mob.target) || 0
            players.set(mob.target, playerCount+1)
            let player_with_more_mobs_count = players.get(player_with_more_mobs) || 0
            let current_target_count = players.get(mob.target) || 0
            if ( 
                mob.target != player_with_more_mobs && 
                current_target_count > player_with_more_mobs_count
            ) 
            {
                player_with_more_mobs = mob.target
            }
        }
        await this.bot.absorbSins(player_with_more_mobs)        
    }

    public async useMassHeal() {
        if(!this.bot.canUse("partyheal")) return
        
        return this.bot.partyHeal()
    }

    private async useDarkBlessingLoop() {
        if(this.bot.isOnCooldown("darkblessing")) return setTimeout(this.useDarkBlessingLoop, this.bot.getCooldown("darkblessing"))
        if(!this.bot.canUse("darkblessing") || this.bot.smartMoving) return setTimeout(this.useDarkBlessingLoop, 2000)
        if(this.bot.s.darkblessing) return setTimeout(this.useDarkBlessingLoop, this.bot.s.darkblessing.ms)

        await this.useDarkBlessingLoop().catch(ex => console.warn(ex))
        return setTimeout(this.useDarkBlessingLoop, this.bot.getCooldown("darkblessing"))
    }

    private async useZap() {
        if(!this.bot.canUse("zap")) return setTimeout(this.useZap, Math.max(50, this.bot.getCooldown("zap")))

        let dps = 0
        let hps = this.bot.heal * this.bot.frequency
        for(let mob of this.bot.getEntities({targetingMe: true, targetingPartyMember: true})) {
            dps+= CF.calculate_monster_dps(this.bot, mob)
            
        }
        let MobsWithoutTargetingParty = this.bot.getEntities({targetingMe: false, targetingPartyMember:false})
        
        if(MobsWithoutTargetingParty.length>0 && dps<hps) {
            for( let mob of MobsWithoutTargetingParty) {
                if(hps > dps + CF.calculate_monster_dps(this.bot, mob)) {
                    await this.bot.zapperZap(mob.id).catch(er => console.warn(er))
                    return setTimeout(this.useZap, Math.max(1, this.bot.getCooldown("zapperzap")))
                }
            }
        }

        if(this.bot.mp > this.bot.max_mp * 0.8 && this.bot.getTargetEntity()) {
            await this.bot.zapperZap(this.bot.getTargetEntity().id)
            return setTimeout(this.useZap, Math.max(1, this.bot.getCooldown("zapperzap")))
        }

        return setTimeout(this.useZap, 1000)
        
    }

}