import {Entity, PingCompensatedCharacter, Tools, SkillName, IPosition, Pathfinder, ItemData, Player} from "alclient"
import * as CharacterItems from "../configs/character_items_configs"
import * as MIC from "../configs/manage_items_configs"

export const UPGRADE_POSITION: IPosition = {
    x: -208,
    y: -137,
    map: "main"
}

/*
Formula for calculationg burning

const burnPadding = highestBurningMob
    ? dps_multiplier(
        highestBurningMob.damage_type === "physical"
          ? characterEntity.armor -
              (G.monsters[highestBurningMob.mtype].apiercing ?? 0) * 2
          : highestBurningMob.damage_type === "magical"
          ? characterEntity.resistance -
            (G.monsters[highestBurningMob.mtype].rpiercing ?? 0) * 2
          : 1,
      ) *
      ((100 - fireResist) / 100) *
      (highestBurningMob.abilities.burn.unlimited ? 3 : 1.5) *
      highestBurningMob.attack
    : 0;
*/
export function calculate_monsters_dps (bot: PingCompensatedCharacter, tank: PingCompensatedCharacter|Player) {
    let dps = 0
    for(let entity of bot.getEntities()){
        if(entity.damage_type == "physical") {
            dps += entity.attack * Tools.damage_multiplier(tank.armor - entity.apiercing)
        }
        else if(entity.damage_type == "magical") {
            dps += (entity.attack * Tools.damage_multiplier(tank.resistance - entity.rpiercing)) * (entity.frequency/100)
        }
        else {
            dps += entity.attack * entity.frequency
        }
        
    }
    return dps
}

export function calculate_monster_dps(bot: PingCompensatedCharacter|Player, mob: Entity): number {
    if(!mob || !bot) return 0
    if(mob.damage_type == "physical") {
        // console.log(`${mob.type} DPS counter ${bot.name}: ${(mob.attack * Tools.damage_multiplier(bot.armor - mob.apiercing)) * mob.frequency}`)
        return (mob.attack * Tools.damage_multiplier(bot.armor - mob.apiercing)) * mob.frequency
    }
    else if(mob.damage_type == "magical"){
        // console.log(`${mob.type} DPS counter ${bot.name}: ${(mob.attack * Tools.damage_multiplier(bot.resistance - mob.rpiercing)) * (mob.frequency/100)}`)
        return (mob.attack * Tools.damage_multiplier(bot.resistance - mob.rpiercing)) * mob.frequency
    }
    else if(mob.damage_type == "pure"){
        // console.log(`${mob.type} DPS counter ${bot.name}: ${mob.attack * (mob.frequency/100)}`)
        return mob.attack * mob.frequency
    }
    return 0
}

export function calculate_ttk(mob: Entity, bot: PingCompensatedCharacter) {
    if(!mob || !bot) return 0
    switch(bot.damage_type) {
        case "physical":
            return mob.hp / ((bot.attack * 0.9 * Tools.damage_multiplier(mob.armor-bot.apiercing)) * (bot.frequency/100))
        case "magical":
            return mob.hp / ((bot.attack * 0.9 * Tools.damage_multiplier(mob.resistance-bot.rpiercing)) * (bot.frequency/100))
        default:
            return 0
    }
}

export function getHalfWay(bot: PingCompensatedCharacter, mob: Entity) : IPosition {
    if(!bot || !mob) return undefined
    if(bot.map != mob.map) return undefined
    let position: IPosition
    //multiplier for distance starting check from half way 0.5 => 0.9
    for( let i = 5; i < 10; i++ ) {
        position = {
            map: bot.map,
            x: bot.x + ( mob.x - bot.x ) * (i/10),
            y: bot.y + ( mob.y - bot.y ) * (i/10)
        }
        if( Pathfinder.canStand(position) ) break
    }
     
    return position
}

