<template>
  <section v-if="playerUrl" v-memo="[playerUrl]" class="player-panel" :class="panelClass">
    <div class="player-header">
      <h2 class="player-title">Players</h2>
      <span v-if="playerName" class="player-name">{{ playerName }}</span>
      <a class="player-link" :href="playerUrl" target="_blank" rel="noopener noreferrer">Open in new tab</a>
    </div>
    <div class="player-frame-wrap">
      <iframe :key="playerUrl" class="player-frame" :src="playerUrl" loading="lazy" />
    </div>
  </section>
</template>

<script setup>
defineProps({
  playerUrl: {
    type: String,
    default: null
  },
  playerName: {
    type: String,
    default: null
  },
  panelClass: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.player-panel {
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

.player-panel.fixed-width {
  width: 680px;
  flex-shrink: 0;
}

.player-panel.test2-player {
  flex: 1 1 0;
  min-height: 0;
}

.player-panel.test2-player .player-frame-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.player-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.player-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #e5e7eb;
}

.player-name {
  font-size: 0.85rem;
  color: #9ca3af;
  background: #1f2937;
  padding: 4px 8px;
  border-radius: 6px;
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
  position: relative;
}

.player-frame {
  width: 100%;
  height: 100%;
  min-height: 600px;
  border: none;
  display: block;
}
</style>
