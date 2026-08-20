import {Tools, Ranger, SkillName, SlotType, Entity, Pathfinder, IPosition, MonsterName, Game, ItemName} from "alclient"
import * as CF from "../../src/common_functions/common_functions"
import * as Items from "../configs/character_items_configs"
import { MemoryStorage } from "../common_functions/memory_storage"
import { StateStrategy } from "../common_functions/state_strategy"
import { RangerWeaponConfig, WEAPON_CONFIGS } from "../configs/character_items_configs"
import { debugLog } from "../common_functions/common_functions"
import { CRYPT_ALLY_NEAR_RANGE, CRYPT_BLACKLIST, SPECIAL_MONSTERS } from "../configs/events_and_spots"

export class RangerAttackStrategy extends StateStrategy {

    private ranger : Ranger

    constructor(bot: Ranger, memoryStorage: MemoryStorage) {
        super(bot, memoryStorage)
        this.ranger = bot

        this.basicAttackLoop = this.basicAttackLoop.bind(this)
        this.useSupershotLoop = this.useSupershotLoop.bind(this)
        this.useMarkLoop = this.useMarkLoop.bind(this)
        this.useFourFingersLoop = this.useFourFingersLoop.bind(this)
        this.changeWeapon = this.changeWeapon.bind(this)


        this.basicAttackLoop()
        this.useSupershotLoop()
        this.useMarkLoop()
        this.useFourFingersLoop()
        // this.changeWeapon()
    }

    /** HPS budget for crypt pulls; poison cuts effective heal by 25%. */
    private getCryptHpsBudget(): number {
        let hps = CF.calculate_hps(this.ranger)
        if (this.ranger.s?.poisoned) hps *= 0.75
        return hps
    }

    private getCryptEngagedMobs(): Entity[] {
        return this.ranger.getEntities().filter(e => this.isPartyCryptTarget(e.target))
    }

    /** Untagged mob only if allies nearby and current engaged DPS + its DPS stays under HPS budget. */
    private canCryptPullExtra(entity: Entity, alreadyQueued: Entity[] = []): boolean {
        if (this.isPartyCryptTarget(entity.target)) return true
        if (entity.target) return false
        // Never open new pulls while solo — scare/flee instead
        if (!this.hasCryptAllyNearby()) return false
        const engaged = this.getCryptEngagedMobs()
        const pack = [...engaged]
        for (const e of alreadyQueued) {
            if (!pack.some(p => p.id === e.id)) pack.push(e)
        }
        if (pack.some(p => p.id === entity.id)) return true
        const currentDps = CF.calculate_monsters_dps(this, this, pack, true)
        const addDps = CF.calculate_monster_dps(this, entity, true)
        return currentDps + addDps <= this.getCryptHpsBudget()
    }

    protected shouldAttack(entity: Entity): boolean {
        if (!entity) return false
        if (this.isCryptCombatState()) {
            if (CRYPT_BLACKLIST.includes(entity.type as MonsterName)) return false
            if (entity.xp < 1) return false
            // Don't open on unkillable overhealers (e.g. a5/a8) — leave them for route skip
            if (this.isOverhealingMob(entity)) return false
            // Always help finish pack already on the party
            if (this.isPartyCryptTarget(entity.target)) return true
            if (entity.target) return false
            // New pull only if engaged DPS + this mob stays under HPS budget
            return this.canCryptPullExtra(entity)
        }
        return super.shouldAttack(entity)
    }

    private hasCryptAllyNearby(range = CRYPT_ALLY_NEAR_RANGE): boolean {
        return this.bot.getPlayers({ isPartyMember: true, isDead: false })
            .some(p => p.id !== this.bot.id && p.ctype !== "merchant" && Tools.distance(this.bot, p) <= range)
    }

