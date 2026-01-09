import {Item, ItemName, BankInfo, PingCompensatedCharacter, Tools, Constants, Game, BankPackName, LocateItemFilters} from "alclient"
import * as ItemsConfig from "../classes_configs/items"
import { ResuplyStrategy } from "./resupply_strategy"
import { MemoryStorage } from "./memory_storage"


export type PackItems = [BankPackName, number[]]
export type BankItems = PackItems[]
export type BankItemPosition = [BankPackName, number]

export type UpgradeItem = {
    itemName: ItemName,
    level: number,
    slots: BankItemPosition[]
}
export type UpgradeItems = {
    upgrade?: UpgradeItem[]
    compound?: UpgradeItem[]
}

const sortByPackNumberAsc = (a: PackItems, b: PackItems) => {
        const matchA = /^items(\d+)$/.exec(a[0])
        const numA = Number.parseInt(matchA[1])
        const matchB = /^items(\d+)$/.exec(b[0])
        const numB = Number.parseInt(matchB[1])

        // Sort packs by lower indexes first
        return numA - numB
    }

export class ManageItems extends ResuplyStrategy {


    private SHINY_GRADE: Map<number,string[]> = new Map([
        [0, ["bronzeingot","goldnugget"]],
        [1, ["goldingot", "platinumnugget"]],
        [2, ["platinumingot"]]
    ])

    

    constructor (bot: PingCompensatedCharacter, memoryStorage: MemoryStorage){
        super(bot, memoryStorage)
    }

    

    protected async upgradeItems() {
        if(!super.getBot.locateItem(["computer", "supercomputer"]) && Tools.distance(super.getBot, {x: -203, y: -115, map: "main"})>Constants.NPC_INTERACTION_DISTANCE) return

        level: for(let lvl = 0; lvl < 9; lvl++){
            for(const [slot,item] of super.getBot.getItems()) {
                if(!item) continue
                if(!Game.G.items[item.name].upgrade || !ItemsConfig.MERCHANT_UPGRADE.has(item.name)) continue
                let itemConfig = ItemsConfig.MERCHANT_UPGRADE.get(item.name)
                if(item.level != lvl || item.level>= itemConfig.level) continue
                if(item.level == 0 && itemConfig.shouldBeShiny && item.p != "shiny") continue
                if(itemConfig.offeringAt >= item.level) {
                    if(!super.getBot.locateItem("offering", super.getBot.items) && super.getBot.gold > 500000000 && super.getBot.esize>0) await super.getBot.buy("offering")
                    if(!super.getBot.locateItem("offering", super.getBot.items)) continue
                }
                if(itemConfig.primlingAt >= item.level && (!itemConfig.offeringAt || itemConfig.offeringAt < item.level) && !super.getBot.locateItem("offeringp", super.getBot.items)) continue

                let primling
                if(itemConfig.offeringAt >= item.level) {
                    primling = super.getBot.locateItem("offering", super.getBot.items)
                }
                else if(itemConfig.primlingAt >= item.level) {
                    primling = super.getBot.locateItem("offeringp", super.getBot.items)
                }
                let scroll_grade = item.calculateGrade()
                scroll_grade = (itemConfig.scrollUpAt>= item.level && scroll_grade<2) ? scroll_grade+1 : scroll_grade
                let scroll_name = `scroll${scroll_grade}` as ItemName
                let scroll_idx = super.getBot.locateItem(scroll_name, super.getBot.items)
                if(!scroll_idx && scroll_idx<3 && super.getBot.esize>0 && super.getBot.gold > Game.G.items[scroll_name].g) {
                    await super.getBot.buy(scroll_name)
                }

                scroll_idx = super.getBot.locateItem(scroll_name, super.getBot.items)
                if(!scroll_idx) continue
                await super.getBot.upgrade(slot, scroll_idx, primling)
            }
        }
    }

