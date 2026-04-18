import { CharacterType, ItemName, SlotType } from "alclient";

export const KEEP_GOLD: number = 10_500_000;
export const KEEP_GOLD_WITH_PC: number = 100_000_000;

export const DEFAULT_ELIXIRS: Map<CharacterType, ItemName[]> = new Map([
    ["mage", ["pumpkinspice","elixirluck"]],
    ["priest", ["elixirluck"]],
    ["warrior", ["pumpkinspice"]],
    ["ranger", ["pumpkinspice", "elixirluck"]],
    ["rogue", ["pumpkinspice"]]
])

export type DefaultWeaponsConfig = {
    solo_mainhand?: {name: ItemName, level: number},
    solo_offhand?: {name: ItemName, level: number},
    mass_mainhand?: {name: ItemName, level: number},
    mass_offhand?: {name: ItemName, level: number},
    fast_mainhand?: {name: ItemName, level: number},
    fast_offhand?: {name: ItemName, level: number}
}

export type WarriorWeaponsConfig = DefaultWeaponsConfig & {
    cleave? : {name: ItemName, level: number},
    stomp? : {name: ItemName, level: number},
}

export type RangerWeaponConfig = DefaultWeaponsConfig & {
    heal_weapon?: {name: ItemName, level: number},
    heal_offhand?: {name: ItemName, level: number}
}

export const WEAPON_CONFIGS:{ [T in string]: DefaultWeaponsConfig|WarriorWeaponsConfig|RangerWeaponConfig} = {
    "Warious": {
        cleave: {name: "bataxe", level: 8 },
        stomp: {name: "basher", level: 8 },
        solo_mainhand: {name: 'fireblade', level: 9 },
        solo_offhand: { name: 'candycanesword', level: 9 },
        mass_mainhand: {name: 'ololipop', level: 9},
        mass_offhand: {name: 'ololipop', level: 9},
        fast_mainhand: {name: "rapier", level: 7}
    },
    "arMAGEdon": {
        solo_mainhand: { name: "firestaff", level: 9 },
        solo_offhand: { name: "wbook1", level: 3},
        mass_mainhand: { name: "gstaff", level: 6 },
        fast_mainhand: { name: "wand", level: 7 },
        fast_offhand: { name: "wbookhs", level: 3 }
    },
    "aRanDonDon": {
        solo_mainhand: { name: "crossbow", level: 9},
        solo_offhand: { name: "t2quiver", level: 8 },
        mass_mainhand: { name: "pouchbow", level: 11},
        mass_offhand: { name: "alloyquiver", level: 8},
        heal_weapon: { name: "cupid", level: 8},
        heal_offhand: {name: "t2quiver", level: 8}
    },
    "frostyWar": {
        solo_mainhand: { name: "candycanesword", level: 9 },
        solo_offhand: { name: "fireblade", level: 8 },
        mass_mainhand: { name: "glolipop", level: 6 },
        mass_offhand: { name: "glolipop", level: 6 },
        stomp: { name: "basher", level: 0},
        cleave: { name: "bataxe", level: 4}
    },
    "MerchanDiser": {
        fast_mainhand: {name: "broom", level: 8},
        fast_offhand: {name: "wbookhs", level: 3}
    },
    "frostyMerch": {
        fast_mainhand: { name: "staff", level: 3},
        fast_offhand: { name: "wbook0", level: 2}
    }
}

export type PriestOffhandConfig = {
    luck?: {name: ItemName, level: number},
    armor?: {name: ItemName, level: number},
    resistance?: {name: ItemName, level: number},
    resistEvasion?: {name: ItemName, level: number}
}

export const PRIEST_OFFHAND_CONFIGS: { [T in string]: PriestOffhandConfig} = {
    "Archealer": {
        luck: {name: "mshield", level: 9},
        armor: {name: "exoarm", level: 2},
        resistance: {name: "wbookhs", level: 3},
        resistEvasion: {name: "lantern", level: 3}
    }
}


export type SetConfig = {
    name: string,
    level?: number,
    slot?: SlotType
    priority?: number
}

export type SetList = "tank" | "dd" | "heal" | "luck" | "gold" | "exp"

export type SetListConfig = { [T in SetList]? : SetConfig[] }


export const SET_CONFIGS: {
        [T in string]: SetListConfig
    } = {
        "Archealer": {
            "luck": [
                {name: 'oxhelmet'},
                {name: 'tshirt88', level: 4},
                {name: 'xmaspants', level: 9},
                {name: 'eslippers', level: 8},
                {name: 'mittens', level: 9},
                {name: 'spookyamulet', level: 1},
                {name: 'mshield', level: 9},
                {name: 'rabbitsfoot', level: 1},
                {name: 'mearring', level: 0, slot: "earring1"},
                {name: 'mearring', level: 1, slot: "earring2"},
                {name: 'ecape', level: 6}
            ],
            "gold": [
                {name: 'wcap', level: 9},
                {name: 'wattire', level: 8},
                {name: 'wbreeches', level: 9},
                {name: 'wshoes', level: 9},
                {name: 'handofmidas', level: 4},
                {name: 'spookyamulet', level: 1},
                {name: 'horsecapeg', level: 7}
            ],
            "tank": [
                {name: 'xhelmet', level: 7},
                {name: 'xarmor', level: 6},
                {name: 'starkillers', level: 8},
                {name: 'wingedboots', level: 8},
                {name: 'mittens', level: 9},
                {name: 't2intamulet', level: 3},
                {name: 'intearring', level: 4, slot: "earring1"},
                {name: 'sbelt', level: 1},
                {name: 'bcape', level: 7}
            ]
        }
    }
