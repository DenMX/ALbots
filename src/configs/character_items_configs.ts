import { CharacterType, ItemName, SlotType } from "alclient";

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

export const WEAPON_CONFIGS:{ [T in string]: DefaultWeaponsConfig|WarriorWeaponsConfig} = {
    "Warious": {
        cleave: {name: "bataxe", level: 8 },
        stomp: {name: "basher", level: 8 },
        solo_mainhand: {name: 'fireblade', level: 9 },
        solo_offhand: { name: 'candycanesword', level: 9 },
        mass_mainhand: {name: 'ololipop', level: 9},
        mass_offhand: {name: 'ololipop', level: 9},
        fast_mainhand: {name: "rapier", level: 8}
    },
    "arMAGEdon": {
        solo_mainhand: { name: "firestaff", level: 9 },
        solo_offhand: { name: "wbook1", level: 3},
        mass_mainhand: { name: "gstaff", level: 6 },
        fast_mainhand: { name: "wand", level: 7 },
        fast_offhand: { name: "wbookhs", level: 3 }
    },
    "aRanDonDon": {
        solo_mainhand: { name: "crossbow", level: 8},
        solo_offhand: { name: "t2quiver", level: 8 },
        mass_mainhand: { name: "pouchbow", level: 11},
        mass_offhand: { name: "alloyquiver", level: 8}
    },
    "frostyWar": {
        solo_mainhand: { name: "candycanesword", level: 9 },
        solo_offhand: { name: "fireblade", level: 8 },
        mass_mainhand: { name: "glolipop", level: 6 },
        mass_offhand: { name: "glolipop", level: 6 },
        stomp: { name: "basher", level: 0}
    }
}


export type SetConfig = {
    name: string,
    level?: number,
    slot?: SlotType
}

export type SetList = "tank" | "dd" | "heal" | "luck" | "gold"

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
                {name: 'mshield', level: 9, slot: "offhand"},
                {name: 'lmace', level: 7},
                {name: 'rabbitsfoot', level: 1},
                {name: 'mearring', level: 0, slot: "earring1"},
                {name: 'ecape', level: 6}
            ],
            "gold": [
                {name: 'wcap', level: 9},
                {name: 'wattire', level: 8},
                {name: 'wbreeches', level: 9},
                {name: 'wshoes', level: 9},
                {name: 'handofmidas', level: 4},
                {name: 'spookyamulet', level: 1},
                {name: 'mearring', level: 0, slot: "earring1"}
            ],
            "tank": [
                {name: 'xhelmet', level: 7},
                {name: 'xarmor', level: 6},
                {name: 'starkillers', level: 7},
                {name: 'wingedboots', level: 8},
                {name: 'mittens', level: 9},
                {name: 'ornamentstaff', level: 10},
                {name: 't2intamulet', level: 3},
                {name: 'intearring', level: 4, slot: "earring1"},
                {name: 'sbelt', level: 1},
                {name: 'bcape', level: 7}
            ]
        }
    }