export function moveHalfWay(bot: PingCompensatedCharacter, to: IPosition) {
    if(to && Pathfinder.canStand(to)) {
        Pathfinder.canWalkPath(bot, to) ? bot.move(to.x, to.y).catch(console.warn) : bot.smartMove(to).catch(console.warn)
    }
}

export function calculate_hps(bot: PingCompensatedCharacter, mobsCount?: number) {
    let default_hps = 250
    let total_hps = default_hps
    if(bot.lifesteal>0 && mobsCount && mobsCount > 0) {
        // take 90% of dmg apply lifesteal and frequency
        total_hps += (calculate_my_dps(bot) * bot.lifesteal/100) * bot.getEntities().length
    }
    if(bot.ctype == "priest") {
        total_hps += bot.heal * bot.frequency+400
    }
    if(bot.partyData) {
        for(let player of bot.partyData.list) {
            let pm = bot.partyData.party[player]
            if(pm.type != "priest" || player == bot.name) continue
            total_hps += 400
        }
    }
    let nearHeals = bot.getPlayers({isPartyMember: true}).filter( e => e.ctype == "priest" && Tools.distance(e,bot)<=e.range)
    if(nearHeals.length>0) nearHeals.forEach(e => total_hps += (e.heal*e.frequency))
    // console.log(`HPS for ${bot.name} is ${total_hps}`)
    return total_hps
}

export function calculate_my_dps(bot: PingCompensatedCharacter) {
    return bot.attack * (1 + (bot.crit/100)) * 0.9
}

export function shouldUseMassWeapon(bot: PingCompensatedCharacter, tank: string) {
    if(bot.getEntities({targetingPartyMember: true, targetingMe: true}).length>1) return true
    let willTank 
    if(bot.name == tank ) willTank = bot
    else {
        willTank = bot.getPlayers().filter( e => e.name == tank && Tools.distance(e,bot)<200)[0] || bot
    }
    if(calculate_hps(bot) - calculate_monsters_dps(bot, willTank) > 0) return true
    return false
}

export function isInRange(entity: Entity, bot: PingCompensatedCharacter, skill?: SkillName) {
    if(!entity || !bot) return false
    if(entity.map != bot.map) return false
    if(!skill) skill = "attack"
    if(Tools.distance(entity, bot) < bot.G.skills[skill].range!) return true
    return false
}

export function getBotPersonalItemsList(bot: PingCompensatedCharacter): ItemData[] {
    let botPersonalItems: ItemData[] = []
    if(CharacterItems.SET_CONFIGS[bot.name]) {
        for(const set of Object.keys(CharacterItems.SET_CONFIGS[bot.name])) {
            for(const i of CharacterItems.SET_CONFIGS[bot.name][set]) {
                botPersonalItems.push(i)
            }
        }
    }
    if(CharacterItems.WEAPON_CONFIGS[bot.name]) {
        for(const key of Object.keys(CharacterItems.WEAPON_CONFIGS[bot.name])) {
            botPersonalItems.push(CharacterItems.WEAPON_CONFIGS[bot.name][key])
        }
    }

    return botPersonalItems
}

export function getBotNotPersonalItemsList(bot: PingCompensatedCharacter): ItemData[] {
    let botPersonalItems = getBotPersonalItemsList(bot)

    let notPersonalItems: ItemData[] = []
    for(const [, item] of bot.getItems() ) {
        // console.debug(`[${bot.name}] checking ${item.name}...`)
        if( MIC.DONT_SEND_ITEMS.includes(item.name) ) continue
        if( item.isLocked() ) continue
        if( botPersonalItems.some(i=> item.name==i.name && i.level == item.level) ) continue
        if( CharacterItems.DEFAULT_ELIXIRS.get(bot.ctype).includes(item.name) ) continue
        // console.debug(`[${bot.name}] Added to list ${item.name}.`)
        notPersonalItems.push(item)
    }

    return notPersonalItems
}

export function debugLog(): void {
    return
}

export function infoLog(): void {
    return
}

export function warnLog(): void {
    return
}

export function errorLog(): void {
    return
}