import { Item, Game, Constants, InviteData, PingCompensatedCharacter, Tools, HitData, LimitDCReportData, ItemName, SlotType } from "alclient";
import { MemoryStorage } from "./memory_storage";
import { my_characters } from "../main";
import { debugLog } from "./common_functions";
import { SetConfig } from "../configs/character_items_configs";

export class PartyStrategy {

    protected bot: PingCompensatedCharacter

    protected memoryStorage: MemoryStorage

    protected deactivate: boolean = false

    
    constructor(bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        this.bot = bot as PingCompensatedCharacter
        this.memoryStorage = memoryStorage
        this.checkParty = this.checkParty.bind(this)
        this.enablePartyEvents = this.enablePartyEvents.bind(this)
        this.loot = this.loot.bind(this)

        this.checkParty()
        this.loot()
        this.enablePartyEvents()

        let logLimitDCReport = (data: LimitDCReportData) => {
            console.debug(`=== START LIMITDCREPORT (${bot.id}) ===`)
            console.debug(data)
            console.debug(`=== END LIMITDCREPORT ${bot.id} ===`)
        }
        bot.socket.on("limitdcreport", logLimitDCReport)
        
    }

    public deactivateStrat(){
        this.deactivate = true
    }


    private enablePartyEvents() {
        this.bot.socket.on("invite", (data) => this.onPartyInvite(data))
        this.bot.socket.on("request", (data) => this.onPartyRequest(data))
        this.bot.socket.on("hit", (data) => this.moveOnTakenDamage(data))
        this.memoryStorage.addEventListners(this.bot)
    }

    private moveOnTakenDamage(data: HitData) {
        if(data.stacked?.includes(this.bot.name) && !this.bot.moving && !this.bot.smartMoving) {
            this.bot.move( 
                this.bot.x + (-15 + Math.random()*15),
                this.bot.y + (-15 + Math.random()*15)
            ).catch(debugLog)
        } 
    }

    private async onPartyInvite(data: InviteData) {
        if(data.name == this.memoryStorage.getCurrentPartyLeader) this.bot.acceptPartyInvite(data.name)
    }

    private async onPartyRequest(data: InviteData) {
        if(this.bot.name != this.memoryStorage.getCurrentPartyLeader) return
        if(my_characters.has(data.name) || !this.bot.partyData) this.bot.acceptPartyRequest(data.name)
        let myCharsInParty = 0
        this.bot.partyData?.list.forEach((e) => { if(my_characters.has(e)) myCharsInParty++})
        if(
            //All my characters in party. we can have additional chars
            myCharsInParty==4 || 
            //9 is maximum(ish) party size, so 9 minus party.lenght +1(current request) is party capacity, 4 - myCharsInParty needed capacity
            9-this.bot.partyData?.list.length+1>4-myCharsInParty
        ) 
        {
            this.bot.acceptPartyRequest(data.name)
        }
    }

    public getBot() : PingCompensatedCharacter {
        return this.bot
    }

    private getActiveBooster(): number {
        let idx: number
        for(const [id, item] of this.bot.getItems()) {
            if(item.name.includes('booster')){
                if(!idx) idx = id
                else if(item.expires && !this.bot.items[idx].expires ) idx = id
                else if(item.expires < this.bot.items[idx].expires) idx = id
            }
        }
        return idx
    }

    private async loot() {
        if(this.deactivate) return
        if(!this.bot.chests) return setTimeout( this.loot, 500)
        if(this.canLoot()) {
            if(this.bot.chests.size>3 || (this.bot.chests.size>0 && this.bot.smartMoving)) {
                let active_booster = this.getActiveBooster()
                if(active_booster && this.bot.items[active_booster].name !== "goldbooster") await this.bot.shiftBooster(active_booster, "goldbooster").catch(debugLog)
                this.bot.chests.forEach( (e) => this.bot.openChest(e.id).catch(console.warn))
                if(this.memoryStorage.getCurrentLooter != this.bot.name || this.memoryStorage.getDefaultLooter != this.bot.name) this.bot.shiftBooster(active_booster, "xpbooster").catch(debugLog)
                else await this.bot.shiftBooster(active_booster, "luckbooster").catch(debugLog)
            }
        }
        setTimeout(this.loot, 1000)
    }

    private getSlotType(itemName: ItemName): SlotType {
        if(!itemName) return null
        let item = new Item({name: itemName}, Game.G)
        switch (item.type) {
            case "source":
            case "misc_offhand":
            case "shield":
                return "offhand"
            case "weapon":
                return "mainhand"
            case "earring":
                return "earring1"
            case "ring":
                return "ring1"
            default:
                return item.type as SlotType
        }

    }

    private async equipSet(set: SetConfig[]) {
        if(!set) return
        let equipBatchList: {num: number, slot: SlotType}[] = []
        for(const setItem of set) {
            let item = this.bot.locateItem(setItem.name as ItemName, this.bot.items, {returnHighestLevel: true})
            if(!item) continue
            equipBatchList.push({num: item, slot: setItem.slot ?? this.getSlotType(setItem.name as ItemName)})
        }

        equipBatchList.sort((curr, next) => {
            let currPriority = set.find( e => e.name == this.bot.items[curr.num].name).priority ?? 0
            let nextPriority = set.find( e => e.name == this.bot.items[next.num].name).priority ?? 0
            if(currPriority != nextPriority) return (currPriority > 0) ? 1 : -1
            return 0
        })

        const msToNextAttack = this.bot.getCooldown("attack")
        const timeToNextAttack = ( msToNextAttack === 0 ) ? 1000 / this.bot.frequency : msToNextAttack
        const maxItemsCanEquip = Math.max(1, Math.floor(timeToNextAttack - (this.bot.s.penalty_cd?.ms ?? 0) / 120))
        equipBatchList.splice(maxItemsCanEquip)
        await this.bot.equipBatch(equipBatchList)
    }

    private canLoot() : boolean {
        let looter = this.memoryStorage.getCurrentLooter
        let defaultLooter = this.memoryStorage.getDefaultLooter
        if(this.bot.name == looter) return true
        let looterEntity = this.bot.getPlayers().filter( e => e.name == looter && Tools.distance(this.bot, e) < Constants.NPC_INTERACTION_DISTANCE)
        let defaultLooterEntity = this.bot.getPlayers().filter( e => e.name == defaultLooter && Tools.distance(this.bot, e) < Constants.NPC_INTERACTION_DISTANCE)
        if( !this.bot.partyData || !this.bot.partyData?.list?.includes(looter) ) return true
        if( !looterEntity && (!defaultLooterEntity || this.bot.name == defaultLooter) ) return true
        return false
    }

    private async checkParty() {
        if(this.deactivate) return
        // console.log("party loop")
        let pl = this.memoryStorage.getCurrentPartyLeader
        let default_pl = this.memoryStorage.getDefaultPartyLeader
        if(pl != this.bot.name && !this.bot.partyData?.list?.includes(pl)) {
            let players = await this.bot.getServerPlayers().catch(console.warn)
            if(!players) {
                return setTimeout(this.checkParty, 5000)
            }
            if(players.filter( e=> e.name == pl).length>0) {
                this.bot.sendPartyRequest(pl)
                return setTimeout(this.checkParty, 1000)
            }
            if(this.bot.name != default_pl) {
                this.bot.sendPartyRequest(default_pl).catch(console.warn)
            }
        }

        setTimeout(this.checkParty, 5000)
    }


    protected get getMemoryStorage() {
        return this.memoryStorage
    }

}