import { Warrior, ItemName, Tools} from "alclient"
import * as Items from "../classes_configs/items"
import * as CF from "../../src/common_functions/common_functions"
import { MemoryStorage } from "../common_functions/memory_storage";
import { ManageItems } from "../common_functions/manage_items_strategy";
import { StateStrategy } from "../common_functions/state_strategy";


export class WarriorsAttackStrategy extends StateStrategy {

    private warrior: Warrior

    private _firehazard : boolean = false;

    constructor (bot: Warrior, memoryStorage: MemoryStorage){
        super(bot, memoryStorage)
        this.warrior = bot
        this.bot = bot
        this.memoryStorage = memoryStorage
        setTimeout(() => this.initializ(), 1000)
    }

    private async initializ() {
        await this.attackLoop()
        // this.useMassAggroLoop()
        await this.hardShellLoop()
        await this.useWarcryLoop()
    }


    public toogleFireHazard(){
        if (this._firehazard == true) this._firehazard = false
        else if(this._firehazard == false) this._firehazard = true
    }

    public getFirehazard() {
        return this._firehazard
    }

    private async attackLoop() {
        if( !this.warrior.getTargetEntity()) return setTimeout(this.attackLoop, 100)
        if( this.warrior.isOnCooldown("scare") && this.warrior.getEntities({targetingMe: true, targetingPartyMember:true}).length<1) return setTimeout(this.attackLoop, this.warrior.getCooldown("scare"))
        if(!this.warrior.getTargetEntity().target && CF.calculate_monster_dps(this.warrior, this.warrior.getTargetEntity())/CF.calculate_hps(this.warrior) >=2) return setTimeout(this.attackLoop, 500)
        try {
            if(!this.warrior.smartMoving && this.warrior.canUse("stomp", {ignoreEquipped: true})) {
                await this.useStomp()
            }
            if(!this.warrior.smartMoving && this.warrior.canUse("cleave", {ignoreEquipped: true})) {
                await this.useCleave()
            }
            if(this.warrior.target && this.warrior.canUse("attack")) {
                if(this.warrior.getEntities({withinRange: "attack"}).filter( e=> e.id == this.warrior.target).length>0) {
                    await this.warrior.basicAttack(this.warrior.target).catch(ex => console.error(ex))
                }
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
        if(this.warrior.isOnCooldown("warcry")) return setTimeout(this.useWarcryLoop, this.warrior.getCooldown("warcry"))
        if(!this.warrior.canUse("warcry") || this.warrior.smartMoving) return setTimeout(this.useWarcryLoop, 2000)
        if(this.warrior.s.warcry) return setTimeout(this.useWarcryLoop, this.warrior.s.warcry.ms)

        await this.useWarcryLoop().catch(ex => console.warn(ex))
        return setTimeout(this.useWarcryLoop, this.warrior.getCooldown("warcry"))
    }

    private async switchWeapons(cleave? : boolean, stomp?: boolean) {
        if(cleave) {
            if(this.warrior.slots.offhand && this.warrior.esize > 0) {
                try {
                    
                    this.warrior.unequip("offhand")
                    
                }
                catch(ex){
                    console.error(ex)
                }
            }
            let cleave_weapon = Items.WariousItems.cleave
            let cleave_item_idx = this.warrior.locateItem(cleave_weapon!.name as ItemName, [], {level: cleave_weapon!.level})
            this.warrior.equip(cleave_item_idx).catch(ex => console.error(ex))
        }
        else if(stomp) {
            if(this.warrior.slots.offhand && this.warrior.esize > 0) {
                try {
                    
                    this.warrior.unequip("offhand")
                    
                }
                catch(ex){
                    console.error(ex)
                }
            }
            let stomp_item = Items.WariousItems.stomp
            let stop_item_idx = this.warrior.locateItem(stomp_item!.name as ItemName, [], {level: stomp_item!.level})
            this.warrior.equip(stop_item_idx).catch(ex => console.error(ex))
        }
        else {
            let mainhand_item
            let mainhand_idx = -1
            let offhand_item
            let offhand_idx = -1
            if(CF.shouldUseMassWeapon(this.warrior)) {
                mainhand_item = Items.WariousItems.solo_mainhand
                offhand_item = Items.WariousItems.solo_offhand
            }
            else {
                mainhand_item = Items.WariousItems.mass_mainhand
                offhand_item = Items.WariousItems.mass_offhand
            }
            if(this.warrior.slots.mainhand?.name == mainhand_item!.name as ItemName && this.warrior.slots.offhand?.name == offhand_item!.name) return
            mainhand_idx = this.warrior.locateItem(mainhand_item!.name as ItemName, [], {level: mainhand_item!.level})
            mainhand_idx = this.warrior.locateItem(mainhand_item!.name as ItemName, [], {level: mainhand_item!.level})
            this.warrior.equipBatch([{num: mainhand_idx, slot: "mainhand"}, {num: offhand_idx, slot: "offhand"}]).catch(ex => console.error(ex))
        }
    }

    

    private async useCleave() {
        if(!CF.shouldUseMassWeapon(this.warrior)) return
        await this.switchWeapons(true)
        await this.warrior.cleave().catch(ex => console.error(ex))
        await this.switchWeapons()
    }

    private async useStomp() {
        let dps = 0
        for(let mob of this.warrior.getEntities({targetingMe: true, targetingPartyMember: true, })) {
            if(mob.damage_type == "physical"){
                let paty_armor = this.warrior.players.get(mob.target)?.armor || 0
                if(mob.target == this.warrior.name) dps += mob.attack * Tools.damage_multiplier(this.warrior.armor) * mob.frequency
                else dps += mob.attack * Tools.damage_multiplier(paty_armor) * mob.frequency
            }
            else if(mob.damage_type == "magical"){
                let paty_armor = this.warrior.players.get(mob.target)?.resistance || 0
                if(mob.target == this.warrior.name) dps += mob.attack * Tools.damage_multiplier(this.warrior.resistance) * mob.frequency
                else dps += mob.attack * Tools.damage_multiplier(paty_armor) * mob.frequency
            }
            else {
                dps += mob.attack * mob.frequency
            }
        }
        if(CF.calculate_hps(this.warrior)/dps < 2) {
            await this.switchWeapons(false, true)
            await this.warrior.stomp().catch(ex => console.error(ex))
            await this.switchWeapons()
        }
    }

    private async  useAggro() {
        
    }

    private async useMassAggroLoop() {
        if(this.warrior.isOnCooldown("scare")) return setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("scare"))
        if(this.warrior.smartMoving) return setTimeout(this.useMassAggroLoop, 2000)
        if(!CF.shouldUseMassWeapon(this.warrior)) return setTimeout(this.useMassAggroLoop, 2000)
        if(this.warrior.getEntities({hasTarget: false}).length<2) return setTimeout(this.useMassAggroLoop, 2000)

        await this.warrior.agitate().catch(ex => console.error(ex))

        setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("agitate"))
    }

    public async useMassAggro() {
        if(this.warrior.isOnCooldown("scare")) return setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("scare"))
        if(this.warrior.smartMoving) return setTimeout(this.useMassAggroLoop, 2000)
        if(!CF.shouldUseMassWeapon(this.warrior)) return setTimeout(this.useMassAggroLoop, 2000)
        if(this.warrior.getEntities({hasTarget: false}).length<2) return setTimeout(this.useMassAggroLoop, 2000)

        await this.warrior.agitate().catch(ex => console.error(ex))

    }

    private async hardShellLoop() {
        if(this.warrior.smartMoving || !this.warrior.canUse("hardshell") || this.warrior.moving) return setTimeout(this.hardShellLoop, 2000)
        if(this.warrior.hp < this.warrior.max_hp * 0.6 && Object.values(this.warrior.getEntities({targetingMe: true})).filter(e=> e.damage_type == "physical").length>0) {
            await this.warrior.hardshell().catch(ex => console.error(ex))
            return setTimeout(this.hardShellLoop, this.warrior.getCooldown("hardshell"))
        }
        return setTimeout(this.hardShellLoop, 2000)
    }
}