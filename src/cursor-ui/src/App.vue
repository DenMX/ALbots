<template>
  <div class="app">
    <header class="header">
      <div class="header-left">
        <h1 class="title">Cursor UI</h1>
        <p class="subtitle">Adventure Land · Bot Monitor</p>
        <nav class="tabs">
          <button class="tab" :class="{ active: activeTab === 'main' }" @click="activeTab = 'main'">Main</button>
          <button class="tab" :class="{ active: activeTab === 'docs' }" @click="activeTab = 'docs'">Docs</button>
          <button class="tab" :class="{ active: activeTab === 'test' }" @click="activeTab = 'test'">Test</button>
          <button class="tab" :class="{ active: activeTab === 'comm' }" @click="activeTab = 'comm'">Comm</button>
        </nav>
      </div>
      <div class="header-center">
        <div class="stats">
          <div class="stat"><span class="stat-val">{{ bots.length }}</span><span class="stat-lbl">Bots</span></div>
          <div class="stat"><span class="stat-val">{{ aliveCount }}</span><span class="stat-lbl">Alive</span></div>
          <div class="stat gold"><span class="stat-val">{{ formatNum(totalGold) }}</span><span class="stat-lbl">Gold</span></div>
          <div class="stat"><span class="stat-val">{{ formatNum(totalDPS) }}</span><span class="stat-lbl">DPS</span></div>
          <div class="stat"><span class="stat-val">{{ avgCC }}</span><span class="stat-lbl">Avg CC</span></div>
          <div class="stat muted"><span class="stat-val">{{ formatTime(lastUpdate) }}</span><span class="stat-lbl">Updated</span></div>
        </div>
      </div>
    </header>

    <main class="main">
      <template v-if="activeTab === 'main'">
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
        <div v-else class="content-row">
          <div class="grid">
            <BotCard v-for="b in sortedBots" :key="b.name" :bot="b" :default-effects-open="true" :default-min-mode="false" />
          </div>
          <section v-if="playerUrl" class="player-panel">
            <div class="player-header">
              <h2 class="player-title">Players</h2>
              <span class="player-name">{{ primaryBot?.name }}</span>
              <a class="player-link" :href="playerUrl" target="_blank" rel="noopener noreferrer">Open in new tab</a>
            </div>
            <div class="player-frame-wrap player-frame-wrap-main">
              <iframe v-if="playerUrl" :key="playerUrl" class="player-frame player-frame-main" :src="playerUrl" loading="lazy" />
            </div>
          </section>
        </div>
      </template>
      <template v-else-if="activeTab === 'docs'">
        <section class="docs-panel">
          <div class="docs-header">
            <h2 class="docs-title">Adventure Land Docs</h2>
            <a class="docs-link" href="https://adventure.land/docs" target="_blank" rel="noopener noreferrer">Open in new tab</a>
          </div>
          <div class="docs-frame-wrap">
            <iframe class="docs-frame" src="https://adventure.land/docs" loading="lazy" />
          </div>
        </section>
      </template>
      <template v-else-if="activeTab === 'test'">
        <div class="tab-pane" :class="{ 'tab-pane--fill': !loading && !error && bots.length > 0 }">
          <div v-if="loading && bots.length === 0" class="loading">
            <div class="spinner" />
            <p>Loading…</p>
          </div>
          <div v-else-if="error" class="error">
            <p>{{ error }}</p>
            <button @click="load">Retry</button>
          </div>
          <div v-else class="content-row test-layout">
            <div v-memo="[playerUrl]" class="comm-panels-wrap">
              <AdventurePanels :player-url="playerUrl" :player-name="primaryBot?.name" />
            </div>
            <aside class="test-bots-panel">
              <div class="test-bots-panel-header">
                <h3 class="test-bots-panel-title">Bots</h3>
                <span class="test-bots-panel-count">{{ sortedBots.length }} active</span>
              </div>
              <div class="test-bots-grid test-bots-grid-auto">
                <BotCard v-for="b in sortedBots" :key="'test-' + b.name" :bot="b" :default-effects-open="false" :default-min-mode="true" :show-combat="false" :show-effects="false" :show-effects-inline="true" />
              </div>
            </aside>
          </div>
        </div>
      </template>
      <template v-else-if="activeTab === 'comm'">
        <div class="tab-pane" :class="{ 'tab-pane--fill': !loading && !error && bots.length > 0 }">
          <div v-if="loading && bots.length === 0" class="loading">
            <div class="spinner" />
            <p>Loading…</p>
          </div>
          <div v-else-if="error" class="error">
            <p>{{ error }}</p>
            <button @click="load">Retry</button>
          </div>
          <div v-else class="content-row test-layout">
            <div v-memo="[playerUrl]" class="comm-panels-wrap">
              <AdventurePanels :player-url="playerUrl" :player-name="primaryBot?.name" />
            </div>
            <aside class="test-bots-panel">
              <div class="test-bots-panel-header">
                <h3 class="test-bots-panel-title">Bots</h3>
                <span class="test-bots-panel-count">{{ sortedBots.length }} active</span>
              </div>
              <div class="test-bots-grid">
                <BotCard v-for="b in sortedBots.slice(0, 4)" :key="'comm-' + b.name" :bot="b" :default-effects-open="false" :default-min-mode="true" :show-combat="false" :show-effects="false" :show-effects-inline="false" />
              </div>
            </aside>
          </div>
        </div>
      </template>
    </main>

    <footer v-if="activeTab !== 'test' && activeTab !== 'comm'" class="footer">
      <span>Auto-refresh · Cursor UI</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import BotCard from './components/BotCard.vue'
