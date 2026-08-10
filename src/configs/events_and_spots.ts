import { IPosition, MapName, MonsterName } from "alclient";

export type BossSpot = {
    name: string,
    location: IPosition
}

/** April–September inclusive (JS month: 0 = Jan) */
export const CRYPT_SEASON_MONTHS = [3, 4, 5, 6, 7, 8]

export const CRYPT_BLACKLIST: MonsterName[] = ["a4"]
/** Don't use mass weapons/skills if a blacklisted mob is within this of the focus target */
export const CRYPT_MASS_BLACKLIST_RANGE = 100
/** Don't cleave if a blacklisted mob is within this of the warrior */
export const CRYPT_CLEAVE_BLACKLIST_RANGE = 300

/**
 * Crypt is considered cleared when these bosses that spawned are dead.
 * (Not every crypt spawns all of them — only ones seen must be killed.)
 * a2/a3/a7: level 1–2; vbat: any level.
 */
export const CRYPT_WANTED_MONSTERS: MonsterName[] = ["vbat", "a3", "a2", "a7"]
/** Inclusive min/max level for non-vbat wanted bosses */
export const CRYPT_WANTED_LEVEL_MIN = 1
export const CRYPT_WANTED_LEVEL_MAX = 2
/** @deprecated use CRYPT_WANTED_LEVEL_MIN/MAX */
export const CRYPT_WANTED_LEVEL = CRYPT_WANTED_LEVEL_MIN

/**
 * After opening a crypt, wait this long before sending the party so some mobs
 * can level up to 2.
 */
export const CRYPT_LEVEL_UP_WAIT_MS = 3 * 60 * 60 * 1000

export function isCryptWantedMonster(entity: { type?: string; level?: number } | null | undefined): boolean {
    if (!entity?.type) return false
    if (!CRYPT_WANTED_MONSTERS.includes(entity.type as MonsterName)) return false
    if (entity.type === "vbat") return true
    const level = entity.level ?? 0
    return level >= CRYPT_WANTED_LEVEL_MIN && level <= CRYPT_WANTED_LEVEL_MAX
}

/** Walkable rally near crypt entrance (old 200,-885 is unwalkable). */
export const CRYPT_ENTRANCE: IPosition = { map: "crypt", x: 200, y: -1080 }

/** Door to crypt is on cave (requires cryptkey). From G.maps.cave.doors */
export const CRYPT_DOOR: IPosition = { map: "cave", x: -192, y: -1308 }

/** Route after rally at CRYPT_ENTRANCE (entrance is not a route step). */
export const CRYPT_ROUTE: IPosition[] = [
    { map: "crypt", x: 700, y: -1080 },
    { map: "crypt", x: 900, y: -600 },
    { map: "crypt", x: 1450, y: -850 },
    { map: "crypt", x: 2750, y: -660 },
    { map: "crypt", x: 2450, y: 400 },
    { map: "crypt", x: 2740, y: -1090 },
    { map: "crypt", x: 1780, y: -1500 },
    { map: "crypt", x: 370, y: -1080 }
]

export const CRYPT_PARTY_WAIT_RANGE = 450
/** Follow party leader / priest if farther than this */
export const CRYPT_FOLLOW_RANGE = 175
/** Detect mobs to approach; combat pause only when in attack range */
export const CRYPT_MOB_DETECT_RANGE = 450
/** Close enough to stop moving toward a waypoint */
export const CRYPT_WAYPOINT_ARRIVE_RANGE = 120
/** Close enough to count as "at waypoint" for party advance */
export const CRYPT_WAYPOINT_SYNC_RANGE = 250
/** Ally must be within this to count as "nearby" for overheal scare escape */
export const CRYPT_ALLY_NEAR_RANGE = 300
/** Untagged mobs within this of the focus count as one pull pack */
export const CRYPT_PULL_PACK_RANGE = 140
/**
 * Pack is fine to take together if pack DPS / tank HPS is below this.
 * Evaluated on tank (+ nearby priest heal), not on squishy DPS bots.
 */
