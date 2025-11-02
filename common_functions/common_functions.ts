import {Entity, PingCompensatedCharacter, Tools, Game} from "alclient"

export function calculate_monsters_dps (bot: PingCompensatedCharacter) {
    let dps = 0
    for(let entity of bot.getEntities()){
        if(entity.damage_type == "physical") {
            dps += entity.attack * Tools.damage_multiplier(bot.armor - entity.apiercing)
        }
        else if(entity.damage_type == "magical") {
            dps += (entity.attack * Tools.damage_multiplier(bot.resistance - entity.rpiercing)) * (entity.frequency/100)
        }
        else {
            dps += entity.attack * entity.frequency
        }
        
    }
    return dps
}

export function calculate_monster_dps(bot: PingCompensatedCharacter, mob: Entity) {
    if(!mob) return
    if(mob.damage_type == "physical") {
        return (mob.attack * Tools.damage_multiplier(bot.armor - mob.apiercing)) * (mob.frequency/100)
    }
    else if(mob.damage_type == "magical"){
        return (mob.attack * Tools.damage_multiplier(bot.resistance - mob.rpiercing)) * (mob.frequency/100)
    }
    else {
        return mob.attack * (mob.frequency/100)
    }
}

export function calculate_hps(bot: PingCompensatedCharacter, mobsCount?: number) {
    let default_hps = 250
    let total_hps = default_hps
    if(bot.lifesteal>0) {
        // take 90% of dmg apply lifesteal and frequency
        total_hps += (calculate_my_dps(bot) * bot.lifesteal/100) * bot.getEntities().length
    }
    if(bot.ctype == "priest") {
        total_hps += bot.heal * bot.frequency
    }
    if(bot.party) {
       Object.values(bot.players).filter( e => 
                                    //check healers in party
                                    e.name != bot.name && 
                                    bot.party?.includes(e.name) && 
                                    e.type == "priest" && Tools.distance(e, bot) < e.range
                                    )
                                    .forEach( e => { total_hps += e.heal * e.frequency })
        Object.values(bot.players).filter( e => 
                                    //check healers in party
                                    e.name != bot.name && 
                                    bot.party?.includes(e.name) && 
                                    e.type == "priest" && Tools.distance(e, bot) < e.range
                                    )
                                    .forEach( e => { total_hps += 400 }) //add HPS for party heal skill
    }
    return total_hps
}

export function calculate_my_dps(bot: PingCompensatedCharacter) {
    return bot.attack * (1 + (bot.crit/100)) * 0.9
}

export function shouldUseMassWeapon(bot: PingCompensatedCharacter) {
        if(bot.getEntities({targetingPartyMember: true, targetingMe: true}).length>1) return true
        if(calculate_hps(bot) - calculate_monsters_dps(bot) > 0)
        return false
    }