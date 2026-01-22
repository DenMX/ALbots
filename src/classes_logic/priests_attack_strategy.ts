import { Priest, Tools, } from "alclient"
import * as CF from "../../src/common_functions/common_functions"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"

export class PriestsAttackStrategy extends StateStrategy {

    private priest: Priest
    constructor (bot: Priest, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        this.priest = bot

        this.attackOrHealLoop = this.attackOrHealLoop.bind(this)
        this.useZap = this.useZap.bind(this)
        this.useDarkBlessingLoop = this.useDarkBlessingLoop.bind(this)
        this.useCurseLoop = this.useCurseLoop.bind(this)
        this.whoNeedsHeal = this.whoNeedsHeal.bind(this)


        this.attackOrHealLoop()
        this.useZap()
        this.useDarkBlessingLoop()
        this.useCurseLoop()
    }

    private async attackOrHealLoop() {
        if(this.priest.isOnCooldown("attack")) return setTimeout(this.attackOrHealLoop, Math.max(1,this.priest.getCooldown("attack")))
        if(!this.priest.canUse("attack")) return setTimeout(this.attackOrHealLoop, Math.max(1, this.priest.getCooldown("attack")))
        let mobsTargetingMe = this.bot.getEntities({targetingMe: true})
        let totalDps = 0
        mobsTargetingMe.forEach( e => totalDps+= CF.calculate_monster_dps(this.bot, e))
        if( this.bot.c.town && this.bot.hp > totalDps*15 ) return setTimeout(this.attackOrHealLoop, 5000)
        let healTarget = this.whoNeedsHeal()
        if(healTarget !== undefined) {
            let healEntity = this.priest.getPlayers().filter( e => e.name == healTarget)[0]
            if(healEntity && Tools.distance(healEntity, this.priest) > this.priest.range) {
                if(!this.priest.smartMoving && Tools.distance(healEntity,this.priest)> this.priest.range) {
                    await this.priest.move( 
                        this.priest.x + (healEntity.x - this.priest.x)/2,
                        this.priest.y + (healEntity.y - this.priest.y)/2
                    ).catch(console.warn)
                }
                if(Tools.distance(healEntity, this.priest)<= this.priest.range) {
                    console.debug(`[HEALING] ${healEntity.name}`)
                    await this.priest.healSkill(healTarget).catch(console.error)
                    return setTimeout(this.attackOrHealLoop, Math.max(1,this.priest.getCooldown("attack")))
                }
            }
        }
        let target = this.priest.getTargetEntity()
        if(!target) return setTimeout(this.attackOrHealLoop, 300)
        if(!target.target && CF.calculate_monster_dps(this.priest, target)/CF.calculate_hps(this.priest) >=2) return setTimeout(this.attackOrHealLoop, 500)
        if(!this.priest.smartMoving && !this.priest.moving && Tools.distance(target, this.priest)> this.priest.range) {
            let location = CF.getHalfWay(this.priest, target)
            CF.moveHalfWay(this.priest, location)
            return setTimeout(this.attackOrHealLoop, 500)
        }
        if(Tools.distance(target, this.priest)<= this.priest.range) {
            await this.priest.basicAttack(target.id).catch(console.error)
            return setTimeout(this.attackOrHealLoop, this.priest.getCooldown("attack"))
        }
        return setTimeout(this.attackOrHealLoop, Math.min(this.priest.frequency, this.priest.getCooldown("attack")))
    }

    private whoNeedsHeal() : string  {
        if( this.priest.hp < this.priest.max_hp*0.8 ) return this.priest.name
        let party = this.priest.getPlayers({isPartyMember: true, withinRange: this.priest.range*2}).filter( e => e.hp<e.max_hp*0.85)
        let randomPlayers = this.priest.getPlayers({withinRange: "heal", isPartyMember: false}).filter( e => e.hp < e.max_hp*0.7)
        if(party.length == 1) return party[0].name
        if(party.length>1) {
            party = party.sort( (cur, next) => {
                if(cur.hp != next.hp) {
                    return cur.hp<next.hp ? -1 : 1
                }
                return 0
            })
            return party[0].name
        }
        if(randomPlayers.length == 1) return randomPlayers[0].name
        if(randomPlayers.length > 1) {
            randomPlayers = randomPlayers.sort( (cur, next) => {
                if(cur.hp != next.hp) {
                    return cur.hp<next.hp ? -1 : 1
                }
                return 0
            })
            return randomPlayers[0].name
        }
        return undefined
    }

    private async useCurseLoop() {
        if(!this.priest.getTargetEntity() || this.priest.smartMoving) return setTimeout(this.useCurseLoop, 2000)
        if(this.priest.getCooldown("curse") || !this.priest.canUse("curse")) return setTimeout(this.useCurseLoop, Math.max(100, this.priest.getCooldown("curse")))
        if(this.priest.getTargetEntity().hp<5000) return setTimeout(this.useCurseLoop, 1000)
            await this.priest.curse(this.priest.target).catch(console.warn)
        return setTimeout(this.useCurseLoop, this.priest.getCooldown("curse"))
    }

    // REWRITE!!!
    public async pullMobsFromParty() {
        let mobs_targeting_party = this.priest.getEntities({targetingPartyMember: true, targetingMe: false})
        if(mobs_targeting_party.length<1) return setTimeout(this.pullMobsFromParty, 1000)
        if(mobs_targeting_party.filter( e=> e.abilities.stone)) return setTimeout(this.pullMobsFromParty, 1000)
        let players : Map<string, number> = new Map()
        let player_with_more_mobs : string

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
        if(this.priest.s.darkblessing) return setTimeout(this.useDarkBlessingLoop, Math.max(100,this.priest.s.darkblessing.ms))

        await this.priest.darkBlessing().catch(console.warn)
        return setTimeout(this.useDarkBlessingLoop, Math.max(1,this.priest.getCooldown("darkblessing")))
    }

    private async useZap() {
        if(!this.priest.canUse("zapperzap")) return setTimeout(this.useZap, Math.max(50, this.priest.getCooldown("zapperzap")))
        console.log("Priest can use zap?")
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