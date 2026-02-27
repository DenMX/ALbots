import { Game, Warrior, ItemName, Tools, PingCompensatedCharacter, LimitDCReportData} from "alclient"
import * as Items from "../configs/character_items_configs"
import * as CF from "../../src/common_functions/common_functions"
import { debugLog } from "../../src/common_functions/common_functions";
import { MemoryStorage } from "../common_functions/memory_storage";
import { StateStrategy } from "../common_functions/state_strategy";

export type warriorWeaponSwitchConfig = {
    cleave?:  boolean
    stomp?: boolean
}
export class WarriorsAttackStrategy extends StateStrategy {

    public warrior: Warrior

    private _firehazard : boolean = false;

    private lastWeaponSwitch: number

    constructor (bot: Warrior, memoryStorage: MemoryStorage){
        super(bot as PingCompensatedCharacter,memoryStorage)
        this.warrior = bot
        this.bot = bot

        //binding
        this.attackLoop = this.attackLoop.bind(this)
        this.hardShellLoop = this.hardShellLoop.bind(this)
        this.useWarcryLoop = this.useWarcryLoop.bind(this)
        this.useMassAggroLoop = this.useMassAggroLoop.bind(this)
        this.switchWeapons = this.switchWeapons.bind(this)
        this.switchWeaponsLoop = this.switchWeaponsLoop.bind(this)
        this.useStomp = this.useStomp.bind(this)
        this.useCleave = this.useCleave.bind(this)
        this.useCharge = this.useCharge.bind(this)
        this.useMassSkillsWeapon = this.useMassSkillsWeapon.bind(this)

        //trigger started loops
        this.attackLoop()
        this.switchWeaponsLoop()
        this.useMassAggroLoop()
        this.hardShellLoop()
        this.useWarcryLoop()
        this.useMassSkillsWeapon()
    }


    public toogleFireHazard(){
        if (this._firehazard == true) this._firehazard = false
        else if(this._firehazard == false) this._firehazard = true
    }

    public getFirehazard() {
        return this._firehazard
    }

    private async attackLoop() {
        if(this.deactivate) return
        if(!this.warrior.canUse("attack")) {
            return setTimeout(this.attackLoop, 500)
        }
        if(this.warrior.isOnCooldown("attack")) {
            return setTimeout(this.attackLoop, Math.max(1, this.warrior.getCooldown("attack")))
        }
        let mobsTargetingMe = this.bot.getEntities({targetingMe: true})
        let totalDps = 0
        mobsTargetingMe.forEach( e => totalDps+= CF.calculate_monster_dps(this.bot, e))
        if( this.bot.c.town && this.bot.hp > totalDps*15 ) {
            return setTimeout(this.attackLoop, 15000)
        }
        
        let target = this.warrior.getTargetEntity()
        if( !target) {
            return setTimeout(this.attackLoop, 100)
        }
        if( this.warrior.hasItem("jacko") && this.warrior.isOnCooldown("scare") && this.warrior.getEntities({targetingMe: true, targetingPartyMember:true}).length<1) {
            return setTimeout( this.attackLoop, this.warrior.getCooldown("scare"))
        }
        if(!target.target && CF.calculate_monster_dps(this.warrior, target, true)/CF.calculate_hps(this.warrior) >=0.95) {
            console.log(`Monster DPS: ${CF.calculate_monster_dps(this.warrior, target, true)}, ${this.warrior.name} HPS: ${CF.calculate_hps(this.warrior)}`)
            return setTimeout(this.attackLoop, 500)
        }
        try {            
            if(Tools.distance(this.warrior,target)<this.warrior.range) {
                await this.warrior.basicAttack(target.id).catch(debugLog)
            }
            else if( !this.warrior.moving && !this.warrior.smartMoving ) {
                // console.log("trying move halfway to the target")
                let location = CF.getHalfWay(this.warrior, target)
                CF.moveHalfWay(this.warrior, location)
                // return setTimeout(this.attackLoop, 500)
            }
        }
        catch(Ex) {
            console.error(Ex)
        }
        finally {
            setTimeout(this.attackLoop, Math.max(1, this.warrior.getCooldown("attack")))
        }
    }

