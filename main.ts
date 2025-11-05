import * as ALClient from "alclient"
import { WarriorsAttackStrategy } from "./classes_logic/warriors_attack_strategy"
import { PriestsAttackStrategy } from "./classes_logic/priests_attack_strategy"
import { RangerAttackStrategy } from "./classes_logic/ranger_attack_strategy"
import { MageAttackStrategy } from "./classes_logic/mage_attack_strategy"


var active_players = []

const my_characters = {
    Warious: {name: "Warious", class: "warrior"},
    arMAGEdon: {name: "arMAGEdon", class: "mage"},
    Archealer: {name: "Archealer", class: "priest"},
    DonWar: {name: "DonWar", class: "warrior"},
    Merchandiser: {name: "Merchandiser", class: "merchant"},
    aRanDonDon: {name: "aRanDonDon", class: "ranger"},
    RangerOver: {name: "RangerOver", class: "ranger"},
    aRogDonDon: {name: "aRogDonDon", class: "rogue"}
}

var class_functions = {
    warrior: { start: ALClient.Game.startWarrior, attackStrategy: WarriorsAttackStrategy},
    ranger: { start: ALClient.Game.startRanger, attackStrategy: RangerAttackStrategy},
    mage: { start: ALClient.Game.startMage, attackStrategy: MageAttackStrategy},
    merchant: { start: ALClient.Game.startMerchant, },
    priest: { start: ALClient.Game.startPriest, attackStrategy: PriestsAttackStrategy},
    rogue: { start: ALClient.Game.startRogue, }
}

run()
async function run(){
    await Promise.all([ALClient.Game.loginJSONFile('credentials.json'), ALClient.Game.getGData()])

    let merchant = class_functions.merchant.start("Merchandiser", "US", "III")
    active_players.push(merchant)
}