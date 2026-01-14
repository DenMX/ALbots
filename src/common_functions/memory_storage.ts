import { BankInfo, BankModel, Database, PingCompensatedCharacter } from "alclient";
import fs from "fs"



export class MemoryStorage {

    private active_bots: PingCompensatedCharacter[]
    
    private bank: BankInfo

    private secretKey: string

    private default_party_leader: string = "frostyRan"

    private current_party_leader: string

    private default_tank: string = "frostyHeal"

    private current_tank: string

    private default_looter: string = this.default_tank

    private current_looter: string 

    constructor(bots: PingCompensatedCharacter[]) {
        this.active_bots = bots
        let credentialFile = fs.readFileSync(`../credentials.json`, 'utf-8')
        this.secretKey = JSON.parse(credentialFile).apiToken

        this.current_party_leader = this.default_party_leader
        this.current_tank = this.default_tank

        this.loadBankFromMongo().catch(console.warn)

        this.active_bots.forEach( (bot) => {
            bot.socket.on("new_map", () => this.updateBank(bot))
        })

        if(this.secretKey == "") {
            console.error("Add apiToken in credentials file!")
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

    private async loadBankFromMongo() {
        if(Database.connection) {
            this.bank = await BankModel.findOne( {
                owner: this.active_bots[0].owner
            }) as BankInfo
        }
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

    public get getDefaultLooter() {
        return this.default_looter
    }

    public get getCurrentLooter() {
        return this.current_looter
    }

    public set setCurrentPartyLeader(value: string) {
        this.current_party_leader = value
    }

    public set setCurrentTank(value: string) {
        this.current_tank = value
        this.current_looter = value
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