    private async useMassSkillsWeapon() {
        if(this.deactivate) return
        await this.useCleave()
        await this.useStomp()
        setTimeout(this.useMassSkillsWeapon, Math.max(1000,this.warrior.getCooldown("cleave")))
    }

    private async useWarcryLoop() {
        if(this.deactivate) return
        // console.log("Warcry loop")
        if(this.warrior.isOnCooldown("warcry")) {
            return setTimeout(this.useWarcryLoop, this.warrior.getCooldown("warcry"))
        }
        if(!this.warrior.canUse("warcry") || this.warrior.smartMoving) {
            return setTimeout(this.useWarcryLoop, 2000)
        }
        if(this.warrior.s.warcry) {
            return setTimeout(this.useWarcryLoop, this.warrior.s.warcry.ms)
        }

        await this.warrior.warcry().catch(console.warn)
        return setTimeout(this.useWarcryLoop, this.warrior.getCooldown("warcry"))
    }

    private async switchWeapons(config?: warriorWeaponSwitchConfig) {
        let botWC = Items.WEAPON_CONFIGS[this.bot.name] as Items.WarriorWeaponsConfig
        if(!botWC) return //console.error("No weapon config found")
        let mainhand = this.warrior.slots.mainhand.name
        if( mainhand == botWC.cleave?.name || mainhand == botWC.stomp?.name ) return 
        if(config?.cleave && botWC.cleave) {
            //console.debug("Want to switch to cleave weapon")
            let cleave_weapon = botWC.cleave
            if(cleave_weapon.name == this.warrior.slots?.mainhand?.name) return console.log("Cleave weapon is already equiped")
            if(!this.bot.hasItem(cleave_weapon.name, undefined, {level: cleave_weapon.level})) return
            let cleave_item_idx = this.warrior.locateItem(cleave_weapon.name, undefined, {level: cleave_weapon.level})
            
            try {
               if(this.warrior.slots?.offhand && this.warrior.esize > 0) {
                await this.warrior.unequip("offhand").catch(console.error)
                    // console.log("Unequiped offhand")
                }
                
                // console.log("Equiped cleave weapon")
            }
            catch(ex){
                console.error(ex)
            }
            this.lastWeaponSwitch = Date.now()
            return this.warrior.equip(cleave_item_idx).catch(console.error)
                        
        }
        else if(config?.stomp && botWC.stomp) {
            let stomp_item = botWC.stomp
            if(!this.bot.hasItem(stomp_item.name, undefined, {level: stomp_item.level})) return
            if(this.bot.slots.mainhand.name == stomp_item.name) return
            if(this.warrior.slots.offhand && this.warrior.esize > 0) {
                try {
                    
                    this.warrior.unequip("offhand").catch(debugLog)
                    
                }
                catch(ex){
                    console.error(ex)
                }
            }
            
            
            let stop_item_idx = this.warrior.locateItem(stomp_item.name, undefined, {level: stomp_item.level})
            this.lastWeaponSwitch = Date.now()
            return this.warrior.equip(stop_item_idx).catch(console.error)
        }
        else if(!config || (!config?.cleave && !config?.stomp) ) {
            let mainhand_item
            
            let offhand_item
            
            if(CF.shouldUseMassWeapon(this.warrior, this.memoryStorage.getCurrentTank)) {
                // console.debug(`Warrior want mass weapon`)
                mainhand_item = botWC.mass_mainhand
                offhand_item = botWC.mass_offhand
            }
            else {
                // console.debug(`Warrior want solo weapon`)
                mainhand_item = botWC.solo_mainhand
                offhand_item = botWC.solo_offhand
            }
            if(this.warrior.slots.mainhand?.name == mainhand_item?.name  && this.warrior.slots.offhand?.name == offhand_item?.name) return
            if(mainhand_item.name == offhand_item.name && mainhand_item.level == offhand_item.level) {
                let items = this.bot.locateItems(mainhand_item.name, undefined, {level: mainhand_item.level})
                if(!items) return 
                items.length > 1 ? 
                    await this.bot.equipBatch([{num: items[0], slot: "mainhand"},{num: items[1], slot: "offhand"}]).catch(debugLog)
                    :
                    await this.bot.equipBatch([{num: items[0], slot: "mainhand"}]).catch(debugLog)
                this.lastWeaponSwitch = Date.now()
                return 
            }
            let mainhand_idx = this.warrior.locateItem(mainhand_item.name, undefined, {level: mainhand_item?.level})
            if( mainhand_idx ) await this.warrior.equip(mainhand_idx,"mainhand").catch(debugLog)
            let offhand_idx = this.warrior.locateItem(offhand_item.name, undefined, {level: offhand_item?.level})
            if( offhand_idx ) await this.warrior.equip(offhand_idx, "offhand").catch(debugLog)
        }
        this.lastWeaponSwitch = Date.now()
    }

