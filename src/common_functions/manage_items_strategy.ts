import {Item, ItemName, BankInfo, PingCompensatedCharacter, Tools, Constants, Game, BankPackName, LocateItemFilters, Merchant} from "alclient"
import * as ItemsConfig from "../configs/manage_items_configs"
import { ResuplyStrategy } from "./resupply_strategy"
import { MemoryStorage } from "./memory_storage"
import * as CharacterItems from "../configs/character_items_configs"
import * as CF from "./common_functions"


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
        super(bot as  PingCompensatedCharacter, memoryStorage)

        //bind context functions
        this.upgradeItems = this.upgradeItems.bind(this)
        this.compoundItems = this.compoundItems.bind(this)
        this.exchangeItems = this.exchangeItems.bind(this)
        this.storeItems = this.storeItems.bind(this)
        this.upgradeItemsFromBank = this.upgradeItemsFromBank.bind(this)
        this.sellTrash = this.sellTrash.bind(this)
        this.sendItems = this.sendItems.bind(this)
        this.shinyItems = this.shinyItems.bind(this)
        this.startManageLogic = this.startManageLogic.bind(this)

        if(bot.ctype != 'merchant') this.startManageLogic()
    }

    protected async startManageLogic() {
        if( !this.bot.hasItem(["computer", "supercomputer"])) {
            
            if( this.bot.esize>0 ) return setTimeout( this.startManageLogic, 30 * this.bot.esize * 1000 ) //setTimeout to 30sec for each empty slot

            if( !this.bot.smartMoving && !this.bot.map.startsWith("bank") && (!this.memoryStorage.getBank || this.locateEmptyBankSlots().length>0) ) {
                await this.bot.smartMove("main").catch(console.warn)
                await this.sellTrash()
                try {
                    await this.bot.smartMove("bank")
                }
                catch(error) {
                    console.warn(error)
                }
                
                await this.storeItems()
            }

            return setTimeout( this.startManageLogic, this.bot.esize * 30 * 1000 )
        }
        //we have PC for remote upgrade
        else {
            if(Object.values(this.bot.getItems()).filter( e => !e.isLocked() ).length>0) {
                this.sellTrash()
                await this.upgradeItems()
                await this.compoundItems()
                await this.exchangeItems()
            }
        }
        return setTimeout(this.startManageLogic, 30 * this.bot.esize * 1000)
    }

    protected async upgradeItems() {
        if(!this.bot.hasItem(["computer", "supercomputer"]) && Tools.distance(this.bot, CF.UPGRADE_POSITION)>Constants.NPC_INTERACTION_DISTANCE) return

        level: for(let lvl = 0; lvl < 9; lvl++){
            let debugItemsInfo = this.bot.items.filter( e => ItemsConfig.MERCHANT_UPGRADE.has(e?.name) && e?.level == lvl && Game.G.items[e.name].upgrade)
            // console.debug(`Upgrading to level ${lvl+1}, items should be upgraded: ${debugItemsInfo.length}`)
            debugItemsInfo.forEach( e => console.debug(e.name))
            for(const [slot,item] of this.bot.getItems()) {
                if(!item) continue
                if(!Game.G.items[item.name].upgrade || !ItemsConfig.MERCHANT_UPGRADE.has(item.name)) continue
                let itemConfig = ItemsConfig.MERCHANT_UPGRADE.get(item.name)
                if(item.level != lvl || item.level>= itemConfig.level) continue
                if(item.level == 0 && itemConfig.shouldBeShiny && item.p != "shiny") continue
                
                let offering: ItemName
                if( itemConfig.offeringAt && itemConfig.offeringAt <= item.level ) offering = "offering"
                else if ( itemConfig.primlingAt && itemConfig.primlingAt <= item.level ) offering = "offeringp"
                if( offering && !this.bot.locateItem(offering) ) {
                    if( offering == "offering" && this.bot.gold > 500000000 && this.bot.esize>0 ) await this.bot.buy("offering")
                    else continue
                }

                let primling 
                if(offering) primling = this.bot.locateItem(offering)
                
                
                let scroll_grade = (itemConfig.scrollUpAt <= item.level && item.calculateGrade()<2) ? item.calculateGrade()+1 : item.calculateGrade()
                // console.debug(`[UPGRADE] NEED TO USE SCROLL UP? ${(itemConfig.scrollUpAt <= item.level && item.calculateGrade()<2)}`)
                let scroll_name = `scroll${scroll_grade}` as ItemName
                // console.debug(`For ${item.name} level ${item.level} needs ${scroll_name}. Has scroll: ${this.bot.hasItem(scroll_name)}`)
                if(!this.bot.hasItem(scroll_name)) {
                    if( scroll_grade<3 && this.bot.esize>0 && this.bot.gold > Game.G.items[scroll_name].g) {
                        await this.bot.buy(scroll_name).catch(console.warn)
                    }
                    else continue
                }

                let scroll_idx = this.bot.locateItem(scroll_name)
                if(this.bot instanceof Merchant) {
                    if(this.bot.canUse("massproduction")) await this.bot.massProduction().catch(console.debug)
                    if(this.bot.canUse("massproductionpp")) await this.bot.massProductionPP().catch(console.debug)
                }
                console.debug(`Upgrading ${item.name} to ${item.level+1}`)
                await this.bot.upgrade(slot, scroll_idx, primling).catch(console.warn)
            }
        }
    }

    protected async compoundItems() {
        console.debug(`COMPOUND STARTED`)
        if(!this.bot.hasItem(["computer", "supercomputer"]) && Tools.distance(this.bot, CF.UPGRADE_POSITION)>Constants.NPC_INTERACTION_DISTANCE) return

        level: for(let lvl=0; lvl<5; lvl++){
            let debugItemsInfo = this.bot.items.filter( e => ItemsConfig.MERCHANT_UPGRADE.has(e?.name) && e?.level == lvl && Game.G.items[e.name].compound)
            // console.debug(`Compouding to level ${lvl+1}, items should be compound: ${debugItemsInfo.length}`)
            debugItemsInfo.forEach( e => console.debug(e.name))
            for(const [, item] of this.bot.getItems()) {
                if(!item) continue
                if(!Game.G.items[item.name].compound || ! ItemsConfig.MERCHANT_UPGRADE.has(item.name)) continue
                let itemConfig = ItemsConfig.MERCHANT_UPGRADE.get(item.name)
                if(item.level != lvl || item.level>= itemConfig.level) continue
                const items = this.bot.locateItems(item.name, undefined, {level: item.level, locked: false})
                if (items.length < 3) continue
                
                let offering: ItemName
                if( itemConfig.offeringAt && itemConfig.offeringAt <= item.level ) offering = "offering"
                else if ( itemConfig.primlingAt && itemConfig.primlingAt <= item.level ) offering = "offeringp"
                if( offering && !this.bot.locateItem(offering) ) {
                    if( offering == "offering" && this.bot.gold > 500000000 && this.bot.esize>0 ) await this.bot.buy("offering")
                    else continue
                }

                let primling 
                if(offering) primling = this.bot.locateItem(offering)

                let scroll_grade = (itemConfig.scrollUpAt <= item.level && item.calculateGrade()<2) ? item.calculateGrade()+1 : item.calculateGrade()
               
                // console.debug(`[UPGRADE] NEED TO USE SCROLL UP? ${(itemConfig.scrollUpAt <= item.level && item.calculateGrade()<2)}`)
                
                let scroll_name = `cscroll${scroll_grade}` as ItemName
                
                // console.debug(`For ${item.name} level ${item.level} needs ${scroll_name}. Has scroll: ${this.bot.hasItem(scroll_name)}`)
                
                if(!this.bot.hasItem(scroll_name)) {
                    if( scroll_grade<3 && this.bot.esize>0 && this.bot.gold > Game.G.items[scroll_name].g) {
                        await this.bot.buy(scroll_name).catch(console.warn)
                    }
                    else continue
                }

                let scroll_idx = this.bot.locateItem(scroll_name)
               
                console.debug(`Compuond item ${item.name} to ${lvl+1}`)
                
                if(this.bot instanceof Merchant) {
                    if(this.bot.canUse("massproduction")) await this.bot.massProduction().catch(console.debug)
                    if(this.bot.canUse("massproductionpp")) await this.bot.massProductionPP().catch(console.debug)
                }
                await this.bot.compound(items[0],items[1],items[2], scroll_idx, primling).catch(console.warn)
                
            }
        }
    }

    protected async exchangeItems() {
        if(this.bot.esize<1) return
        items: for(const [idx, item] of this.bot.getItems()) {
            if(!item || ItemsConfig.DO_NOT_EXCHANGE.includes(item.name)) continue
            if(!item.e || item.q < item.e) continue
            for(let q = 0; q< Math.floor(item.e/item.q); q++) {
                if(this.bot.esize < 1 ) break items;
                if(this.bot instanceof Merchant) {
                    if(this.bot.canUse("massexchange")) await this.bot.massExchange().catch(console.debug)
                    if(this.bot.canUse("massexchange")) await this.bot.massExchange().catch(console.debug)
                }
                await this.bot.exchange(idx).catch(console.warn)
            }
        }
    }

    protected async shinyItems() {
        //search for items should be shiny
        //search for resources needs to make shiny ? can we craft needed items?
        //withdraw all from bank while esize > 0
        //shiny
        //this.bot.upgrade(itm_idx, undefined, ingot_idx)
    }

    protected async storeItems() {

        if(!this.bot.map.startsWith("bank")) return
        if(!this.bot.bank) console.error("We don't have bank information")

        const emptyBankSlots = this.locateEmptyBankSlots()
        function getEmptySlot(): BankItemPosition {
            if (!emptyBankSlots.length) return undefined//throw new Error("No empty slots")

            const [bankPackName, emptyIndexes] = emptyBankSlots[0]

            // Get an empty slot from the list
            const emptyIndex = emptyIndexes.shift()

            // Remove the pack if there are no more empty slots
            if (!emptyIndexes.length) emptyBankSlots.shift()

            // Return the empty slot name with the index of an empty spot
            return [bankPackName, emptyIndex]
        }
    
        let personalItems = CF.getBotPersonalItemsList(this.bot)

        for(const [i, item] of this.bot.getItems()) {
            if(ItemsConfig.DONT_SEND_ITEMS.includes(item.name)) continue
            if(item.l || ItemsConfig.ITEMS_TO_SELL.includes(item.name)) continue
            if(personalItems.some(e => e.name == item.name && e.level == item.level)) continue
            if(this.bot.ctype == "merchant" && ItemsConfig.MERCHANT_KEEP_ITEMS.includes(item.name)) continue
            
            //left more quantity of elixirs in inventory if we have more than stack
            if( CharacterItems.DEFAULT_ELIXIRS.get(this.bot.ctype)?.includes(item.name) && 
                Game.G.items[item.name].s < this.bot.countItem(item.name) && 
                this.bot.locateItem(item.name, this.bot.items, {returnHighestQuantity: true}) == i) continue

            if(ItemsConfig.DISMANTLE_ITEMS.includes(item.name)) {
                if(this.bot.locateItem(["computer", "supercomputer"])) {
                    await this.bot.dismantle(i).catch(console.warn)
                }
                else continue
            }
            if(!item.q && emptyBankSlots.length>0){
                let emptyBankSlot = getEmptySlot()
                await this.bot.smartMove(emptyBankSlot[0], {getWithin: 9999}).catch(console.warn)
                console.debug(`Deposit item ${item.name}`)
                await this.bot.depositItem(i, emptyBankSlot[0]).catch(console.error)
            }
            if(item.q && Game.G.items[item.name].s > item.q) {
                const bankItems = this.locateItemsInBank(this.bot, item.name, {
                    quantityLessThan: Game.G.items[item.name].s - item.q +1,
                })
                if(bankItems.length) {
                    await this.bot.smartMove(bankItems[0][0], {getWithin: 9999}).catch(console.warn)
                }
                else if(emptyBankSlots.length>0){
                    await this.bot.smartMove(getEmptySlot()[0], {getWithin: 9999}).catch(console.warn)
                }
                console.debug(`Deposit item ${item.name}`)
                await this.bot.depositItem(i).catch(console.error)
            }
        }
        
    }

    protected locateItemsInBank(bot: PingCompensatedCharacter, item: ItemName, filters?: LocateItemFilters): BankItems {
        if (!bot.map.startsWith("bank") && !super.getMemoryStorage.getBank) throw new Error("We aren't in the bank")
        if (!bot.bank && !super.getMemoryStorage.getBank) throw new Error("We don't have bank information")

        const items: BankItems = []

        let bank = (bot.bank) ? bot.bank : super.getMemoryStorage.getBank

        let bankPackName: keyof BankInfo
        for (bankPackName in bank) {
            if(bankPackName == "gold" || bankPackName == "owner" as BankPackName || bankPackName == "_id" as BankPackName) continue

            const itemsInSlot = bot.locateItems(item, bank[bankPackName], filters)

            if (itemsInSlot.length) items.push([bankPackName, itemsInSlot])
        }

        return items.sort(sortByPackNumberAsc)
    }

    private locateEmptyBankSlots() {
        let bot = this.bot
        if (!bot.map.startsWith("bank") && !super.getMemoryStorage.getBank) console.error("We aren't in the bank")
        if (!bot.bank && !super.getMemoryStorage.getBank) {
            console.error("We don't have bank information")
            return []
        }

        const empty: BankItems = []

        let bank = (bot.bank) ? bot.bank : this.memoryStorage.getBank

        let bankPackName: keyof BankInfo
        for (bankPackName in bank) {
            if(bankPackName == "gold" || bankPackName == "owner" as BankPackName || bankPackName == "_id" as BankPackName) continue

            const emptyInSlot = []
            for (let i = 0; i < bank[bankPackName].length; i++) {
                const bankItem = bank[bankPackName][i]
                if (bankItem) continue // There's an item here
                emptyInSlot.push(i)
            }

            if (emptyInSlot.length) empty.push([bankPackName, emptyInSlot])
        }

        // Sort by bank pack name
        return empty.sort(sortByPackNumberAsc)
    }

    protected async upgradeItemsFromBank() {
        let bot = this.bot
        if (!bot.bank && !super.getMemoryStorage.getBank) return console.debug("We don't have bank information")
        const items = this.getUpgradeListFromBank()
        let itemsToUpgrade = 0
        items.upgrade.forEach( (e) => { itemsToUpgrade+=e.slots.length})
        let itemsToCompound = 0
        items.compound.forEach( (e) => {itemsToCompound+=Math.floor(e.slots.length/3)})
        console.debug(`Items to upgrade: ${itemsToUpgrade}, items to compound: ${itemsToCompound}`)
        if(itemsToUpgrade<10 && itemsToCompound<5) {
            // items.upgrade.forEach(element => {
            //     console.debug(`Item for upgrade ${element.itemName} level: ${element.level ?? "none"} count: ${element.slots.length}`)
            // });
            // items.compound.forEach(element => {
            //     console.debug(`Item for upgrade ${element.itemName} level: ${element.level ?? "none"} count: ${element.slots.length}`)
            // });
            return console.log("There not enough items to upgrade")
        }
        
        //get all offerings
        if(Game.G.items["offeringp"].s > bot.items[bot.locateItem("offeringp")]?.q) {
            let offerings = this.locateItemsInBank(bot, "offeringp")
            if(offerings.length) {
                for(const bankPack of offerings) {
                    console.debug(`[upgradeFromBank] smartmove to bankPack`)
                    await bot.smartMove(bankPack[0], {getWithin: 9999}).catch(console.warn)
                    for(const pack of bankPack[1]) {
                        await bot.withdrawItem(bankPack[0], pack).catch(console.debug)
                    }
                }
            }
        }
        if(Game.G.items["offering"].s > bot.items[bot.locateItem("offering")]?.q) {
            let offerings = this.locateItemsInBank(bot, "offering")
            if(offerings.length) {
                for(const bankPack of offerings) {
                    console.debug(`[upgradeFromBank] smartmove to bankPack`)
                    await bot.smartMove(bankPack[0], {getWithin: 9999}).catch(console.warn)
                    for(const pack of bankPack[1]) {
                        await bot.withdrawItem(bankPack[0], pack).catch(console.debug)
                    }
                }
            }
        }

        //withdraw UPGRADE items while have inventory space. Safe 1 slot just in case
        upouter: for(let i = 0; i < items.upgrade.length; i++) {
            for(const it of items.upgrade[i].slots) {
                if(bot.esize<2) break upouter;
                console.debug(`[upgradeFromBank] smartmove to bankPack`)
                await bot.smartMove(it[0], {getWithin: 9999}).catch(console.warn)
                await bot.withdrawItem(it[0], it[1]).catch(console.debug)
            }
        }

        //withdraw COMPOUND items
        comouter: for(const configItem of items.compound) {
            let slotsLength = configItem.slots.length - ( configItem.slots.length % 3 )
            for(let it = 0; it < slotsLength; it++) {

                if((it == 0 || it%3 == 0) && bot.esize<3) {
                    console.debug(`[upgradeFromBank] No more space in inventory`)
                    break comouter;
                }

                console.debug(`[upgradeFromBank] withdrowing ${configItem.itemName} level ${configItem.level}`)
                await bot.smartMove(configItem.slots[it][0], {getWithin: 9999}).catch(console.warn)
                await bot.withdrawItem(configItem.slots[it][0], configItem.slots[it][1]).catch(console.debug)
                
            }
        }
        console.debug(`[upgradeFromBank] smartmove to upgrade`)
        await bot.smartMove(CF.UPGRADE_POSITION).catch(console.warn)
        console.debug(`Calling compound function!`)
        this.compoundItems()
        await this.upgradeItems()
        
        
    }

    protected getUpgradeListFromBank() : UpgradeItems {
        const bot = this.bot
        if(!bot.bank && !super.getMemoryStorage.getBank) return { upgrade: [], compound: [] }


        let bank = (bot.map.startsWith("bank")) ? bot.bank : super.getMemoryStorage.getBank;
        (bot.map.startsWith("bank")) ? console.debug('using bank info') : console.debug('using bank info from DB')
        // console.debug(`bank in memory storage:\n${JSON.stringify(this.memoryStorage.getBank)}`)

        // console.debug(`Packs in bank: ${Object.keys(bank).filter( e => e != "gold").length}`)

        let upgradeItems : UpgradeItems = {
            upgrade: [],
            compound: []
        }
        let bankPackName: keyof BankInfo
        let offeringsCount = this.calculateItemsCountTotal("offering")
        let primlingCount = this.calculateItemsCountTotal("offeringp")

        for(bankPackName in bank) {
            // console.debug(`${bankPackName} = \n${bank[bankPackName]}`)
            if(bankPackName == "gold" || bankPackName == "owner" as BankPackName || bankPackName == "_id" as BankPackName) continue
            
            itemsFor: for(let i = 0; i < bank[bankPackName].length; i++) {
                let item = bank[bankPackName][i]
                if(!item) continue
                // console.debug(`Check item - ${item.name} level: ${item.level ?? "none"}`)
                if(ItemsConfig.MERCHANT_UPGRADE.has(item.name)) {
                    let config = ItemsConfig.MERCHANT_UPGRADE.get(item.name)
                    let key = Game.G.items[item.name].upgrade ? "upgrade" : "compound"
                    if(item.level >= config.level) {
                        console.debug(`Item upgraded ${item.name} level: ${item.level ?? "none"}`)
                        continue
                    }
                    if(config.shouldBeShiny && item.p != "shiny") {
                        console.debug(`Item not shiny ${item.name} level: ${item.level ?? "none"}`)
                        continue
                    }

                    // CHECK IF WE HAVE OFFERINGS FOR THIS ITEM
                    if(config.offeringAt && item.level>=config.offeringAt) {
                        if(offeringsCount<1 && bot.gold<500_000_000) {
                            console.debug(`No big offering for item ${item.name} level: ${item.level ?? "none"}`)
                            continue
                        }
                        
                        for(let j of upgradeItems[key]) {
                            if(j.itemName == item.name && j.level == item.level) {
                                // console.debug(`Added ${item.name} level: ${item.level ?? "none"}`)
                                j.slots.push([bankPackName, i])
                                if(key == "compound" && j.slots.length%3==0) offeringsCount -= 1
                                continue itemsFor                               
                            }
                        }

                        let itemUpgrade : UpgradeItem
                        itemUpgrade.itemName == item.name
                        itemUpgrade.level == item.level
                        itemUpgrade.slots.push([bankPackName, i])
                        upgradeItems[key].push(itemUpgrade)
                        if(key == "upgrade") offeringsCount -= 1
                        // console.debug(`Added ${item.name} level: ${item.level ?? "none"}`)
                        
                        continue
                    }
                    if(config.primlingAt && item.level >= config.primlingAt) {
                        if(primlingCount<1) {
                            console.debug(`No offering for item ${item.name} level: ${item.level ?? "none"}`)
                            continue
                        }

                        for(let j of upgradeItems[key]) {
                            if(j.itemName == item.name && j.level == item.level) {
                                // console.debug(`Added ${item.name} level: ${item.level ?? "none"}`)
                                j.slots.push([bankPackName, i])
                                if(key == "compound" && j.slots.length%3==0)primlingCount -= 1
                                if(key == "upgrade") primlingCount -= 1
                                continue itemsFor                               
                            }
                        }
                        
                        let itemUpgrade: UpgradeItem = {
                            itemName: item.name,
                            level: item.level,
                            slots: []
                        }
                        // console.debug(`Added ${item.name} level: ${item.level ?? "none"}`)
                        itemUpgrade.slots.push([bankPackName, i])
                        upgradeItems[key].push(itemUpgrade)
                        if(key == "upgrade") primlingCount -= 1
                        
                        continue
                    }

                    if((!config.offeringAt || item.level<config.offeringAt) && (!config.primlingAt || item.level<config.primlingAt)) {

                        let isThisDuplicate = false
                        for(let j of upgradeItems[key]) {
                            if(j.itemName == item.name && j.level == item.level) {
                                // console.debug(`Added ${item.name} level: ${item.level ?? "none"}`)
                                j.slots.push([bankPackName, i])
                                isThisDuplicate = true                                
                            }
                        }

                        if(!isThisDuplicate) {
                            let itemUpgrade: UpgradeItem = {
                                itemName: item.name,
                                level: item.level,
                                slots: []
                            }
                            // console.debug(`Added ${item.name} level: ${item.level ?? "none"}`)
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
                let cur_grade = new Item({name: curr.itemName, level: curr.level}, Game.G).calculateGrade()
                let next_grade = new Item({name: next.itemName, level: next.level}, Game.G).calculateGrade()
                if(curr.level != next.level) {
                    return curr.level < next.level ? -1 : 1
                }
                if(cur_grade != next_grade) {
                    return cur_grade < next_grade ? -1 : 1
                }
                return 0
            })
        }

        //left only compoundable count of items in array
        for(const compoundConfig of upgradeItems.compound) {
            if(compoundConfig.slots.length<3) {
                // console.debug(`Items ${compoundConfig.itemName} ${compoundConfig.slots.length} count. Removing this item from coumpound list.`)
                upgradeItems.compound.splice(upgradeItems.compound.indexOf(compoundConfig), 1) //remove this items
                continue
            }
            if(compoundConfig.slots.length%3>0) {
                // console.debug(`${compoundConfig.itemName} has ${compoundConfig.slots.length}. Removing ${compoundConfig.slots.length%3}`)
                compoundConfig.slots.splice( 
                    compoundConfig.slots.length - ( compoundConfig.slots.length % 3 ) -1,
                    compoundConfig.slots.length-1 
                )
            }
        }

        if(upgradeItems.compound.length) {
            upgradeItems.compound.sort((curr, next) => {
                let cur_grade = new Item({name: curr.itemName, level: curr.level}, Game.G).calculateGrade()
                let next_grade = new Item({name: next.itemName, level: next.level}, Game.G).calculateGrade()
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
        let bot = this.bot
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

            for(let i =0; i<bank[bankPackName].length; i++) {
                let itm = bank[bankPackName][i]
                if(!itm) continue
                if(itm.name == item) count += itm.q
            }
        }

        return count;
    }

    public async sendItems(name: string) {
        let personalItems = CF.getBotPersonalItemsList(this.bot)
        try {
            for(const [idx, item] of this.bot.getItems()) {
                if( ItemsConfig.DONT_SEND_ITEMS.includes(item.name) ) continue
                if( item.isLocked() ) continue
                if( personalItems.some(e => e.name == item.name && e.level == item.level) ) continue
                if( CharacterItems.DEFAULT_ELIXIRS.get(this.bot.ctype).includes(item.name) ) continue
                await this.bot.sendItem(name,idx,item.q).catch(console.warn)
            }
            if(this.bot.ctype != "merchant") {
                if(this.bot.hasItem(["computer", "supercomputer"]) && this.bot.gold>CharacterItems.KEEP_GOLD_WITH_PC) await this.bot.sendGold(name, this.bot.gold-CharacterItems.KEEP_GOLD_WITH_PC)
                else if(!this.bot.hasItem(["computer","supercomputer"]) && this.bot.gold>CharacterItems.KEEP_GOLD) await this.bot.sendGold(name, this.bot.gold-CharacterItems.KEEP_GOLD)
            }
        }
        catch(ex) {
            console.error(`While sending items exception: ${ex}`)
        }
    }

    protected async sellTrash() {
        let bot = this.bot
        for(const [idx,item] of bot.getItems()) {
            if( item.isLocked() ) continue
            if ( 
                ItemsConfig.ITEMS_TO_SELL.includes(item.name) 
                && (!item.level || item.level == 0)
            ) 
            {
                await bot.sell(idx,item.q).catch(console.warn)
            }
        }
    }

}