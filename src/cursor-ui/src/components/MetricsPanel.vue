<template>
  <section class="metrics-panel">
    <div class="metrics-header">
      <h2 class="metrics-title">Grafana · ALbots Metrics</h2>
      <a
        v-if="dashboardUrl"
        class="metrics-link"
        :href="dashboardUrl"
        target="_blank"
        rel="noopener noreferrer"
      >Open in new tab</a>
    </div>
    <div v-if="!dashboardUrl" class="metrics-empty">
      <p>Set <code>metrics.grafanaDashboardUrl</code> in <code>credentials.json</code></p>
      <p class="metrics-hint">Use a direct dashboard URL, not Grafana <code>/goto/</code> links — those redirect to localhost.</p>
      <p class="metrics-hint">Example: http://your-server:3000/d/albots-overview/albots-overview?orgId=1&amp;kiosk</p>
    </div>
    <div v-else class="metrics-frame-wrap">
      <iframe :key="dashboardUrl" class="metrics-frame" :src="dashboardUrl" loading="lazy" />
    </div>
  </section>
</template>

<script setup>
defineProps({
  dashboardUrl: {
    type: String,
    default: null,
  },
})
</script>

<style scoped>
.metrics-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, #111827 0%, #020617 100%);
  border-radius: 14px;
  border: 1px solid #1f2937;
  padding: 16px 20px 12px;
  overflow: hidden;
}

.metrics-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.metrics-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #e5e7eb;
  margin: 0;
}

.metrics-link {
  margin-left: auto;
  font-size: 0.8rem;
  color: #60a5fa;
  text-decoration: none;
}

.metrics-link:hover {
  text-decoration: underline;
}

.metrics-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #71717a;
  text-align: center;
  padding: 24px;
}

.metrics-empty code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: #a1a1aa;
  background: #27272a;
  padding: 2px 6px;
  border-radius: 4px;
}

.metrics-hint {
  font-size: 0.8rem;
  color: #52525b;
  max-width: 520px;
  word-break: break-all;
}

.metrics-frame-wrap {
  flex: 1;
  min-height: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #111827;
  background: #020617;
}

.metrics-frame {
  width: 100%;
  height: 100%;
  min-height: 480px;
  border: none;
  display: block;
}
</style>
