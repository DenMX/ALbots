import {Game, CharacterType, PingCompensatedCharacter, Pathfinder, Observer} from "alclient"
import { WarriorsAttackStrategy } from "./classes_logic/warriors_attack_strategy"
import { PriestsAttackStrategy } from "./classes_logic/priests_attack_strategy"
import { RangerAttackStrategy } from "./classes_logic/ranger_attack_strategy"
import { MageAttackStrategy } from "./classes_logic/mage_attack_strategy"
import { RogueAttackStrategy } from "./classes_logic/rogue_attack_strategy"
import { MerchantStrategy } from "./classes_logic/merchant_strategy"
import { MemoryStorage } from "./common_functions/memory_storage"
import { startBotWithStrategy } from "./common_functions/common_functions"
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




run()
async function run(){
    await Promise.all([Game.loginJSONFile("../credentials.json"), Game.getGData()])
    await Pathfinder.prepare(Game.G)

    // let merchant = class_functions.merchant.start("Merchandiser", "EU", "II")
    // active_players.push(merchant)

    
    
    
    // let rogue = await Game.startRogue("frostyRogue", "EU", "II")
    // let mage = await Game.startMage("frostyMage", "EU", "II")
        
    let memoryStorage = new MemoryStorage()
    // PROD READY STEADY
    // let stateList = []

    // let merchant = await Game.startMerchant("frostyMerch","EU", "II")
    // new MerchantStrategy(merchant, memoryStorage)
    // stateList.push(await startBotWithStrategy("merchant", "frostyMerch", "EU", "II", memoryStorage)[1])
    // stateList.push(await startBotWithStrategy("warrior","frostyWar", "EU", "II", memoryStorage)[1])

    // let warrior = await Game.startWarrior("frostyWar", "EU", "II")
    // let warriorState = new WarriorsAttackStrategy(warrior, memoryStorage)
    // stateList.push(warriorState)
    // active_players.push(warrior)
    // active_players.push(priest)
    
    
    // let priest = await Game.startPriest("frostyHeal", "EU", "II")
    // let priestState = new PriestsAttackStrategy(priest, memoryStorage)
    // stateList.push(priestState)
    
    // let ranger = await Game.startRanger("frostyRan", "EU", "II")
    // let rangerState = new RangerAttackStrategy(ranger, memoryStorage)
    // stateList.push(rangerState)
    
    // stateList.push(new RogueAttackStrategy(rogue, memoryStorage))
    // stateList.push(new MageAttackStrategy(mage, memoryStorage))
    
    
    
    
    let stateController = new StateController([
        await startBotWithStrategy("merchant", "frostyMerch", "EU", "II", memoryStorage),
        await startBotWithStrategy("warrior","frostyWar", "EU", "II", memoryStorage),
        await startBotWithStrategy("ranger","frostyRan", "EU", "II", memoryStorage),
        await startBotWithStrategy("priest","frostyHeal", "EU", "II", memoryStorage)
    ], memoryStorage)
    memoryStorage.setStateController = stateController
    new BWIReporter(stateController)


}
