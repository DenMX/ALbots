import { InviteData, PingCompensatedCharacter } from "alclient";
import { MemoryStorage } from "./memory_storage";
import { my_characters } from "../main";

export class PartyStrategy {

    protected bot: PingCompensatedCharacter

    protected memoryStorage: MemoryStorage

    
    constructor(bot: PingCompensatedCharacter, memoryStorage: MemoryStorage) {
        this.bot = bot
        this.memoryStorage = memoryStorage
        this.bot.socket.on("invite", (data) => this.onPartyInvite(data))
        this.bot.socket.on("request", (data) => this.onPartyRequest(data))
        this.checkParty()
    }

    private async onPartyInvite(data: InviteData) {
        if(data.name == this.memoryStorage.getCurrentPartyLeader) this.bot.acceptPartyInvite(data.name)
    }

    private async onPartyRequest(data: InviteData) {
        if(this.bot.name != this.memoryStorage.getCurrentPartyLeader) return
        if(my_characters.has(data.name)) this.bot.acceptPartyRequest(data.name)
        let myCharsInParty = 0
        this.bot.partyData.list.forEach((e) => { if(my_characters.has(e)) myCharsInParty++})
        if(
            //All my characters in party. we can have additional chars
            myCharsInParty==4 || 
            //9 is maximum(ish) party size, so 9 minus party.lenght +1(current request) is party capacity, 4 - myCharsInParty needed capacity
            9-this.bot.partyData.list.length+1>4-myCharsInParty
        ) 
        {
            this.bot.acceptPartyRequest(data.name)
        }
    }

    private async checkParty() {
        let pl = this.memoryStorage.getCurrentPartyLeader
        let default_pl = this.memoryStorage.getDefaultPartyLeader
        if(pl != this.bot.name && !this.bot.partyData?.list.includes(pl)) {
            let players = await this.bot.getServerPlayers()
            let shouldWait = (players.filter( e=> e.name == pl).length>0 || my_characters.has(pl))
            if(shouldWait) {
                setTimeout((pl) => {
                    //sending another request in 2sec
                    this.bot.sendPartyRequest(pl)
                    //checking our party after 1 sec when sent request. 3 sec total
                    setTimeout(this.checkParty, 1000)
                }, 2000)
            }
            if(!shouldWait) {
                this.bot.sendPartyRequest(default_pl)
            }
        }

        setTimeout(this.checkParty, 5000)
    }


    protected get getMemoryStorage() {
        return this.memoryStorage
    }

}