    private async useCharge() {
        if(this.deactivate) return
        if(this.bot.smartMoving && !this.bot.isOnCooldown("charge")) {
            await this.warrior.charge()
            return setTimeout(this.useCharge, Math.max(1,this.bot.getCooldown("charge")))
        }
        else if(this.bot.isOnCooldown("charge")) return setTimeout(this.useCharge, Math.max(1,this.bot.getCooldown("charge")))
        
        return setTimeout(this.useCharge, 1000)
    }

    private async switchWeaponsLoop() {
        if(this.deactivate) return
        let botWC = Items.WEAPON_CONFIGS[this.bot.name] as Items.WarriorWeaponsConfig
        if(!botWC) return
        if(Date.now() - this.lastWeaponSwitch < 1000) return setTimeout(this.switchWeaponsLoop, 500)
        if( this.warrior.canUse("cleave") || this.warrior.canUse("stomp") ) return setTimeout(this.switchWeaponsLoop, 500)

        let mainhand_item
            
        let offhand_item
        
        if(CF.shouldUseMassWeapon(this.warrior, this.memoryStorage.getCurrentTank)) {
            // console.debug(`Warrior want mass weapon`)
            mainhand_item = botWC.mass_mainhand
            offhand_item = botWC.mass_offhand
        }
        else {
            // console.debug(`Warrior want solo weapon`)
            mainhand_item = botWC.solo_mainhand
            offhand_item = botWC.solo_offhand
        }
        if(this.warrior.slots.mainhand?.name == mainhand_item?.name  && this.warrior.slots.offhand?.name == offhand_item?.name) {
            // console.debug('using weapon as we want')
            return setTimeout(this.switchWeaponsLoop,1000)
        }
        if(mainhand_item.name == offhand_item.name && mainhand_item.level == offhand_item.level) {
            let items = this.bot.locateItems(mainhand_item.name, undefined, {level: mainhand_item.level})
            if(!items) {
                return setTimeout(this.switchWeapons, 1000)
            }
            items.length > 1 ? 
                await this.bot.equipBatch([{num: items[0], slot: "mainhand"},{num: items[1], slot: "offhand"}]).catch(debugLog)
                :
                await this.bot.equipBatch([{num: items[0], slot: "mainhand"}]).catch(debugLog)

            return setTimeout(this.switchWeaponsLoop, 1000)
        }
        let mainhand_idx = this.warrior.locateItem(mainhand_item.name, undefined, {level: mainhand_item?.level})
        // console.debug(`Mainhand ${mainhand_item.name} in ${mainhand_idx} slot.`)
        if( mainhand_idx !== undefined ) await this.warrior.equip(mainhand_idx,"mainhand").catch(debugLog)
        let offhand_idx = this.warrior.locateItem(offhand_item.name, undefined, {level: offhand_item?.level})
        // console.debug(`Offhand ${offhand_item.name} in ${offhand_idx} slot.`)        
        if( offhand_idx !== undefined ) await this.warrior.equip(offhand_idx, "offhand").catch(debugLog)
        
        setTimeout(this.switchWeaponsLoop,5000)
    }

