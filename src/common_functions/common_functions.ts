import {Entity, PingCompensatedCharacter, Tools, SkillName, IPosition, Pathfinder, ItemData, Player, Game, CharacterType, ServerRegion, ServerIdentifier, GMonsterAbilities} from "alclient"
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
import { PartyStrategy } from "./party_strategy"
import { StateStrategy } from "./state_strategy"

export const UPGRADE_POSITION: IPosition = {
    x: -208,
    y: -137,
    map: "main"
}

export const BLACKLISTED_ATTRIBUTES_BY_CLASS = {
    "warrior": { dreturn: 30 },
    "mage": { reflection: 30}
    }

export const BLACKLISTED_ABILITIES: GMonsterAbilities[] = ["stone"]

export type CharacterSettings = {
    ctype: CharacterType,
    server: {region: ServerRegion, name: ServerIdentifier},
    isMainSetup?: boolean
}

export const MY_CHARACTERS: Map<string, CharacterSettings> = new Map([
    ["Warious", {ctype: "warrior", server: {region: "ASIA", name: "I"}, isMainSetup: true}],
    ["aRanDonDon", {ctype: "ranger", server: {region: "ASIA", name: "I", isMainSetup: true}}],
    ["Archealer", {ctype: "priest", server: {region: "ASIA", name: "I", isMainSetup: true}}],
    ["DonWar", {ctype:"warrior", server: {region: "EU", name: "I"}}],
    ["MerchanDiser", {ctype: "merchant", server: {region: "ASIA", name: "I"}}],
    ["arMAGEdon", {ctype:"mage", server: {region: "US", name: "III"}}],
    ["RangerOver", {ctype: "ranger", server: {region: "US", name: "II"}}],
    ["aRogDonDon", {ctype: "rogue", server: {region: "US", name: "I"}}],
    ["RogerThat", {ctype: "rogue", server: {region: "EU", name: "II"}}]
])

