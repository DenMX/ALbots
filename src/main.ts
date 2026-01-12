import {Game, CharacterType, PingCompensatedCharacter, Pathfinder, Observer} from "alclient"
import { WarriorsAttackStrategy } from "./classes_logic/warriors_attack_strategy"
// import { WarriorsTestStrategy } from "./classes_logic/warriors_attack_strategy"
import { PriestsAttackStrategy } from "./classes_logic/priests_attack_strategy"
import { RangerAttackStrategy } from "./classes_logic/ranger_attack_strategy"
import { MageAttackStrategy } from "./classes_logic/mage_attack_strategy"
import { RogueAttackStrategy } from "./classes_logic/rogue_attack_strategy"
import { MerchantStrategy } from "./classes_logic/merchant_strategy"
import { MemoryStorage } from "./common_functions/memory_storage"
import { BWIReporter } from "./bwi_reporter"
import { StateController } from "./controllers/state_controller"


var active_players: PingCompensatedCharacter[] = []

export const my_characters: Map<string, CharacterType> = new Map([
    ["Warious", "warrior"],
    ["arMAGEdon", "mage"],
    ["Archealer", "priest"],
    ["DonWar", "warrior"],
    ["Merchandiser", "merchant"],
    ["aRanDonDon", "ranger"],
    ["RangerOver", "ranger"],
    ["aRogDonDon", "rogue"],
    ["RogerThat", "rogue"]
])


var class_functions = {
    // warrior: { start: Game.startWarrior, mainStrategy: WarriorsAttackStrategy},
    ranger: { start: Game.startRanger, mainStrategy: RangerAttackStrategy},
    mage: { start: Game.startMage, mainStrategy: MageAttackStrategy},
    merchant: { start: Game.startMerchant, mainStrategy: MerchantStrategy},
    priest: { start: Game.startPriest, mainStrategy: PriestsAttackStrategy},
    rogue: { start: Game.startRogue, mainStrategy: RogueAttackStrategy}
}

run()
async function run(){
    await Promise.all([Game.loginJSONFile("../credentials.json"), Game.getGData()])
    await Pathfinder.prepare(Game.G)

    // let merchant = class_functions.merchant.start("Merchandiser", "EU", "II")
    // active_players.push(merchant)

    // let merchant = await Game.startMerchant("frostyMerch","EU", "II")
    // let priest = await Game.startPriest("frostyHeal", "EU", "II")
    
    let ranger = await Game.startRanger("frostyRan", "EU", "II")
    
    // active_players.push(merchant)
    // active_players.push(priest)
    
    active_players.push(ranger)
    
    // console.log(`Warrior created: ${warrior.name}`)
    // console.log("Smart moving to snowman")
    // await warrior.smartMove(warrior.S.snowman || "main")
    // console.log("Smart moved to goo")
    // console.log(`Current target: ${warrior.target}`)
    // warrior.target = warrior.getEntities({withinRange: "cleave"})[0].id
    // console.log(`Got target: ${warrior.target}`)


    // PROD READY STEADY
    let stateList = []

    // let warrior = await Game.startWarrior("frostyWar", "EU", "II")
    // active_players.push(warrior)
    // active_players.push(priest)
    
    let memoryStorage = new MemoryStorage(active_players)
    // stateList.push(new PriestsAttackStrategy(priest, memoryStorage))
    // stateList.push(new WarriorsAttackStrategy(warrior, memoryStorage))
    stateList.push(new RangerAttackStrategy(ranger, memoryStorage))
    // new MerchantStrategy(merchant, memoryStorage)
    let stateController = new StateController(stateList)
    let bwi = new BWIReporter(active_players)

}
