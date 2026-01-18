import { MapName, MonsterName } from "alclient";

export const WANTED_EVENTS: Map<MonsterName|MapName,MonsterName[]> = new Map([
    ["dragold", ["dragold"]],
    ["icegolem",["icegolem"]],
    ["franky",["franky","nerfedmummy"]],
    ["mrgreen",["mrgreen"]],
    ["mrpumpkin",["mrpumpkin"]],
    ["crabxx",["crabxx", "crabx"]],
    ["snowman",["snowman"]],
    ["grinch",["grinch"]],
    ["goobrawl",["bgoo", "rgoo"]]    
])