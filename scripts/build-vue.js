// Используем CommonJS синтаксис
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Building Vue app...');

const vueDir = path.join(__dirname, '../src/vue-monitor');

// Создаём структуру папок
const dirs = ['src', 'public'];
dirs.forEach(dir => {
  const dirPath = path.join(vueDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// 1. Создаём package.json для Vue
const packageJson = {
  "name": "vue-monitor",
  "private": true,
  "version": "1.0.0",
  "type": "commonjs", // Изменяем на commonjs
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^4.2.0",
    "vite": "^4.3.0"
  }
};

fs.writeFileSync(
  path.join(vueDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);

// 2. Создаём vite.config.js (CommonJS синтаксис)
const viteConfig = `const { defineConfig } = require('vite')
const vue = require('@vitejs/plugin-vue')
const { resolve } = require('path')

module.exports = defineConfig({
  plugins: [vue()],
  build: {
    outDir: resolve(__dirname, '../../dist/vue-monitor'),
    emptyOutDir: true
  },
  server: {
    port: 3000
  }
})`;

fs.writeFileSync(path.join(vueDir, 'vite.config.js'), viteConfig);

// 3. Создаём index.html
const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bot Monitor</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`;

fs.writeFileSync(path.join(vueDir, 'index.html'), indexHtml);

// 4. Создаём App.vue
const appVue = `<template>
  <div class="app">
    <header>
      <h1>🤖 Bot Monitor</h1>
      <div class="stats">
        <span>Bots: {{ bots.length }}</span>
        <span>Alive: {{ aliveCount }}</span>
        <button @click="loadBots">🔄 Refresh</button>
      </div>
    </header>

    <main>
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="bots.length === 0" class="no-bots">No bots connected</div>
      <div v-else class="bots">
        <div v-for="bot in bots" :key="bot.name" class="bot-card">
          <h3>{{ bot.name }} (Lvl {{ bot.level }})</h3>
          <div class="status">{{ bot.rip ? '💀 DEAD' : '✅ ALIVE' }}</div>
          
          <div class="progress">
            <div>❤️ Health: {{ bot.health }}/{{ bot.maxHealth }}</div>
            <div class="bar">
              <div class="fill health" :style="{ width: healthPercent(bot) + '%' }"></div>
            </div>
          </div>
          
          <div class="info">
            <div>🎯 Target: {{ bot.target || 'None' }}</div>
            <div>💰 Gold: {{ formatNumber(bot.gold) }}</div>
            <div>⚔️ Attack: {{ bot.attack.toFixed(1) }}</div>
          </div>
        </div>
      </div>
    </main>

    <footer>
      <p>Last update: {{ lastUpdate }}</p>
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
    }
  },
  mounted() {
    this.loadBots()
    setInterval(this.loadBots, 5000)
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
        }
      } catch (err) {
        this.error = 'Failed to load bots'
      } finally {
        this.loading = false
      }
    },
    healthPercent(bot) {
      return bot.maxHealth > 0 ? (bot.health / bot.maxHealth * 100) : 0
    },
    formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
      return num
    }
  }
}
</script>

<style>
.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
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
  align-items: center;
}

.stats span {
  background: rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 20px;
}

.stats button {
  background: white;
  color: #667eea;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
}

.loading, .error, .no-bots {
  text-align: center;
  padding: 40px;
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
}

.bot-card h3 {
  color: #63b3ed;
  margin-bottom: 10px;
}

.status {
  margin-bottom: 15px;
  font-weight: bold;
}

.progress {
  margin: 15px 0;
}

.bar {
  height: 10px;
  background: #4a5568;
  border-radius: 5px;
  overflow: hidden;
  margin-top: 5px;
}

.fill {
  height: 100%;
  transition: width 0.5s;
}

.health {
  background: #e53e3e;
}

.info {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #4a5568;
  font-size: 0.9em;
}

.info div {
  margin: 5px 0;
}

footer {
  text-align: center;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #4a5568;
  color: #a0aec0;
}
</style>`;

fs.writeFileSync(path.join(vueDir, 'src/App.vue'), appVue);

// 5. Создаём main.js
const mainJs = `import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')`;

fs.writeFileSync(path.join(vueDir, 'src/main.js'), mainJs);

