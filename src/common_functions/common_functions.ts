import {Entity, PingCompensatedCharacter, Tools, SkillName, IPosition, Pathfinder, ItemData, Player, Game, CharacterType, ServerRegion, ServerIdentifier} from "alclient"
import * as CharacterItems from "../configs/character_items_configs"
import * as MIC from "../configs/manage_items_configs"
import { WarriorsAttackStrategy } from "../classes_logic/warriors_attack_strategy"
import { PriestsAttackStrategy } from "../classes_logic/priests_attack_strategy"
import { RangerAttackStrategy } from "../classes_logic/ranger_attack_strategy"
import { MageAttackStrategy } from "../classes_logic/mage_attack_strategy"
import { RogueAttackStrategy } from "../classes_logic/rogue_attack_strategy"
import { MerchantStrategy } from "../classes_logic/merchant_strategy"
import { MemoryStorage, DEFAULT_SERVER_NAME, DEFAULT_SERVER_REGION } from "./memory_storage"
import { IState } from "../controllers/state_interface"

export const UPGRADE_POSITION: IPosition = {
    x: -208,
    y: -137,
    map: "main"
}

export async function startBotWithStrategy(ctype: CharacterType, name: string, sRegion: ServerRegion, sID: ServerIdentifier, memory_storage: MemoryStorage): Promise<IState> {
    if(!sRegion || !sID) {
        sRegion = DEFAULT_SERVER_REGION;
        sID = DEFAULT_SERVER_NAME;
    }
    switch (ctype) {
        case "mage":
            return new MageAttackStrategy(await Game.startMage(name, sRegion, sID), memory_storage)
        case "merchant":
            return new MerchantStrategy(await Game.startMerchant(name, sRegion, sID), memory_storage)
        case "priest":
            return new PriestsAttackStrategy(await Game.startPriest(name, sRegion, sID), memory_storage)
        case "warrior":
            return new WarriorsAttackStrategy(await Game.startWarrior(name, sRegion, sID), memory_storage)
        case "ranger":
            return new RangerAttackStrategy(await Game.startRanger(name, sRegion, sID), memory_storage)
        case "rogue":
            return new RogueAttackStrategy(await Game.startRogue(name, sRegion, sID), memory_storage)
        case "paladin":
            console.error("NO CODE FOR PALADIN")
        default:
            console.error(`Unknown ctype ${ctype}`)
    }
    return undefined
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
export function calculate_monsters_dps (bot: PingCompensatedCharacter, tank: PingCompensatedCharacter|Player, entities?: Entity[]) {
    
    if(!entities) entities = bot.getEntities()

    let dps = 0

    entities.forEach( e => dps +=calculate_monster_dps(tank, e) )

    let entitiesWithBurn = entities.filter( e => e.abilities.burn)

    if(entitiesWithBurn.length>0) {
        entitiesWithBurn.sort((curr, next) => {
            if(curr.attack != next.attack)
                return curr.attack > next.attack ? -1 : 1
            return 0
        })
        dps+=calculate_burning_dps(tank, entitiesWithBurn[0])
    }

    return dps
}

export function calculate_burning_dps(bot: PingCompensatedCharacter|Player, mob: Entity) {
    if(!bot || !mob) return 0

    let damage_multiplier = 1 

    switch (mob.damage_type) {
        case "physical":
            damage_multiplier = Tools.damage_multiplier(bot.armor - mob.apiercing * 2)
            break;
        case "magical":
            damage_multiplier = Tools.damage_multiplier(bot.resistance - mob.rpiercing * 2)
            break;
    }
    let fireres = (bot instanceof PingCompensatedCharacter) ? bot.firesistance : 0
    return damage_multiplier * ((100- fireres)/100) * (mob.abilities?.burn?.unlimited ? 3 : 1.5) * mob.attack

}

export function calculate_monster_dps(bot: PingCompensatedCharacter|Player, mob: Entity, calculateBurn: boolean = false): number {
    if(!mob || !bot) return 0
    let dps = 0
    if(mob.damage_type == "physical") {
        // console.log(`${mob.type} DPS counter ${bot.name}: ${(mob.attack * Tools.damage_multiplier(bot.armor - mob.apiercing)) * mob.frequency}`)
        dps = (mob.attack * Tools.damage_multiplier(bot.armor - mob.apiercing * 2)) * mob.frequency
    }
    else if(mob.damage_type == "magical"){
        // console.log(`${mob.type} DPS counter ${bot.name}: ${(mob.attack * Tools.damage_multiplier(bot.resistance - mob.rpiercing)) * (mob.frequency/100)}`)
        dps = (mob.attack * Tools.damage_multiplier(bot.resistance - mob.rpiercing * 2)) * mob.frequency
    }
    else if(mob.damage_type == "pure"){
        // console.log(`${mob.type} DPS counter ${bot.name}: ${mob.attack * (mob.frequency/100)}`)
        dps = mob.attack * mob.frequency
    }
    
    return calculateBurn ? dps + calculate_burning_dps(bot, mob) : dps
}

export function calculate_ttk(mob: Entity, bot: PingCompensatedCharacter) {
    if(!mob || !bot) return 0
    switch(bot.damage_type) {
        case "physical":
            return mob.hp / ((bot.attack * 0.9 * Tools.damage_multiplier(mob.armor-bot.apiercing*2)) * (bot.frequency/100))
        case "magical":
            return mob.hp / ((bot.attack * 0.9 * Tools.damage_multiplier(mob.resistance-bot.rpiercing*2)) * (bot.frequency/100))
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
    return bot.attack * (1 + (bot.crit/100)) * 0.9 * bot.frequency
}


/**
 * Decide could we or should we use weapon with explosion and blast effects
 */
export function shouldUseMassWeapon(bot: PingCompensatedCharacter, tank: string) {
    if(bot.getEntities().filter( e => e.target == bot.id || bot.partyData?.list.includes(e.target)).length>1) return true
    let target = bot.getTargetEntity()
    if(!target) return false
    let willTank 
    if(bot.name == tank ) willTank = bot
    else {
        willTank = bot.getPlayers().filter( e => e.name == tank && Tools.distance(e,bot)<200)[0] || bot
    }
    let entitiesTargetingUs = bot.getEntities().filter( e => Tools.distance(e, target)<= 40 && (bot.partyData?.list.includes(e.target) || e.target == willTank.name))
    
    if(entitiesTargetingUs.length>1) return true

    let entitiesInRadiusWT = bot.getEntities().filter( e => Tools.distance(e, target) <= 40 && !e.target )
    
    return ( entitiesInRadiusWT.length>0 && calculate_monsters_dps(bot, willTank, [...entitiesInRadiusWT, ...entitiesTargetingUs]) / calculate_hps(bot) <= 1.2)
}

export function shouldUseMassSkill(bot: PingCompensatedCharacter, tank: string, skill: SkillName) {
    let willTank 
    if(bot.name == tank ) willTank = bot
    else {
        willTank = bot.getPlayers().filter( e => e.name == tank && Tools.distance(e,bot)<200)[0] || bot
    }
    let entitiesInRange = bot.getEntities({withinRange: skill}).filter( e => !e.target)
    let targetingUs = bot.getEntities().filter( e => e.target == bot.name || bot.partyData?.list.includes(e.target))
    return (calculate_monsters_dps(bot, willTank, [...entitiesInRange, ...targetingUs]) / calculate_hps(bot) <= 1.2)
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
    return console.debug()
}