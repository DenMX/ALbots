<template>
  <article class="card" :class="{ dead: bot.rip }">
    <!-- Header -->
    <header class="card-header">
      <div class="name-row">
        <h3 class="name">{{ bot.name }}</h3>
        <span class="lvl">Lv{{ bot.level }}</span>
      </div>
      <div class="meta">
        <span class="realm">{{ bot.realm || '?' }}</span>
        <span class="alive" :class="{ on: !bot.rip, off: bot.rip }">
          {{ bot.rip ? 'DEAD' : 'ALIVE' }}
        </span>
        <span class="status-badge">{{ bot.status || '—' }}</span>
      </div>
    </header>

    <!-- Bars: Health, Mana, XP, Inventory -->
    <div class="bars">
      <div class="bar">
        <div class="bar-head">
          <span>HP</span>
          <span>{{ bot.health }}/{{ bot.maxHealth }}</span>
        </div>
        <div class="bar-track"><div class="bar-fill hp" :style="{ width: pct(bot.health, bot.maxHealth) + '%' }" /></div>
      </div>
      <div class="bar">
        <div class="bar-head">
          <span>MP</span>
          <span>{{ bot.mana }}/{{ bot.maxMana }}</span>
        </div>
        <div class="bar-track"><div class="bar-fill mp" :style="{ width: pct(bot.mana, bot.maxMana) + '%' }" /></div>
      </div>
      <div class="bar">
        <div class="bar-head">
          <span>XP</span>
          <span>{{ fmt(bot.xp) }}/{{ fmt(bot.maxXp) }}</span>
        </div>
        <div class="bar-track"><div class="bar-fill xp" :style="{ width: pct(bot.xp, bot.maxXp) + '%' }" /></div>
      </div>
      <div class="bar">
        <div class="bar-head">
          <span>Inv</span>
          <span>{{ (bot.isize || 0) - (bot.esize || 0) }}/{{ bot.isize || 0 }}</span>
        </div>
        <div class="bar-track"><div class="bar-fill inv" :style="{ width: pct((bot.isize || 0) - (bot.esize || 0), bot.isize || 1) + '%' }" /></div>
      </div>
    </div>

    <!-- Combat -->
    <section class="section">
      <h4 class="section-title">Combat</h4>
      <div class="kv">
        <div class="k"><span class="v">{{ (bot.attack || 0).toFixed(1) }}</span><span class="l">Attack</span></div>
        <div class="k"><span class="v">{{ (bot.frequency || 0).toFixed(2) }}</span><span class="l">Freq</span></div>
        <div class="k highlight"><span class="v">{{ fmt(bot.dps || 0) }}</span><span class="l">DPS</span></div>
        <div class="k"><span class="v">{{ bot.armor || 0 }}</span><span class="l">Armor</span></div>
        <div class="k"><span class="v">{{ bot.resistance || 0 }}</span><span class="l">Resist</span></div>
        <div class="k"><span class="v">{{ (bot.physicalReduction || 0).toFixed(1) }}%</span><span class="l">Phys▼</span></div>
        <div class="k"><span class="v">{{ (bot.magicalReduction || 0).toFixed(1) }}%</span><span class="l">Mag▼</span></div>
        <div class="k"><span class="v">{{ Math.round(bot.cc || 0) }}%</span><span class="l">CC</span></div>
      </div>
    </section>

    <!-- Economy & Misc -->
    <section class="section">
      <h4 class="section-title">Stats</h4>
      <div class="kv">
        <div class="k"><span class="v gold">{{ fmt(bot.gold || 0) }}</span><span class="l">Gold</span></div>
        <div class="k"><span class="v">{{ fmt(bot.gph || 0) }}</span><span class="l">G/h</span></div>
        <div class="k"><span class="v">{{ fmt(bot.xpPh || 0) }}</span><span class="l">XP/h</span></div>
        <div class="k"><span class="v">{{ bot.ttlu || '—' }}</span><span class="l">TTLU</span></div>
        <div class="k full"><span class="l">Target</span><span class="v">{{ bot.target || 'None' }}</span></div>
        <div class="k full"><span class="l">Party</span><span class="v">{{ bot.party || 'Solo' }}</span></div>
      </div>
    </section>

    <!-- Collapsible: Buffs -->
    <section class="section collapsible">
      <h4 class="section-title toggle" @click="openBuffs = !openBuffs">
        <span>Buffs</span>
        <span class="count">({{ (bot.buffs || []).length }})</span>
        <span class="chevron" :class="{ up: openBuffs }">▼</span>
      </h4>
      <div v-show="openBuffs" class="effect-list">
        <div v-for="(e, i) in (bot.buffs || [])" :key="'b'+i" class="effect-line">{{ e }}</div>
        <div v-if="!(bot.buffs || []).length" class="effect-line muted">None</div>
      </div>
    </section>

    <!-- Collapsible: Debuffs -->
    <section class="section collapsible">
      <h4 class="section-title toggle" @click="openDebuffs = !openDebuffs">
        <span>Debuffs</span>
        <span class="count">({{ (bot.debuffs || []).length }})</span>
        <span class="chevron" :class="{ up: openDebuffs }">▼</span>
      </h4>
      <div v-show="openDebuffs" class="effect-list">
        <div v-for="(e, i) in (bot.debuffs || [])" :key="'d'+i" class="effect-line debuff">{{ e }}</div>
        <div v-if="!(bot.debuffs || []).length" class="effect-line muted">None</div>
      </div>
    </section>

    <!-- Collapsible: Special -->
    <section class="section collapsible">
      <h4 class="section-title toggle" @click="openSpecial = !openSpecial">
        <span>Special</span>
        <span class="count">({{ (bot.special || []).length }})</span>
        <span class="chevron" :class="{ up: openSpecial }">▼</span>
      </h4>
      <div v-show="openSpecial" class="effect-list">
        <div v-for="(e, i) in (bot.special || [])" :key="'s'+i" class="effect-line special">{{ e }}</div>
        <div v-if="!(bot.special || []).length" class="effect-line muted">None</div>
      </div>
    </section>
  </article>
