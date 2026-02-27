<template>
  <article class="card" :class="{ dead: bot.rip, 'card-min': isCompact }">
    <!-- Header -->
    <header class="card-header">
      <div class="name-row">
        <h3 class="name">{{ bot.name }}</h3>
        <span class="lvl">Lv{{ bot.level }}</span>
        <template v-if="isCompact">
          <span class="realm">{{ bot.realm || '?' }}</span>
          <span class="alive" :class="{ on: !bot.rip, off: bot.rip }">
            {{ bot.rip ? 'DEAD' : 'ALIVE' }}
          </span>
        </template>
      </div>
      <div v-if="!isCompact" class="meta">
        <span class="realm">{{ bot.realm || '?' }}</span>
        <span class="alive" :class="{ on: !bot.rip, off: bot.rip }">
          {{ bot.rip ? 'DEAD' : 'ALIVE' }}
        </span>
      </div>
      <button class="card-toggle-btn" @click="toggleMode" :title="isCompact ? 'Maximize' : 'Minimize'">
        {{ isCompact ? 'max' : 'min' }}
      </button>
    </header>

    <!-- Bars + Stats row (compact) or stacked (default) -->
    <div class="bars-and-stats" :class="{ compact: isCompact }">
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
      <div v-if="isCompact" class="compact-right">
        <section class="section section-stats-inline">
          <h4 class="section-title">Stats</h4>
          <div class="kv">
            <div class="k"><span class="v gold">{{ fmt(bot.gold || 0) }}</span><span class="l">Gold</span></div>
            <div class="k"><span class="v">{{ fmt(bot.gph || 0) }}</span><span class="l">G/h</span></div>
            <div class="k"><span class="v">{{ fmt(bot.xpPh || 0) }}</span><span class="l">XP/h</span></div>
            <div class="k"><span class="v">{{ bot.ttlu || '—' }}</span><span class="l">TTLU</span></div>
            <div class="k full"><span class="l">Status</span><span class="v">{{ displayStatus }}</span></div>
            <div class="k full"><span class="l">Target</span><span class="v">{{ bot.target || 'None' }}</span></div>
            <div class="k full"><span class="l">Party</span><span class="v">{{ bot.party || 'Solo' }}</span></div>
          </div>
        </section>
        <section v-if="effectiveShowEffectsInline" class="section section-effects-inline">
          <div class="effect-blocks">
            <div class="effect-group">
              <div class="effect-sublabel">Buffs</div>
              <div v-for="(e, i) in (bot.buffs || [])" :key="'b'+i" class="effect-line">{{ e }}</div>
              <div v-if="!(bot.buffs || []).length" class="effect-line muted">None</div>
            </div>
            <div class="effect-group">
              <div class="effect-sublabel">Debuffs</div>
              <div v-for="(e, i) in (bot.debuffs || [])" :key="'d'+i" class="effect-line debuff">{{ e }}</div>
              <div v-if="!(bot.debuffs || []).length" class="effect-line muted">None</div>
            </div>
            <div class="effect-group">
              <div class="effect-sublabel">Special</div>
              <div v-for="(e, i) in (bot.special || [])" :key="'s'+i" class="effect-line special">{{ e }}</div>
              <div v-if="!(bot.special || []).length" class="effect-line muted">None</div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Combat -->
    <section v-if="effectiveShowCombat" class="section">
      <h4 class="section-title">Combat</h4>
      <div class="kv">
        <div class="k"><span class="v">{{ (bot.attack || 0).toFixed(1) }}</span><span class="l">Attack</span></div>
        <div class="k"><span class="v">{{ (bot.frequency || 0).toFixed(2) }}</span><span class="l">Freq</span></div>
        <div class="k highlight"><span class="v">{{ fmt(bot.dps || 0) }}</span><span class="l">DPS</span></div>
        <div class="k"><span class="v">{{ bot.armor || 0 }}</span><span class="l">Armor</span></div>
        <div class="k"><span class="v">{{ bot.resistance || 0 }}</span><span class="l">Resist</span></div>
        <div class="k"><span class="v">{{ (bot.physicalReduction || 0).toFixed(1) }}%</span><span class="l">Phys▼</span></div>
        <div class="k"><span class="v">{{ (bot.magicalReduction || 0).toFixed(1) }}%</span><span class="l">Mag▼</span></div>
        <div class="k"><span class="v">{{ Math.round(bot.cc || 0) }}</span><span class="l">CC</span></div>
      </div>
    </section>

    <!-- Economy & Misc (only when not compact) -->
    <section v-if="!isCompact" class="section">
      <h4 class="section-title">Stats</h4>
      <div class="kv">
        <div class="k"><span class="v gold">{{ fmt(bot.gold || 0) }}</span><span class="l">Gold</span></div>
        <div class="k"><span class="v">{{ fmt(bot.gph || 0) }}</span><span class="l">G/h</span></div>
        <div class="k"><span class="v">{{ fmt(bot.xpPh || 0) }}</span><span class="l">XP/h</span></div>
        <div class="k"><span class="v">{{ bot.ttlu || '—' }}</span><span class="l">TTLU</span></div>
        <div class="k full"><span class="l">Status</span><span class="v">{{ displayStatus }}</span></div>
        <div class="k full"><span class="l">Target</span><span class="v">{{ bot.target || 'None' }}</span></div>
        <div class="k full"><span class="l">Party</span><span class="v">{{ bot.party || 'Solo' }}</span></div>
      </div>
    </section>

    <!-- Collapsible: Buffs / Debuffs / Special (вместе) -->
    <section v-if="effectiveShowEffects" class="section collapsible">
      <h4 class="section-title toggle" @click="openEffects = !openEffects">
        <span>Buffs / Debuffs / Special</span>
        <span class="count">({{ totalEffects }})</span>
        <span class="chevron" :class="{ up: openEffects }">▼</span>
      </h4>
      <div v-show="openEffects" class="effect-blocks">
        <div class="effect-group">
          <div class="effect-sublabel">Buffs</div>
          <div v-for="(e, i) in (bot.buffs || [])" :key="'b'+i" class="effect-line">{{ e }}</div>
          <div v-if="!(bot.buffs || []).length" class="effect-line muted">None</div>
        </div>
        <div class="effect-group">
          <div class="effect-sublabel">Debuffs</div>
          <div v-for="(e, i) in (bot.debuffs || [])" :key="'d'+i" class="effect-line debuff">{{ e }}</div>
          <div v-if="!(bot.debuffs || []).length" class="effect-line muted">None</div>
        </div>
        <div class="effect-group">
          <div class="effect-sublabel">Special</div>
          <div v-for="(e, i) in (bot.special || [])" :key="'s'+i" class="effect-line special">{{ e }}</div>
          <div v-if="!(bot.special || []).length" class="effect-line muted">None</div>
        </div>
      </div>
    </section>
  </article>
