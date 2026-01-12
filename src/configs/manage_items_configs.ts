import {ItemName, ItemData} from "alclient"

/// MANAGE ITEMS SECTION ///

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
	'cupid',

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
	"sword",
	'sstinger',

	//heavy useless
	'hboots',
	'hgloves',
	// 'cape'
	//shields
	// 'mshield'
]

export const DISMANTLE_ITEMS: ItemName[] = [
	'firebow', 
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
    ["angelwings", { level: 6 }],
    ["cape", { level: 7 }],
    ["sshield", { level: 8 }],
    ["mshield", { level: 6 }],
    ["wbreeches", { level: 8 }],

    // Darkforge set
    ["xhelmet", { level: 3, primlingAt: 0 }],
    ["xarmor", { level: 3, primlingAt: 0 }],
    ["xpants", { level: 3, primlingAt: 0 }],

    ["firestaff", { level: 8, primlingAt: 7, shouldBeShiny: true, scrollUpAt: 5 }],
    ["fireblade", { level: 8, primlingAt: 7 }],

    ["harbringer", { level: 7 }],
    ["oozingterror", { level: 6 }],


    // Halloween
    ["ololipop", { level: 8, primlingAt: 6, scrollUpAt: 3, shouldBeShiny: true }],
    ["glolipop", { level: 8, primlingAt: 6, scrollUpAt: 3 }],

    // Bunny stuff
    ["ecape", { level: 7, scrollUpAt: 5 }],
    ["pinkie", { level: 7 }],
    ["eslippers", { level: 7, scrollUpAt: 5 }],

    ["wingedboots", { level: 7, scrollUpAt: 5 }],
    ["lmace", { level: 3, primlingAt: 0 }],
    ["handofmidas", { level: 5 }],
    ["bataxe", { level: 8, scrollUpAt: 4, primlingAt: 4, offeringAt: 6, shouldBeShiny: true }],

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
    ["dexamulet", { level: 4, primlingAt: 3 }],


    ["t2stramulet", { level: 3, primlingAt: 2 }],
    ["t2intamulet", { level: 3, primlingAt: 2 }],
    ["t2dexamulet", { level: 3, primlingAt: 2 }],

    // Belts
    ["intbelt", { level: 4, offeringAt: 3 }],
    ["strbelt", { level: 4, offeringAt: 3 }],
    ["dexbelt", { level: 4, offeringAt: 3 }],

    ["crossbow", { level: 5, primlingAt: 3, scrollUpAt: 4 }],

    // Orbs
    ["orbg", { level: 3 }],
    ["jacko", { level: 3 }],
    ["orbofdex", { level: 4, scrollUpAt: 2, offeringAt: 3 }],
    ["orbofstr", { level: 4, scrollUpAt: 2, offeringAt: 3 }]
]);

