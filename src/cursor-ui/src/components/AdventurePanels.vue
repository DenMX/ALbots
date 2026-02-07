<template>
  <div class="adventure-panels">
    <section v-once class="comm-panel">
      <div class="comm-header">
        <h2 class="comm-title">Adventure Land Comm</h2>
        <a class="comm-link" href="https://adventure.land/comm" target="_blank" rel="noopener noreferrer">Open in new tab</a>
      </div>
      <div class="comm-frame-wrap">
        <iframe :key="'comm-panel'" class="comm-frame" src="https://adventure.land/comm" loading="lazy" />
      </div>
    </section>
    <section v-if="playerUrl" v-memo="[playerUrl]" class="player-panel">
      <div class="player-header">
        <h2 class="player-title">Players</h2>
        <span v-if="playerName" class="player-name">{{ playerName }}</span>
        <a class="player-link" :href="playerUrl" target="_blank" rel="noopener noreferrer">Open in new tab</a>
      </div>
      <div class="player-frame-wrap">
        <iframe :key="playerUrl" class="player-frame" :src="playerUrl" loading="lazy" />
      </div>
    </section>
  </div>
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
  }
})
</script>

<style scoped>
.adventure-panels {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 680px;
  gap: 20px;
  align-items: stretch;
  min-height: 0;
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

.player-panel {
  width: 680px;
  flex-shrink: 0;
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
