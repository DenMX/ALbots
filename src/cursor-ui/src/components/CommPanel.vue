<template>
  <section v-once class="comm-panel" :class="panelClass">
    <div class="comm-header">
      <h2 class="comm-title">Adventure Land Comm</h2>
      <a class="comm-link" href="https://adventure.land/comm" target="_blank" rel="noopener noreferrer">Open in new tab</a>
    </div>
    <div class="comm-frame-wrap" :class="frameWrapClass">
      <component :is="frameType" :key="frameKey" :class="frameClass" :src="commUrl" :data="commUrl" :type="frameType === 'object' ? 'text/html' : undefined" loading="lazy">
        <embed v-if="frameType === 'object'" class="comm-embed" type="text/html" :src="commUrl" />
      </component>
    </div>
  </section>
</template>

<script setup>
defineProps({
  panelClass: {
    type: String,
    default: ''
  },
  frameWrapClass: {
    type: String,
    default: ''
  },
  frameType: {
    type: String,
    default: 'iframe', // 'iframe' or 'object'
    validator: (value) => ['iframe', 'object'].includes(value)
  },
  frameKey: {
    type: String,
    default: 'comm-panel'
  },
  commUrl: {
    type: String,
    default: 'https://adventure.land/comm'
  }
})

const frameClass = 'comm-frame'
</script>

<style scoped>
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

.comm-frame,
.comm-object,
.comm-embed {
  width: 100%;
  height: 100%;
  min-height: 600px;
  border: none;
  display: block;
  pointer-events: auto;
}
</style>
