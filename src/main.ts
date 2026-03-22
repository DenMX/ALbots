import {Game, CharacterType, PingCompensatedCharacter, Pathfinder, Observer} from "alclient"
import { MemoryStorage } from "./common_functions/memory_storage"
import { startBotWithStrategy } from "./common_functions/common_functions"
import { StateController } from "./controllers/state_controller"
import { startCursorUI } from "./cursor-ui/server"


var active_players: PingCompensatedCharacter[] = []



let bwiReporter
const CURSOR_UI_PORT = Number(process.env.CURSOR_UI_PORT) || 3001

run()
async function run(){
    // await Promise.all([Game.loginJSONFile("./frosty-credentials.json", true), Game.getGData()])
    await Promise.all([Game.loginJSONFile("./credentials.json", true), Game.getGData()])
    await Pathfinder.prepare(Game.G)
        
    let memoryStorage = new MemoryStorage()
    // PROD READY STEADY
    
    // let stateController = new StateController([
    //     await startBotWithStrategy("merchant", "frostyMerch", "US", "III", memoryStorage),
    //     await startBotWithStrategy("rogue","frostyRogue2", "US", "III", memoryStorage),
    //     await startBotWithStrategy("mage","frostyMage", "US", "III", memoryStorage),
    //     // await startBotWithStrategy("ranger","frostyRan", "ASIA", "I", memoryStorage),
    //     await startBotWithStrategy("priest","frostyHeal", "US", "III", memoryStorage)
    // ], memoryStorage)


    let stateController = new StateController([
        await startBotWithStrategy("merchant", "MerchanDiser", "ASIA", "I", memoryStorage),
        await startBotWithStrategy("warrior","Warious", "ASIA", "I", memoryStorage),
        await startBotWithStrategy("ranger","aRanDonDon", "ASIA", "I", memoryStorage),
        // await startBotWithStrategy("ranger","frostyRan", "ASIA", "I", memoryStorage),
        await startBotWithStrategy("priest","Archealer", "ASIA", "I", memoryStorage)
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