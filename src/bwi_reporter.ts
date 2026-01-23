import { PingCompensatedCharacter } from "alclient";
import BotWebInterface from "bot-web-interface";
import prettyMilliseconds from "pretty-ms";
import { StateController } from "./controllers/state_controller";
import express from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Получаем __dirname и __filename для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type BWIMetricSchema = {
    name: string;
    type: string;
    label: string;
    options?: {};
    getter: () => any;
};

type BWIDataSource = {
    name: string;
    realm: string;
    rip: boolean;
    level: number;
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    xp: number;
    maxXp: number;
    isize: number;
    esize: number;
    gold: number;
    party: string;
    status: string;
    target: string;
    cc: number;
    xpPh: number;
    xpHisto: number[];
    goldHisto: number[];
    // Новые поля для статистики боя
    attack: number;
    frequency: number;
    armor: number;
    resistance: number;
    // Дополнительные метрики
    dps: number; // Расчётный DPS = attack * frequency
    physicalReduction: number; // % снижения физ. урона
    magicalReduction: number; // % снижения маг. урона
    // Состояния из bot.s
    statusInfo: any;
};

export class BWIReporter {
    private statBeatInterval: number;
    private bwiInstance: BotWebInterface;
    private statisticsInterval: NodeJS.Timeout;
    private stateController: StateController;
    private botDataSources = new Map<string, BWIDataSource>();
    
    private app: express.Application;
    private server: http.Server;
    private vueDistPath: string | null = null;

    public constructor(sc: StateController, bwiPort: number = 924, vuePort: number = 3000, statBeatInterval: number = 500) {
        this.statBeatInterval = statBeatInterval;
        this.stateController = sc;

        console.log(`\n🎮 Starting monitoring servers...`);
        console.log(`   Old interface: http://localhost:${bwiPort}`);
        console.log(`   Vue monitor:   http://localhost:${vuePort}`);

        // 1. Стандартный BotWebInterface (старый интерфейс)
        try {
            this.bwiInstance = new BotWebInterface({
                port: bwiPort,
                password: null,
                updateRate: statBeatInterval,
                theme: 'dark',
                layout: 'grid'
            });
            console.log(`✅ BotWebInterface started on port ${bwiPort}`);
        } catch (err: any) {
            console.warn(`⚠️  BotWebInterface error: ${err.message}`);
            console.log(`   Continuing without old interface...`);
        }

        // 2. Настраиваем Express сервер для Vue
        this.app = express();
        this.setupExpressServer(vuePort);

        // 3. Инициализируем данные ботов
        this.initializeDataSources();
        this.statisticsInterval = setInterval(() => {
            this.updateStatistics();
        }, this.statBeatInterval);

        console.log(`✅ Monitoring servers ready\n`);
    }