export async function startBotWithStrategy(ctype: CharacterType, name: string, sRegion: ServerRegion = DEFAULT_SERVER_REGION, sID: ServerIdentifier = DEFAULT_SERVER_NAME, memory_storage: MemoryStorage): Promise<IState> {
    
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

// ?????????
export function checkScareAttack(bot: PingCompensatedCharacter): boolean {
    if(!bot) return false
    if(!bot.isOnCooldown("scare")) return true
    else {
        let target = bot.getTargetEntity()
        if(!target) return false
        if(target.target && !Object.keys(target?.abilities).some(e => BLACKLISTED_ABILITIES.includes(e as GMonsterAbilities))) return true
    }
    return true
}


export function calculate_monsters_dps (bot: PartyStrategy, tank: PartyStrategy|Player, entities?: Entity[], applyDistance: boolean = false) {
    
    if(!entities) entities = bot.getBot().getEntities()

    let dps = 0

    let tankBot = tank instanceof PartyStrategy ? tank.getBot() : tank

    entities.forEach( e => {
        if(applyDistance && Tools.distance(e, tankBot) > e.range) return
        dps +=calculate_monster_dps(tank, e) 
    })

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

export function calculate_burning_dps(bot: PartyStrategy|Player, mob: Entity) {
    if(!bot || !mob) return 0

    let damage_multiplier = 1 

    switch (mob.damage_type) {
        case "physical":
            let armor = bot instanceof PartyStrategy ? bot.getMaxDef.armor : bot.armor
            damage_multiplier = Tools.damage_multiplier(armor - mob.apiercing * 2)
            break;
        case "magical":
            let resistance = bot instanceof PartyStrategy ? bot.getMaxDef.resistance : bot.resistance
            damage_multiplier = Tools.damage_multiplier(resistance - mob.rpiercing * 2)
            break;
    }
    let fireres = (bot instanceof PingCompensatedCharacter) ? bot.firesistance : 0
    return damage_multiplier * ((100- fireres)/100) * (mob.abilities?.burn?.unlimited ? 3 : 1.5) * mob.attack

}

export function calculate_monster_dps(bot: PartyStrategy|Player, mob: Entity, calculateBurn: boolean = false): number {
    if(!mob || !bot) return 0
    let dps = 0
    let bonusArmor = 0
    const botBot = bot instanceof PartyStrategy ? bot.getBot() : bot
    // console.debug(`${botBot.id} instanceof PartyStrategy: ${bot instanceof PartyStrategy}`)
    Object.keys(botBot.s).forEach( e => bonusArmor += (Game.G.conditions[e]?.armor) ? Game.G.conditions[e].armor : 0)
    let bonusResistance = 0
    Object.keys(botBot.s).forEach( e => bonusResistance += (Game.G.conditions[e]?.resistance) ? Game.G.conditions[e].resistance : 0)
    switch(mob.damage_type) {
        case "physical":
            let armor = bot instanceof PartyStrategy ? bot.getMaxDef.armor : bot.armor
            dps = (mob.attack * Tools.damage_multiplier(armor - bonusArmor - mob.apiercing * 2)) * mob.frequency
            break;
        case "magical":
            let resistance = bot instanceof PartyStrategy ? bot.getMaxDef.resistance : bot.resistance
            dps = (mob.attack * Tools.damage_multiplier(resistance - bonusResistance - mob.rpiercing * 2)) * mob.frequency
            break;
        case "pure":
            dps = mob.attack * mob.frequency
            break;
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
        Pathfinder.canWalkPath(bot, to) ? bot.move(to.x, to.y).catch(debugLog) : bot.smartMove(to, {avoidTownWarps: true}).catch(debugLog)
    }
}

export function calculate_hps(bot: PingCompensatedCharacter, mobsCount?: number) {
    let default_hps = 200
    let total_hps = default_hps
    if(bot.lifesteal>0 && mobsCount && mobsCount > 0) {
        // take 90% of dmg apply lifesteal and frequency
        total_hps += (calculate_my_dps(bot) * bot.lifesteal/100) * bot.getEntities().length
    }
    if(bot.ctype == "priest") {
        total_hps += bot.heal * Tools.damage_multiplier(bot.resistance) * bot.frequency
    }
    
    let nearHeals = bot.getPlayers({isPartyMember: true}).filter( e => e.ctype == "priest" && Tools.distance(e,bot)<=e.range && !e.rip)
    if(nearHeals.length>0) nearHeals.forEach(e => total_hps += (e.heal* Tools.damage_multiplier(e.resistance) * e.frequency))
    // console.log(`HPS for ${bot.name} is ${total_hps}`)
    return total_hps
}

export function calculate_my_dps(bot: PingCompensatedCharacter) {
    return bot.attack * (1 + (bot.crit/100)) * 0.9 * bot.frequency
}


/**
 * Decide could we or should we use weapon with explosion and blast effects
 */
export function shouldUseMassWeapon(bot: PartyStrategy, tank: string) {

    const target = bot.getBot().getTargetEntity()
    if(!target) return false
    if((target.dreturn >= 30 || bot.getBot().getEntities().filter(e => Tools.distance(e, target) <=40 && e.dreturn >= 30).length>0) && bot.getBot().ctype == "warrior") return false
    if(bot.getBot().getEntities().filter( e => e.target == bot.getBot().id || bot.getBot().partyData?.list.includes(e.target) && bot.getBot().getEntities().filter( addentity => addentity.abilities.stone && Tools.distance(e, addentity)<40).length<1).length>1) return true
    
    if(bot.getBot().getEntities().filter( e => Tools.distance(e, target)<= 40 && e.abilities.stone && !e.target).length>0) return false
    let willTank = getActualTank(bot, tank)
    const tankName = willTank instanceof Player ? willTank.name : willTank.getBot().name
    let entitiesTargetingUs = bot.getBot().getEntities().filter( e => Tools.distance(e, target)<= 40 && (bot.getBot().partyData?.list.includes(e.target) || e.target == tankName))
    
    if(entitiesTargetingUs.length>1) return true

    let entitiesInRadiusWT = bot.getBot().getEntities().filter( e => Tools.distance(e, target) <= 40 && !e.target )


    
    return ( entitiesInRadiusWT.length>0 && calculate_monsters_dps(bot, willTank, [...entitiesInRadiusWT, ...entitiesTargetingUs]) / calculate_hps(bot.getBot()) <= 0.95)
}

export function getActualTank(bot: PartyStrategy, tank: string): Player | PartyStrategy {
    
    let willTank = bot.getBot().getPlayer({id: tank, withinRange: 200})
    if(!willTank) return bot
    return willTank
}

export function shouldUseMassSkill(bot: PartyStrategy, tank: string, skill: SkillName) {
    if(bot.getBot().getEntities({withinRange: skill, hasTarget: false}).length<1) return true

    if(bot.getBot().getEntities({hasTarget: false}).filter( e => e.abilities.stone).length>0) return false
    
    let willTank =  bot.getMemoryStorage?.getStateController?.getBots.find( e => e.getBot().id == tank && e.getBot().serverData.region == bot.getBot().serverData.region && e.getBot().serverData.name == bot.getBot().serverData.name && Tools.distance(e.getBot(), bot.getBot()) < 200) as StateStrategy
                    || bot.getBot().getPlayer({id: tank}) || bot


    let entitiesInRange = bot.getBot().getEntities({withinRange: skill, hasTarget: false})
    let targetingUs = bot.getBot().getEntities().filter( e => e.target == bot.getBot().name || bot.getBot().partyData?.list.includes(e.target))

    let  tankHp = willTank instanceof StateStrategy ? willTank.getBot().hp : willTank instanceof Player ? willTank.hp : 0
    let  tankMaxHp = willTank instanceof StateStrategy ? willTank.getBot().max_hp : willTank instanceof Player ? willTank.max_hp : 0

    return (Math.floor(calculate_monsters_dps(bot, willTank, [...entitiesInRange, ...targetingUs])) < Math.floor(calculate_hps(bot.getBot()) * 0.70) && tankHp > tankMaxHp *0.55)
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

export function sleep(ms)
{
    return new Promise(resolve => setTimeout(resolve, ms))
}