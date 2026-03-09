import {ItemName} from "alclient"


//POTS
export const MPOTS_CAP = 9000
export const HPOTS_CAP = 1000

export const SCROLLS_CAP: Map<ItemName,number> = new Map([
        ["scroll0", 100],
        ["scroll1", 25],
        ["scroll2", 5],
        ["cscroll0", 75],
        ["cscroll1", 20],
        ["cscroll2", 2]
    ])

export const DONT_SEND_ITEMS: ItemName[] = [
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

export const MERCHANT_KEEP_ITEMS: ItemName[] = [
    "scroll0",
    "scroll1",
    "scroll2",
    "cscroll0",
    "cscroll1",
    "cscroll2",
    "offering",
    "offeringp",
    "rod",
    "pickaxe"
]

export const DO_NOT_EXCHANGE: ItemName[] = [
    "lostearring",
    "goldenegg",
    "cosmo0",
    "cosmo1",
    "cosmo2",
    "cosmo3",
    "cosmo4"
]

export const ITEMS_TO_SELL: ItemName[] = [
    //materials
	'frogt', 
	'xmashat',
	'pstem', 
	'poison', 
	'smush',
	'smoke', 
	'ink',
	'snowball',
	'dstones',
	'spores',
    'sstinger',
    'firecrackers',
    'rfangs',
    'bcandle',
    'bandages',
    'xmace',

	//Elexirs
	'elixirvit0', 
	'elixirvit1', 
	'elixirvit2', 
	'elixirstr0',
	'elixirstr1',
	'elixirstr2',
	'elixirdex0',
	'elixirdex1',
	'elixirdex2',
	'elixirint0',
	'elixirint1',
	'elixirint2',
	'eggnog',
	'emptyjar',
	'rattail',
	'wbook0',

	//xmass set
	'rednose',
	'iceskates',
	'xmasshoes',
	'xmassweater',
	'warmscarf',
	'merry',

	//Jewelery
	'hpamulet',
	'hpbelt',
	'vitearring',
	'vitring',
	'ringsj',

	//scrolls
	'vitscroll',
	'forscroll',

	//begginers shit
	'stinger',
	'slimestaff',
	'gloves',
	'shoes',
	'pclaw',

	//beginners set
	'helmet',
	'gloves',
	'shoes',
	'quiver',

	//Rugged set
	'helmet1',
	'pants1',
	'gloves1',
	'shoes1',
	'coat1',

	//useless weapons
	'dagger',
	'hotchocolate',
	'throwingstars',
	'carrotsword',
	'spear',
	'swifty',
	'phelmet',
	"sword",
	'sstinger',
	'hammer',

	//halloween
	'gphelmet',
	'skullamulet',

	//weapon of dead
	'pmaceofthedead',
	'swordofthedead',
	'staffofthedead',
	'daggerofthedead',
	'maceofthedead',
	'bowofthedead',

	//heavy set
	'harmor',
	'hhelmet',
	'hpants',
	
	'hboots',
	'hgloves',
    "mcape",

    //trash weapon
    "t2bow"
    
]

export const DISMANTLE_ITEMS: ItemName[] = [
	// 'firebow', 
	// 'lostearring',
    'goldenegg'
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
    ["angelwings", { level: 8, scrollUpAt: 4, offeringAt: 6}],
    
    // Shields
    ["sshield", { level: 8 }],
    ["mshield", { level: 9, primlingAt: 7, offeringAt: 8 }],
    ["shield", {level: 9, scrollUpAt: 6}],
    
    ["rapier", { level: 8, scrollUpAt: 4, primlingAt: 7}],

    //wanderer set
    ["wbreeches", { level: 9, scrollUpAt: 8 }],
    ["wcap", { level: 9, scrollUpAt: 8}],
    ["wattire", { level: 9, scrollUpAt: 8}],
    ["wgloves", { level: 9, scrollUpAt: 8}],
    ["wshoes", { level: 9, scrollUpAt: 8}],

    // Darkforge set
    ["xhelmet", { level: 3, primlingAt: 0 }],
    ["xarmor", { level: 3, primlingAt: 0 }],
    ["xpants", { level: 3, primlingAt: 0 }],

    // Weapons
    ["firestaff", { level: 8, primlingAt: 7, scrollUpAt: 5 }],
    ["fireblade", { level: 8, primlingAt: 7, scrollUpAt: 5 }],
    ["firebow", { level: 8, primlingAt: 7, scrollUpAt: 5}],
    ["crossbow", { level: 8, primlingAt: 4, scrollUpAt: 4, offeringAt: 5 }],
    ["harbringer", { level: 7 }],
    ["oozingterror", { level: 6 }],
    ["basher", {level: 7, primlingAt: 7}],
    ["cclaw", {level: 9, scrollUpAt: 5, offeringAt: 8}],
    ["cupid", {level: 8, scrollUpAt: 4, primlingAt: 5, offeringAt: 7}],
    ["pmace", {level: 9, scrollUpAt: 4, primlingAt: 6, offeringAt: 8}],
    

    // Halloween
    ["ololipop", { level: 8, primlingAt: 6, scrollUpAt: 3, shouldBeShiny: true }],
    ["glolipop", { level: 8, scrollUpAt: 3 }],


    // Capes
    ["cape", { level: 7 }],
    ["horsecapeg", {level: 7, primlingAt: 5}],

    // Bunny stuff
    ["ecape", { level: 7, scrollUpAt: 5 }],
    ["pinkie", { level: 7 }],
    ["eslippers", { level: 7, scrollUpAt: 5 }],

    ["wingedboots", { level: 7, scrollUpAt: 5 }],
    ["lmace", { level: 8, primlingAt: 0, offeringAt: 3 }],
    ["handofmidas", { level: 5, primlingAt: 3 }],
    ["bataxe", { level: 8, scrollUpAt: 4, primlingAt: 4, offeringAt: 6, shouldBeShiny: true }],

    // Winter holidays
    ["gcape", { level: 7 }],
    ["mittens", { level: 9, scrollUpAt: 6, offeringAt: 8 }],
    ["ornamentstaff", { level: 9, scrollUpAt: 6, offeringAt: 8 }],
    ["supermittens", { level: 7, primlingAt: 0, offeringAt: 3 }],
    ["xmaspants", { level: 9, scrollUpAt: 6, primlingAt: 8 }],

    ["frankypants", { level: 9, primlingAt: 7, offeringAt: 8 }],

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
    ["dexamulet", { level: 4, primlingAt: 3 }],


    ["t2stramulet", { level: 3, primlingAt: 2 }],
    ["t2intamulet", { level: 3, primlingAt: 2 }],
    ["t2dexamulet", { level: 3, primlingAt: 2 }],

    // Belts
    ["intbelt", { level: 4, offeringAt: 3 }],
    ["strbelt", { level: 4, offeringAt: 3 }],
    ["dexbelt", { level: 4, offeringAt: 3 }],

    

    // Orbs
    ["orbg", { level: 3 }],
    ["jacko", { level: 3 }],
    ["orbofdex", { level: 4, scrollUpAt: 2, offeringAt: 3 }],
    ["orbofstr", { level: 4, scrollUpAt: 2, offeringAt: 3 }]
]);