    private async useCleave() {
        // console.log("Cealve loop")
        if(this.warrior.isOnCooldown("cleave")) return 
        if(!this.warrior.canUse("cleave", {ignoreEquipped: true})) return 
        if(!CF.shouldUseMassSkill(this.warrior, this.getMemoryStorage.getCurrentTank, "cleave") || this.warrior.getEntities({withinRange:"cleave"}).length<3) return //console.log("Don't want to use cleave")
        await this.switchWeapons({cleave: true})
        if(Game.G.skills.cleave.wtype.includes(Game.G.items[this.warrior.slots.mainhand?.name].wtype)) {
            await this.warrior.cleave().catch(debugLog)
            
        }
        await this.switchWeapons()
    }

    private async useStomp() {
        // console.log("Calculating needs to use stomp")
        if(this.deactivate) return
        if(this.warrior.isOnCooldown("stomp")) return
        if(!this.warrior.canUse("stomp", {ignoreEquipped: true})) return
        let dps = 0
        for(let mob of this.warrior.getEntities({targetingMe: true, targetingPartyMember: true, })) {
            let mobTarget = this.bot.getPlayers().filter( e => e.id == mob.target)[0]
            dps+= CF.calculate_monster_dps(mobTarget,mob)
        }
        if ( (dps> CF.calculate_hps(this.warrior) / 2)
            || this.warrior.getPlayers({isPartyMember: true, isDead: false})
                .filter( e => e.hp < e.max_hp * 0.6 && this.bot.getEntities().filter(m => m.target == e.id).length>0).length > 0
            ) {
            // console.log("we want to use stomp")
            await this.switchWeapons({stomp: true})
            if( Game.G.skills.stomp.wtype?.includes(Game.G.items[this.warrior.slots.mainhand?.name].wtype) )await this.warrior.stomp().catch(debugLog)
            await this.switchWeapons()
        }
        // console.log("we won't use stomp")
    }

    private async  useAggro() {
        
    }

    private async useMassAggroLoop() {
        if(this.deactivate) return
        if(this.warrior.isOnCooldown("scare")) {
            return setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("scare"))
        }
        if(this.warrior.smartMoving || !this.warrior.canUse("agitate")) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if(!CF.shouldUseMassSkill(this.warrior, this.memoryStorage.getCurrentTank, "agitate")) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if(this.warrior.getEntities({hasTarget: false, withinRange: "agitate"}).length<2) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }

        await this.warrior.agitate().catch(ex => console.error(ex))

        setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("agitate"))
    }

    public async useMassAggro() {
        if(this.deactivate) return
        if(this.warrior.isOnCooldown("scare")) {
            return setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("scare"))
        }
        if(this.warrior.smartMoving) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if(!CF.shouldUseMassWeapon(this.warrior, this.memoryStorage.getCurrentTank)) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if(this.warrior.getEntities({hasTarget: false}).length<2) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }

        await this.warrior.agitate().catch(ex => console.error(ex))

    }

    private async hardShellLoop() {
        if(this.deactivate) return
        // console.log("Hardshell loop")
        if(this.warrior.smartMoving || !this.warrior.canUse("hardshell") || this.warrior.moving) {
            return setTimeout(this.hardShellLoop, 2000)
        }
        if(this.warrior.hp < this.warrior.max_hp * 0.6 && Object.values(this.warrior.getEntities({targetingMe: true})).filter(e=> e.damage_type == "physical").length>0) {
            await this.warrior.hardshell().catch(console.error)
            return setTimeout(this.hardShellLoop, this.warrior.getCooldown("hardshell"))
        }
        return setTimeout(this.hardShellLoop, 2000)
    }
}