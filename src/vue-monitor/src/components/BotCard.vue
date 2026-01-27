<template>
  <div class="bot-card" :class="{ 'bot-dead': bot.rip }">
    <!-- Заголовок -->
    <div class="bot-header">
      <div class="bot-title">
        <h3 class="bot-name">{{ bot.name }}</h3>
        <div class="bot-meta">
          <span class="bot-level">Lvl {{ bot.level }}</span>
          <span class="bot-realm">{{ bot.realm || 'Unknown' }}</span>
          <span class="bot-alive" :class="{ alive: !bot.rip, dead: bot.rip }">
            {{ bot.rip ? '💀 DEAD' : '✅ ALIVE' }}
          </span>
        </div>
      </div>
      <div class="bot-status">
        <span class="status-badge">{{ bot.status || 'Unknown' }}</span>
      </div>
    </div>

    <!-- Основные показатели -->
    <div class="bot-main-stats">
      <div class="main-stat">
        <div class="stat-label">❤️ Health</div>
        <div class="stat-value">{{ bot.hp || 0 }}/{{ bot.max_hp || 0 }}</div>
        <div class="stat-bar">
          <div class="stat-fill health" :style="`width: ${getPercentage(bot.hp, bot.max_hp)}%`"></div>
        </div>
      </div>
      
      <div class="main-stat">
        <div class="stat-label">🔵 Mana</div>
        <div class="stat-value">{{ bot.mp || 0 }}/{{ bot.max_mp || 0 }}</div>
        <div class="stat-bar">
          <div class="stat-fill mana" :style="`width: ${getPercentage(bot.mp, bot.max_mp)}%`"></div>
        </div>
      </div>
    </div>

    <!-- Боевые характеристики -->
    <div class="combat-stats">
      <h4 class="section-title">⚔️ Combat Stats</h4>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">{{ formatNumber(bot.attack || 0) }}</div>
          <div class="stat-label">Attack</div>
        </div>
        
        <div class="stat-item highlight">
          <div class="stat-value">{{ formatNumber(bot.dps || 0) }}</div>
          <div class="stat-label">DPS</div>
        </div>
        
        <div class="stat-item">
          <div class="stat-value">{{ (bot.cc || 0).toFixed(1) }}%</div>
          <div class="stat-label">Crit</div>
        </div>
        
        <div class="stat-item">
          <div class="stat-value">{{ (bot.frequency || 0).toFixed(2) }}</div>
          <div class="stat-label">Freq</div>
        </div>
        
        <div class="stat-item armor">
          <div class="stat-value">{{ bot.armor || 0 }}</div>
          <div class="stat-label">Armor</div>
        </div>
        
        <div class="stat-item resistance">
          <div class="stat-value">{{ bot.resistance || 0 }}</div>
          <div class="stat-label">Resist</div>
        </div>
      </div>
    </div>

    <!-- Экономические показатели -->
    <div class="economic-stats">
      <h4 class="section-title">💰 Economy</h4>
      <div class="stats-grid">
        <div class="stat-item gold">
          <div class="stat-value">{{ formatNumber(bot.gold || 0) }}</div>
          <div class="stat-label">Gold</div>
        </div>
        
        <div class="stat-item">
          <div class="stat-value">{{ formatNumber(bot.gph || 0) }}</div>
          <div class="stat-label">GPH</div>
        </div>
        
        <div class="stat-item">
          <div class="stat-value">{{ formatNumber(bot.xp || 0) }}</div>
          <div class="stat-label">XP</div>
        </div>
        
        <div class="stat-item">
          <div class="stat-value">{{ formatNumber(bot.xpPh || 0) }}</div>
          <div class="stat-label">XP/h</div>
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
        <span class="info-label">🎒 Inventory:</span>
        <span class="info-value">{{ bot.esize || 0 }}/{{ bot.isize || 0 }}</span>
      </div>
    </div>

    <!-- Время обновления -->
    <div class="bot-updated">
      Last update: {{ getTimeAgo(bot.lastUpdate) }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  bot: {
    type: Object,
    required: true,
    default: () => ({})
  }
})

const getPercentage = (current, max) => {
  if (!max || max <= 0) return 0
  return Math.min(100, (current / max) * 100)
}

const formatNumber = (num) => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
  return Math.round(num).toString()
}

const getTimeAgo = (timestamp) => {
  if (!timestamp) return 'unknown'
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
</script>

<style scoped>
.bot-card {
  background: linear-gradient(145deg, #1e293b, #0f172a);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.bot-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
  border-color: rgba(79, 70, 229, 0.3);
}

.bot-card.bot-dead {
  opacity: 0.6;
  filter: grayscale(0.8);
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
  font-size: 1.5em;
  color: #ffffff;
  font-weight: 700;
}

.bot-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.bot-level {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85em;
  font-weight: 600;
}

.bot-realm {
  color: #94a3b8;
  font-size: 0.85em;
  padding: 4px 8px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 6px;
}

.bot-alive {
  font-size: 0.85em;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 20px;
}

.bot-alive.alive {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.bot-alive.dead {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.status-badge {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: 600;
}

/* Основные показатели */
.bot-main-stats {
  margin: 20px 0;
}

.main-stat {
  margin-bottom: 15px;
}

.stat-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 0.9em;
  color: #cbd5e1;
}

.stat-value {
  font-size: 1.1em;
  font-weight: 600;
  color: #ffffff;
}

.stat-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 6px;
}

.stat-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.stat-fill.health {
  background: linear-gradient(90deg, #ef4444, #f87171);
}

.stat-fill.mana {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}

/* Боевые характеристики */
.section-title {
  margin: 25px 0 15px 0;
  color: #e2e8f0;
  font-size: 1.1em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stat-item {
  background: rgba(255, 255, 255, 0.05);
  padding: 15px;
  border-radius: 10px;
  text-align: center;
  transition: all 0.3s;
  border: 1px solid transparent;
}

.stat-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.1);
}

.stat-item.highlight {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.stat-item.highlight .stat-value {
  color: #f59e0b;
  font-size: 1.3em;
}

.stat-item.armor {
  border-left: 4px solid #3b82f6;
}

.stat-item.resistance {
  border-left: 4px solid #8b5cf6;
}

.stat-item.gold .stat-value {
  color: #fbbf24;
}

.stat-value {
  font-size: 1.2em;
  font-weight: bold;
  color: #ffffff;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 0.85em;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Экономические показатели */
.economic-stats {
  margin: 20px 0;
}

/* Информация */
.bot-info {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 15px;
  margin: 20px 0;
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
  color: #94a3b8;
  font-weight: 500;
}

.info-value {
  color: #e2e8f0;
  font-weight: 500;
}

/* Время обновления */
.bot-updated {
  font-size: 0.8em;
  color: #64748b;
  text-align: center;
  padding-top: 15px;
  margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* Адаптивность */
@media (min-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>