</template>

<script setup>
import { ref } from 'vue'

defineProps({ bot: { type: Object, required: true } })

const openBuffs = ref(true)
const openDebuffs = ref(true)
const openSpecial = ref(true)

function pct(a, b) {
  if (!b || b <= 0) return 0
  return Math.min(100, (Number(a) / Number(b)) * 100)
}

function fmt(n) {
  const x = Math.round(Number(n) || 0)
  if (x >= 1e9) return (x / 1e9).toFixed(1) + 'B'
  if (x >= 1e6) return (x / 1e6).toFixed(1) + 'M'
  if (x >= 1e3) return (x / 1e3).toFixed(1) + 'K'
  return String(x)
}
</script>

<style scoped>
.card {
  font-family: 'Outfit', system-ui, sans-serif;
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.card:hover {
  border-color: #3f3f46;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}

.card.dead {
  opacity: 0.7;
  filter: saturate(0.6);
}

.card-header { margin-bottom: 4px; }
.name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.name { font-size: 1.2rem; font-weight: 700; color: #fafafa; margin: 0; }
.lvl {
  font-family: 'JetBrains Mono', monospace;
  background: #3b82f6;
  color: #fff;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
}

.meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.realm { font-size: 0.8rem; color: #71717a; }
.alive {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}
.alive.on { background: rgba(34,197,94,0.2); color: #4ade80; }
.alive.off { background: rgba(239,68,68,0.2); color: #f87171; }
.status-badge { font-size: 0.75rem; background: #27272a; color: #a1a1aa; padding: 2px 8px; border-radius: 6px; }

/* Bars */
.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-head { display: flex; justify-content: space-between; font-size: 0.75rem; color: #a1a1aa; margin-bottom: 4px; }
.bar-track { height: 6px; background: #27272a; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
.bar-fill.hp { background: linear-gradient(90deg, #dc2626, #f87171); }
.bar-fill.mp { background: linear-gradient(90deg, #2563eb, #60a5fa); }
.bar-fill.xp { background: linear-gradient(90deg, #16a34a, #4ade80); }
.bar-fill.inv { background: linear-gradient(90deg, #a16207, #eab308); }

.section { }
.section-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #71717a;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #27272a;
}

.kv { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.k {
  background: #27272a;
  border-radius: 8px;
  padding: 8px 10px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.k.full { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; align-items: center; text-align: left; }
.k .v { font-family: 'JetBrains Mono', monospace; font-size: 0.95rem; font-weight: 600; color: #e4e4e7; }
.k .l { font-size: 0.7rem; color: #71717a; text-transform: uppercase; }
.k.highlight .v { color: #f59e0b; }
.k.gold .v { color: #facc15; }

/* Collapsible */
.collapsible .section-title.toggle {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 8px;
}
.collapsible .section-title.toggle:hover { color: #a1a1aa; }
.count { font-weight: 400; color: #52525b; }
.chevron { font-size: 0.65rem; margin-left: auto; transition: transform 0.2s; }
.chevron.up { transform: rotate(-180deg); }

.effect-list { display: flex; flex-direction: column; gap: 4px; padding-left: 4px; }
.effect-line {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: #d4d4d8;
  padding: 4px 8px;
  background: #27272a;
  border-radius: 6px;
  border-left: 3px solid #3b82f6;
}
.effect-line.debuff { border-left-color: #ef4444; }
.effect-line.special { border-left-color: #a855f7; }
.effect-line.muted { color: #71717a; border-left-color: #3f3f46; }
</style>
