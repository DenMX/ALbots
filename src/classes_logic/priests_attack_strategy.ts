import { Priest, Tools, Game } from "alclient"
import * as CF from "../../src/common_functions/common_functions"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"
import { debugLog } from "../../src/common_functions/common_functions"
import { IState } from "../controllers/state_interface"

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
        this.pullMobsFromParty = this.pullMobsFromParty.bind(this)
        this.useMassHeal = this.useMassHeal.bind(this)

        this.attackOrHealLoop()
        this.useZap()
        this.useDarkBlessingLoop()
        this.useCurseLoop()
        this.pullMobsFromParty()
        this.useMassHeal()
    }


    private async attackOrHealLoop() {
        if(this.deactivate) return
        if(this.priest.isOnCooldown("attack")) {
            return setTimeout(this.attackOrHealLoop, Math.max(1,this.priest.getCooldown("attack")))
        }
        if(!this.priest.canUse("attack")) {
            return setTimeout(this.attackOrHealLoop, Math.max(1, this.priest.getCooldown("attack")))
        }
        let mobsTargetingMe = this.bot.getEntities({targetingMe: true})
        let totalDps = 0
        mobsTargetingMe.forEach( e => totalDps+= CF.calculate_monster_dps(this.bot, e))
        if( this.bot.c.town && this.bot.hp > totalDps*15 ) {
            return setTimeout(this.attackOrHealLoop, 15000)
        }
        let healTarget = this.whoNeedsHeal()
        if (healTarget == this.priest.id ) {
            await this.priest.healSkill(healTarget).catch(debugLog)
            return setTimeout(this.attackOrHealLoop, Math.max(1,this.priest.getCooldown("attack")))
        }
        let healEntity = healTarget ? this.priest.getPlayers().filter( e => e.id == healTarget)[0] || undefined : undefined
        if(healTarget !== undefined && healEntity !== undefined) {
            if( Tools.distance(this.priest, healEntity) > this.priest.range && this.priest.partyData?.list.includes(healTarget)) {
                if(!this.priest.smartMoving && Tools.distance(healEntity,this.priest)> this.priest.range) {
                    await this.priest.move( 
                        this.priest.x + (healEntity.x - this.priest.x)/2,
                        this.priest.y + (healEntity.y - this.priest.y)/2
                    ).catch(debugLog)
                }
                if(Tools.distance(this.priest, healEntity ) < this.priest.range) {
                    await this.priest.healSkill(healTarget).catch(debugLog)
                    return setTimeout(this.attackOrHealLoop, Math.max(1,this.priest.getCooldown("attack")))
                }
            }
            else {
                await this.priest.healSkill(healTarget).catch(debugLog)
                return setTimeout(this.attackOrHealLoop, Math.max(1,this.priest.getCooldown("attack")))
            }
        }
        let target = this.priest.getTargetEntity()
        if(!target) {
            return setTimeout(this.attackOrHealLoop, 300)
        }
        if(!target.target && CF.calculate_monster_dps(this.priest, target, true)/CF.calculate_hps(this.priest) >=0.95) {
            return setTimeout(this.attackOrHealLoop, 500)
        }
        if(!this.priest.smartMoving && !this.priest.moving && Tools.distance(target, this.priest)> this.priest.range) {
            let location = CF.getHalfWay(this.priest, target)
            CF.moveHalfWay(this.priest, location)
            return setTimeout(this.attackOrHealLoop, 500)
        }
        if(Tools.distance(target, this.priest)<= this.priest.range) {
            await this.priest.basicAttack(target.id).catch(debugLog)
            return setTimeout(this.attackOrHealLoop, this.priest.getCooldown("attack"))
        }
        return setTimeout(this.attackOrHealLoop, Math.min(this.priest.frequency, this.priest.getCooldown("attack")))
    }

    private whoNeedsHeal() : string  {
        //Heal self first
        if( this.priest.hp < this.priest.max_hp*0.8 ) return this.priest.id
        //Check all nearby players
        let woundedPlayers = this.priest.getPlayers().filter( e => e.name != this.priest.name && !e.rip && Tools.distance(this.priest,e) < this.priest.range*2 && e.hp<e.max_hp*0.85)
        if(woundedPlayers.length>0) {
            //Order party_member => less %hp => less distance
            woundedPlayers.sort( (curr, next) => {
                if(this.priest.partyData?.list.includes(curr.name) != this.priest.partyData?.list.includes(next.name)) {
                    return this.priest.partyData.list.includes(curr.name) ? -1 : 1
                }
                if( curr.hp/curr.max_hp*100 != next.hp/next.max_hp*100) {
                    return curr.hp/curr.max_hp*100 < next.hp/next.max_hp*100 ? -1 : 1
                }
                let curr_distance = Tools.distance(this.priest, curr)
                let next_distance = Tools.distance(this.priest, next)
                if(curr_distance != next_distance) {
                    return curr_distance< next_distance ? -1 : 1
                }
                return 0
            })

            return woundedPlayers[0].id
        }
        return undefined
    }

    private async useCurseLoop() {
        if(this.deactivate) return
        if(!this.priest.getTargetEntity() || this.priest.smartMoving) {
            return setTimeout(this.useCurseLoop, 2000)
        }
        if(this.priest.getCooldown("curse") || !this.priest.canUse("curse")) {
            return setTimeout(this.useCurseLoop, Math.max(100, this.priest.getCooldown("curse")))
        }
        if(this.priest.getTargetEntity().hp<5000) {
            return setTimeout(this.useCurseLoop, 1000)
        }
        if(!this.priest.getTargetEntity().target && CF.calculate_monster_dps(this.priest, this.priest.getTargetEntity())/CF.calculate_hps(this.priest) >=0.95) {
            return setTimeout(this.useCurseLoop, 500)
        }
        if(Tools.distance(this.priest, this.priest.getTargetEntity()) <= Game.G.skills.curse.range) await this.priest.curse(this.priest.target).catch(console.warn)
        return setTimeout(this.useCurseLoop, this.priest.getCooldown("curse"))
    }

    public async pullMobsFromParty() {
        if(this.deactivate) return
        if(this.priest.isOnCooldown("scare")) return setTimeout(this.pullMobsFromParty, Math.max(1, this.priest.getCooldown("scare")))
        if(this.priest.isOnCooldown("absorb")) return setTimeout(this.pullMobsFromParty, Math.max(1, this.priest.getCooldown("absorb")))
        if(!this.priest.canUse("absorb")) return setTimeout(this.pullMobsFromParty, 1000)
        if(this.priest.mp < this.priest.max_mp * 0.3) return setTimeout(this.pullMobsFromParty, 1000)
        let mobs_targeting_party = this.priest.getEntities({targetingPartyMember: true})
        // console.debug(`Mobs targeting party: ${mobs_targeting_party.length}`)
        
        const current_tank_name = this.memoryStorage.getCurrentTank
        const default_tank_name = this.memoryStorage.getDefaultTank
        let current_tank_entity = (current_tank_name == this.priest.id) ? this.priest : this.priest.getPlayer({isDead: false, id: current_tank_name}) ?? this.priest.getPlayer({isDead: false, id: default_tank_name}) ?? this.priest

        // console.debug(`Current tank: ${current_tank_entity.id}`)

        if( current_tank_entity.id != this.priest.id
            && Tools.distance(current_tank_entity, this.priest) < 250
            && current_tank_entity.hp>current_tank_entity.max_hp*0.3
        ) {
            console.debug(`Current tank is not the priest and is in range and has more than 30% hp`)
            return setTimeout(this.pullMobsFromParty, 1000)}


        if(mobs_targeting_party.length<1) {
            // console.debug(`No mobs targeting party`)
            return setTimeout(this.pullMobsFromParty, 1000)
        }
        if(mobs_targeting_party.filter( e=> e.abilities.stone).length>0) {
            console.debug(`Mobs targeting party have stone ability`)
            return setTimeout(this.pullMobsFromParty, 1000)
        }

        if(this.priest.mp - Game.G.skills.absorb.mp < this.priest.max_mp*0.1) {
            console.debug(`Not enough mp to absorb sins`)
            return setTimeout(this.pullMobsFromParty, 1000)
        }

        //find player with most mobs targeting him in party
        let players : Map<string, number> = new Map()

        this.priest.partyData?.list?.forEach(pm => { if(pm!=this.priest.id) players.set( pm, mobs_targeting_party.filter( e=> e.target == pm).length ) })
        
        let player_with_more_mobs = [...players.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        let current_dps = CF.calculate_monsters_dps(this.priest, this.priest, this.priest.getEntities({targetingMe: true}))
        let add_dps = CF.calculate_monsters_dps(this.priest, this.priest, mobs_targeting_party.filter(e => e.target == player_with_more_mobs))
        if(current_dps+add_dps/CF.calculate_hps(this.priest) > 0.95) {
            // console.debug(`Current dps + add dps is more than 1.2x hps`)
            return setTimeout(this.pullMobsFromParty, 1000)
        }

        await this.priest.absorbSins(player_with_more_mobs).catch(debugLog)
        
        return setTimeout(this.pullMobsFromParty, Math.max(1, this.priest.getCooldown("absorb")))
    }

    private async useMassHeal() {
        if(this.deactivate) return
        if(this.priest.rip) return setTimeout(this.useMassHeal, 1000)
        if(!this.priest.canUse("partyheal")) return setTimeout(this.useMassHeal, 1000)
        if(this.priest.mp < this.priest.max_mp * 0.1) return setTimeout(this.useMassHeal, 1000)
        if(this.priest.c.town) return setTimeout(this.useMassHeal, 3000)
        let PriestHpLessThan65 = this.priest.hp<this.priest.max_hp*0.65 ? 1 : 0
        if(this.priest.getPlayers({isPartyMember: true, isDead: false}).filter( e => e.hp < e.max_hp*0.65).length + PriestHpLessThan65 >1)
        {
            // console.debug(`Party heal will appear cause:\n
            //     Party members with less than 65% hp: ${this.priest.getPlayers({isPartyMember: true, isDead: false}).filter( e => e.hp < e.max_hp*0.65).length}`)
            this.priest.partyHeal().catch(console.warn)
            return setTimeout(this.useMassHeal, Math.max(1, this.priest.getCooldown("partyheal")))
        }
        if(this.bot.hp<this.bot.max_hp*0.4 || this.bot.getPlayers({isPartyMember: true, isDead: false}).filter( e => e.hp < e.max_hp* 0.4).length>0) {
            // console.debug(`Party heal will appear cause:\n
            //     Priest hp: ${this.priest.hp} is ${this.priest.hp/this.priest.max_hp*100}% of max hp: ${this.priest.max_hp}\n
            //     Party members with less than 30% hp: ${this.priest.getPlayers({isPartyMember: true, isDead: false}).filter( e => e.hp < e.max_hp*0.3).length}`)
            this.priest.partyHeal().catch(console.warn)
            return setTimeout(this.useMassHeal, Math.max(1, this.priest.getCooldown("partyheal")))
        }
        if(this.getMemoryStorage.getStateController?.getBots
            .filter( 
                e => !e.getBot().rip && e.getBot().hp < e.getBot().max_hp*0.7 
                && (Tools.distance(this.priest, e.getBot()) > this.priest.range*2 || this.priest.map != e.getBot().map) 
                && e.getBot().serverData.region == this.priest.serverData.region 
                && e.getBot().serverData.name == this.priest.serverData.name
            ).length>0) {
            // console.debug(`Party heal will appear cause:\n
            //     Party members with less than 70% hp and distance > range*2: ${this.bots?.filter( e => e.getBot().hp < e.getBot().max_hp*0.7 && (Tools.distance(this.priest, e.getBot()) > this.priest.range*2 || this.priest.map != e.getBot().map))?.length}`)
            this.priest.partyHeal().catch(console.warn)
            return setTimeout(this.useMassHeal, Math.max(1, this.priest.getCooldown("partyheal")))
        }
        
        return setTimeout(this.useMassHeal, 1000)
    }

    private async useDarkBlessingLoop() {
        if(this.deactivate) return
        if(this.priest.isOnCooldown("darkblessing")) {
            return setTimeout(this.useDarkBlessingLoop, this.priest.getCooldown("darkblessing"))
        }
        if(!this.priest.canUse("darkblessing") || this.priest.smartMoving) {
            return setTimeout(this.useDarkBlessingLoop, 2000)
        }
        if(this.priest.s.darkblessing) {
            return setTimeout(this.useDarkBlessingLoop, Math.max(100,this.priest.s.darkblessing.ms))
        }

        await this.priest.darkBlessing().catch(console.warn)
        return setTimeout(this.useDarkBlessingLoop, Math.max(1,this.priest.getCooldown("darkblessing")))
    }

    private async useZap() {
        if(this.deactivate) return
        if(this.priest.isOnCooldown("zapperzap")) return setTimeout(this.useZap, Math.max(1, this.priest.getCooldown("zapperzap")))
        if(!this.priest.canUse("zapperzap")) return setTimeout(this.useZap, 1000)
        if(this.priest.mp < this.priest.max_mp * 0.3) return setTimeout(this.useZap, 1000)
        
        let dps = CF.calculate_monsters_dps(this.priest, this.priest, this.priest.getEntities({targetingMe: true, targetingPartyMember: true}))
        let hps = CF.calculate_hps(this.priest)
        
        let MobsWithoutTargetingParty = this.priest.getEntities({hasTarget: false})
        
        if(MobsWithoutTargetingParty.length>0 && dps<hps) {
            for( let mob of MobsWithoutTargetingParty) {
                if(hps > dps + CF.calculate_monster_dps(this.priest, mob)) {
                    await this.priest.zapperZap(mob.id).catch(er => console.warn(er))
                    return setTimeout(this.useZap, Math.max(1, this.priest.getCooldown("zapperzap")))
                }
            }
        }

        return setTimeout(this.useZap, 1000)
        
    }

}