// 6. Устанавливаем зависимости и собираем
try {
  console.log('Installing Vue dependencies...');
  
  // Удаляем package-lock если есть
  const packageLock = path.join(vueDir, 'package-lock.json');
  if (fs.existsSync(packageLock)) {
    fs.unlinkSync(packageLock);
  }
  
  // Удаляем node_modules если есть
  const nodeModules = path.join(vueDir, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    fs.rmSync(nodeModules, { recursive: true, force: true });
  }
  
  execSync('npm install', { 
    cwd: vueDir, 
    stdio: 'inherit',
    shell: true 
  });
  
  console.log('Building Vue app...');
  execSync('npm run build', { 
    cwd: vueDir, 
    stdio: 'inherit',
    shell: true 
  });
  
  console.log('✅ Vue app built successfully!');
  console.log('✅ Built files in: dist/vue-monitor');
} catch (err) {
  console.error('❌ Build failed:', err.message);
  console.log('\nCreating fallback HTML file instead...');
  
  // Создаём fallback HTML файл
  const distDir = path.join(__dirname, '../dist/vue-monitor');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  const fallbackHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Bot Monitor</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #1a1a2e;
      color: white;
      min-height: 100vh;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 25px;
      border-radius: 15px;
      margin-bottom: 25px;
      text-align: center;
    }
    h1 {
      margin: 0 0 15px 0;
      font-size: 2.2em;
    }
    .stats {
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .stat {
      background: rgba(255, 255, 255, 0.2);
      padding: 10px 20px;
      border-radius: 20px;
      font-weight: bold;
    }
    .bots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      margin: 25px 0;
    }
    .bot-card {
      background: #2d3748;
      border-radius: 12px;
      padding: 20px;
      transition: transform 0.3s, box-shadow 0.3s;
    }
    .bot-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }
    .bot-card h3 {
      margin: 0 0 10px 0;
      color: #63b3ed;
    }
    .status {
      font-weight: bold;
      margin-bottom: 15px;
      padding: 5px 10px;
      border-radius: 8px;
      display: inline-block;
    }
    .status.alive {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
    }
    .status.dead {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .progress {
      margin: 15px 0;
    }
    .bar {
      height: 12px;
      background: #4a5568;
      border-radius: 6px;
      overflow: hidden;
      margin-top: 8px;
    }
    .fill {
      height: 100%;
      transition: width 0.5s;
    }
    .health {
      background: linear-gradient(90deg, #e53e3e, #fc8181);
    }
    .info {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #4a5568;
      font-size: 0.9em;
    }
    .info div {
      margin: 6px 0;
    }
    footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #4a5568;
      color: #a0aec0;
      font-size: 0.9em;
    }
    .controls {
      margin-top: 20px;
    }
    .controls button {
      background: white;
      color: #667eea;
      border: none;
      padding: 10px 20px;
      border-radius: 20px;
      font-weight: bold;
      cursor: pointer;
      margin: 0 10px;
    }
    @media (max-width: 768px) {
      .bots-grid {
        grid-template-columns: 1fr;
      }
      .stats {
        flex-direction: column;
        align-items: center;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 Bot Monitor (Fallback Mode)</h1>
      <p>Vue app could not be built. Using fallback interface.</p>
      <div class="stats">
        <div class="stat">Bots: <span id="botCount">0</span></div>
        <div class="stat">Alive: <span id="aliveCount">0</span></div>
        <div class="stat">Gold: <span id="totalGold">0</span></div>
      </div>
      <div class="controls">
        <button onclick="loadBots()">🔄 Load Bots</button>
        <button onclick="location.reload()">🔁 Refresh Page</button>
      </div>
    </header>
    
    <div class="bots-grid" id="botsContainer">
      <p class="no-bots">Click "Load Bots" to load bot data</p>
    </div>
    
    <footer>
      <p>Last update: <span id="lastUpdate">Never</span></p>
      <p><a href="/api/bots" style="color: #63b3ed;">View JSON data</a> | <a href="http://localhost:924" style="color: #63b3ed;">Old Interface</a></p>
    </footer>
  </div>
  
  <script>
    async function loadBots() {
      try {
        const response = await fetch('/api/bots');
        const data = await response.json();
        
        if (data.success) {
          updateUI(data);
        }
      } catch (err) {
        console.error('Failed to load bots:', err);
        alert('Failed to load bots. Make sure bot server is running.');
      }
    }
    
    function updateUI(data) {
      // Update stats
      document.getElementById('botCount').textContent = data.count;
      const alive = data.bots.filter(b => !b.rip).length;
      document.getElementById('aliveCount').textContent = alive;
      const totalGold = data.bots.reduce((sum, b) => sum + b.gold, 0);
      document.getElementById('totalGold').textContent = totalGold.toLocaleString();
      
      // Update bots display
      const container = document.getElementById('botsContainer');
      container.innerHTML = '';
      
      data.bots.forEach(bot => {
        const botCard = document.createElement('div');
        botCard.className = 'bot-card';
        botCard.innerHTML = \`
          <h3>\${bot.name} (Lvl \${bot.level})</h3>
          <div class="status \${bot.rip ? 'dead' : 'alive'}">
            \${bot.rip ? '💀 DEAD' : '✅ ALIVE'}
          </div>
          <div class="progress">
            <div>❤️ Health: \${bot.health}/\${bot.maxHealth}</div>
            <div class="bar">
              <div class="fill health" style="width: \${(bot.health / bot.maxHealth * 100)}%"></div>
            </div>
          </div>
          <div class="info">
            <div>🎯 Target: \${bot.target || 'None'}</div>
            <div>💰 Gold: \${bot.gold.toLocaleString()}</div>
            <div>⚔️ Attack: \${bot.attack.toFixed(1)}</div>
            <div>🛡️ Armor: \${bot.armor}</div>
          </div>
        \`;
        container.appendChild(botCard);
      });
      
      // Update time
      document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    }
    
    // Auto-refresh every 10 seconds
    setInterval(loadBots, 10000);
    
    // Load bots on page load
    setTimeout(loadBots, 1000);
  </script>
</body>
</html>`;
  
  fs.writeFileSync(path.join(distDir, 'index.html'), fallbackHtml);
  console.log('✅ Created fallback HTML file at: dist/vue-monitor/index.html');
  console.log('✅ You can now run the bot server and open http://localhost:3000');
}