    /** Solo aggro or pack over HPS — scare + run (don't stand and die). */
    private async cryptScareOrFleeIfNeeded(): Promise<boolean> {
        if (!this.isCryptCombatState()) return false
        const onMe = this.ranger.getEntities({ targetingMe: true })
        if (onMe.length < 1) return false

        const dps = CF.calculate_monsters_dps(this, this, onMe, true)
        const hps = this.getCryptHpsBudget()
        const alone = !this.hasCryptAllyNearby()
        const overwhelmed = dps > hps
        if (!alone && !overwhelmed) return false

        const nearest = onMe.reduce((a, b) =>
            Tools.distance(this.ranger, a) <= Tools.distance(this.ranger, b) ? a : b,
        )
        this.addLog(
            `${this.ranger.name} crypt scare/flee (alone=${alone} dps=${Math.floor(dps)} hps=${Math.floor(hps)})`,
            false,
        )
        await this.scareAndRetreatFrom(nearest)
        // If scare on CD / no jacko — still kite away
        if (onMe.some(e => e.target === this.ranger.id)) {
            const angle = Math.atan2(this.ranger.y - nearest.y, this.ranger.x - nearest.x)
            const flee: IPosition = {
                map: this.ranger.map,
                x: this.ranger.x + Math.cos(angle) * 200,
                y: this.ranger.y + Math.sin(angle) * 200,
            }
            if (Pathfinder.canStand(flee)) {
                await this.ranger.move(flee.x, flee.y).catch(debugLog)
            }
        }
        return true
    }

