<template>
  <div class="progress-container">
    <div class="progress-header">
      <span class="progress-label">{{ label }}</span>
      <span class="progress-value">{{ displayValue }}</span>
    </div>
    <div class="progress-bar" :style="{ '--progress-color': color }">
      <div 
        class="progress-fill" 
        :style="{ 
          width: `${percentage}%`,
          backgroundColor: color 
        }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: number
  max: number
  color?: string
  humanize?: boolean
  percentage?: boolean
}>()

const percentage = computed(() => {
  return props.max > 0 ? (props.value / props.max) * 100 : 0
})

const displayValue = computed(() => {
  if (props.percentage) {
    return `${percentage.value.toFixed(1)}%`
  }
  
  if (props.humanize) {
    return humanizeNumber(props.value)
  }
  
  return `${Math.floor(props.value).toLocaleString()} / ${Math.floor(props.max).toLocaleString()}`
})

const humanizeNumber = (num: number): string => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
  return Math.floor(num).toString()
}
</script>

<style scoped>
.progress-container {
  margin: 12px 0;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 0.9em;
}

.progress-label {
  font-weight: 500;
  color: var(--text-primary);
}

.progress-value {
  color: var(--text-secondary);
  font-weight: 500;
}

.progress-bar {
  height: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease;
  position: relative;
}

.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>