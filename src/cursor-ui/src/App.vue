<template>
  <div class="app">
    <header class="header">
      <h1 class="title">Cursor UI</h1>
      <p class="subtitle">Adventure Land · Bot Monitor</p>
      <div class="stats">
        <div class="stat"><span class="stat-val">{{ bots.length }}</span><span class="stat-lbl">Bots</span></div>
        <div class="stat"><span class="stat-val">{{ aliveCount }}</span><span class="stat-lbl">Alive</span></div>
        <div class="stat gold"><span class="stat-val">{{ formatNum(totalGold) }}</span><span class="stat-lbl">Gold</span></div>
        <div class="stat"><span class="stat-val">{{ formatNum(totalDPS) }}</span><span class="stat-lbl">DPS</span></div>
        <div class="stat"><span class="stat-val">{{ avgCC }}</span><span class="stat-lbl">Avg CC</span></div>
        <div class="stat muted"><span class="stat-val">{{ formatTime(lastUpdate) }}</span><span class="stat-lbl">Updated</span></div>
      </div>
    </header>

    <main class="main">
      <div v-if="loading && bots.length === 0" class="loading">
        <div class="spinner" />
        <p>Loading…</p>
      </div>
      <div v-else-if="error" class="error">
        <p>{{ error }}</p>
        <button @click="load">Retry</button>
      </div>
      <div v-else-if="bots.length === 0" class="empty">
        <p>No bots connected</p>
      </div>
      <div v-else class="grid">
        <BotCard v-for="b in sortedBots" :key="b.name" :bot="b" />
      </div>
    </main>

    <footer class="footer">
      <span>Auto-refresh · Cursor UI</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import BotCard from './components/BotCard.vue'

const POLL_MS = 600
const API = '/api/bots'

const bots = ref([])
const loading = ref(true)
const error = ref(null)
const lastUpdate = ref(null)
let poll = null

const aliveCount = computed(() => bots.value.filter(b => !b.rip).length)
const totalGold = computed(() => bots.value.reduce((s, b) => s + (b.gold || 0), 0))
const totalDPS = computed(() => bots.value.reduce((s, b) => s + (b.dps || 0), 0))
const avgCC = computed(() => {
  const a = bots.value.filter(b => !b.rip && b.cc != null)
  if (!a.length) return '0'
  return (a.reduce((s, b) => s + (b.cc || 0), 0) / a.length).toFixed(1)
})

const sortedBots = computed(() =>
  [...bots.value].sort((a, b) => {
    if (a.rip !== b.rip) return a.rip ? 1 : -1
    if (a.level !== b.level) return b.level - a.level
    return (a.name || '').localeCompare(b.name || '')
  })
)

function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString()
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const r = await fetch(API)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await r.json()
    if (data.success) {
      bots.value = data.bots || []
      lastUpdate.value = data.timestamp
    } else throw new Error('Invalid response')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  poll = setInterval(load, POLL_MS)
})

onUnmounted(() => {
  if (poll) clearInterval(poll)
})
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Outfit', system-ui, sans-serif;
  background: #0c0c10;
  color: #e4e4e7;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

.app {
  max-width: 1920px;
  margin: 0 auto;
  padding: 20px 24px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(145deg, #18181b 0%, #0f0f12 100%);
  border: 1px solid #27272a;
  border-radius: 14px;
  padding: 20px 28px;
  margin-bottom: 24px;
}

.title {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #fafafa;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 0.9rem;
  color: #71717a;
  margin-bottom: 18px;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.stat {
  font-family: 'JetBrains Mono', monospace;
  background: #27272a;
  border: 1px solid #3f3f46;
  border-radius: 10px;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.stat-val { font-size: 1.1rem; font-weight: 600; color: #fafafa; }
.stat-lbl { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: #71717a; margin-top: 2px; }
.stat.gold .stat-val { color: #facc15; }
.stat.muted .stat-val { font-size: 0.85rem; color: #a1a1aa; }

.loading, .error, .empty {
  text-align: center;
  padding: 48px 24px;
  color: #a1a1aa;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #27272a;
  border-top-color: #6366f1;
  border-radius: 50%;
  margin: 0 auto 16px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.error button {
  margin-top: 12px;
  padding: 8px 20px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  flex: 1;
}

@media (max-width: 1400px) { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 700px)  { .grid { grid-template-columns: 1fr; } }

.footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #27272a;
  font-size: 0.8rem;
  color: #52525b;
}
</style>
