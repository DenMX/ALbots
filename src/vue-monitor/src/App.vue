<template>
  <div class="app">
    <header>
      <h1>🤖 Adventure Land Bots Monitor</h1>
      <div class="stats">
        <span>Bots: {{ bots.length }}</span>
        <span>Alive: {{ aliveCount }}</span>
        <span>Total Gold: {{ totalGold }}</span>
        <span>Total DPS: {{ totalDPS }}</span>
        <span>Avg CC: {{ avgCC }}%</span>
        <button @click="loadBots" :disabled="loading">
          {{ loading ? '🔄 Loading...' : '🔄 Refresh' }}
        </button>
        <span class="last-update">Updated: {{ formatTime(lastUpdate) }}</span>
      </div>
    </header>

    <main>
      <div v-if="loading && bots.length === 0" class="loading">
        <div class="spinner"></div>
        <p>Loading bot data...</p>
      </div>
      
      <div v-else-if="error" class="error">
        <p>❌ {{ error }}</p>
        <button @click="loadBots">Try Again</button>
      </div>
      
      <div v-else-if="bots.length === 0" class="no-bots">
        <p>🤖 No bots connected yet...</p>
        <p>Make sure your bots are running in Adventure Land</p>
      </div>
      
      <div v-else class="bots-container grid-layout">
        <BotCard 
          v-for="bot in sortedBots" 
          :key="bot.name" 
          :bot="bot"
        />
      </div>
    </main>

    <footer>
      <p>Auto-refresh every 5 seconds | Server: http://localhost:3001</p>
      <p>Make sure your Adventure Land bots are running the monitoring script</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import BotCard from './components/BotCard.vue'

const API_URL = 'http://localhost:3001/api/bots'

const bots = ref([])
const loading = ref(false)
const error = ref(null)
const lastUpdate = ref(null)
let interval = null

const aliveCount = computed(() => 
  bots.value.filter(b => !b.rip).length
)

const totalGold = computed(() => 
  formatNumber(bots.value.reduce((sum, b) => sum + (b.gold || 0), 0))
)

const totalDPS = computed(() => 
  formatNumber(bots.value.reduce((sum, b) => sum + (b.dps || 0), 0))
)

const avgCC = computed(() => {
  const alive = bots.value.filter(b => !b.rip && b.cc !== undefined)
  if (alive.length === 0) return 0
  const total = alive.reduce((sum, b) => sum + (b.cc || 0), 0)
  return (total / alive.length).toFixed(1)
})

const sortedBots = computed(() => {
  return [...bots.value].sort((a, b) => {
    if (a.rip !== b.rip) return a.rip ? 1 : -1
    if (a.level !== b.level) return b.level - a.level
    return a.name.localeCompare(b.name)
  })
})

const loadBots = async () => {
  loading.value = true
  error.value = null
  
  try {
    const response = await fetch(API_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const data = await response.json()
    
    if (data.success) {
      bots.value = data.bots
      lastUpdate.value = data.timestamp
    } else {
      throw new Error('Invalid response from server')
    }
  } catch (err) {
    error.value = `Failed to load bots: ${err.message}`
    console.error('Error loading bots:', err)
  } finally {
    loading.value = false
  }
}

const formatNumber = (num) => {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return Math.round(num).toString()
}

const formatTime = (timestamp) => {
  if (!timestamp) return 'Never'
  return new Date(timestamp).toLocaleTimeString()
}

onMounted(() => {
  loadBots()
  interval = setInterval(loadBots, 5000)
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
}

.app {
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  padding: 25px;
  border-radius: 16px;
  margin-bottom: 25px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}

header h1 {
  margin-bottom: 20px;
  font-size: 2.2em;
  text-align: center;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.stats {
  display: flex;
  justify-content: center;
  gap: 15px;
  flex-wrap: wrap;
  align-items: center;
}

.stats span {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1.1em;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.stats .last-update {
  font-size: 0.9em;
  opacity: 0.9;
}

.stats button {
  background: #fbbf24;
  color: #78350f;
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 1em;
}

.stats button:hover:not(:disabled) {
  background: #f59e0b;
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(245, 158, 11, 0.4);
}

.stats button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 60px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-top-color: #4f46e5;
  border-radius: 50%;
  margin: 0 auto 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  text-align: center;
  padding: 40px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid #ef4444;
  border-radius: 12px;
  margin: 20px 0;
}

.error p {
  margin-bottom: 20px;
  font-size: 1.2em;
  color: #fca5a5;
}

.error button {
  background: #ef4444;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
}

.no-bots {
  text-align: center;
  padding: 60px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  border: 2px dashed rgba(255, 255, 255, 0.1);
}

.no-bots p {
  margin: 10px 0;
  font-size: 1.2em;
  color: #94a3b8;
}

/* Сетка 4 колонки */
.bots-container.grid-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

footer {
  margin-top: auto;
  padding-top: 30px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9em;
  border-top: 1px solid #334155;
}

footer p {
  margin: 5px 0;
}

@media (max-width: 1200px) {
  .bots-container.grid-layout {
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  }
}

@media (max-width: 768px) {
  .stats {
    flex-direction: column;
    gap: 10px;
  }
  
  .stats span, .stats button {
    width: 100%;
    text-align: center;
  }
  
  header h1 {
    font-size: 1.8em;
  }
}
</style>