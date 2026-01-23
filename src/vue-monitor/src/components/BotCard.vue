<template>
  <div class="bot-card" :class="{ 'bot-dead': bot.rip }">
    <!-- Заголовок -->
    <div class="bot-header">
      <div class="bot-title">
        <h3 class="bot-name">{{ bot.name }}</h3>
        <div class="bot-meta">
          <span class="bot-level">Lvl {{ bot.level }}</span>
          <span class="bot-realm">{{ bot.realm }}</span>
          <span class="bot-alive" :class="{ alive: !bot.rip, dead: bot.rip }">
            {{ bot.rip ? '💀 DEAD' : '✅ ALIVE' }}
          </span>
        </div>
      </div>
      <button @click="$emit('update-requested')" class="refresh-bot" title="Refresh">
        🔄
      </button>
    </div>

    <!-- Прогресс-бары -->
    <div class="bot-progress">
      <ProgressBar 
        label="❤️ Health"
        :value="bot.health"
        :max="bot.maxHealth"
        color="#ef4444"
        :percentage="true"
      />
      <ProgressBar 
        label="🔵 Mana"
        :value="bot.mana"
        :max="bot.maxMana"
        color="#3b82f6"
        :percentage="true"
      />
      <ProgressBar 
        label="📈 XP"
        :value="bot.xp"
        :max="bot.maxXp"
        color="#10b981"
        :humanize="true"
      />
      <ProgressBar 
        label="🎒 Inventory"
        :value="bot.isize - bot.esize"
        :max="bot.isize"
        color="#a16207"
        :percentage="true"
      />
    </div>

    <!-- Боевые характеристики -->
    <div class="bot-stats">
      <h4 class="section-title">⚔️ Combat Stats</h4>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">{{ bot.attack.toFixed(1) }}</div>
          <div class="stat-label">Attack</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ bot.frequency.toFixed(2) }}</div>
          <div class="stat-label">Freq</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ formatNumber(bot.dps) }}</div>
          <div class="stat-label">DPS</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ Math.round(bot.cc) }}</div>
          <div class="stat-label">CC</div>
        </div>
        <div class="stat-item armor">
          <div class="stat-value">{{ bot.armor }}</div>
          <div class="stat-label">Armor</div>
          <div class="stat-subtext">{{ bot.physicalReduction.toFixed(1) }}% reduction</div>
        </div>
        <div class="stat-item resistance">
          <div class="stat-value">{{ bot.resistance }}</div>
          <div class="stat-label">Resistance</div>
          <div class="stat-subtext">{{ bot.magicalReduction.toFixed(1) }}% reduction</div>
        </div>
      </div>
    </div>

    <!-- Состояния -->
    <div class="bot-states" v-if="hasStates">
      <div class="states-group" v-if="buffs.length > 0">
        <h5>📈 Buffs</h5>
        <div class="states-list">
          <span v-for="buff in buffs" :key="buff" class="state-badge buff">{{ buff }}</span>
        </div>
      </div>
      <div class="states-group" v-if="debuffs.length > 0">
        <h5>📉 Debuffs</h5>
        <div class="states-list">
          <span v-for="debuff in debuffs" :key="debuff" class="state-badge debuff">{{ debuff }}</span>
        </div>
      </div>
    </div>

    <!-- Информация -->
    <div class="bot-info">
      <div class="info-row">
        <span class="info-label">🎯 Target:</span>
        <span class="info-value">{{ bot.target || 'None' }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">👥 Party:</span>
        <span class="info-value">{{ bot.party || 'Solo' }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">💰 Gold:</span>
        <span class="info-value">{{ formatNumber(bot.gold) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">⚡ XP/h:</span>
        <span class="info-value">{{ formatNumber(bot.xpPh) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status:</span>
        <span class="info-value status">{{ bot.status }}</span>
      </div>
    </div>

    <!-- Время обновления -->
    <div class="bot-updated">
      Updated: {{ new Date().toLocaleTimeString() }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ProgressBar from './ProgressBar.vue'
import type { Bot } from '../types/bot'

defineProps<{
  bot: Bot
}>()

defineEmits<{
  'update-requested': []
}>()

// Форматирование чисел
const formatNumber = (num: number): string => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
  return num.toFixed(0)
}

// Извлечение состояний из statusInfo
const buffs = computed(() => {
  const buffList = ['warcry', 'mluck', 'rspeed', 'newcomersblessing', 'young']
  const result: string[] = []
  
  buffList.forEach(buff => {
    if (props.bot.statusInfo?.[buff]?.ms) {
      const seconds = Math.floor(props.bot.statusInfo[buff].ms / 1000)
      result.push(`${buff}:${seconds}s`)
    }
  })
  
  return result
})

const debuffs = computed(() => {
  const debuffList = ['poisoned', 'cursed', 'slowed', 'stunned', 'sick']
  const result: string[] = []
  
  debuffList.forEach(debuff => {
    if (props.bot.statusInfo?.[debuff]?.ms) {
      const seconds = Math.floor(props.bot.statusInfo[debuff].ms / 1000)
      result.push(`${debuff}:${seconds}s`)
    }
  })
  
  return result
})

const hasStates = computed(() => buffs.value.length > 0 || debuffs.value.length > 0)
</script>

<style scoped>
.bot-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
  border: 2px solid transparent;
  position: relative;
}

.bot-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  border-color: rgba(79, 70, 229, 0.3);
}

.bot-card.bot-dead {
  opacity: 0.7;
  filter: grayscale(0.5);
}

.bot-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.bot-title {
  flex: 1;
}

.bot-name {
  margin: 0 0 8px 0;
  font-size: 1.4em;
  color: var(--text-primary);
}

.bot-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.bot-level {
  background: var(--accent);
  color: white;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: 600;
}

.bot-realm {
  color: var(--text-secondary);
  font-size: 0.85em;
}

.bot-alive {
  font-size: 0.85em;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 12px;
}

.bot-alive.alive {
  background: rgba(16, 185, 129, 0.2);
  color: var(--success);
}

.bot-alive.dead {
  background: rgba(239, 68, 68, 0.2);
  color: var(--danger);
}

.refresh-bot {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
}

.refresh-bot:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.bot-progress {
  margin: 20px 0;
}

.section-title {
  margin: 25px 0 15px 0;
  color: var(--text-primary);
  font-size: 1.1em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.stat-item {
  background: rgba(255, 255, 255, 0.05);
  padding: 12px;
  border-radius: 8px;
  text-align: center;
  transition: all 0.3s;
}

.stat-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.stat-item.armor {
  border-left: 3px solid #3b82f6;
}

.stat-item.resistance {
  border-left: 3px solid #8b5cf6;
}

.stat-value {
  font-size: 1.3em;
  font-weight: bold;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 0.85em;
  color: var(--text-secondary);
}

.stat-subtext {
  font-size: 0.75em;
  color: var(--text-secondary);
  margin-top: 4px;
  opacity: 0.8;
}

.bot-states {
  margin: 20px 0;
  padding: 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.states-group {
  margin-bottom: 15px;
}

.states-group:last-child {
  margin-bottom: 0;
}

.states-group h5 {
  margin: 0 0 8px 0;
  font-size: 0.9em;
  color: var(--text-secondary);
}

.states-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.state-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: 500;
}

.state-badge.buff {
  background: rgba(16, 185, 129, 0.2);
  color: var(--success);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.state-badge.debuff {
  background: rgba(239, 68, 68, 0.2);
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.bot-info {
  margin: 20px 0;
  padding: 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  color: var(--text-secondary);
  font-weight: 500;
}

.info-value {
  color: var(--text-primary);
  font-weight: 500;
}

.info-value.status {
  color: var(--accent);
}

.bot-updated {
  font-size: 0.8em;
  color: var(--text-secondary);
  text-align: center;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  margin-top: 15px;
}
</style>