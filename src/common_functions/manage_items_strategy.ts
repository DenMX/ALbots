import {Item, ItemName, ItemData, PingCompensatedCharacter, Tools, Constants, Game} from "alclient"
import * as ItemsConfig from "../classes_configs/items"
import { ResuplyStrategy } from "./resupply_strategy"

export class ManageItems extends ResuplyStrategy {


    private SHINY_GRADE: Map<number,string[]> = new Map([
        [0, ["bronzeingot","goldnugget"]],
        [1, ["goldingot", "platinumnugget"]],
        [2, ["platinumingot"]]
    ])

    constructor (bot: PingCompensatedCharacter){
        super(bot)
    }


    protected async upgradeItems() {
        if(!super.getBot().locateItem(["computer", "supercomputer"]) && Tools.distance(super.getBot(), {x: -203, y: -115, map: "main"})>Constants.NPC_INTERACTION_DISTANCE) return

        level: for(let lvl =0; lvl < 9; lvl++){
            for(const [slot,item] of super.getBot().getItems()) {
                if(!item) continue
                if(!Game.G.items[item.name].upgrade || !ItemsConfig.MERCHANT_UPGRADE.has(item.name)) continue
                let itemConfig = ItemsConfig.MERCHANT_UPGRADE.get(item.name)
                if(item.level != lvl || item.level>= itemConfig.level) continue
                if(item.level == 0 && itemConfig.shouldBeShiny && item.p != "shiny") continue
                if(itemConfig.offeringAt >= item.level) {
                    if(!super.getBot().locateItem("offering", super.getBot().items) && super.getBot().gold > 500000000 && super.getBot().esize>0) await super.getBot().buy("offering")
                    if(!super.getBot().locateItem("offering", super.getBot().items)) continue
                }
                if(itemConfig.primlingAt >= item.level && (!itemConfig.offeringAt || itemConfig.offeringAt < item.level) && !super.getBot().locateItem("offeringp", super.getBot().items)) continue

                let primling
                if(itemConfig.offeringAt >= item.level) {
                    primling = super.getBot().locateItem("offering", super.getBot().items)
                }
                else if(itemConfig.primlingAt >= item.level) {
                    primling = super.getBot().locateItem("offeringp", super.getBot().items)
                }
                let scroll_grade = item.calculateGrade()
                scroll_grade = (itemConfig.scrollUpAt>= item.level && scroll_grade<2) ? scroll_grade+1 : scroll_grade
                let scroll_name = `scroll${scroll_grade}` as ItemName
                let scroll_idx = super.getBot().locateItem(scroll_name, super.getBot().items)
                if(!scroll_idx && scroll_idx<3 && super.getBot().esize>0 && super.getBot().gold > Game.G.items[scroll_name].g) {
                    await super.getBot().buy(scroll_name)
                }

                scroll_idx = super.getBot().locateItem(scroll_name, super.getBot().items)
                if(!scroll_idx) continue
                await super.getBot().upgrade(slot, scroll_idx, primling)
            }
        }
    }

    protected async compoundItems() {
        if(!super.getBot().locateItem(["computer", "supercomputer"]) && Tools.distance(super.getBot(), {x: -203, y: -115, map: "main"})>Constants.NPC_INTERACTION_DISTANCE) return

        level: for(let lvl=0; lvl<5; lvl++){
            for(const [, item] of super.getBot().getItems()) {
                if(!item) continue
                if(!Game.G.items[item.name].compound || ! ItemsConfig.MERCHANT_UPGRADE.has(item.name)) continue
                let itemConfig = ItemsConfig.MERCHANT_UPGRADE.get(item.name)
                if(item.level != lvl || item.level>= itemConfig.level) continue
                const items = super.getBot().locateItems(item.name, super.getBot().items, {level: item.level, locked: false})
                if (items.length < 3) continue
                if(itemConfig.offeringAt >= item.level) {
                    if(!super.getBot().locateItem("offering", super.getBot().items) && super.getBot().gold > 500000000 && super.getBot().esize>0) await super.getBot().buy("offering")
                    if(!super.getBot().locateItem("offering", super.getBot().items)) continue
                }
                if(itemConfig.primlingAt >= item.level && (!itemConfig.offeringAt || itemConfig.offeringAt < item.level) && !super.getBot().locateItem("offeringp", super.getBot().items)) continue

                let primling
                if(itemConfig.offeringAt >= item.level) {
                    primling = super.getBot().locateItem("offering", super.getBot().items)
                }
                else if(itemConfig.primlingAt >= item.level) {
                    primling = super.getBot().locateItem("offeringp", super.getBot().items)
                }
                let scroll_grade = item.calculateGrade()
                scroll_grade = (itemConfig.scrollUpAt>= item.level && scroll_grade<2) ? scroll_grade+1 : scroll_grade
                let scroll_name = `scroll${scroll_grade}` as ItemName
                let scroll_idx = super.getBot().locateItem(scroll_name, super.getBot().items)
                if(!scroll_idx && scroll_idx<3 && super.getBot().esize>0 && super.getBot().gold > Game.G.items[scroll_name].g) {
                    await super.getBot().buy(scroll_name)
                }

                scroll_idx = super.getBot().locateItem(scroll_name, super.getBot().items)
                if(!scroll_idx) continue

                await super.getBot().compound(items[0],items[1],items[2], scroll_idx, primling)
                
            }
        }
    }

    protected async exchangeItems() {
        if(super.getBot().esize<1) return
        items: for(const [idx, item] of super.getBot().getItems()) {
            if(!item || ItemsConfig.DO_NOT_EXCHANGE.includes(item.name)) continue
            if(!item.e || item.q < item.e) continue
            for(let q = 0; q< Math.floor(item.e/item.q); q++) {
                if(super.getBot().esize < 1 ) break items;
                await super.getBot().exchange(idx)
            }
        }
    }

    protected async shinyItems() {
        //search for items should be shiny
        //search for resources needs to make shiny ? can we craft needed items?
        //withdraw all from bank while esize > 0
        //shiny
        //super.getBot().upgrade(itm_idx, undefined, ingot_idx)
    }

    protected async storeItems() {
        let bot = super.getBot()
        if(!bot.map.startsWith("bank")) return
        let idx_to_store: number[] = []
        for(const [idx, item] of bot.getItems()) {
            if(ItemsConfig.DONT_SEND_ITEMS.includes(item.name)) continue
            if(item.isLocked()) continue
            idx_to_store.push(idx)
        }
        idx_to_store = await this.store(bot, idx_to_store)
        if(bot.map == "bank") await bot.smartMove("bank_b")
        await this.store(bot, idx_to_store)
    }

    private async store(bot, idxs: number[]): Promise<number[]> {
        for(const idx of idxs) {
            await bot.depositItem(idx);
            if(!bot.items[idx]) {
                const index = idxs.indexOf(idx)
                if( index > -1) {
                    idxs.splice(index, 1)
                }
            }
        }
        return idxs
    }

}