    protected async compoundItems() {
        if(!super.getBot.locateItem(["computer", "supercomputer"]) && Tools.distance(super.getBot, {x: -203, y: -115, map: "main"})>Constants.NPC_INTERACTION_DISTANCE) return

        level: for(let lvl=0; lvl<5; lvl++){
            for(const [, item] of super.getBot.getItems()) {
                if(!item) continue
                if(!Game.G.items[item.name].compound || ! ItemsConfig.MERCHANT_UPGRADE.has(item.name)) continue
                let itemConfig = ItemsConfig.MERCHANT_UPGRADE.get(item.name)
                if(item.level != lvl || item.level>= itemConfig.level) continue
                const items = super.getBot.locateItems(item.name, super.getBot.items, {level: item.level, locked: false})
                if (items.length < 3) continue
                if(itemConfig.offeringAt >= item.level) {
                    if(!super.getBot.locateItem("offering", super.getBot.items) && super.getBot.gold > 500000000 && super.getBot.esize>0) await super.getBot.buy("offering")
                    if(!super.getBot.locateItem("offering", super.getBot.items)) continue
                }
                if(itemConfig.primlingAt >= item.level && (!itemConfig.offeringAt || itemConfig.offeringAt < item.level) && !super.getBot.locateItem("offeringp", super.getBot.items)) continue

                let primling
                if(itemConfig.offeringAt >= item.level) {
                    primling = super.getBot.locateItem("offering", super.getBot.items)
                }
                else if(itemConfig.primlingAt >= item.level) {
                    primling = super.getBot.locateItem("offeringp", super.getBot.items)
                }
                let scroll_grade = item.calculateGrade()
                scroll_grade = (itemConfig.scrollUpAt>= item.level && scroll_grade<2) ? scroll_grade+1 : scroll_grade
                let scroll_name = `scroll${scroll_grade}` as ItemName
                let scroll_idx = super.getBot.locateItem(scroll_name, super.getBot.items)
                if(!scroll_idx && scroll_idx<3 && super.getBot.esize>0 && super.getBot.gold > Game.G.items[scroll_name].g) {
                    await super.getBot.buy(scroll_name)
                }

                scroll_idx = super.getBot.locateItem(scroll_name, super.getBot.items)
                if(!scroll_idx) continue

                await super.getBot.compound(items[0],items[1],items[2], scroll_idx, primling)
                
            }
        }
    }

    protected async exchangeItems() {
        if(super.getBot.esize<1) return
        items: for(const [idx, item] of super.getBot.getItems()) {
            if(!item || ItemsConfig.DO_NOT_EXCHANGE.includes(item.name)) continue
            if(!item.e || item.q < item.e) continue
            for(let q = 0; q< Math.floor(item.e/item.q); q++) {
                if(super.getBot.esize < 1 ) break items;
                await super.getBot.exchange(idx)
            }
        }
    }

    protected async shinyItems() {
        //search for items should be shiny
        //search for resources needs to make shiny ? can we craft needed items?
        //withdraw all from bank while esize > 0
        //shiny
        //super.getBot.upgrade(itm_idx, undefined, ingot_idx)
    }