import AdventurePanels from './components/AdventurePanels.vue'

const POLL_MS = 600
const API = '/api/bots'

const activeTab = ref('main')
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

const sortedBots = computed(() => {
  const sorted = [...bots.value].sort((a, b) => {
    if (a.rip !== b.rip) return a.rip ? 1 : -1
    if (a.level !== b.level) return b.level - a.level
    return (a.name || '').localeCompare(b.name || '')
  })
  return sorted
})

const primaryBot = computed(() => sortedBots.value[0] || null)

const playerUrl = computed(() => {
  if (!primaryBot.value || !primaryBot.value.name) return null
  return `https://adventure.land/player/${encodeURIComponent(primaryBot.value.name)}`
})


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
  poll = setInterval(() => {
    load()
  }, POLL_MS)
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
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 20px 24px;
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.header {
  background: linear-gradient(145deg, #18181b 0%, #0f0f12 100%);
  border: 1px solid #27272a;
  border-radius: 14px;
  padding: 20px 28px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.header-left {
  min-width: 0;
  flex-shrink: 0;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 0;
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
  margin-bottom: 12px;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 0;
}

.tab {
  font-family: 'Outfit', system-ui, sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  color: #71717a;
  background: #27272a;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}

.tab:hover {
  color: #a1a1aa;
  background: #3f3f46;
}

.tab.active {
  color: #fafafa;
  background: #6366f1;
  border-color: #6366f1;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 0;
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

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.main .tab-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.main .tab-pane--fill {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.main .content-row {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.main .content-row.test-layout {
  min-height: 0;
  flex: 1;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  flex: 1;
}

@media (max-width: 1400px) { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 700px)  { .grid { grid-template-columns: 1fr; } }

.main .player-panel,
.test-layout .player-panel {
  width: 680px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
}

.footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #27272a;
  font-size: 0.8rem;
  color: #52525b;
}

.player-panel {
  background: linear-gradient(145deg, #111827 0%, #020617 100%);
  border-radius: 14px;
  border: 1px solid #1f2937;
  padding: 16px 20px 12px;
}

.player-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.player-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #e5e7eb;
}

.player-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: #a5b4fc;
}

.player-link {
  margin-left: auto;
  font-size: 0.8rem;
  color: #60a5fa;
  text-decoration: none;
}

.player-link:hover {
  text-decoration: underline;
}

.player-frame-wrap {
  flex: 1;
  min-height: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #111827;
  background: #020617;
}

.player-frame-wrap-main {
  overflow: auto;
}

.player-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.player-frame-main {
  height: 940px;
  min-height: 940px;
}

.docs-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: linear-gradient(145deg, #111827 0%, #020617 100%);
  border-radius: 14px;
  border: 1px solid #1f2937;
  padding: 16px 20px 12px;
}

.docs-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.docs-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #e5e7eb;
}

.docs-link {
  margin-left: auto;
  font-size: 0.8rem;
  color: #60a5fa;
  text-decoration: none;
}

.docs-link:hover {
  text-decoration: underline;
}

.docs-frame-wrap {
  flex: 1;
  min-height: 400px;
  border-radius: 10px;
  overflow: auto;
  border: 1px solid #111827;
  background: #020617;
}

.docs-frame {
  width: 100%;
  height: 100%;
  min-height: 800px;
  border: none;
  display: block;
}

.content-row.test-layout {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 20px;
  align-items: stretch;
  min-height: 0;
  max-height: calc(100vh - 240px);
  position: relative;
}

.test-panels-iframe-wrap {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid #27272a;
  background: #0c0c10;
  contain: layout paint;
}

.test-panels-iframe {
  width: 100%;
  height: 100%;
  min-height: 400px;
  border: none;
  display: block;
}

.test-bots-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, #18181b 0%, #0f0f12 100%);
  border: 1px solid #27272a;
  border-radius: 12px;
  padding: 12px 16px;
  min-height: 0;
  overflow: hidden;
}

.test-bots-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #27272a;
}

.test-bots-panel-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #e5e7eb;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.test-bots-panel-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: #71717a;
  background: #27272a;
  padding: 4px 8px;
  border-radius: 6px;
}

