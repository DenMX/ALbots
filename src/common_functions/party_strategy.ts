import { Item, Game, Constants, InviteData, PingCompensatedCharacter, Tools, HitData, LimitDCReportData, ItemName, SlotType } from "alclient";
import { MemoryStorage } from "./memory_storage";
import { my_characters } from "../main";
import { debugLog } from "./common_functions";
import { SET_CONFIGS, SetConfig } from "../configs/character_items_configs";

export class PartyStrategy {

    protected bot: PingCompensatedCharacter

    protected memoryStorage: MemoryStorage

    protected deactivate: boolean = false

    private maxDef = {
        armor: 0,
        resistance: 0,
        firesistance: 0,
        reflection: 0,
        evasion: 0
    }

    private LastEquippedSet: {name: string, itemsCount: number, datetime: number} = {
        name: undefined,
        itemsCount: 0,
        datetime: undefined
    }

    private last_loot: number = 0

    private loot_interval: number = 30_000

    constructor(bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        this.bot = bot as PingCompensatedCharacter
        this.memoryStorage = memoryStorage
        this.checkParty = this.checkParty.bind(this)
        this.enablePartyEvents = this.enablePartyEvents.bind(this)
        this.loot = this.loot.bind(this)
        this.checkEquippedSetLoop = this.checkEquippedSetLoop.bind(this)
        this.reduceSpotCDLoop = this.reduceSpotCDLoop.bind(this)

        this.checkParty()
        this.loot()
        this.enablePartyEvents()
        this.reduceSpotCDLoop()
        

        let logLimitDCReport = (data: LimitDCReportData) => {
            console.debug(`=== START LIMITDCREPORT (${bot.id}) ===`)
            console.debug(data)
            console.debug(`=== END LIMITDCREPORT ${bot.id} ===`)
        }
        bot.socket.on("limitdcreport", logLimitDCReport)


        this.calculateMaxDef()
    }

    public get getMaxDef() {
        return this.maxDef
    }

    public deactivateStrat(){
        this.deactivate = true
    }

