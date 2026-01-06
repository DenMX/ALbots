import {ItemName } from "alclient"

export const DONT_SEND_ITEMS = [
    "tracker", 
    "computer", 
    "supercomputer", 
    "xptome",
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
        cleave: {name: "bataxe", level: 8},
        stomp: {name: "basher", level: 8},
        mass_mainhand: {name: "ololipop", level: 9},
        mass_offhand: {name: "ololipop", level: 9},
        solo_mainhand: {name: "candycanesword", level: 9},
        solo_offhand: {name: "fireblade", level: 9},
        elixir: "pumpkinspice",
        main_orb: {name: "orbofstr", level: 3},
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

export const DO_NOT_EXCHANGE: ItemName[] = [
    "lostearring",
    "goldenegg",
    "cosmo0",
    "cosmo1",
    "cosmo2",
    "cosmo3",
    "cosmo4"
]

export type UpgradeConfig = {
    level: number,
    primlingAt?: number,
    scrollUpAt?: number,
    offeringAt?: number,
    shouldBeShiny?: boolean
}

export const MERCHANT_UPGRADE: Map<ItemName, UpgradeConfig> = new Map<ItemName, UpgradeConfig>([
    // --- UPGRADE SECTION --- \\
    ["staff", { level: 8 }],
    ["angelwings", { level: 6 }],
    ["cape", { level: 7 }],
    ["sshield", { level: 8 }],
    ["mshield", { level: 6 }],
    ["wbreeches", { level: 8 }],

    // Darkforge set
    ["xhelmet", { level: 3, primlingAt: 0 }],
    ["xarmor", { level: 3, primlingAt: 0 }],
    ["xpants", { level: 3, primlingAt: 0 }],

    ["firestaff", { level: 8, primlingAt: 7 }],
    ["fireblade", { level: 8, primlingAt: 7 }],

    ["harbringer", { level: 7 }],
    ["oozingterror", { level: 6 }],


    // Halloween
    ["ololipop", { level: 8, primlingAt: 6, scrollUpAt: 3 }],
    ["glolipop", { level: 8, primlingAt: 6, scrollUpAt: 3 }],

    // Bunny stuff
    ["ecape", { level: 7, scrollUpAt: 5 }],
    ["pinkie", { level: 7 }],
    ["eslippers", { level: 7, scrollUpAt: 5 }],

    ["wingedboots", { level: 7, scrollUpAt: 5 }],
    ["lmace", { level: 3, primlingAt: 0 }],
    ["handofmidas", { level: 5 }],
    ["bataxe", { level: 8, scrollUpAt: 4, primlingAt: 4, offeringAt: 6 }],

    // Winter holidays
    ["gcape", { level: 7 }],
    ["mittens", { level: 8, scrollUpAt: 6 }],
    ["ornamentstaff", { level: 8, scrollUpAt: 6 }],
    ["supermittens", { level: 3, primlingAt: 0 }],

    // --- COMPOUND SECTION --- \\
    // Offhands
    ["wbookhs", { level: 3, primlingAt: 1 }],

    // Earrings
    ["strearring", { level: 4, primlingAt: 2, scrollUpAt: 1 }],
    ["intearring", { level: 4, primlingAt: 2, scrollUpAt: 1 }],
    ["dexearring", { level: 4, primlingAt: 2, scrollUpAt: 1 }],
    ["lostearring", { level: 2 }],

    // Rings
    ["strring", { level: 4, primlingAt: 3 }],
    ["intring", { level: 4, primlingAt: 3 }],
    ["dexring", { level: 4, primlingAt: 3 }],

    // Amulets
    ["intamulet", { level: 4, primlingAt: 3 }],
    ["stramulet", { level: 4, primlingAt: 3 }],


    ["t2stramulet", { level: 3, primlingAt: 2 }],
    ["t2intamulet", { level: 3, primlingAt: 2 }],
    ["t2dexamulet", { level: 3, primlingAt: 2 }],

    // Belts
    ["intbelt", { level: 4, offeringAt: 3 }],
    ["strbelt", { level: 4, offeringAt: 3 }],

    ["crossbow", { level: 5, primlingAt: 3, scrollUpAt: 4 }],

    // Orbs
    ["orbg", { level: 3 }],
    ["jacko", { level: 3 }]
]);

