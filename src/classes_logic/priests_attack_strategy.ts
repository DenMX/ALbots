import { Priest, ItemName, Tools, Player, Game} from "alclient"
import * as Items from "../classes_configs/items"
import * as CF from "../../src/common_functions/common_functions"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"

export class PriestsAttackStrategy extends StateStrategy {

    private priest: Priest
    constructor (bot: Priest, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        this.priest = bot
        this.attackOrHealLoop()
        this.useZap()
        this.useDarkBlessingLoop()
        this.useCurseLoop()
    }

    private async attackOrHealLoop() {
        if(this.priest.isOnCooldown("attack")) return setTimeout(this.attackOrHealLoop, this.priest.getCooldown("attack"))
        if(!this.priest.canUse("attack")) return setTimeout(this.attackOrHealLoop, Math.max(1, this.priest.getCooldown("attack")))
        let healTarget = this.whoNeedsHeal()
        let playerHealTartget = this.priest.players.get(healTarget)
        if(healTarget !== "null") {
            if(!this.priest.smartMoving && playerHealTartget && Tools.distance(playerHealTartget,this.priest)> this.priest.range) {
                await this.priest.move( 
                    this.priest.x + (playerHealTartget.x - this.priest.x)/2,
                    this.priest.y + (playerHealTartget.y - this.priest.y)/2
                )
            }
            if(playerHealTartget && Tools.distance(playerHealTartget, this.priest)<= this.priest.range) {
                this.priest.healSkill(playerHealTartget.id).catch( ex => console.error(ex))
            }
        }
        if(this.priest.isOnCooldown("attack")) return setTimeout(this.attackOrHealLoop, this.priest.getCooldown("attack"))
        let target = this.priest.getTargetEntity()
        if(!target?.target && CF.calculate_monster_dps(this.priest, target)/CF.calculate_hps(this.priest) >=2) return setTimeout(this.attackOrHealLoop, 500)
        if(target && Tools.distance(target, this.priest)<= this.priest.range) {
            await this.priest.basicAttack(target.id).catch( ex => console.error(ex))
            return setTimeout(this.attackOrHealLoop, this.priest.getCooldown("attack"))
        }
        return setTimeout(this.attackOrHealLoop, Math.min(this.priest.frequency, this.priest.getCooldown("attack")))
    }

    private async useCurseLoop() {
        if(!this.priest.target || this.priest.smartMoving) return setTimeout(this.useCurseLoop, 2000)
        if(this.priest.getCooldown("curse")) return setTimeout(this.useCurseLoop, this.priest.getCooldown("curse"))
        await this.priest.curse(this.priest.target).catch(ex => console.warn(ex))
        return setTimeout(this.useCurseLoop, this.priest.getCooldown("curse"))
    }

    private whoNeedsHeal()  {
        if(this.priest.hp < this.priest.max_hp*0.7 && this.priest.getEntities({targetingMe: true}).length>0) return this.priest.name
        let players_near = Object.values(this.priest.players).filter( e=> Tools.distance(this.priest, e) < this.priest.range * 2 && e.name)
        for(let player of players_near) {
            if(this.priest.partyData.list.includes(player.name) && player.hp < player.max_hp*0.8) return player.name
            if(!this.priest.partyData.list.includes(player.name) && player.hp<player.max_hp*0.6 && Tools.distance(player, this.priest)<=this.priest.range) return player.name
        }
        return "null"
    }

    public async pullMobsFromParty() {
        let mobs_targeting_party = this.priest.getEntities({targetingPartyMember: true, targetingMe: false})
        if(mobs_targeting_party.length<1) return setTimeout(this.pullMobsFromParty, 1000)
        if(mobs_targeting_party.filter( e=> e.abilities.stone)) return
        let players : Map<string, number> = new Map()
        let player_with_more_mobs = 'null'

        for (let pm of this.priest.partyData.list) {
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

        await this.priest.absorbSins(player_with_more_mobs)        
    }

    public async useMassHeal() {
        if(!this.priest.canUse("partyheal")) return
        
        return this.priest.partyHeal()
    }

    private async useDarkBlessingLoop() {
        if(this.priest.isOnCooldown("darkblessing")) return setTimeout(this.useDarkBlessingLoop, this.priest.getCooldown("darkblessing"))
        if(!this.priest.canUse("darkblessing") || this.priest.smartMoving) return setTimeout(this.useDarkBlessingLoop, 2000)
        if(this.priest.s.darkblessing) return setTimeout(this.useDarkBlessingLoop, this.priest.s.darkblessing.ms)

        await this.useDarkBlessingLoop().catch(ex => console.warn(ex))
        return setTimeout(this.useDarkBlessingLoop, this.priest.getCooldown("darkblessing"))
    }

    private async useZap() {
        if(!this.priest.canUse("zap")) return setTimeout(this.useZap, Math.max(50, this.priest.getCooldown("zap")))

        let dps = 0
        let hps = this.priest.heal * this.priest.frequency
        for(let mob of this.priest.getEntities({targetingMe: true, targetingPartyMember: true})) {
            dps+= CF.calculate_monster_dps(this.priest, mob)
            
        }
        let MobsWithoutTargetingParty = this.priest.getEntities({targetingMe: false, targetingPartyMember:false})
        
        if(MobsWithoutTargetingParty.length>0 && dps<hps) {
            for( let mob of MobsWithoutTargetingParty) {
                if(hps > dps + CF.calculate_monster_dps(this.priest, mob)) {
                    await this.priest.zapperZap(mob.id).catch(er => console.warn(er))
                    return setTimeout(this.useZap, Math.max(1, this.priest.getCooldown("zapperzap")))
                }
            }
        }

        if(this.priest.mp > this.priest.max_mp * 0.8 && this.priest.getTargetEntity()) {
            await this.priest.zapperZap(this.priest.getTargetEntity().id)
            return setTimeout(this.useZap, Math.max(1, this.priest.getCooldown("zapperzap")))
        }

        return setTimeout(this.useZap, 1000)
        
    }

}