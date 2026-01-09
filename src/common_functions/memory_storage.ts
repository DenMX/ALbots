import { BankInfo, PingCompensatedCharacter } from "alclient";
import fs from "fs"



export class MemoryStorage {

    private active_bots: PingCompensatedCharacter[]
    
    private bank: BankInfo

    private secretKey: string

    private default_party_leader: string = "MerchanDiser"

    private current_party_leader: string

    private default_tank: string = "Archealer"

    private current_tank: string

    constructor(bots: PingCompensatedCharacter[]) {
        this.active_bots = bots
        this.secretKey = fs.readFileSync(`../../api_token.txt`, 'utf-8') || ""

        this.current_party_leader = this.default_party_leader
        this.current_tank = this.default_tank

        this.active_bots.forEach( (bot) => {
            bot.socket.on("new_map", () => this.updateBank(bot))
        })

        if(this.secretKey == "") {
            console.error("Create api_token.txt with secretKey!")
            return
        }
        bots.forEach( (e) => {
            e.socket.once("tracker", (data) => {
            const url = `https://aldata.earthiverse.ca/achievements/${e.id}/${this.secretKey}`;
            const settings = {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ max: data.max, monsters: data.monsters }),
            };
            // if response.status == 200, it was successfully updated
            fetch(url, settings).then((response) => console.log(`Sending tracker info code: ${response.status}`));
            });
            e.socket.emit("tracker");
        })
    }

    public get getCurrentPartyLeader() {
        return this.current_party_leader
    }

    public get getDefaultPartyLeader() {
        return this.default_party_leader
    }

    public get getCurrentTank() {
        return this.current_tank
    }

    public set setCurrentPartyLeader(value: string) {
        this.current_party_leader = value
    }

    public set setCurrentTank(value: string) {
        this.current_tank = value
    } 

    public get getBank() {
        return this.bank
    }

    public get getActiveBots() {
        return this.active_bots
    }

    private async updateBank(bot: PingCompensatedCharacter) {
        if(!bot.map.startsWith("bank")) return
        if(bot.map.startsWith("bank") && !bot.bank)
        { 
            setTimeout(() => { this.updateBank(bot) }, 100)
        }
        if(bot.bank) {
            this.bank = bot.bank
            if(this.secretKey == "") return console.error("Create api_token.txt")
            const url = `https://aldata.earthiverse.ca/bank/${bot.owner}/${this.secretKey}`;
            const settings = {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bot.bank),
            };
            // if response.status == 200, it was successfully updated
            fetch(url, settings).then((response) => console.log(`Sending bank status code: ${response.status}`));
        }
    }
}