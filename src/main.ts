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
import { startCursorUI } from "./cursor-ui/server"


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

let bwiReporter
const CURSOR_UI_PORT = Number(process.env.CURSOR_UI_PORT) || 3001

run()
async function run(){
    await Promise.all([Game.loginJSONFile("./credentials.json"), Game.getGData()])
    await Pathfinder.prepare(Game.G)
        
    let memoryStorage = new MemoryStorage()
    // PROD READY STEADY
    
    let stateController = new StateController([
        await startBotWithStrategy("merchant", "frostyMerch", "EU", "II", memoryStorage),
        await startBotWithStrategy("warrior","frostyWar", "EU", "II", memoryStorage),
        await startBotWithStrategy("ranger","frostyRan", "EU", "II", memoryStorage),
        await startBotWithStrategy("priest","frostyHeal", "EU", "II", memoryStorage)
    ], memoryStorage)
    memoryStorage.setStateController = stateController
    // bwiReporter = new BWIReporter(stateController, 924, 3000);
    startCursorUI(stateController, CURSOR_UI_PORT);
}

// Немедленный выход по Ctrl+C без запроса "Завершить выполнение пакетного файла" в Windows
process.on('SIGINT', () => {
    if (bwiReporter && typeof bwiReporter.destroy === 'function') {
        try { bwiReporter.destroy(); } catch (_) {}
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (bwiReporter && typeof bwiReporter.destroy === 'function') {
        try { bwiReporter.destroy(); } catch (_) {}
    }
    process.exit(0);
});