    private setupExpressServer(port: number): void {
        // Ищем собранное Vue приложение
        this.vueDistPath = this.findVueBuild();
        
        // API endpoints должны быть первыми
        this.app.get('/api/bots', (req, res) => {
            res.json(this.getBotsDataForVue());
        });

        this.app.get('/api/bots/:name', (req, res) => {
            const bot = this.botDataSources.get(req.params.name);
            res.json(bot || { error: 'Bot not found' });
        });
        
        if (this.vueDistPath) {
            console.log(`📁 Serving Vue app from: ${this.vueDistPath}`);
            
            // Serve static files
            this.app.use(express.static(this.vueDistPath));
            
            // Для Vue SPA - возвращаем index.html для всех GET запросов, которые не являются API
            this.app.get(/^(?!\/api).*$/, (req, res) => {
                res.sendFile(path.join(this.vueDistPath!, 'index.html'));
            });
        } else {
            // Если Vue build не найден, показываем fallback
            this.app.get(/^(?!\/api).*$/, (req, res) => {
                res.send(this.getFallbackHTML());
            });
        }

        // Запускаем сервер
        this.server = this.app.listen(port, '0.0.0.0', () => {
            console.log(`✅ Vue server listening on http://localhost:${port}`);
        });

        // Обработка ошибок сервера
        this.server.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Port ${port} is already in use!`);
                console.error(`   Try changing the port or killing the process.`);
            } else {
                console.error('Server error:', err);
            }
        });
    }

    private findVueBuild(): string | null {
        // Получаем текущую директорию проекта
        const projectRoot = process.cwd();
        
        // Проверяем несколько возможных путей
        const possiblePaths = [
            path.join(projectRoot, 'dist/vue-monitor'),           // Корень проекта
            path.join(__dirname, '../../dist/vue-monitor'),       // Из src/
            path.join(__dirname, '../dist/vue-monitor'),          // Альтернативный путь
            path.join(projectRoot, 'src/vue-monitor/dist'),       // Vue dist внутри src
        ];
        
        console.log('Looking for Vue build in:');
        for (const buildPath of possiblePaths) {
            console.log(`  - ${buildPath}`);
            const indexPath = path.join(buildPath, 'index.html');
            if (fs.existsSync(buildPath) && fs.existsSync(indexPath)) {
                console.log(`  ✅ Found at: ${buildPath}`);
                return buildPath;
            }
        }
        
        console.log('  ❌ Vue build not found');
        return null;
    }

    private getBotsDataForVue(): any {
        const botsArray = Array.from(this.botDataSources.values()).map(bot => ({
            name: bot.name,
            realm: bot.realm,
            rip: bot.rip,
            level: bot.level,
            health: bot.health,
            maxHealth: bot.maxHealth,
            mana: bot.mana,
            maxMana: bot.maxMana,
            xp: bot.xp,
            maxXp: bot.maxXp,
            isize: bot.isize,
            esize: bot.esize,
            gold: bot.gold,
            party: bot.party,
            status: bot.status,
            target: bot.target,
            cc: bot.cc,
            xpPh: bot.xpPh,
            attack: bot.attack,
            frequency: bot.frequency,
            armor: bot.armor,
            resistance: bot.resistance,
            dps: bot.dps,
            physicalReduction: bot.physicalReduction,
            magicalReduction: bot.magicalReduction,
            statusInfo: bot.statusInfo
        }));
        
        return {
            success: true,
            timestamp: Date.now(),
            count: botsArray.length,
            bots: botsArray
        };
    }

    private getFallbackHTML(): string {
        const bots = this.getBotsDataForVue();
        const botsHtml = bots.bots.length > 0 ? bots.bots.map((bot: any) => `
            <div class="bot-card">
                <h3>${bot.name} (Lvl ${bot.level})</h3>
                <div class="status ${bot.rip ? 'dead' : 'alive'}">
                    ${bot.rip ? '💀 DEAD' : '✅ ALIVE'}
                </div>
                <div class="progress">
                    <div>❤️ Health: ${bot.health}/${bot.maxHealth}</div>
                    <div class="bar">
                        <div class="fill health" style="width: ${(bot.health / bot.maxHealth * 100)}%"></div>
                    </div>
                </div>
                <div class="info">
                    <div>🎯 Target: ${bot.target || 'None'}</div>
                    <div>💰 Gold: ${bot.gold.toLocaleString()}</div>
                    <div>⚔️ Attack: ${bot.attack.toFixed(1)}</div>
                    <div>🛡️ Armor: ${bot.armor}</div>
                </div>
            </div>
        `).join('') : '<div class="no-bots">No bots connected yet</div>';

        return `
        <!DOCTYPE html>
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
                    margin-bottom: 20px;
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
                    opacity: 0.9;
                }
                .bots-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                    margin: 25px 0;
                }
                .bot-card {
                    background: #2d3748;
                    border-radius: 12px;
                    padding: 20px;
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
                .no-bots {
                    text-align: center;
                    padding: 40px;
                    grid-column: 1 / -1;
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
                    <h1>🤖 Bot Monitor</h1>
                    <div class="stats">
                        <div class="stat">Bots: <span id="botCount">${bots.count}</span></div>
                        <div class="stat">Alive: <span id="aliveCount">${bots.bots.filter((b: any) => !b.rip).length}</span></div>
                        <div class="stat">Gold: <span id="totalGold">${bots.bots.reduce((sum: number, b: any) => sum + b.gold, 0).toLocaleString()}</span></div>
                    </div>
                    <div class="controls">
                        <button onclick="location.reload()">🔄 Refresh</button>
                        <button onclick="window.open('http://localhost:924', '_blank')">📟 Old Interface</button>
                        <button onclick="fetch('/api/bots').then(r => r.json()).then(d => console.log(d))">📊 JSON Data</button>
                    </div>
                </header>
                
                <div class="bots-grid" id="botsContainer">
                    ${botsHtml}
                </div>
                
                <footer>
                    <p>Auto-refresh: <button onclick="toggleAutoRefresh()" id="autoRefreshBtn">Enable</button></p>
                    <p>Last update: <span id="lastUpdate">${new Date().toLocaleTimeString()}</span></p>
                </footer>
            </div>
            
            <script>
                let autoRefresh = null;
                
                function toggleAutoRefresh() {
                    const btn = document.getElementById('autoRefreshBtn');
                    if (autoRefresh) {
                        clearInterval(autoRefresh);
                        autoRefresh = null;
                        btn.textContent = 'Enable';
                    } else {
                        autoRefresh = setInterval(() => location.reload(), 10000);
                        btn.textContent = 'Disable';
                    }
                }
                
                // Update time every second
                setInterval(() => {
                    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
                }, 1000);
                
                // Auto-refresh after 30 seconds
                setTimeout(() => {
                    if (!autoRefresh) {
                        autoRefresh = setInterval(() => location.reload(), 10000);
                        document.getElementById('autoRefreshBtn').textContent = 'Disable';
                    }
                }, 30000);
            </script>
        </body>
        </html>
        `;
    }

    private initializeDataSources(): void {
        if (!this.stateController?.getBots) return;
        
        for (let botState of this.stateController.getBots) {
            let bot = botState.getBot();
            
            // Рассчитываем дополнительные метрики
            const dps = bot.attack * bot.frequency;
            const physicalReduction = this.calculateDamageReduction(bot.armor);
            const magicalReduction = this.calculateDamageReduction(bot.resistance);
            
            let dataSourceObj: BWIDataSource = {
                name: bot.id,
                realm: `${bot.serverData.region}${bot.serverData.name}`,
                rip: bot.rip,
                level: bot.level,
                health: bot.hp,
                maxHealth: bot.max_hp,
                mana: bot.mp,
                maxMana: bot.max_mp,
                xp: bot.xp,
                maxXp: bot.max_xp,
                isize: bot.isize,
                esize: bot.esize,
                gold: bot.gold,
                party: bot.party,
                status: botState.getStateType?.(),
                target: bot.getTargetEntity?.()?.name ?? "None",
                cc: bot.cc,
                xpPh: 0,
                xpHisto: [bot.xp],
                goldHisto: [bot.gold],
                // Новые поля
                attack: bot.attack,
                frequency: bot.frequency,
                armor: bot.armor,
                resistance: bot.resistance,
                // Рассчитанные метрики
                dps: dps,
                physicalReduction: physicalReduction,
                magicalReduction: magicalReduction,
                // Состояния из bot.s
                statusInfo: bot.s || {}
            };

            this.botDataSources.set(bot.id, dataSourceObj);
            this.createModernMonitorUI(dataSourceObj);
        }
    }

    private updateStatistics(): void {
        if (!this.stateController?.getBots) return;
        
        for (let b of this.stateController.getBots) {
            let bot = b.getBot();
            let dataSource: BWIDataSource = this.botDataSources.get(bot.id);

            if (!dataSource) continue;

            // Обновляем основные данные
            dataSource.realm = `${bot.serverData.region}${bot.serverData.name}`;
            dataSource.rip = bot.rip;
            
            if (dataSource.level != bot.level) {
                dataSource.xpHisto = [];
            }
            
            dataSource.level = bot.level;
            dataSource.health = bot.hp;
            dataSource.maxHealth = bot.max_hp;
            dataSource.mana = bot.mp;
            dataSource.maxMana = bot.max_mp;
            dataSource.xp = bot.xp;
            dataSource.maxXp = bot.max_xp;
            dataSource.isize = bot.isize;
            dataSource.esize = bot.esize;
            dataSource.gold = bot.gold;
            dataSource.party = bot.party;
            dataSource.status = b.getStateType();
            dataSource.target = bot.getTargetEntity?.()?.name ?? "None";
            dataSource.cc = bot.cc;
            
            // Обновляем боевые характеристики
            dataSource.attack = bot.attack;
            dataSource.frequency = bot.frequency;
            dataSource.armor = bot.armor;
            dataSource.resistance = bot.resistance;
            dataSource.dps = bot.attack * bot.frequency;
            dataSource.physicalReduction = this.calculateDamageReduction(bot.armor);
            dataSource.magicalReduction = this.calculateDamageReduction(bot.resistance);
            
            // Обновляем состояния из bot.s
            dataSource.statusInfo = bot.s || {};

            // Обновляем исторические данные
            dataSource.goldHisto.push(bot.gold);
            if (dataSource.goldHisto.length > 100) {
                dataSource.goldHisto = dataSource.goldHisto.slice(-100);
            }

            dataSource.xpHisto.push(bot.xp);
            if (dataSource.xpHisto.length > 100) {
                dataSource.xpHisto = dataSource.xpHisto.slice(-100);
            }
            
            dataSource.xpPh = this.calculatePerHour(dataSource.xpHisto);
        }
    }

    private createModernMonitorUI(ds: BWIDataSource): void {
        // Минимальная реализация для совместимости
        if (!this.bwiInstance?.publisher?.createInterface) return;
        
        try {
            const schema: BWIMetricSchema[] = [
                // Основная информация
                { name: "name", type: "text", label: "Bot", getter: () => ds.name },
                { name: "realm", type: "text", label: "Realm", getter: () => ds.realm },
                { name: "alive", type: "text", label: "Alive", getter: () => ds.rip ? "No (💀)" : "Yes (✅)" },
                { name: "status", type: "text", label: "Status", getter: () => ds.status },
                { name: "level", type: "text", label: "Level", getter: () => ds.level },
                
                // Новые боевые поля
                { name: "attack", type: "text", label: "⚔️ Attack", getter: () => ds.attack.toFixed(1) },
                { name: "frequency", type: "text", label: "🌀 Freq", getter: () => ds.frequency.toFixed(2) },
                { name: "dps", type: "text", label: "🔥 DPS", getter: () => this.humanizeInt(ds.dps, 1) },
                { name: "armor", type: "text", label: "🛡️ Armor", getter: () => ds.armor },
                { name: "resistance", type: "text", label: "✨ Resist", getter: () => ds.resistance },
                { name: "phys_red", type: "text", label: "➖ Phys Red", getter: () => `${ds.physicalReduction.toFixed(1)}%` },
                { name: "mag_red", type: "text", label: "➖ Mag Red", getter: () => `${ds.magicalReduction.toFixed(1)}%` },
                
                // Группировка состояний по типам
                { 
                    name: "botstate_buffs", 
                    type: "text", 
                    label: "📈 Buffs", 
                    getter: () => {
                        const buffs = this.extractStatesByType(ds.statusInfo, [
                            'warcry', 'mluck', 'rspeed', 'newcomersblessing', 
                            'young', 'easterluck', 'halloween', 'citizen0aura',
                            'citizen4aura', 'darkblessing', 'self_healing'
                        ]);
                        return buffs.join(', ') || "None";
                    }
                },
                { 
                    name: "botstate_debuffs", 
                    type: "text", 
                    label: "📉 Debuffs", 
                    getter: () => {
                        const debuffs = this.extractStatesByType(ds.statusInfo, [
                            'poisoned', 'cursed', 'slowed', 'stunned', 'sick', 
                            'shocked', 'frozen', 'marked', 'weakness', 'stone'
                        ]);
                        return debuffs.join(', ') || "None";
                    }
                },
                { 
                    name: "botstate_special", 
                    type: "text", 
                    label: "✨ Special", 
                    getter: () => {
                        const special = [];
                        
                        if (ds.statusInfo?.burned) {
                            const intensity = ds.statusInfo.burned.intensity;
                            const source = ds.statusInfo.burned.f || "unknown";
                            special.push(`burned:${intensity}dps (${source})`);
                        }
                        
                        if (ds.statusInfo?.coop) {
                            const percent = ds.statusInfo.coop.p;
                            const seconds = Math.floor(ds.statusInfo.coop.ms / 1000);
                            special.push(`coop:${percent}% (${seconds}s)`);
                        }
                        
                        if (ds.statusInfo?.monsterhunt) {
                            const remaining = ds.statusInfo.monsterhunt.c;
                            const monster = ds.statusInfo.monsterhunt.id;
                            special.push(`hunt:${remaining} ${monster}`);
                        }
                        
                        if (ds.statusInfo?.blink) {
                            special.push(`blink:${ds.statusInfo.blink.map}`);
                        }
                        
                        if (ds.statusInfo?.typing) {
                            const seconds = Math.floor(ds.statusInfo.typing.ms / 1000);
                            special.push(`typing:${seconds}s`);
                        }
                        
                        if (ds.statusInfo?.healed) {
                            const seconds = Math.floor(ds.statusInfo.healed.ms / 1000);
                            special.push(`healed:${seconds}s`);
                        }
                        
                        return special.join(', ') || "None";
                    }
                },
                
                // Прогресс-бары
                {
                    name: "health",
                    type: "labelProgressBar",
                    label: "❤️ Health",
                    options: { color: "red" },
                    getter: () => this.quickBarVal(ds.health, ds.maxHealth)
                },
                {
                    name: "mana",
                    type: "labelProgressBar",
                    label: "🔵 Mana",
                    options: { color: "blue" },
                    getter: () => this.quickBarVal(ds.mana, ds.maxMana)
                },
                {
                    name: "xp",
                    type: "labelProgressBar",
                    label: "📈 XP",
                    options: { color: "green" },
                    getter: () => this.quickBarVal(ds.xp, ds.maxXp, true)
                },
                {
                    name: "inv",
                    type: "labelProgressBar",
                    label: "🎒 Inventory",
                    options: { color: "brown" },
                    getter: () => this.quickBarVal(ds.isize - ds.esize, ds.isize)
                },
                
                // Дополнительная информация
                { name: "target", type: "text", label: "🎯 Target", getter: () => ds.target || "None" },
                { name: "party", type: "text", label: "👥 Party", getter: () => ds.party || "Solo" },
                { name: "gold", type: "text", label: "💰 Gold", getter: () => this.humanizeInt(ds.gold, 1) },
                { name: "gph", type: "text", label: "📊 Gold/h", getter: () => this.humanizeInt(this.calculatePerHour(ds.goldHisto), 1) },
                { name: "xpph", type: "text", label: "⚡ XP/h", getter: () => this.humanizeInt(ds.xpPh, 1) },
                { name: "cc", type: "text", label: "🎯 CC", getter: () => Math.round(ds.cc) },
                
                // Поле TTLU
                { 
                    name: "ttlu", 
                    type: "text", 
                    label: "⏱️ TTLU", 
                    getter: () => {
                        if (ds.rip) return "DEAD";
                        if (ds.xpPh <= 0) return "N/A";
                        return prettyMilliseconds(((ds.maxXp - ds.xp) * 3_600_000) / ds.xpPh, { unitCount: 2 });
                    }
                }
            ];

            const ui = this.bwiInstance.publisher.createInterface(
                schema.map((x) => ({
                    name: x.name,
                    type: x.type,
                    label: x.label,
                    options: x.options
                }))
            );

            ui.setDataSource(() => {
                let result: Record<string, any> = {};
                schema.forEach((x) => (result[x.name] = x.getter()));
                return result;
            });
        } catch (err) {
            console.error('Error creating modern monitor UI:', err);
        }
    }

    // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

    private calculateDamageReduction(defense: number): number {
        return Math.min(95, (defense / (defense + 1000)) * 100);
    }

    private calculatePerHour(arr: number[]): number {
        if (arr.length < 2) {
            return 0;
        }
        return ((arr[arr.length - 1] - arr[0]) * 3600000) / (arr.length - 1) / this.statBeatInterval;
    }

    private extractStatesByType(statusInfo: any, statesList: string[]): string[] {
        if (!statusInfo) return [];
        
        const result = [];
        for (const state of statesList) {
            if (statusInfo[state]?.ms) {
                const seconds = Math.floor(statusInfo[state].ms / 1000);
                result.push(`${state}:${seconds}s`);
            }
        }
        return result;
    }

    private humanizeInt(num: number, digits: number): string {
        num = Math.round(num);
        const lookup = [
            { value: 1e3, symbol: "" },
            { value: 1e6, symbol: "k" },
            { value: 1e9, symbol: "M" },
            { value: 1e12, symbol: "B" },
            { value: 1e15, symbol: "T" }
        ];

        const regexp = /\.0+$|(\.[0-9]*[1-9])0+$/;
        const item = lookup.find(item => Math.abs(num) < item.value);

        return item 
            ? ((num * 1e3) / item.value).toFixed(digits).replace(regexp, "$1") + item.symbol 
            : num.toExponential(digits);
    }

    private quickBarVal(num: number, denom: number, humanize: boolean = false): [number, string] {
        let modif = (x: number): string => x.toString();
        if (humanize) {
            modif = (x: number): string => this.humanizeInt(x, 1);
        }

        const percentage = denom > 0 ? (100 * num) / denom : 0;
        return [percentage, `${modif(num)} / ${modif(denom)}`];
    }

    public async destroy(): Promise<void> {
        console.log('\n🛑 Shutting down BWIReporter...');
        
        if (this.statisticsInterval) {
            clearInterval(this.statisticsInterval);
        }
        
        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server.close(() => {
                    console.log('✅ Vue server stopped');
                    resolve();
                });
            });
        }
        
        this.botDataSources.clear();
        console.log('✅ BWIReporter shutdown complete\n');
    }
}