    protected async storeItems() {
        let bot = super.getBot
        if(!bot.map.startsWith("bank")) return
        if(!bot.bank) console.error("We don't have bank information")

        const emptyBankSlots = this.locateEmptyBankSlots(bot)
        function getEmptySlot(): BankItemPosition {
            if (!emptyBankSlots.length) throw new Error("No empty slots")

            const [bankPackName, emptyIndexes] = emptyBankSlots[0]

            // Get an empty slot from the list
            const emptyIndex = emptyIndexes.shift()

            // Remove the pack if there are no more empty slots
            if (!emptyIndexes.length) emptyBankSlots.shift()

            // Return the empty slot name with the index of an empty spot
            return [bankPackName, emptyIndex]
        }


        for(let i=0 ; i< bot.isize; i++) {
            let item = bot.items[i]
            if(ItemsConfig.DONT_SEND_ITEMS.includes(item.name)) continue
            if(item.l || ItemsConfig.ITEMS_TO_SELL.includes(item.name)) continue
            if(ItemsConfig.DISMANTLE_ITEMS.includes(item.name)) {
                if(bot.locateItem(["computer", "supercomputer"])) {
                    await bot.dismantle(i).catch((ex) => console.warn(ex))
                }
            }
            if(!item.q){
                let emptyBankSlot = getEmptySlot()
                await bot.smartMove(emptyBankSlot[0], {getWithin: 9999})
                await bot.depositItem(i, emptyBankSlot[0])
            }
            if(item.q && Game.G.items[item.name].s > item.q) {
                const bankItems = this.locateItemsInBank(bot, item.name, {
                    quantityLessThan: Game.G.items[item.name].s - item.q +1,
                })
                if(bankItems.length) {
                    await bot.smartMove(bankItems[0][0], {getWithin: 9999})
                }
                else if(emptyBankSlots.length>0){
                    await bot.smartMove(getEmptySlot()[0], {getWithin: 9999})
                }
                await bot.depositItem(i)
            }
        }
        
    }

    protected locateItemsInBank(bot: PingCompensatedCharacter, item: ItemName, filters?: LocateItemFilters) {
        if (!bot.map.startsWith("bank") && !super.getMemoryStorage.getBank) throw new Error("We aren't in the bank")
        if (!bot.bank && !super.getMemoryStorage.getBank) throw new Error("We don't have bank information")

        const items: BankItems = []

        let bank = (bot.bank) ? bot.bank : super.getMemoryStorage.getBank

        let bankPackName: keyof BankInfo
        for (bankPackName in bank) {
            if (bankPackName == "gold") continue

            const itemsInSlot = bot.locateItems(item, bot.bank[bankPackName], filters)

            if (itemsInSlot.length) items.push([bankPackName, itemsInSlot])
        }

        return items.sort(sortByPackNumberAsc)
    }

    private locateEmptyBankSlots(bot: PingCompensatedCharacter) {
        if (!bot.map.startsWith("bank") && !super.getMemoryStorage.getBank) throw new Error("We aren't in the bank")
        if (!bot.bank && !super.getMemoryStorage.getBank) throw new Error("We don't have bank information")

        const empty: BankItems = []

        let bank = (bot.bank) ? bot.bank : super.getMemoryStorage.getBank

        let bankPackName: keyof BankInfo
        for (bankPackName in bank) {
            if (bankPackName == "gold") continue

            const emptyInSlot = []
            for (let i = 0; i < bot.bank[bankPackName].length; i++) {
                const bankItem = bot.bank[bankPackName][i]
                if (bankItem) continue // There's an item here
                emptyInSlot.push(i)
            }

            if (emptyInSlot.length) empty.push([bankPackName, emptyInSlot])
        }

        // Sort by bank pack name
        return empty.sort(sortByPackNumberAsc)
    }