</template>

<script setup>
import { ref, computed } from 'vue'
const props = defineProps({
  bot: { type: Object, required: true },
  defaultEffectsOpen: { type: Boolean, default: true },
  compactLayout: { type: Boolean, default: false },
  showCombat: { type: Boolean, default: true },
  showEffects: { type: Boolean, default: true },
  showEffectsInline: { type: Boolean, default: false },
  defaultMinMode: { type: Boolean, default: false },
  // Пропсы для режима min (используются когда isMinMode = true)
  minShowCombat: { type: Boolean, default: false },
  minShowEffects: { type: Boolean, default: false },
  minShowEffectsInline: { type: Boolean, default: true },
  // Пропсы для режима max (используются когда isMinMode = false)
  maxShowCombat: { type: Boolean, default: true },
  maxShowEffects: { type: Boolean, default: true },
  maxShowEffectsInline: { type: Boolean, default: false }
})

const isMinMode = ref(props.defaultMinMode)
const isCompact = computed(() => isMinMode.value)

// Computed свойства для отображения секций в зависимости от режима
const effectiveShowCombat = computed(() => isMinMode.value ? props.minShowCombat : props.maxShowCombat)
const effectiveShowEffects = computed(() => isMinMode.value ? props.minShowEffects : props.maxShowEffects)
const effectiveShowEffectsInline = computed(() => isMinMode.value ? props.minShowEffectsInline : props.maxShowEffectsInline)

function toggleMode() {
  isMinMode.value = !isMinMode.value
}

const openEffects = ref(props.defaultEffectsOpen)

const totalEffects = computed(() =>
  (props.bot.buffs || []).length + (props.bot.debuffs || []).length + (props.bot.special || []).length
)

