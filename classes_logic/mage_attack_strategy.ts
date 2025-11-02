import {Tools, Game, Mage } from "alclient"

export class MageAttackStrategy {

    private bot : Mage

    constructor(bot: Mage) {
        this.bot = bot
    }

    public getBot() {
        return this.bot
    }

    
}