export const CRYPT_SAFE_PULL_RATIO = 1.05
/** Scare+flee if pack already on us exceeds this vs tank HPS */
export const CRYPT_OVERWHELM_RATIO = 1.25
/** Only separate dangerous packs; easy clusters are burned together */
export const CRYPT_SEPARATE_RANGE = 180
/** Stay at least this far from non-wanted mobs while pathing the route */
export const CRYPT_AVOID_MOB_RANGE = 90
/** Priest zap-pull approach distance (zapperzap is long-range) */
export const CRYPT_PRIEST_PULL_RANGE = 250

/** Kite away from these (high-damage auras / portal). Not dampening/curse — those pull bots to entrance. */
export const CRYPT_KITE_ABILITIES = ["portal", "weakness_aura"] as const

export const WANTED_EVENTS: { [T in MonsterName|MapName]?: { monsters: MonsterName[], wantedOnOtherServer?: boolean, join?: boolean}} = {
    dragold: { monsters: ["dragold"], wantedOnOtherServer: true },
    icegolem: { monsters: ["icegolem"], join: true },
    franky: { monsters: ["franky","nerfedmummy"], wantedOnOtherServer: true },
    mrgreen: { monsters: ["mrgreen"], wantedOnOtherServer: true },
    mrpumpkin: { monsters: ["mrpumpkin"], wantedOnOtherServer: true },
    crabxx: { monsters: ["crabxx"], wantedOnOtherServer: true },
    snowman: { monsters: ["snowman"] },
    grinch: { monsters: ["grinch"] },
    goobrawl: { monsters: ["bgoo", "rgoo"], join: true } 
}

export const BOSS_CHECK_ROUTE: BossSpot[] = [
	{name: "phoenix", location: {map: "main", x: -1184, y: 784}},
	{name: "phoenix", location: {map: "main", x: 641, y: 1803}},
	{name: "phoenix", location: {map: "main", x: 1188, y: -193}},
	{name: "phoenix", location: {map: "halloween", x: 8, y: 631}},
	{name: "greenjr", location: {map: "halloween", x: -569, y: -412}},
	{name: "fvampire", location: {map: "halloween", x: -406, y: -1643}},
	{name: "phoenix", location: {map: "cave", x: -181, y: -1164}},
	{name: "mvampire", location: {map: "cave", x: -181, y: -1164}},
	{name: "mvampire", location: {map: "cave", x: 1244, y: -23}},
	{name: "jr", location: {map: "spookytown", x: -784, y: -301}},
	{name: "stompy", location: {map: "winterland", x: 400, y: -2600}},
	{name: "skeletor", location: {map: "arena", x: 247, y: -558}}
]
export const SPECIAL_MONSTERS: MonsterName[] = [
	// Noraml monsters
	"crabxx",
	"cutebee",
	"dragold",
	"fvampire",
	"franky",
	"gbluepro",
	"ggreenpro",
	"goldenbat",
	"goldenbot",
	"gredpro",
	"gpurplepro",
	"greenjr",
	"grinch",
	"harpy",
	"icegolem",
	"jr",
	"mrgreen",
	"mrpumpkin",
	"mvampire",
	"phoenix",
	"pinkgoo",
	"rharpy",
	"rudolph",
	"skeletor",
	"slenderman",
	"snowman",
	"spiderbl",
	"spiderbr",
	"spiderr",
	"stompy",
	"tiger",
	// "tinyp",
	"wabbit",
	// Goo Brawl
	"rgoo",
	// Crypt monsters
	"a1",
	"a2",
	"a3",
	"a4",
	"a5",
	"a6",
	"a7",
	"a8",
	"vbat",
	"xmagefi",
	"xmagefz",
	"xmagen",
	"xmagex",
]

export const SPECIAL_ALWAYS_WANTED: MonsterName[] = [
	// Noraml monsters
	"cutebee",
	"goldenbat",
	"goldenbot",
	"rharpy",
	"tiger"
]