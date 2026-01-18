import { BankInfo, BankModel, Database, PingCompensatedCharacter } from "alclient";
import fs from "fs"
import { StateStrategy } from "./state_strategy";
import { MerchantStrategy } from "../classes_logic/merchant_strategy";



export class MemoryStorage {

    private active_bots: PingCompensatedCharacter[] = []

    private fighters: StateStrategy[] = []

    private merchant: MerchantStrategy
    
    private bank: BankInfo

    private secretKey: string

    private default_party_leader: string = "frostyRan"

    private current_party_leader: string

    private default_tank: string = "frostyHeal"

    private current_tank: string

    private default_looter: string = this.default_tank

    private current_looter: string 

    constructor() {
        this.loadBankFromMongo = this.loadBankFromMongo.bind(this)
        this.updateBank = this.updateBank.bind(this)
        
        let credentialFile = fs.readFileSync(`../credentials.json`, 'utf-8')
        this.secretKey = JSON.parse(credentialFile).apiToken

        this.current_party_leader = this.default_party_leader
        this.current_tank = this.default_tank

        this.loadBankFromMongo().catch(console.warn)
    }

    public addEventListners(bot: PingCompensatedCharacter) {
        if(this.secretKey == "") {
            return console.error("Add apiToken in credentials file!")
        }
        bot.socket.on("new_map", () => this.updateBank(bot))
        bot.socket.once("tracker", (data) => {
            const url = `https://aldata.earthiverse.ca/achievements/${bot.id}/${this.secretKey}`;
            const settings = {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ max: data.max, monsters: data.monsters }),
            };
            // if response.status == 200, it was successfully updated
            fetch(url, settings).then((response) => console.log(`Sending tracker info code: ${response.status}`));
            });
            bot.socket.emit("tracker");
    }

    public addFighter(fighter: StateStrategy) {
        this.fighters.push(fighter)
        this.addEventListners(fighter.getBot())
        this.active_bots.push(fighter.getBot())
    }

    public addMerchant(bot: MerchantStrategy) {
        this.merchant = bot
        this.addEventListners(bot.getBot())
        this.active_bots.push(bot.getBot())
    }

    public replaceBot(old_name: string, newBot: PingCompensatedCharacter) {
        if(newBot.name == old_name) {
            let oldBot
            for(let i = 0; i < this.active_bots.length; i++) {
                if(this.active_bots[i].name == old_name) {
                    oldBot = i
                    break
                }
            }
            this.active_bots[oldBot] = newBot
            this.addEventListners(newBot)
            console.debug(`Replaced ${old_name} to ${newBot.name} in bot collection`)
        }
        else {
            console.error(`NEED TO WRITE LOGIC FOR REPLACE ONE BOT FOR ANOTHER`)
        }
    }

    private async loadBankFromMongo() {
        if(!this.active_bots?.length || this.active_bots.length<1) return setTimeout(this.loadBankFromMongo, 500)
        if(Database.connection) {
            this.bank = await BankModel.findOne( {
                owner: this.active_bots[0].owner
            }) as BankInfo
            console.debug('Bank loaded from MONGO')
        }
    }

    public get getFighters() {
        return this.fighters
    }

    public get getMerchant() {
        return this.merchant
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