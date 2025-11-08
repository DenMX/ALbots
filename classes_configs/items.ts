import {ItemName } from "alclient"

export const DONT_SEND_ITEMS = [
    "tracker", 
    "computer", 
    "supercomputer", 
    "hpot1", 
    "mpot1", 
    "luckbooster", 
    "goldbooster", 
    "xpbooster"
]

export type ItemsConfig = {
    cleave? : {name: ItemName, level: number},
    stomp? : {name: ItemName, level: number},
    solo_mainhand?: {name: ItemName, level: number},
    solo_offhand?: {name: ItemName, level: number},
    mass_mainhand?: {name: ItemName, level: number},
    mass_offhand?: {name: ItemName, level: number},
    elixir: ItemName,
    main_orb?: {name: ItemName, level: number},
    luck_offhand?: {name: ItemName, level: number},
    armor_offhand?: {name: ItemName, level: number},
    resist_offhand?: {name: ItemName, level: number},
    luck_orb?: {name: ItemName, level: number},
    dps_orb?: {name: ItemName, level: number}
}


export var WariousItems: ItemsConfig = {
        cleave: {name: "scythe", level: 5},
        stomp: {name: "basher", level: 7},
        mass_mainhand: {name: "ololipop", level: 9},
        mass_offhand: {name: "ololipop", level: 9},
        solo_mainhand: {name: "candycanesword", level: 9},
        solo_offhand: {name: "fireblade", level: 9},
        elixir: "pumpkinspice",
        main_orb: {name: "test_orb", level: 0},
    }

export var arMAGEdonItems: ItemsConfig = {
        solo_mainhand: {name: "firestaff", level: 9},
        solo_offhand: {name: "exoarm", level: 1},
        mass_mainhand: {name: "gstaff", level: 6},
        elixir: "pumpkinspice"
    }

export var ArchealerItems: ItemsConfig = {
        elixir: "elixirluck",
        luck_offhand: {name: "mshield", level: 7},
        armor_offhand: {name: "exoarm", level: 1},
        resist_offhand: {name: "wbookhs", level: 3},
        luck_orb: {name: "rabbitsfoot", level: 1},
        dps_orb: {name: "jacko", level: 4},
        
    }

export var ArchealersArmor = {
    armor:{
            helmet: {name: "xhelmet", level: 7},
            chest: {name: "xarmor", level: 6},
            pants: {name: "starkillers", level: 7},
            shoes: {name: "wingedboots", level: 8},
            gloves: {name: "mittens", level: 9}
    },
    luck: {
        helmet: {name: "wcap", level: 9},
        chest: {name: "wattire", level: 8},
        pants: {name: "wbreeches", level: 8},
        shoes: {name: "wshoes", level: 9},
        gloves: {name: "wgloves", level: 8}
    },
    loot: {
        helmet: {name: "wcap", level: 9},
        chest: {name: "wattire", level: 8},
        pants: {name: "wbreeches", level: 8},
        shoes: {name: "wshoes", level: 9},
        gloves: {name: "handofmidas", level: 4}
    }
}

export var aRanDonDon: ItemsConfig = {
    mass_mainhand: {name: "pouchbow", level: 11},
    mass_offhand: {name: "alloyquiver" as ItemName, level: 8},
    solo_mainhand: {name: "crossbow", level: 7},
    solo_offhand: {name: "t2quiver", level: 8},
    elixir: "pumpkinspice"
}

export var aRogDonDon: ItemsConfig = {
    elixir: "pumpkinspice"
}
