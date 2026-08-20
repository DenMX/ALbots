import { Game, ItemName, Tools, Warrior, SlotType, MonsterName } from "alclient"
import * as Items from "../configs/character_items_configs"
import * as CF from "../../src/common_functions/common_functions"
import { debugLog } from "../../src/common_functions/common_functions";
import { MemoryStorage } from "../common_functions/memory_storage";
import { StateStrategy } from "../common_functions/state_strategy";
import { CRYPT_BLACKLIST, CRYPT_CLEAVE_BLACKLIST_RANGE } from "../configs/events_and_spots"

type WeaponItemRef = { name: ItemName; level: number }
type EquipBatchEntry = { num: number; slot: SlotType }

export class WarriorsAttackStrategy extends StateStrategy {

    public warrior: Warrior

    private _firehazard : boolean = false;

    /** Сериализует equip/unequip — stomp и cleave не пересекаются. */
    private weaponOpChain: Promise<void> = Promise.resolve()

    constructor (bot: Warrior, memoryStorage: MemoryStorage){
        super(bot, memoryStorage)
        this.warrior = bot
        this.bot = bot

        this.attackLoop = this.attackLoop.bind(this)
        this.hardShellLoop = this.hardShellLoop.bind(this)
        this.useWarcryLoop = this.useWarcryLoop.bind(this)
        this.useMassAggroLoop = this.useMassAggroLoop.bind(this)

        this.attackLoop()
        this.useMassAggroLoop()
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

    private runWeaponOp(fn: () => Promise<void>): Promise<void> {
        const op = this.weaponOpChain.then(fn)
        this.weaponOpChain = op.then(() => undefined, () => undefined)
        return op
    }

    private getWeaponConfig(): Items.WarriorWeaponsConfig | undefined {
        return Items.WEAPON_CONFIGS[this.bot.name] as Items.WarriorWeaponsConfig
    }

    private isSlotEquipped(slot: SlotType, item: { name: string; level: number }): boolean {
        const eq = this.warrior.slots?.[slot]
        return eq?.name === item.name && eq?.level === item.level
    }

    private isCleaveMainhand(): boolean {
        const cleave = this.getWeaponConfig()?.cleave
        return cleave ? this.isSlotEquipped("mainhand", cleave) : false
    }

    private getAttackWeaponPair(): { mainhand: WeaponItemRef; offhand?: WeaponItemRef } | null {
        const botWC = this.getWeaponConfig()
        if (!botWC?.solo_mainhand) return null
        if (this.isHazardState()) {
            // Title weapon only on the final burn kill; otherwise farm with hazard_mainhand
            if (this.shouldEquipHazardTitleWeapon() && this.memoryStorage.getHazardWeapon) {
                const name = this.memoryStorage.getHazardWeapon
                const idx = this.bot.locateItem(name, undefined, { returnHighestLevel: true })
                const level = idx >= 0 ? (this.bot.items[idx]?.level ?? 0) : (this.bot.slots.mainhand?.level ?? 0)
                const wtype = Game.G.items[name]?.wtype
                const offhand = (wtype === "bow" || wtype === "crossbow")
                    ? (botWC.hazard_offhand && Game.G.items[botWC.hazard_offhand.name]?.type === "quiver"
                        ? botWC.hazard_offhand
                        : undefined)
                    : botWC.hazard_offhand
                return { mainhand: { name, level }, offhand }
            }
            if (botWC.hazard_mainhand) {
                return { mainhand: botWC.hazard_mainhand, offhand: botWC.hazard_offhand }
            }
        }
        if (this.bot.getTargetEntity()?.["1hp"] && botWC.fast_mainhand) {
            return { mainhand: botWC.fast_mainhand, offhand: botWC.fast_offhand }
        }
        if (CF.shouldUseMassWeapon(this, this.memoryStorage.getCurrentTank)) {
            return { mainhand: botWC.mass_mainhand!, offhand: botWC.mass_offhand }
        }
        return { mainhand: botWC.solo_mainhand, offhand: botWC.solo_offhand }
    }

    private isAttackWeaponsEquipped(): boolean {
        const pair = this.getAttackWeaponPair()
        if (!pair) return true
        if (!this.isSlotEquipped("mainhand", pair.mainhand)) return false
        if (!pair.offhand) return true
        return this.isSlotEquipped("offhand", pair.offhand)
    }

    private buildEquipBatch(wanted: { item: WeaponItemRef; slot: SlotType }[]): EquipBatchEntry[] {
        const batch: EquipBatchEntry[] = []
        const usedNums = new Set<number>()

        for (const spec of wanted) {
            if (this.isSlotEquipped(spec.slot, spec.item)) continue
            for (const [num, inv] of this.bot.getItems()) {
                if (usedNums.has(num)) continue
                if (inv.name !== spec.item.name || inv.level !== spec.item.level) continue
                batch.push({ num, slot: spec.slot })
                usedNums.add(num)
                break
            }
        }
        return batch
    }

    private async applyEquipBatch(wanted: { item: WeaponItemRef; slot: SlotType }[]): Promise<void> {
        const batch = this.buildEquipBatch(wanted)
        if (!batch.length) return
        await this.runWeaponOp(async () => {
            await this.warrior.equipBatch(batch).catch(debugLog)
        })
    }

    private async unequipOffhandIfNeeded(): Promise<void> {
        if (!this.warrior.slots?.offhand || this.warrior.esize <= 0) return
        await this.runWeaponOp(async () => {
            await this.warrior.unequip("offhand").catch(debugLog)
        })
    }

    private async equipCleaveWeapon(): Promise<void> {
        const cleave = this.getWeaponConfig()?.cleave
        if (!cleave || this.isCleaveMainhand()) return
        if (!this.bot.hasItem(cleave.name, undefined, { level: cleave.level })) return
        await this.unequipOffhandIfNeeded()
        await this.applyEquipBatch([{ item: cleave, slot: "mainhand" }])
    }

    private async equipAttackWeapons(): Promise<void> {
        if (this.isAttackWeaponsEquipped()) return
        const pair = this.getAttackWeaponPair()
        if (!pair) return
        const wtype = Game.G.items[pair.mainhand.name]?.wtype
        if ((wtype === "bow" || wtype === "crossbow")) {
            const oh = this.warrior.slots?.offhand
            if (oh && Game.G.items[oh.name]?.type !== "quiver") {
                await this.unequipOffhandIfNeeded()
            }
        }
        const wanted: { item: WeaponItemRef; slot: SlotType }[] = [
            { item: pair.mainhand, slot: "mainhand" },
        ]
        if (pair.offhand) wanted.push({ item: pair.offhand, slot: "offhand" })
        await this.applyEquipBatch(wanted)
    }

    private async equipStompWeapon(): Promise<void> {
        const stomp = this.getWeaponConfig()?.stomp
        if (!stomp || this.isSlotEquipped("mainhand", stomp)) return
        if (!this.bot.hasItem(stomp.name, undefined, { level: stomp.level })) return
        await this.unequipOffhandIfNeeded()
        await this.applyEquipBatch([{ item: stomp, slot: "mainhand" }])
    }

    private shouldTryCleave(): boolean {
        if (this.warrior.isOnCooldown("cleave")) return false
        if (!this.warrior.canUse("cleave", { ignoreEquipped: true })) return false
        if (this.warrior.c.town) return false
        if (this.warrior.getEntities().some(e =>
            CRYPT_BLACKLIST.includes(e.type as MonsterName)
            && Tools.distance(this.warrior, e) <= CRYPT_CLEAVE_BLACKLIST_RANGE
        )) return false
        if (this.warrior.getEntities({ withinRange: "cleave" }).some(e => e?.dreturn >= 30)) return false
        if (!CF.shouldUseMassSkill(this, this.getMemoryStorage.getCurrentTank, "cleave")) return false
        if (this.warrior.getEntities({ withinRange: "cleave" }).length < 3) return false
        const cleave = this.getWeaponConfig()?.cleave
        return !!(cleave && this.bot.hasItem(cleave.name, undefined, { level: cleave.level }))
    }

    /** axe → cleave → основное оружие. Возвращает true, если cleave был использован. */
    private async tryCleaveSequence(): Promise<boolean> {
        if (!this.shouldTryCleave()) return false

        await this.equipCleaveWeapon()

        const mhName = this.warrior.slots.mainhand?.name
        if (!mhName || !Game.G.skills.cleave.wtype.includes(Game.G.items[mhName].wtype)) {
            await this.equipAttackWeapons()
            return false
        }

        await this.warrior.cleave().catch(debugLog)
        await this.equipAttackWeapons()
        return true
    }

    private async tryStomp(): Promise<void> {
        if (this.warrior.isOnCooldown("stomp")) return
        if (!this.warrior.canUse("stomp", { ignoreEquipped: true })) return

        let dps = 0
        for (const mob of this.warrior.getEntities({ targetingMe: true, targetingPartyMember: true })) {
            const mobTarget = this.bot.getPlayers().find(e => e.id == mob.target)
            dps += CF.calculate_monster_dps(mobTarget, mob)
        }
        const partyHurt = this.warrior.getPlayers({ isPartyMember: true, isDead: false })
            .some(e => e.hp < e.max_hp * 0.6 && this.bot.getEntities().some(m => m.target == e.id))
        if (dps <= CF.calculate_hps(this.warrior) / 2 && !partyHurt) return

        await this.equipStompWeapon()
        const mhName = this.warrior.slots.mainhand?.name
        if (mhName && Game.G.skills.stomp.wtype?.includes(Game.G.items[mhName].wtype)) {
            await this.warrior.stomp().catch(debugLog)
        }
        await this.equipAttackWeapons()
    }

    private async attackLoop() {
        if (this.deactivate) return
        if (!this.warrior.canUse("attack")) {
            return setTimeout(this.attackLoop, 500)
        }
        if (this.warrior.isOnCooldown("attack")) {
            return setTimeout(this.attackLoop, Math.max(1, this.warrior.getCooldown("attack")))
        }

        const mobsTargetingMe = this.bot.getEntities({ targetingMe: true })
        let totalDps = 0
        mobsTargetingMe.forEach(e => totalDps += CF.calculate_monster_dps(this, e))
        if (this.bot.c.town && this.bot.hp > totalDps * 15) {
            return setTimeout(this.attackLoop, 15000)
        }

        const target = this.getTarget()
        if (!target) {
            return setTimeout(this.attackLoop, 200)
        }

        if (this.warrior.hasItem("jacko") && this.warrior.isOnCooldown("scare")
            && this.warrior.getEntities({ targetingMe: true, targetingPartyMember: true }).length < 1) {
            return setTimeout(this.attackLoop, this.warrior.getCooldown("scare"))
        }

        if (!this.shouldAttack(target)) {
            return setTimeout(this.attackLoop, 500)
        }

        try {
            if (Tools.distance(this.warrior, target) < this.warrior.range) {
                if (!this.isHazardState()) {
                    const usedCleave = await this.tryCleaveSequence()
                    if (!usedCleave) await this.tryStomp()
                }
                if (!this.isAttackWeaponsEquipped()) await this.equipAttackWeapons()
                // Re-check after equip — hazard burn may have become lethal
                const live = this.bot.entities[target.id] ?? target
                if (!this.shouldAttack(live)) {
                    this.bot.target = undefined
                    return
                }
                await this.warrior.basicAttack(live.id).catch(debugLog)
            } else if (!this.warrior.moving && !this.warrior.smartMoving) {
                const location = CF.getHalfWay(this.warrior, target)
                CF.moveHalfWay(this.warrior, location)
            }
        } catch (Ex) {
            console.error(Ex)
        } finally {
            setTimeout(this.attackLoop, Math.max(1, this.warrior.getCooldown("attack")))
        }
    }

    private async useWarcryLoop() {
        if (this.deactivate) return
        if (this.warrior.isOnCooldown("warcry")) {
            return setTimeout(this.useWarcryLoop, this.warrior.getCooldown("warcry"))
        }
        if (!this.warrior.canUse("warcry") || this.warrior.smartMoving) {
            return setTimeout(this.useWarcryLoop, 2000)
        }
        if (this.warrior.s.warcry) {
            return setTimeout(this.useWarcryLoop, this.warrior.s.warcry.ms)
        }

        await this.warrior.warcry().catch(debugLog)
        return setTimeout(this.useWarcryLoop, this.warrior.getCooldown("warcry"))
    }

    private async useMassAggroLoop() {
        if (this.deactivate) return
        if (this.warrior.c.town) return
        if (this.warrior.isOnCooldown("scare")) {
            return setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("scare"))
        }
        if (this.warrior.smartMoving || !this.warrior.canUse("agitate")) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if (!CF.shouldUseMassSkill(this, this.memoryStorage.getCurrentTank, "agitate")) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if (this.warrior.getEntities({ hasTarget: false, withinRange: "agitate" }).length < 2) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        // Crypt: careful single-pulls — never mass-agitate a pack
        if (this.currentState?.state_type === "crypt" || this.warrior.map === "crypt") {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if (this.isHazardState()) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }

        await this.warrior.agitate().catch(debugLog)
        setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("agitate"))
    }

    public async useMassAggro() {
        if (this.deactivate) return
        if (this.warrior.c.town) return
        if (this.warrior.isOnCooldown("scare")) {
            return setTimeout(this.useMassAggroLoop, this.warrior.getCooldown("scare"))
        }
        if (this.warrior.smartMoving) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if (!CF.shouldUseMassWeapon(this, this.memoryStorage.getCurrentTank)) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }
        if (this.warrior.getEntities({ hasTarget: false }).length < 2) {
            return setTimeout(this.useMassAggroLoop, 2000)
        }

        await this.warrior.agitate().catch(debugLog)
    }

    private async hardShellLoop() {
        if (this.deactivate) return
        if (this.warrior.smartMoving || !this.warrior.canUse("hardshell") || this.warrior.moving) {
            return setTimeout(this.hardShellLoop, 2000)
        }
        if (this.warrior.hp < this.warrior.max_hp * 0.6
            && Object.values(this.warrior.getEntities({ targetingMe: true })).some(e => e.damage_type == "physical")) {
            await this.warrior.hardshell().catch(debugLog)
            return setTimeout(this.hardShellLoop, this.warrior.getCooldown("hardshell"))
        }
        return setTimeout(this.hardShellLoop, 2000)
    }
}