.test-bots-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 12px;
  min-height: 0;
  flex: 1;
  overflow: auto;
  align-content: start;
}

.test-bots-grid .card {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  font-size: 0.8rem;
  padding: 8px 10px;
  gap: 6px;
}

.test-bots-grid .card .card-header { margin-bottom: 4px; }
.test-bots-grid .card .name-row { margin-bottom: 4px; gap: 6px; flex-wrap: wrap; }
.test-bots-grid .card .name { font-size: 0.9rem; }
.test-bots-grid .card .lvl { font-size: 0.65rem; padding: 2px 5px; }
.test-bots-grid .card .realm { font-size: 0.65rem; }
.test-bots-grid .card .alive { font-size: 0.6rem; padding: 2px 5px; }
.test-bots-grid .card .bars-and-stats { gap: 8px; }
.test-bots-grid .card .bars { gap: 4px; min-width: 0; }
.test-bots-grid .card .bar-head { font-size: 0.6rem; margin-bottom: 2px; }
.test-bots-grid .card .bar-track { height: 4px; }
.test-bots-grid .card .section-title { font-size: 0.6rem; margin-bottom: 4px; padding-bottom: 2px; }
.test-bots-grid .card .kv { gap: 2px; }
.test-bots-grid .card .k { padding: 3px 5px; }
.test-bots-grid .card .k .v { font-size: 0.7rem; }
.test-bots-grid .card .k .l { font-size: 0.6rem; }
.test-bots-grid .card .compact-right { min-width: 0; }

/* Автозаполнение по ширине для Test вкладки */
.test-bots-grid-auto {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto;
}

.test-layout .test-bots-panel {
  width: fit-content;
  min-width: fit-content;
  max-width: fit-content;
}

.comm-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, #111827 0%, #020617 100%);
  border-radius: 14px;
  border: 1px solid #1f2937;
  padding: 16px 20px 12px;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
}

.comm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.comm-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #e5e7eb;
}

.comm-link {
  margin-left: auto;
  font-size: 0.8rem;
  color: #60a5fa;
  text-decoration: none;
}

.comm-link:hover {
  text-decoration: underline;
}

.comm-frame-wrap {
  flex: 1;
  min-height: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #111827;
  background: #020617;
  position: relative;
  width: 100%;
  height: 100%;
}

.comm-frame {
  width: 100%;
  height: 100%;
  min-height: 600px;
  border: none;
  display: block;
  pointer-events: auto;
}

/* Comm: Фиксированные размеры в px вместо flex + contain: strict */
.comm-panels-wrap {
  width: calc(75vw - 280px);
  height: calc(100vh - 240px);
  min-width: 720px;
  max-width: calc(75vw - 280px);
  min-height: 400px;
  max-height: calc(100vh - 240px);
  position: relative;
  overflow: hidden;
  contain: strict;
  isolation: isolate;
}

.comm-panels-wrap .adventure-panels {
  width: 100%;
  height: 100%;
  min-height: 0;
}

</style>