    private async calculateMaxDef() {
        
        if(SET_CONFIGS[this.bot.id]?.tank)  {
            const set = SET_CONFIGS[this.bot.id]?.tank
            let equipBatchList: {num: number, slot: SlotType}[] = []
            for(const [idx, item] of this.bot.getItems()) {
                const setItem = set.find(e => e.name == item.name && e?.level == item?.level)
                if(!setItem) continue
                equipBatchList.push({num: idx, slot: setItem.slot ?? this.getSlotType(item.name as ItemName)})
                console.debug(`${this.bot.id} Equipping ${item.name} - ${setItem.slot ?? this.getSlotType(item.name as ItemName)}`)
            }
            await this.bot.equipBatch(equipBatchList).catch(console.warn)
        }

        this.maxDef = {
            armor: this.bot.armor,
            resistance: this.bot.resistance,
            firesistance: this.bot.firesistance,
            reflection: this.bot.reflection,
            evasion: this.bot.evasion
        }

        this.checkEquippedSetLoop()
        console.debug(`${this.bot.id} MAX DEF: ${JSON.stringify(this.maxDef)}`)
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
            if(item.name.includes('booster') && item.expires) return id
        }
        return idx
    }

    private async loot() {
        if(this.deactivate) return
        if(!this.bot.chests) return setTimeout( this.loot, 500)
        if(this.canLoot()) {
            if( (this.bot.chests.size>0 && this.last_loot < Date.now() - this.loot_interval) 
                || (this.bot.chests.size>0 && this.bot.smartMoving)
            ) {
                let active_booster = this.getActiveBooster()
                let burstDamage = 0
                this.bot.getEntities({targetingMe: true}).forEach( e => burstDamage+= e.attack)
                if(active_booster && this.bot.items[active_booster].name !== "goldbooster") await this.bot.shiftBooster(active_booster, "goldbooster").catch(debugLog)
                if(SET_CONFIGS[this.bot.id]?.gold && burstDamage<this.bot.max_hp*0.5) await this.equipSet("gold", SET_CONFIGS[this.bot.id]?.gold)
                this.bot.chests.forEach( (e) => this.bot.openChest(e.id).catch(console.warn))
                if(this.memoryStorage.getCurrentLooter != this.bot.id || this.memoryStorage.getDefaultLooter != this.bot.id) this.bot.shiftBooster(active_booster, "xpbooster").catch(debugLog)
                else await this.bot.shiftBooster(active_booster, "luckbooster").catch(debugLog)
                this.last_loot = Date.now()
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

    private async checkEquippedSetLoop() {
        if(this.deactivate) return
        if(Date.now() - Math.max(1,this.LastEquippedSet.datetime) < 500 ) return setTimeout(this.checkEquippedSetLoop, Math.max(1, this.LastEquippedSet.datetime - Date.now() + 500))
        let burstDamage = 0
        this.bot.getEntities({targetingMe: true}).forEach( e => burstDamage+= e.attack)
        if(this.bot.hp < this.bot.max_hp * 0.55 && this.bot.getEntities({targetingMe: true}).length > 0 && SET_CONFIGS[this.bot.id]?.tank) {
            await this.equipSet("tank", SET_CONFIGS[this.bot.id]?.tank)
            return setTimeout(this.checkEquippedSetLoop, 500)
        }
        if(this.bot.hp > this.bot.max_hp * 0.55 && SET_CONFIGS[this.bot.id]?.luck && this.bot.getEntities({targetingMe: true}).length > 0 && burstDamage<this.bot.max_hp*0.5) {
            await this.equipSet("luck", SET_CONFIGS[this.bot.id]?.luck)
            return setTimeout(this.checkEquippedSetLoop, 500)
        }
        if(this.bot.hp > this.bot.max_hp * 0.55 && SET_CONFIGS[this.bot.id]?.exp && this.bot.getEntities({targetingMe: true}).length > 0 && burstDamage<this.bot.max_hp*0.5) {
            await this.equipSet("exp", SET_CONFIGS[this.bot.id]?.exp)
            return setTimeout(this.checkEquippedSetLoop, 500)
        }
        if(this.memoryStorage.getCurrentTank != this.bot.name && SET_CONFIGS[this.bot.id]?.heal) {
            await this.equipSet("heal", SET_CONFIGS[this.bot.id]?.heal)
            return setTimeout(this.checkEquippedSetLoop, 500)
        }
        if(SET_CONFIGS[this.bot.id]?.dd && this.bot.hp > this.bot.max_hp * 0.55) {
            await this.equipSet("dd", SET_CONFIGS[this.bot.id]?.dd)
            return setTimeout(this.checkEquippedSetLoop, 500)
        }
        return setTimeout(this.checkEquippedSetLoop, 500)
    }

    private async equipSet(name: string, set: SetConfig[]) {
        // console.debug(`${this.bot.id} Equipping ${name} set`)
        if(!set) return console.debug(`${this.bot.id} No set ${name} found`)
        // if(Date.now() - Math.max(1,this.LastEquippedSet.datetime) < 300 ) return console.debug(`${this.bot.id} Already equipped ${name} set in last 300ms`)
        if(Object.keys(set).length == this.LastEquippedSet.itemsCount && this.LastEquippedSet.name == name) return console.debug(`${this.bot.id} Already equipped ${name} set`)
        let equipBatchList: {num: number, slot: SlotType}[] = []
        for(const [idx, item] of this.bot.getItems()) {
            const setItem = set.find(e => e.name == item.name && e?.level == item?.level)
            if(!setItem) continue
            equipBatchList.push({num: idx, slot: setItem.slot ?? this.getSlotType(item.name as ItemName)})
            console.debug(`${this.bot.id} Equipping ${item.name} - ${setItem.slot ?? this.getSlotType(item.name as ItemName)}`)
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
        await this.bot.equipBatch(equipBatchList).catch(console.warn)
        this.LastEquippedSet.itemsCount = (this.LastEquippedSet.name == name) ? this.LastEquippedSet.itemsCount+equipBatchList.length : equipBatchList.length
        this.LastEquippedSet.datetime = Date.now()
        this.LastEquippedSet.name = name
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

    private async reduceSpotCDLoop() {
        if(this.deactivate || !this.bot.hasItem("orboftemporal")) return
        if(this.bot.smartMoving) return setTimeout(this.reduceSpotCDLoop, 1000)
        if(this.bot.isOnCooldown("temporalsurge")) return setTimeout(this.reduceSpotCDLoop, Math.max(1, this.bot.getCooldown("temporalsurge")))
        if(!this.bot.canUse("temporalsurge", {ignoreEquipped: true})) return setTimeout(this.reduceSpotCDLoop, 500)
        if(this.bot.ctype == 'merchant' && this.bot.getPlayers({isPartyMember: true}).filter( e => Tools.distance(this.bot, e)< 200).length<1) return setTimeout(this.reduceSpotCDLoop, 1000)
        
        let currentOrb = this.bot.slots.orb
        if(this.bot.slots?.orb?.name != "orboftemporal") await this.bot.equip(this.bot.locateItem("orboftemporal")).catch(debugLog)
        
        if(this.bot.slots?.orb?.name == "orboftemporal") await this.bot.temporalSurge().catch(debugLog)

        if(currentOrb && currentOrb.name != this.bot.slots?.orb?.name) this.bot.equip(this.bot.locateItem(currentOrb?.name, undefined, {level: currentOrb?.level}))

        setTimeout(this.reduceSpotCDLoop, Math.max(100, this.bot.getCooldown("temporalsurge")))
    }


    public get getMemoryStorage() {
        return this.memoryStorage
    }

}