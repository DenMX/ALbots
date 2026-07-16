import {Game, CharacterType, PingCompensatedCharacter, Pathfinder, Observer} from "alclient"
import { MemoryStorage } from "./common_functions/memory_storage"
import { startBotWithStrategy } from "./common_functions/common_functions"
import { StateController } from "./controllers/state_controller"
import { startCursorUI } from "./cursor-ui/server"
import fs from "fs"



const CURSOR_UI_PORT = Number(process.env.CURSOR_UI_PORT) || 3001

function logFatal(kind: string, err: unknown) {
    const msg = `${new Date().toISOString()} ${kind}:\n${err}\n`
    console.error(msg)
    try {
        fs.appendFileSync("crush.log", msg)
    } catch {
        /* ignore log write errors */
    }
}

process.on("unhandledRejection", (reason) => logFatal("Unhandled rejection", reason))
process.on("uncaughtException", (err) => logFatal("Uncaught exception", err))

run()
async function run(){
    try {
        await Promise.all([Game.loginJSONFile("./credentials.json", true), Game.getGData()])
        await Pathfinder.prepare(Game.G)
            
        let memoryStorage = new MemoryStorage()

        let stateController = new StateController([
            // await startBotWithStrategy("merchant", "MerchanDiser", "ASIA", "I", memoryStorage),
        ], memoryStorage)
        memoryStorage.setStateController = stateController
        startCursorUI(stateController, CURSOR_UI_PORT);
    }
    catch(ex) {
        fs.appendFileSync("crush.log", `${new Date().toLocaleString()} Client should failed:\n${ex}\n`)
    }
}
