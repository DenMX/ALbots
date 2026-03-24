import { IPosition, MapName, MonsterName } from "alclient";

export type BossSpot = {
    name: string,
    location: IPosition
}

export const WANTED_EVENTS: { [T in MonsterName|MapName]?: { monsters: MonsterName[], wantedOnOtherServer?: boolean}} = {
    dragold: { monsters: ["dragold"], wantedOnOtherServer: true },
    icegolem: { monsters: ["icegolem"] },
    franky: { monsters: ["franky","nerfedmummy"], wantedOnOtherServer: true },
    mrgreen: { monsters: ["mrgreen"], wantedOnOtherServer: true },
    mrpumpkin: { monsters: ["mrpumpkin"], wantedOnOtherServer: true },
    crabxx: { monsters: ["crabxx"], wantedOnOtherServer: true },
    snowman: { monsters: ["snowman"] },
    grinch: { monsters: ["grinch"] },
    goobrawl: { monsters: ["bgoo", "rgoo"], wantedOnOtherServer: true } 
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