    protected async upgradeItemsFromBank() {
        let bot = super.getBot
        const items = this.getUpgradeListFromBank()
        let itemsToUpgrade = 0
        items.upgrade.forEach( (e) => { itemsToUpgrade+=e.slots.length})
        let itemsToCompound = 0
        items.compound.forEach( (e) => {itemsToCompound+=Math.floor(e.slots.length/3)})
        if(itemsToUpgrade<10 && itemsToCompound<5) return
        
        //get all offerings
        if(Game.G.items["offeringp"].s > bot.items[bot.locateItem("offeringp")]?.q) {
            let offerings = this.locateItemsInBank(bot, "offeringp")
            if(offerings.length) {
                for(const bankPack of offerings) {
                    await bot.smartMove(bankPack[0], {getWithin: 9999})
                    for(const pack of bankPack[1]) {
                        await bot.withdrawItem(bankPack[0], pack)
                    }
                }
            }
        }
        if(Game.G.items["offering"].s > bot.items[bot.locateItem("offering")]?.q) {
            let offerings = this.locateItemsInBank(bot, "offering")
            if(offerings.length) {
                for(const bankPack of offerings) {
                    await bot.smartMove(bankPack[0], {getWithin: 9999})
                    for(const pack of bankPack[1]) {
                        await bot.withdrawItem(bankPack[0], pack)
                    }
                }
            }
        }

        //withdraw UPGRADE items while have inventory space. Safe 1 slot just in case
        outer: for(let i = 0; i < items.upgrade.length; i++) {
            for(const it of items.upgrade[i].slots) {
                if(bot.esize<2) break outer;
                await bot.smartMove(it[0], {getWithin: 9999})
                await bot.withdrawItem(it[0], it[1])
            }
        }

        //withdraw COMPOUND items
        outer: for(let i = 0; i < items.compound.length; i++) {
            for(let it = 0; it < items.compound[i].slots.length/3; it+=3) {

                if(bot.esize<2) break outer;

                // There is less then 3 items, we can't compuond.
                if(items.compound[i].slots.length-1<it+2) break

                for(let x = 0; i < 3; i++) {
                    await bot.smartMove(items.compound[i].slots[it+x][0], {getWithin: 9999})
                    await bot.withdrawItem(items.compound[i].slots[it+x][0], items.compound[i].slots[it+x][1])
                }
                
            }
        }

        await bot.smartMove("main")
        await this.upgradeItems()
        await this.compoundItems()
    }

