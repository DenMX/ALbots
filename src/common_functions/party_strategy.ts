import { Game, Constants, InviteData, PingCompensatedCharacter, Tools, HitData, LimitDCReportData } from "alclient";
import { MemoryStorage } from "./memory_storage";
import { my_characters } from "../main";

export class PartyStrategy {

    protected bot: PingCompensatedCharacter

    protected memoryStorage: MemoryStorage

    
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


    private enablePartyEvents() {
        this.bot.socket.on("invite", (data) => this.onPartyInvite(data))
        this.bot.socket.on("request", (data) => this.onPartyRequest(data))
        this.bot.socket.on("hit", (data) => this.moveOnTakenDamage(data))
        this.memoryStorage.addEventListners(this.bot)
    }

    private moveOnTakenDamage(data: HitData) {
        if(data.stacked?.includes(this.bot.name) && !this.bot.moving && !this.bot.smartMoving) {
            this.bot.move( 
                this.bot.x + (-5 + Math.random()*5),
                this.bot.y + (-5 + Math.random()*5)
            ).catch(console.debug)
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

    private async loot() {
        if(!this.bot.chests) return setTimeout( this.loot, 500)
        if(this.canLoot()) {
            if(this.bot.chests.size>3 || (this.bot.chests.size>0 && this.bot.smartMoving)) {
                this.bot.chests.forEach( (e) => this.bot.openChest(e.id).catch(console.warn))
            }
        }
        setTimeout(this.loot, 1000)
    }

    private canLoot() : boolean {
        let looter = this.memoryStorage.getCurrentLooter
        let defaultLooter = this.memoryStorage.getDefaultLooter
        if(this.bot.name == looter) return true
        let looterEntity = this.bot.getPlayers().filter( e => e.name == looter && Tools.distance(this.bot, e) < Constants.NPC_INTERACTION_DISTANCE)
        let defaultLooterEntity = this.bot.getPlayers().filter( e => e.name == defaultLooter && Tools.distance(this.bot, e) < Constants.NPC_INTERACTION_DISTANCE)
        if( !this.bot.partyData || !this.bot.partyData?.list.includes(looter) ) return true
        if( !looterEntity && (!defaultLooterEntity || this.bot.name == defaultLooter) ) return true
        return false
    }

    private async checkParty() {
        // console.log("party loop")
        let pl = this.memoryStorage.getCurrentPartyLeader
        let default_pl = this.memoryStorage.getDefaultPartyLeader
        if(pl != this.bot.name && !this.bot.partyData?.list.includes(pl)) {
            let players = await this.bot.getServerPlayers().catch(console.warn)
            if(!players) return setTimeout(this.checkParty, 5000)
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