import { Warrior, ItemName, Tools, PingCompensatedCharacter} from "alclient"
import * as Items from "../configs/character_items_configs"
import * as CF from "../../src/common_functions/common_functions"
import { MemoryStorage } from "../common_functions/memory_storage";
import { StateStrategy } from "../common_functions/state_strategy";

export type warriorWeaponSwitchConfig = {
    cleave?:  boolean
    stomp?: boolean
}
export class WarriorsAttackStrategy extends StateStrategy {

    public warrior: Warrior

    private _firehazard : boolean = false;

    constructor (bot: Warrior, memoryStorage: MemoryStorage){
        super(bot as PingCompensatedCharacter,memoryStorage)
        this.warrior = bot
        this.bot = bot

        //binding
        this.attackLoop = this.attackLoop.bind(this)
        this.hardShellLoop = this.hardShellLoop.bind(this)
        this.useWarcryLoop = this.useWarcryLoop.bind(this)
        this.useMassAggroLoop = this.useMassAggroLoop.bind(this)
        this.useStomp = this.useStomp.bind(this)
        this.useCleave = this.useCleave.bind(this)

        //trigger started loops
        this.attackLoop()
        // this.useMassAggroLoop()
        this.hardShellLoop()
        this.useWarcryLoop()
    }

    public toogleFireHazard(){
        if (this._firehazard == true) this._firehazard = false
        else if(this._firehazard == false) this._firehazard = true
    }

    public getFirehazard() {
        return this._firehazard
    }

    private async attackLoop() {
        if(!this.warrior.canUse("attack")) return setTimeout(this.attackLoop, 500)
        if(this.warrior.isOnCooldown("attack")) return setTimeout(this.attackLoop, Math.max(1, this.warrior.getCooldown("attack")))
        let mobsTargetingMe = this.bot.getEntities({targetingMe: true})
        let totalDps = 0
        mobsTargetingMe.forEach( e => totalDps+= CF.calculate_monster_dps(this.bot, e))
        if( this.bot.c.town && this.bot.hp > totalDps*15 ) return setTimeout(this.attackLoop, 5000)
        
        let target = this.warrior.getTargetEntity()
        if( !target) return setTimeout(this.attackLoop, 100)
        if( this.warrior.isOnCooldown("scare") && this.warrior.getEntities({targetingMe: true, targetingPartyMember:true}).length<1) return setTimeout( this.attackLoop, this.warrior.getCooldown("scare"))
        if(!target.target && CF.calculate_monster_dps(this.warrior, this.warrior.getTargetEntity())/CF.calculate_hps(this.warrior) >=2) {
            console.log(`Monster DPS: ${CF.calculate_monster_dps(this.warrior, target)}, ${this.warrior.name} HPS: ${CF.calculate_hps(this.warrior)}`)
            return setTimeout(this.attackLoop, 500)
        }
        try {
            if(!this.warrior.smartMoving && this.warrior.canUse("stomp", {ignoreEquipped: true})) {
                await this.useStomp()
            }
            if(!this.warrior.smartMoving && this.warrior.canUse("cleave", {ignoreEquipped: true})) {
                await this.useCleave()
            }
            
            if(Tools.distance(this.warrior,target)<this.warrior.range) {
                await this.warrior.basicAttack(this.warrior.target).catch(console.error)
            }
            else if( !this.warrior.moving && !this.warrior.smartMoving ) {
                // console.log("trying move halfway to the target")
                let location = CF.getHalfWay(this.warrior, target)
                CF.moveHalfWay(this.warrior, location)
                return setTimeout(this.attackLoop, 500)
            }
        }
        catch(Ex) {
            console.error(Ex)
        }
        finally {
            setTimeout(this.attackLoop, Math.max(1, this.warrior.getCooldown("attack")))
        }
    }

    private async useWarcryLoop() {
        // console.log("Warcry loop")
        if(this.warrior.isOnCooldown("warcry")) return setTimeout(this.useWarcryLoop, this.warrior.getCooldown("warcry"))
        if(!this.warrior.canUse("warcry") || this.warrior.smartMoving) return setTimeout(this.useWarcryLoop, 2000)
        if(this.warrior.s.warcry) return setTimeout(this.useWarcryLoop, this.warrior.s.warcry.ms)

        await this.warrior.warcry().catch(console.warn)
        return setTimeout(this.useWarcryLoop, this.warrior.getCooldown("warcry"))
    }