    protected getUpgradeListFromBank() : UpgradeItems {
        const bot = super.getBot
        if (!bot.map.startsWith("bank") && !super.getMemoryStorage.getBank) throw new Error("We aren't in the bank")
        if (!bot.bank && !super.getMemoryStorage.getBank) throw new Error("We don't have bank information")

        let bank = (bot.bank) ? bot.bank : super.getMemoryStorage.getBank

        let upgradeItems : UpgradeItems 
        let bankPackName: keyof BankInfo
        let offeringsCount = this.calculateItemsCountTotal("offering")
        let primlingCount = this.calculateItemsCountTotal("offeringp")

        for(bankPackName in bank) {
            if(bankPackName == "gold") continue

            for(let i = 0; i < bot.bank[bankPackName].length; i++) {
                let item = bot.bank[bankPackName][i]
                if(!item) continue
                if(ItemsConfig.MERCHANT_UPGRADE.has(item.name)) {

                    let config = ItemsConfig.MERCHANT_UPGRADE.get(item.name)
                    let key = Game.G.items[item.name].upgrade ? "upgrade" : "compound"
                    if(item.level >= config.level) continue
                    if(config.shouldBeShiny && item.p != "shiny") continue

                    // CHECK IF WE HAVE OFFERINGS FOR THIS ITEM
                    if(config.offeringAt && item.level>=config.offeringAt) {
                        if(offeringsCount<1 && bot.gold<500_000_000) continue
                        
                        let isThisDuplicate = false
                        for(let j of upgradeItems[key]) {
                            if(j.itemName == item.name && j.level == item.level) {
                                j.slots.push([bankPackName, i])
                                if(key == "compound" && j.slots.length%3==0) offeringsCount -= 1
                                isThisDuplicate = true                                
                            }
                        }

                        if(!isThisDuplicate) {
                            let itemUpgrade : UpgradeItem
                            itemUpgrade.itemName == item.name
                            itemUpgrade.level == item.level
                            itemUpgrade.slots.push([bankPackName, i])
                            upgradeItems[key].push(itemUpgrade)
                            if(key == "upgrade") offeringsCount -= 1
                        }
                        continue
                    }
                    if(config.primlingAt && item.level >= config.primlingAt) {
                        if(primlingCount<1) continue

                        let isThisDuplicate = false
                        for(let j of upgradeItems[key]) {
                            if(j.itemName == item.name && j.level == item.level) {
                                j.slots.push([bankPackName, i])
                                if(key == "compound" && j.slots.length%3==0)primlingCount -= 1
                                if(key == "upgrade") primlingCount -= 1
                                isThisDuplicate = true                                
                            }
                        }

                        if(!isThisDuplicate) {
                            let itemUpgrade : UpgradeItem
                            itemUpgrade.itemName == item.name
                            itemUpgrade.level == item.level
                            itemUpgrade.slots.push([bankPackName, i])
                            upgradeItems[key].push(itemUpgrade)
                            if(key == "upgrade") primlingCount -= 1
                        }
                        continue
                    }

                    if(!config.offeringAt && !config.primlingAt) {

                        let isThisDuplicate = false
                        for(let j of upgradeItems[key]) {
                            if(j.itemName == item.name && j.level == item.level) {
                                j.slots.push([bankPackName, i])
                                isThisDuplicate = true                                
                            }
                        }

                        if(!isThisDuplicate) {
                            let itemUpgrade : UpgradeItem
                            itemUpgrade.itemName == item.name
                            itemUpgrade.level == item.level
                            itemUpgrade.slots.push([bankPackName, i])
                            upgradeItems[key].push(itemUpgrade)
                        }
                        continue
                    }
                    
                }
            }
        }

        //sorting lowLevel => highLevel, lowGrade => highGrade

        if(upgradeItems.upgrade.length) {
            upgradeItems.upgrade.sort((curr, next) => {
                let cur_grade = (Game.G.items[curr.itemName] as Item).calculateGrade()
                let next_grade = (Game.G.items[curr.itemName] as Item).calculateGrade()
                if(curr.level != next.level) {
                    return curr.level < next.level ? -1 : 1
                }
                if(cur_grade != next_grade) {
                    return cur_grade < next_grade ? -1 : 1
                }
                return 0
            })
        }

        if(upgradeItems.compound.length) {
            upgradeItems.compound.sort((curr, next) => {
                let cur_grade = (Game.G.items[curr.itemName] as Item).calculateGrade()
                let next_grade = (Game.G.items[curr.itemName] as Item).calculateGrade()
                if(curr.level != next.level) {
                    return curr.level < next.level ? -1 : 1
                }
                if(cur_grade != next_grade) {
                    return cur_grade < next_grade ? -1 : 1
                }
                return 0
            })
        }

        return upgradeItems
    }

    protected calculateItemsCountTotal(item: ItemName): number {
        let bot = super.getBot
        if(!Game.G.items[item].s) return 0

        let bank = (bot.bank) ? bot.bank : super.getMemoryStorage.getBank
        
        let count = 0
        for(const [, itm] of bot.getItems()) {
            if(item == itm.name) {
                count += itm.q
            }
        }

        if(!bank) return count
        let bankPackName: keyof BankInfo

        for(bankPackName in bank) {
            if(bankPackName == "gold") continue

            for(let i =0; i<bot.bank[bankPackName].length; i++) {
                let itm = bot.bank[bankPackName][i]
                if(!itm) continue
                if(itm.name == item) count += itm.q
            }
        }

        return count;
    }

    protected async sendItems(name: string) {
        let me = super.getBot
        if(me.getPlayers({withinRange: Constants.NPC_INTERACTION_DISTANCE}).filter( e=> e.name == name).length>0) {
            for(const [idx, item] of me.getItems()) {
                if(ItemsConfig.DONT_SEND_ITEMS.includes(item.name)) continue
                if(item.isLocked()) continue
                await me.sendItem(name,idx,item.q)
            }
        }
    }

    protected async sellTrash() {
        let bot = super.getBot
        for(const [idx,item] of bot.getItems()) {
            if(item.isLocked()) continue
            if(ItemsConfig.ITEMS_TO_SELL.includes(item.name) && (!item.level || item.level == 0)) bot.sell(idx,item.q)
        }
    }

}