const displayStatus = computed(() => {
  const t = props.bot.state_type
  const wantedRaw = props.bot.wantedMob

  if (t === 'farm' || t === 'boss' || t === 'event') {
    let wantedText = ''
    if (Array.isArray(wantedRaw)) {
      wantedText = wantedRaw.join(', ')
    } else if (typeof wantedRaw === 'string') {
      wantedText = wantedRaw
    }

    if (wantedText) return `${t} · ${wantedText}`
    return String(t)
  }

  return props.bot.status || '—'
})

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
  background: linear-gradient(145deg, #1a1a1e 0%, #16161a 100%);
  border: 2px solid #2a2a2e;
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.card:hover {
  border-color: #3a3a3e;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  transform: translateY(-2px);
}

.card.dead {
  opacity: 0.7;
  filter: saturate(0.6);
}

.card-header { 
  margin-bottom: 4px; 
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.card-toggle-btn {
  position: absolute;
  top: 0;
  right: 0;
  background: rgba(39, 39, 42, 0.8);
  border: 1px solid #3f3f46;
  border-radius: 4px;
  color: #a1a1aa;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'JetBrains Mono', monospace;
  text-transform: uppercase;
  z-index: 10;
  flex-shrink: 0;
}
.card-toggle-btn:hover {
  background: rgba(63, 63, 70, 0.9);
  border-color: #52525b;
  color: #e4e4e7;
}
.name-row { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  margin-bottom: 8px; 
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  padding-right: 50px;
}
.name-row .realm { font-size: 0.8rem; color: #71717a; }
.name-row .alive {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}
.name-row .alive.on { background: rgba(34,197,94,0.2); color: #4ade80; }
.name-row .alive.off { background: rgba(239,68,68,0.2); color: #f87171; }
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

.meta { 
  display: flex; 
  flex-wrap: wrap; 
  gap: 8px; 
  align-items: center;
  padding-right: 50px;
  min-width: 0;
}
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

/* Bars + Stats row (compact) */
.bars-and-stats.compact {
  display: flex;
  flex-direction: row;
  gap: 12px;
  align-items: flex-start;
}
.bars-and-stats.compact .bars { flex: 0 0 auto; min-width: 120px; }
.bars-and-stats.compact .compact-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bars-and-stats.compact .section-stats-inline { margin: 0; }
.bars-and-stats.compact .section-stats-inline .kv { grid-template-columns: repeat(2, 1fr); }
.bars-and-stats.compact .section-effects-inline {
  margin: 0;
  padding-top: 0;
  border-top: none;
}

.section-effects-inline {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #27272a;
  display: block !important;
}
.section-effects-inline .effect-blocks {
  display: flex;
  flex-direction: row;
  gap: 12px;
  flex-wrap: wrap;
}
.section-effects-inline .effect-group {
  flex: 1;
  min-width: 0;
  padding-left: 0;
}
.section-effects-inline .effect-line {
  font-size: 0.7rem;
  padding: 2px 6px;
  margin-bottom: 2px;
  display: block;
}
.section-effects-inline .effect-sublabel {
  font-size: 0.65rem;
  margin-bottom: 2px;
  display: block;
}

/* Bars */
.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-head { display: flex; justify-content: space-between; font-size: 0.75rem; color: #a1a1aa; margin-bottom: 4px; }
.bar-track { height: 6px; background: #27272a; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
.bar-fill.hp { background: linear-gradient(90deg, #dc2626, #f87171); }
.bar-fill.mp { background: linear-gradient(90deg, #2563eb, #60a5fa); }
.bar-fill.xp { background: linear-gradient(90deg, #16a34a, #4ade80); }
.bar-fill.inv { background: linear-gradient(90deg, #a16207, #eab308); }

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

.effect-blocks { display: flex; flex-direction: column; gap: 10px; }
.effect-group { padding-left: 4px; }
.effect-sublabel { font-size: 0.7rem; color: #71717a; margin-bottom: 4px; text-transform: uppercase; }
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

/* Equipment grid 4x4 - Adventure Land style */
.equip-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  background: #1a1a1e;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #2a2a2e;
}
.equip-slot {
  aspect-ratio: 1;
  background: linear-gradient(145deg, #2a2a2e 0%, #1e1e22 100%);
  border: 2px solid #3a3a3e;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: all 0.2s ease;
  min-height: 40px;
}
.equip-slot:hover {
  border-color: #4a4a4e;
  background: linear-gradient(145deg, #2e2e32 0%, #222226 100%);
}
.equip-slot.has-item {
  border-color: #4a5568;
  box-shadow: inset 0 0 8px rgba(74, 85, 104, 0.3);
}
.equip-img {
  position: absolute;
  inset: 3px;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  min-width: 16px;
  min-height: 16px;
}
.equip-badge {
  position: absolute;
  bottom: 2px;
  left: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: #ffd700;
  background: rgba(0, 0, 0, 0.7);
  padding: 1px 3px;
  border-radius: 2px;
  text-shadow: 0 0 2px #000;
  line-height: 1;
  z-index: 1;
}
</style>