    private async switchWeapons(config?: warriorWeaponSwitchConfig) {
        let botWC = Items.WEAPON_CONFIGS[this.bot.name] as Items.WarriorWeaponsConfig
        if(!botWC) return
        if(config?.cleave) {
            if(this.warrior.slots.offhand && this.warrior.esize > 0) {
                try {
                    
                    this.warrior.unequip("offhand")
                    
                }
                catch(ex){
                    console.error(ex)
                }
            }
            let cleave_weapon = botWC.cleave
            if(!cleave_weapon) return
            let cleave_item_idx = this.warrior.locateItem(cleave_weapon!.name as ItemName, [], {level: cleave_weapon!.level})
            return this.warrior.equip(cleave_item_idx).catch(console.error)
        }
        else if(config.stomp) {
            if(this.warrior.slots.offhand && this.warrior.esize > 0) {
                try {
                    
                    this.warrior.unequip("offhand")
                    
                }
                catch(ex){
                    console.error(ex)
                }
            }
            let stomp_item = botWC.stomp
            if(!stomp_item) return
            let stop_item_idx = this.warrior.locateItem(stomp_item!.name as ItemName, [], {level: stomp_item!.level})
            return this.warrior.equip(stop_item_idx).catch(console.error)
        }
        else {
            let mainhand_item
            let mainhand_idx = -1
            let offhand_item
            let offhand_idx = -1
            if(CF.shouldUseMassWeapon(this.warrior, this.memoryStorage.getCurrentTank)) {
                mainhand_item = botWC.solo_mainhand
                offhand_item = botWC.solo_offhand
            }
            else {
                mainhand_item = botWC.mass_mainhand
                offhand_item = botWC.mass_offhand
            }
            if(this.warrior.slots.mainhand?.name == mainhand_item?.name  && this.warrior.slots.offhand?.name == offhand_item?.name) return
            mainhand_idx = this.warrior.locateItem(mainhand_item.name, undefined, {level: mainhand_item?.level})
            offhand_idx = this.warrior.locateItem(offhand_item.name, undefined, {level: offhand_item?.level})
            if(mainhand_idx>=0 && offhand_idx>=0) return this.warrior.equipBatch([{num: mainhand_idx, slot: "mainhand"}, {num: offhand_idx, slot: "offhand"}]).catch(console.error)
        }
    }

    private async useCleave() {
        // console.log("Cealve loop")
        if(!CF.shouldUseMassWeapon(this.warrior, this.memoryStorage.getCurrentTank)) return //console.log("Don't want to use cleave")
        await this.switchWeapons({cleave: true})
        await this.warrior.cleave().catch(ex => console.error(ex))
        await this.switchWeapons()
    }

    private async useStomp() {
        // console.log("Calculating needs to use stomp")
        let dps = 0
        for(let mob of this.warrior.getEntities({targetingMe: true, targetingPartyMember: true, })) {
            let mobTarget = this.bot.getPlayers().filter( e => e.id == mob.target)[0]
            dps+= CF.calculate_monster_dps(mobTarget,mob)
        }
        if(CF.calculate_hps(this.warrior)/dps < 2) {
            console.log("we want to use stomp")
            await this.switchWeapons({stomp: true})
            await this.warrior.stomp().catch(console.error)
            await this.switchWeapons()
        }
        // console.log("we won't use stomp")
    }

    private async  useAggro() {
        
    }

    private async useMassAggroLoop() {
        if(this.warrior.isOnCooldown("scare")) return setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("scare"))
        if(this.warrior.smartMoving) return setTimeout(this.useMassAggroLoop, 2000)
        if(!CF.shouldUseMassWeapon(this.warrior, this.memoryStorage.getCurrentTank)) return setTimeout(this.useMassAggroLoop, 2000)
        if(this.warrior.getEntities({hasTarget: false}).length<2) return setTimeout(this.useMassAggroLoop, 2000)

        await this.warrior.agitate().catch(ex => console.error(ex))

        setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("agitate"))
    }

    public async useMassAggro() {
        if(this.warrior.isOnCooldown("scare")) return setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("scare"))
        if(this.warrior.smartMoving) return setTimeout(this.useMassAggroLoop, 2000)
        if(!CF.shouldUseMassWeapon(this.warrior, this.memoryStorage.getCurrentTank)) return setTimeout(this.useMassAggroLoop, 2000)
        if(this.warrior.getEntities({hasTarget: false}).length<2) return setTimeout(this.useMassAggroLoop, 2000)

        await this.warrior.agitate().catch(ex => console.error(ex))

    }

    private async hardShellLoop() {
        // console.log("Hardshell loop")
        if(this.warrior.smartMoving || !this.warrior.canUse("hardshell") || this.warrior.moving) return setTimeout(this.hardShellLoop, 2000)
        if(this.warrior.hp < this.warrior.max_hp * 0.6 && Object.values(this.warrior.getEntities({targetingMe: true})).filter(e=> e.damage_type == "physical").length>0) {
            await this.warrior.hardshell().catch(console.error)
            return setTimeout(this.hardShellLoop, this.warrior.getCooldown("hardshell"))
        }
        return setTimeout(this.hardShellLoop, 2000)
    }
}