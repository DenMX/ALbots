// scripts/simple-build-vue.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Получаем __dirname в ES модулях
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Creating simple Vue build...');

const distDir = path.join(__dirname, '../dist/vue-monitor');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Простой HTML файл
const html = `<!DOCTYPE html>
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
      margin-bottom: 15px;
    }
    .stat {
      background: rgba(255, 255, 255, 0.2);
      padding: 10px 20px;
      border-radius: 20px;
      font-weight: bold;
    }
    .controls {
      margin-top: 15px;
    }
    button {
      background: white;
      color: #667eea;
      border: none;
      padding: 10px 20px;
      border-radius: 20px;
      font-weight: bold;
      cursor: pointer;
      margin: 0 10px;
      font-size: 1em;
    }
    button:hover {
      transform: scale(1.05);
      transition: transform 0.2s;
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
    .mana {
      background: linear-gradient(90deg, #4299e1, #63b3ed);
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
    .loading {
      text-align: center;
      padding: 40px;
      font-size: 1.2em;
    }
    .error {
      text-align: center;
      padding: 20px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid #ef4444;
      border-radius: 10px;
      color: #ef4444;
      margin: 20px 0;
    }
    @media (max-width: 768px) {
      .bots-grid {
        grid-template-columns: 1fr;
      }
      .stats {
        flex-direction: column;
        align-items: center;
      }
      button {
        margin: 5px;
        width: 100%;
        max-width: 300px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 Bot Monitor</h1>
      <div class="stats">
        <div class="stat">Bots: <span id="botCount">0</span></div>
        <div class="stat">Alive: <span id="aliveCount">0</span></div>
        <div class="stat">Gold: <span id="totalGold">0</span></div>
      </div>
      <div class="controls">
        <button onclick="loadBots()">🔄 Load Bots</button>
        <button onclick="location.reload()">🔁 Refresh Page</button>
        <button onclick="window.open('http://localhost:924', '_blank')">📟 Old Interface</button>
      </div>
    </header>
    
    <div id="loading" class="loading">Click "Load Bots" to load bot data</div>
    <div id="error" class="error" style="display: none;"></div>
    
    <div class="bots-grid" id="botsContainer">
      <!-- Боты будут добавляться здесь -->
    </div>
    
    <footer>
      <p>Last update: <span id="lastUpdate">Never</span></p>
      <p>Auto-refresh every 10 seconds | Connected to bot server</p>
      <p><a href="/api/bots" style="color: #63b3ed;">View JSON data</a></p>
    </footer>
  </div>
  
  <script>
    let autoRefreshInterval = null;
    
    async function loadBots() {
      try {
        showLoading(true);
        hideError();
        
        const response = await fetch('/api/bots');
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}\`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          updateUI(data);
          startAutoRefresh();
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (err) {
        showError('Failed to load bots: ' + err.message);
        console.error('Error loading bots:', err);
      } finally {
        showLoading(false);
      }
    }
    
    function updateUI(data) {
      // Update stats
      document.getElementById('botCount').textContent = data.count;
      const alive = data.bots.filter(b => !b.rip).length;
      document.getElementById('aliveCount').textContent = alive;
      const totalGold = data.bots.reduce((sum, b) => sum + b.gold, 0);
      document.getElementById('totalGold').textContent = formatNumber(totalGold);
      
      // Update bots display
      const container = document.getElementById('botsContainer');
      container.innerHTML = '';
      
      if (data.bots.length === 0) {
        container.innerHTML = '<div class="loading">No bots connected</div>';
        return;
      }
      
      data.bots.forEach(bot => {
        const healthPercent = bot.maxHealth > 0 ? (bot.health / bot.maxHealth * 100) : 0;
        const manaPercent = bot.maxMana > 0 ? (bot.mana / bot.maxMana * 100) : 0;
        
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
              <div class="fill health" style="width: \${healthPercent}%"></div>
            </div>
          </div>
          
          <div class="progress">
            <div>🔵 Mana: \${bot.mana}/\${bot.maxMana}</div>
            <div class="bar">
              <div class="fill mana" style="width: \${manaPercent}%"></div>
            </div>
          </div>
          
          <div class="info">
            <div>🎯 Target: \${bot.target || 'None'}</div>
            <div>💰 Gold: \${formatNumber(bot.gold)}</div>
            <div>⚔️ Attack: \${bot.attack.toFixed(1)}</div>
            <div>🛡️ Armor: \${bot.armor}</div>
            <div>✨ Resist: \${bot.resistance}</div>
            <div>🏃 Status: \${bot.status}</div>
          </div>
        \`;
        container.appendChild(botCard);
      });
      
      // Update time
      document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    }
    
    function formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toLocaleString();
    }
    
    function showLoading(show) {
      document.getElementById('loading').style.display = show ? 'block' : 'none';
    }
    
    function showError(message) {
      const errorEl = document.getElementById('error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
    
    function hideError() {
      document.getElementById('error').style.display = 'none';
    }
    
    function startAutoRefresh() {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
      }
      autoRefreshInterval = setInterval(loadBots, 10000);
    }
    
    function stopAutoRefresh() {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }
    }
    
    // Load bots on page load after a short delay
    setTimeout(() => {
      loadBots();
    }, 1000);
    
    // Stop auto-refresh when page is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAutoRefresh();
      } else {
        startAutoRefresh();
      }
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(distDir, 'index.html'), html);

// Также создаём favicon.ico чтобы избежать 404 ошибок
const favicon = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA' +
  'B3RJTUUH5wIYFh4Qn8UkhgAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUH' +
  'AAAAMElEQVQ4y2P8//8/Ay0xw6gBowYw0hIvXLjwn5aYYdSAUQNGDRg1YNSAUQNGDQAA7egHENX6' +
  'g9wAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync(path.join(distDir, 'favicon.ico'), favicon);

console.log('✅ Created Vue build at:', distDir);
console.log('✅ No npm install/build required!');
console.log('✅ Simply run: npm start');
console.log('✅ Then open: http://localhost:3000');