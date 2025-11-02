import { Warrior, ItemName, Tools} from "alclient"
import * as Items from "../classes_configs/items.ts"
import * as CF from "../common_functions/common_functions.ts"


export class WarriorsAttackStrategy {

    private bot : Warrior;

    private _firehazard : boolean = false;

    constructor (bot: Warrior){
        this.bot = bot
        this.attackLoop()
        // this.useMassAggroLoop()
        this.hardShellLoop()
    }

    public getBot(){
        return this.bot
    }

    public toogleFireHazard(){
        if (this._firehazard == true) this._firehazard = false
        else if(this._firehazard == false) this._firehazard = true
    }

    public getFirehazard() {
        return this._firehazard
    }

    async attackLoop() {
        if( !this.bot.getTargetEntity()) return setTimeout(this.attackLoop, 100)
        if( this.bot.isOnCooldown("scare") && this.bot.getEntities({targetingMe: true, targetingPartyMember:true}).length<1) return setTimeout(this.attackLoop, this.bot.getCooldown("scare"))

        try {
            if(!this.bot.smartMoving && this.bot.canUse("stomp", {ignoreEquipped: true})) {
                await this.useStomp()
            }
            if(!this.bot.smartMoving && this.bot.canUse("cleave", {ignoreEquipped: true})) {
                await this.useCleave()
            }
            if(this.bot.target && this.bot.canUse("attack")) {
                if(this.bot.getEntities({withinRange: "attack"}).filter( e=> e.id == this.bot.target).length>0) {
                    await this.switchWeapons()
                    await this.bot.basicAttack(this.bot.target).catch(ex => console.error(ex))
                }
            }
        }
        catch(Ex) {
            console.error(Ex)
        }
        finally {
            setTimeout(this.attackLoop, Math.max(1, this.bot.getCooldown("attack")))
        }
    }

    private async switchWeapons(cleave? : boolean, stomp?: boolean) {
        if(cleave) {
            if(this.bot.slots.offhand && this.bot.esize > 0) {
                try {
                    
                    this.bot.unequip("offhand")
                    
                }
                catch(ex){
                    console.error(ex)
                }
            }
            let cleave_weapon = Items.PERSONAL_ITEMS[this.bot.name as keyof typeof Items.PERSONAL_ITEMS].cleave
            let cleave_item_idx = this.bot.locateItem(cleave_weapon.name as ItemName, [], {level: cleave_weapon.level})
            this.bot.equip(cleave_item_idx).catch(ex => console.error(ex))
        }
        else if(stomp) {
            if(this.bot.slots.offhand && this.bot.esize > 0) {
                try {
                    
                    this.bot.unequip("offhand")
                    
                }
                catch(ex){
                    console.error(ex)
                }
            }
            let stomp_item = Items.PERSONAL_ITEMS[this.bot.name as keyof typeof Items.PERSONAL_ITEMS].stomp
            let stop_item_idx = this.bot.locateItem(stomp_item.name as ItemName, [], {level: stomp_item.level})
            this.bot.equip(stop_item_idx).catch(ex => console.error(ex))
        }
        else {
            let mainhand_item
            let mainhand_idx = -1
            let offhand_item
            let offhand_idx = -1
            if(CF.shouldUseMassWeapon(this.bot)) {
                mainhand_item = Items.PERSONAL_ITEMS[this.bot.name as keyof typeof Items.PERSONAL_ITEMS].solo_mainhand
                offhand_item = Items.PERSONAL_ITEMS[this.bot.name as keyof typeof Items.PERSONAL_ITEMS].solo_offhand
            }
            else {
                mainhand_item = Items.PERSONAL_ITEMS[this.bot.name as keyof typeof Items.PERSONAL_ITEMS].mass_mainhand
                offhand_item = Items.PERSONAL_ITEMS[this.bot.name as keyof typeof Items.PERSONAL_ITEMS].mass_offhand
            }
            if(this.bot.slots.mainhand?.name == mainhand_item.name as ItemName && this.bot.slots.offhand?.name == offhand_item.name) return
            mainhand_idx = this.bot.locateItem(mainhand_item.name as ItemName, [], {level: mainhand_item.level})
            mainhand_idx = this.bot.locateItem(mainhand_item.name as ItemName, [], {level: mainhand_item.level})
            this.bot.equipBatch([{num: mainhand_idx, slot: "mainhand"}, {num: offhand_idx, slot: "offhand"}]).catch(ex => console.error(ex))
        }
    }

    

    private async useCleave() {
        if(!CF.shouldUseMassWeapon(this.bot)) return
        await this.switchWeapons(true)
        await this.bot.cleave().catch(ex => console.error(ex))

    }

    private async useStomp() {
        let dps = 0
        for(let mob of this.bot.getEntities({targetingMe: true, targetingPartyMember: true, })) {
            if(mob.damage_type == "physical"){
                let paty_armor = this.bot.players.get(mob.target)?.armor || 0
                if(mob.target == this.bot.name) dps += mob.attack * Tools.damage_multiplier(this.bot.armor) * mob.frequency
                else dps += mob.attack * Tools.damage_multiplier(paty_armor) * mob.frequency
            }
            else if(mob.damage_type == "magical"){
                let paty_armor = this.bot.players.get(mob.target)?.resistance || 0
                if(mob.target == this.bot.name) dps += mob.attack * Tools.damage_multiplier(this.bot.resistance) * mob.frequency
                else dps += mob.attack * Tools.damage_multiplier(paty_armor) * mob.frequency
            }
            else {
                dps += mob.attack * mob.frequency
            }
        }
        if(CF.calculate_hps(this.bot)/dps < 2) {
            await this.switchWeapons(false, true)
            await this.bot.stomp().catch(ex => console.error(ex))
        }
    }

    private async  useAggro() {
        
    }

    private async useMassAggroLoop() {
        if(this.bot.isOnCooldown("scare")) return setTimeout(this.useMassAggroLoop, this.bot.getCooldown("scare"))
        if(this.bot.smartMoving) return setTimeout(this.useMassAggroLoop, 2000)
        if(!CF.shouldUseMassWeapon(this.bot)) return setTimeout(this.useMassAggroLoop, 2000)
        if(this.bot.getEntities({hasTarget: false}).length<2) return setTimeout(this.useMassAggroLoop, 2000)

        await this.bot.agitate().catch(ex => console.error(ex))

        setTimeout(this.useMassAggroLoop, this.bot.getCooldown("agitate"))
    }

    private async hardShellLoop() {
        if(this.bot.smartMoving || !this.bot.canUse("hardshell") || this.bot.moving) return setTimeout(this.hardShellLoop, 2000)
        if(this.bot.hp < this.bot.max_hp * 0.6 && Object.values(this.bot.getEntities({targetingMe: true})).filter(e=> e.damage_type == "physical").length>0) {
            await this.bot.hardshell().catch(ex => console.error(ex))
            return setTimeout(this.hardShellLoop, this.bot.getCooldown("hardshell"))
        }
        return setTimeout(this.hardShellLoop, 2000)
    }
}