    private async basicAttackLoop() {
        if(this.deactivate) return
        if(this.ranger.isOnCooldown("attack")) {
            return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("attack")))
        }
        if(!this.ranger.canUse("attack")) {
            return setTimeout(this.basicAttackLoop, 300)
        }

        if (await this.cryptScareOrFleeIfNeeded()) {
            return setTimeout(this.basicAttackLoop, 500)
        }

        let healTarget = this.bot.getPlayers({isPartyMember: true, withinRange: "attack", isDead: false}).filter( e => e.hp < e.max_hp * 0.45).sort( (a,b) => a.hp - b.hp)[0]
        if(!this.isHazardState() && healTarget && (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_weapon) {
            await this.switchWeapon("heal")
            await this.bot.basicAttack(healTarget.id).catch(debugLog)
            return setTimeout(this.basicAttackLoop, Math.max(1,this.ranger.getCooldown("attack")))
        }
        
        if( this.bot.c.town ) {
            return setTimeout(this.basicAttackLoop, 15000)
        }
        
        let targetsForFiveShot = this.getTargets("5shot")
        let targetsForThreeShot = this.getTargets("3shot")
        let target = this.getTarget()
        // Drop stale target that is no longer a valid engage (crypt / hazard burn)
        if (target && !this.shouldAttack(target)) {
            this.ranger.target = undefined
            target = this.getTarget()
        }
        const massBlocked = CF.hasCryptBlacklistNear(this.ranger, target ?? targetsForFiveShot[0] ?? targetsForThreeShot[0])

        if(!massBlocked && !this.isHazardState() && this.ranger.canUse("5shot") && targetsForFiveShot.length>3) {
            if(WEAPON_CONFIGS[this.bot.name]?.mass_mainhand) await this.switchWeapon("mass")
            await this.ranger.fiveShot(targetsForFiveShot[0]?.id,targetsForFiveShot[1]?.id,targetsForFiveShot[2]?.id,targetsForFiveShot[3]?.id,targetsForFiveShot[4]?.id).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("5shot")))
        }
        if(!massBlocked && !this.isHazardState() && this.ranger.canUse("3shot") && targetsForThreeShot.length>1) {
            if(WEAPON_CONFIGS[this.bot.name]?.mass_mainhand) await this.switchWeapon("mass")
            await this.ranger.threeShot(targetsForThreeShot[0]?.id,targetsForThreeShot[1]?.id,targetsForThreeShot[2]?.id).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, Math.max(1, this.ranger.getCooldown("3shot")))
        }
        if(!target) {
            return setTimeout(this.basicAttackLoop, 500)
        }
        if(!target?.target && CF.calculate_monster_dps(this, target, true)/CF.calculate_hps(this.ranger) >=0.95) {
            return setTimeout(this.basicAttackLoop, 500)
        }
        if(Tools.distance(this.ranger, target)> this.ranger.range*0.8) {
            if( !this.ranger.smartMoving && !this.ranger.moving ) {
                let location = CF.getHalfWay(this.ranger, target)
                CF.moveHalfWay(this.ranger, location)
                return setTimeout(this.basicAttackLoop, 500)
            }
        }
        if(Tools.distance(this.ranger,target) < this.ranger.range) {
            if(CF.calculate_monster_dps(this,target)/CF.calculate_hps(this.ranger)>=2) {
                return setTimeout(this.basicAttackLoop, 500)
            }
            if(WEAPON_CONFIGS[this.bot.name]?.solo_mainhand) await this.switchWeapon(this.isHazardState() ? "hazard" : "solo")
            const skill = (target.armor - this.ranger.apiercing < 250) ? "attack" : "piercingshot"
            const live = this.guardHazardDamage(this.ranger.entities[target.id] ?? target, skill)
            if (!live) {
                this.ranger.target = undefined
                return setTimeout(this.basicAttackLoop, 200)
            }
            const tid = live.id ?? this.ranger.target
            if (!tid) return setTimeout(this.basicAttackLoop, 300)
            if(skill === "attack") await this.ranger.basicAttack(tid).catch(CF.debugLog) 
            else await this.ranger.piercingShot(tid).catch(CF.debugLog)
            return setTimeout(this.basicAttackLoop, this.ranger.getCooldown("attack"))
        }
        return setTimeout(this.basicAttackLoop, this.ranger.frequency)
    }

    private async switchWeapon(weaponConfig: "heal" | "mass" | "solo" | "hazard") {
        const locateConfigured = (name?: ItemName, level?: number): number => {
            if (!name) return -1
            // Prefer configured level, fallback to highest available level of the same item.
            let idx = this.bot.locateItem(name, undefined, { level })
            if (idx < 0) idx = this.bot.locateItem(name, undefined, { returnHighestLevel: true })
            return idx
        }

        if(weaponConfig == "heal") {
            if(this.bot.slots.mainhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_weapon?.name
               && this.bot.slots.offhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_offhand?.name) return
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_weapon?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_weapon?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_offhand?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.heal_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(debugLog)
            return
        }
        else if(weaponConfig == "mass") {
            if(this.bot.slots.mainhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_mainhand?.name
               && this.bot.slots.offhand?.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_offhand?.name) return
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_mainhand?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_mainhand?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_offhand?.name && item.level == (WEAPON_CONFIGS as RangerWeaponConfig)[this.bot.name]?.mass_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(console.warn)
            return
        }
        else if(weaponConfig == "hazard") {
            // Final kill(s): equip command/title weapon; otherwise farm with hazard_mainhand
            const botWC = (WEAPON_CONFIGS[this.bot.name] ?? WEAPON_CONFIGS[this.bot.id]) as RangerWeaponConfig
            if (this.shouldEquipHazardTitleWeapon() && this.memoryStorage.getHazardWeapon) {
                const weapon = this.memoryStorage.getHazardWeapon
                const batch: { num: number; slot: SlotType }[] = []
                if (this.bot.slots.mainhand?.name !== weapon) {
                    const idx = locateConfigured(weapon)
                    if (idx >= 0) batch.push({ num: idx, slot: "mainhand" })
                }
                const wtype = Game.G.items[weapon]?.wtype
                if (wtype === "bow" || wtype === "crossbow") {
                    const oh = this.bot.slots.offhand
                    if (!oh || Game.G.items[oh.name]?.type !== "quiver") {
                        let q = -1
                        if (botWC?.hazard_offhand && Game.G.items[botWC.hazard_offhand.name]?.type === "quiver") {
                            q = locateConfigured(botWC.hazard_offhand.name, botWC.hazard_offhand.level)
                        }
                        if (q < 0 && botWC?.solo_offhand && Game.G.items[botWC.solo_offhand.name]?.type === "quiver") {
                            q = locateConfigured(botWC.solo_offhand.name, botWC.solo_offhand.level)
                        }
                        if (q < 0) {
                            for (const [i, item] of this.bot.getItems()) {
                                if (item && Game.G.items[item.name]?.type === "quiver") { q = i; break }
                            }
                        }
                        if (q >= 0) batch.push({ num: q, slot: "offhand" })
                    }
                } else if (botWC?.hazard_offhand) {
                    const oh = botWC.hazard_offhand
                    if (this.bot.slots.offhand?.name != oh.name) {
                        const idx = locateConfigured(oh.name, oh.level)
                        if (idx >= 0) batch.push({ num: idx, slot: "offhand" })
                    }
                }
                if (batch.length) await this.ranger.equipBatch(batch).catch(debugLog)
                return
            }
            let equipBatch : {num: number; slot: SlotType}[] = []
            if (botWC?.hazard_mainhand) {
                if (this.bot.slots.mainhand?.name != botWC.hazard_mainhand.name) {
                    const idx = locateConfigured(botWC.hazard_mainhand.name, botWC.hazard_mainhand.level)
                    if (idx >= 0) equipBatch.push({ num: idx, slot: "mainhand" })
                }
            }
            if (botWC?.hazard_offhand) {
                if (this.bot.slots.offhand?.name != botWC.hazard_offhand.name) {
                    const idx = locateConfigured(botWC.hazard_offhand.name, botWC.hazard_offhand.level)
                    if (idx >= 0) equipBatch.push({ num: idx, slot: "offhand" })
                }
            }
            if (equipBatch.length) await this.ranger.equipBatch(equipBatch).catch(debugLog)
            return
        }
        else if(weaponConfig == "solo") {
            const cfg = (WEAPON_CONFIGS[this.bot.name] ?? WEAPON_CONFIGS[this.bot.id]) as RangerWeaponConfig
            if(this.bot.slots.mainhand?.name == cfg?.solo_mainhand?.name
               && this.bot.slots.offhand?.name == cfg?.solo_offhand?.name) return
            let equipBatch : {num: number, slot: SlotType}[] = []
            const mainhandIdx = locateConfigured(cfg?.solo_mainhand?.name, cfg?.solo_mainhand?.level)
            if (mainhandIdx >= 0) equipBatch.push({num: mainhandIdx, slot: "mainhand"})
            const offhandIdx = locateConfigured(cfg?.solo_offhand?.name, cfg?.solo_offhand?.level)
            if (offhandIdx >= 0) equipBatch.push({num: offhandIdx, slot: "offhand"})
            if (equipBatch.length) await this.ranger.equipBatch(equipBatch).catch(debugLog)
            return
        }
    }

    private getTargets(skill : SkillName) : Entity[] {
        if(!["5shot", "3shot"].includes(skill)) return this.ranger.getEntities({withinRange: this.ranger.range})
        const wantedMob = this.getWantedMobList()
        let final_targets: Entity[] = []
        let pcourage = this.bot.getEntities({targetingMe: true}).filter( e => e.damage_type == "pure").length
        let mcourage = this.bot.getEntities({targetingMe: true}).filter( e => e.damage_type == "magical").length
        let courage = this.bot.getEntities({targetingMe: true}).filter( e => e.damage_type == "physical").length
        let dps = CF.calculate_monsters_dps(this, this, this.bot.getEntities({targetingMe: true}))
        if (dps> this.bot.max_hp*0.2) return final_targets

        const inCrypt = this.isCryptCombatState()

        for(const entity of this.ranger.getEntities()) {
            if (!this.shouldAttack(entity)) continue
            if(entity.abilities.stone && !wantedMob.includes(entity.type) ) continue
            if(entity.willBurnToDeath() || entity.willDieToProjectiles(this.bot, this.bot.projectiles, this.bot.players, this.bot.entities)) continue
            if(this.bot.getEntities().filter(e => e.abilities.stone && !wantedMob.includes(e.type) && Tools.distance(e, entity)<40).length>0) continue

            if (inCrypt) {
                // Crypt: prefer already-engaged; extras only within HPS budget
                if (this.isPartyCryptTarget(entity.target)) {
                    final_targets.push(entity)
                    continue
                }
                if (entity.target) continue
                if (!this.canCryptPullExtra(entity, final_targets)) continue
                // Still require one-shot or courage for mass skills on fresh pulls
                if (this.ranger.canKillInOneShot(entity, skill)) {
                    final_targets.push(entity)
                    continue
                }
                switch(entity.damage_type) {
                    case "physical":
                        if(courage < this.ranger.courage) {
                            final_targets.push(entity)
                            courage++
                        }
                        break
                    case "magical":
                        if(mcourage < this.ranger.mcourage) {
                            final_targets.push(entity)
                            mcourage++
                        }
                        break
                    case "pure":
                        if(pcourage < this.ranger.pcourage) {
                            final_targets.push(entity)
                            pcourage++
                        }
                        break
                }
                continue
            }

            if(!entity.target && this.ranger.canKillInOneShot(entity, skill)) final_targets.push(entity)
            if( entity.target ) final_targets.push(entity)
            if(!entity.target && !this.ranger.canKillInOneShot(entity, skill) && dps+CF.calculate_monster_dps(this, entity)< this.bot.hp/5) {
                switch(entity.damage_type) {
                    case "physical":
                        if(courage < this.ranger.courage || entity.target) {
                            final_targets.push(entity)
                            if(!entity.target) courage++
                        }
                        break
                    case "magical":
                        if(mcourage < this.ranger.mcourage || entity.target) {
                            final_targets.push(entity)
                            if(!entity.target) mcourage++
                        }
                        break
                    case "pure":
                        if(pcourage < this.ranger.pcourage || entity.target) {
                            final_targets.push(entity)
                            if(!entity.target) pcourage++
                        }
                        break
                }
            }
        }
        return final_targets.sort( (curr, next) => {
            let curr_distance = Tools.distance(curr, this.ranger)
            let next_distance = Tools.distance(next, this.ranger)
            if(SPECIAL_MONSTERS.includes(curr.type)  != SPECIAL_MONSTERS.includes(next.type) ) {
                return (SPECIAL_MONSTERS.includes(curr.type) ) ? -1 : 1
            }
            if(wantedMob.includes(curr.type) != wantedMob.includes(next.type)) {
                return (wantedMob.includes(curr.type)) ? -1 : 1
            }
            if (inCrypt) {
                const currEng = this.isPartyCryptTarget(curr.target)
                const nextEng = this.isPartyCryptTarget(next.target)
                if (currEng != nextEng) return currEng ? -1 : 1
            }
            if((curr.s.cursed || curr.s.marked) != (next.s.cursed || next.s.marked)) {
                return (curr.s.cursed || curr.s.marked) ? -1 : 1
            }
            if(curr_distance != next_distance) {
                return (curr_distance < next_distance) ? -1 : 1;
            }
            return 0
        })
    }

    private async changeWeapon() {
        if(this.deactivate) return
        if(!Items.WEAPON_CONFIGS[this.ranger.name]) return
        let needChangeMainhand = false
        let needChangeOffhand = false
        let botWC = Items.WEAPON_CONFIGS[this.bot.name]
        if(this.ranger.getEntities({targetingMe: true, targetingPartyMember: true}).length>1) {
            if(this.ranger.slots.mainhand?.name != botWC.mass_mainhand?.name) needChangeMainhand = true
            if(this.ranger.slots.offhand?.name != botWC.mass_offhand?.name) needChangeOffhand = true
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {

                if(item.name == botWC.mass_mainhand?.name && item.level == botWC.mass_mainhand?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == botWC.mass_offhand?.name && item.level == botWC.mass_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(debugLog)
        }
        else {
            if(this.ranger.slots.mainhand?.name != botWC.solo_mainhand?.name) needChangeMainhand = true
            if(this.ranger.slots.offhand?.name != botWC.solo_offhand?.name) needChangeOffhand = true
            let equipBatch : {num: number, slot: SlotType}[] = []
            for( const [i, item] of this.bot.getItems() ) {
                if(item.name == botWC.solo_mainhand?.name && item.level == botWC.solo_mainhand?.level) equipBatch.push({num: i, slot: "mainhand"})
                if(item.name == botWC.solo_offhand?.name && item.level == botWC.solo_offhand?.level) equipBatch.push({num: i, slot: "offhand"})
            }
            await this.ranger.equipBatch(equipBatch).catch(debugLog)
        }
        return setTimeout(this.changeWeapon, 500)
    }

    private async useSupershotLoop() {
        if(this.deactivate) return
        if(!this.ranger.canUse("supershot")) {
            return setTimeout(this.useSupershotLoop, Math.max(2000, this.ranger.getCooldown("supershot")))
        }
        if(this.bot.isOnCooldown("scare")) return setTimeout(this.useSupershotLoop, Math.max(1, this.bot.getCooldown("scare")))
        if(this.ranger.isOnCooldown("supershot")) {
            return setTimeout(this.useSupershotLoop, Math.max(1, this.ranger.getCooldown("supershot")))
        }
        if (await this.cryptScareOrFleeIfNeeded()) {
            return setTimeout(this.useSupershotLoop, 500)
        }
        let target = this.ranger.getTargetEntity()
        if(!target || (target?.abilities?.stone && !target.target)) {
            return setTimeout(this.useSupershotLoop, 500)
        }
        if (!this.shouldAttack(target)) {
            return setTimeout(this.useSupershotLoop, 500)
        }
        if(!target?.target && CF.calculate_monster_dps(this,target)/CF.calculate_hps(this.ranger)>=0.95) {
            return setTimeout(this.useSupershotLoop, 500)
        }
        if(this.ranger.mp > this.ranger.max_mp * 0.6) {
            const live = this.guardHazardDamage(target, "supershot")
            if (!live) return setTimeout(this.useSupershotLoop, 500)
            await this.ranger.superShot(live.id).catch(debugLog)
            return setTimeout(this.useSupershotLoop, Math.max(1,this.ranger.getCooldown("supershot")))
        }

        return setTimeout(this.useSupershotLoop, Math.max(1000, this.ranger.getCooldown("supershot")))
    }

    private async useMarkLoop() {
        if(this.deactivate) return
        if( !this.ranger.canUse("huntersmark") ) {
            return setTimeout(this.useMarkLoop, 500)
        }
        if( this.ranger.isOnCooldown("huntersmark") ) {
            return setTimeout(this.useMarkLoop, Math.max(1, this.ranger.getCooldown("huntersmark")))
        }
        
        let target = this.ranger.getTargetEntity()
        if (target && !this.shouldAttack(target)) {
            return setTimeout(this.useMarkLoop, 500)
        }
        if(!target?.target && CF.calculate_monster_dps(this, target)/CF.calculate_hps(this.ranger)>=0.95) {
            return setTimeout(this.useMarkLoop,500)
        }
        if(target?.abilities?.stone && !target?.target) return setTimeout(this.useMarkLoop, 500)
        if( !target || target?.hp< 15000 ) {
            return setTimeout(this.useMarkLoop, 500)
        }
        
        await this.ranger.huntersMark(target.id).catch(debugLog)
        return setTimeout(this.useMarkLoop, Math.max(1000, this.ranger.getCooldown("huntersmark")))
    }

    /** In crypt: slow dangerous mobs that threaten the ranger (no target or targeting us). */
    private async useFourFingersLoop() {
        if (this.deactivate) return
        if (!this.isCryptCombatState()) {
            return setTimeout(this.useFourFingersLoop, 1000)
        }
        if (!this.ranger.canUse("4fingers")) {
            return setTimeout(this.useFourFingersLoop, 500)
        }
        if (this.ranger.isOnCooldown("4fingers")) {
            return setTimeout(this.useFourFingersLoop, Math.max(1, this.ranger.getCooldown("4fingers")))
        }

        const threat = this.ranger.getEntities()
            .filter(e => {
                if (CF.calculate_monster_dps(this, e) <= this.ranger.max_hp * 0.3) return false
                if (e.target && e.target !== this.ranger.id) return false
                return Tools.distance(this.ranger, e) <= e.range * 1.5
            })
            .sort((a, b) => CF.calculate_monster_dps(this, b) - CF.calculate_monster_dps(this, a))[0]
        if (!threat) {
            return setTimeout(this.useFourFingersLoop, 300)
        }

        await this.ranger.fourFinger(threat.id).catch(debugLog)
        return setTimeout(this.useFourFingersLoop, Math.max(1, this.ranger.getCooldown("4fingers")))
    }
}
