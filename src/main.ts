import {Game, CharacterType, PingCompensatedCharacter} from "alclient"
import { WarriorsAttackStrategy } from "./classes_logic/warriors_attack_strategy"
import { PriestsAttackStrategy } from "./classes_logic/priests_attack_strategy"
import { RangerAttackStrategy } from "./classes_logic/ranger_attack_strategy"
import { MageAttackStrategy } from "./classes_logic/mage_attack_strategy"
import { RogueAttackStrategy } from "./classes_logic/rogue_attack_strategy"
import { MerchantStrategy } from "./classes_logic/merchant_strategy"
import { MemoryStorage } from "./common_functions/memory_storage"


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
    warrior: { start: Game.startWarrior, mainStrategy: WarriorsAttackStrategy},
    ranger: { start: Game.startRanger, mainStrategy: RangerAttackStrategy},
    mage: { start: Game.startMage, mainStrategy: MageAttackStrategy},
    merchant: { start: Game.startMerchant, mainStrategy: MerchantStrategy},
    priest: { start: Game.startPriest, mainStrategy: PriestsAttackStrategy},
    rogue: { start: Game.startRogue, mainStrategy: RogueAttackStrategy}
}

run()
async function run(){
    await Promise.all([Game.loginJSONFile('credentials.json'), Game.getGData()])

    // let merchant = class_functions.merchant.start("Merchandiser", "EU", "II")
    // active_players.push(merchant)

    let test = await Game.startWarrior("Warious", "EU", "II")
    active_players.push(test)
    let tt = new MemoryStorage(active_players)
    new WarriorsAttackStrategy(test, tt)

    for(const char of ["Warious", "Archealer", "aRanDonDon", "MerchanDiser"]) {
        let runner = await class_functions[my_characters.get(char)].start(char, "EU", "II")
        active_players.push(runner)
    }

    active_players.forEach( (e) => {
        new class_functions[e.ctype].mainStrategy(e)
    })
}