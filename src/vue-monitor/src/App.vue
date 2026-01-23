<template>
  <div class="app">
    <header>
      <h1>🤖 Adventure Land Bots Monitor</h1>
      <div class="stats">
        <span>Bots: {{ bots.length }}</span>
        <span>Alive: {{ aliveCount }}</span>
        <span>Total Gold: {{ totalGold }}</span>
        <button @click="loadBots">🔄 Refresh</button>
      </div>
    </header>

    <main>
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="bots.length === 0" class="no-bots">
        No bots connected
      </div>
      <div v-else class="bots">
        <div v-for="bot in bots" :key="bot.name" class="bot-card">
          <h3>{{ bot.name }} (Lvl {{ bot.level }})</h3>
          <div class="bot-status">
            <span :class="{ alive: !bot.rip, dead: bot.rip }">
              {{ bot.rip ? '💀 DEAD' : '✅ ALIVE' }}
            </span>
            <span class="status">{{ bot.status }}</span>
          </div>
          
          <div class="progress">
            <div class="label">❤️ Health</div>
            <div class="bar">
              <div class="fill health" :style="{ width: healthPercent(bot) + '%' }">
                {{ bot.health }} / {{ bot.maxHealth }}
              </div>
            </div>
          </div>
          
          <div class="progress">
            <div class="label">🔵 Mana</div>
            <div class="bar">
              <div class="fill mana" :style="{ width: manaPercent(bot) + '%' }">
                {{ bot.mana }} / {{ bot.maxMana }}
              </div>
            </div>
          </div>
          
          <div class="bot-info">
            <div><strong>Target:</strong> {{ bot.target || 'None' }}</div>
            <div><strong>Gold:</strong> {{ formatNumber(bot.gold) }}</div>
            <div><strong>Attack:</strong> {{ bot.attack.toFixed(1) }}</div>
            <div><strong>Armor:</strong> {{ bot.armor }}</div>
          </div>
        </div>
      </div>
    </main>

    <footer>
      <p>Auto-refresh every 5 seconds | Last update: {{ lastUpdate }}</p>
    </footer>
  </div>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      bots: [],
      loading: false,
      error: null,
      lastUpdate: 'Never'
    }
  },
  computed: {
    aliveCount() {
      return this.bots.filter(b => !b.rip).length
    },
    totalGold() {
      return this.bots.reduce((sum, b) => sum + b.gold, 0).toLocaleString()
    }
  },
  mounted() {
    this.loadBots()
    this.interval = setInterval(this.loadBots, 5000)
  },
  beforeUnmount() {
    if (this.interval) clearInterval(this.interval)
  },
  methods: {
    async loadBots() {
      this.loading = true
      this.error = null
      
      try {
        const response = await fetch('/api/bots')
        const data = await response.json()
        
        if (data.success) {
          this.bots = data.bots
          this.lastUpdate = new Date().toLocaleTimeString()
        } else {
          throw new Error('Invalid response')
        }
      } catch (err) {
        this.error = 'Failed to load bots: ' + err.message
        console.error(err)
      } finally {
        this.loading = false
      }
    },
    healthPercent(bot) {
      return bot.maxHealth > 0 ? (bot.health / bot.maxHealth * 100) : 0
    },
    manaPercent(bot) {
      return bot.maxMana > 0 ? (bot.mana / bot.maxMana * 100) : 0
    },
    formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
      return num.toString()
    }
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: white;
  min-height: 100vh;
}

.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  border-radius: 10px;
  margin-bottom: 20px;
  text-align: center;
}

header h1 {
  margin-bottom: 15px;
  font-size: 2em;
}

.stats {
  display: flex;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
  align-items: center;
}

.stats span {
  background: rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: bold;
}

.stats button {
  background: white;
  color: #667eea;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s;
}

.stats button:hover {
  transform: scale(1.05);
}

.loading, .error, .no-bots {
  text-align: center;
  padding: 40px;
  font-size: 1.2em;
}

.error {
  color: #ff6b6b;
}

.bots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.bot-card {
  background: #2d3748;
  border-radius: 10px;
  padding: 20px;
  transition: transform 0.3s, box-shadow 0.3s;
}

.bot-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}

.bot-card h3 {
  margin-bottom: 10px;
  color: #63b3ed;
}

.bot-status {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  font-size: 0.9em;
}

.alive {
  color: #68d391;
  font-weight: bold;
}

.dead {
  color: #fc8181;
  font-weight: bold;
}

.status {
  color: #a0aec0;
}

.progress {
  margin: 15px 0;
}

.label {
  margin-bottom: 5px;
  font-size: 0.9em;
  color: #a0aec0;
}

.bar {
  height: 20px;
  background: #4a5568;
  border-radius: 10px;
  overflow: hidden;
}

.fill {
  height: 100%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
  font-weight: bold;
  transition: width 0.5s ease;
}

.health {
  background: linear-gradient(90deg, #e53e3e, #fc8181);
}

.mana {
  background: linear-gradient(90deg, #4299e1, #63b3ed);
}

.bot-info {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #4a5568;
}

.bot-info div {
  margin: 5px 0;
  font-size: 0.9em;
}

footer {
  text-align: center;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #4a5568;
  color: #a0aec0;
  font-size: 0.9em;
}

@media (max-width: 768px) {
  .bots {
    grid-template-columns: 1fr;
  }
  
  .stats {
    flex-direction: column;
    gap: 10px;
  }
}
</style>