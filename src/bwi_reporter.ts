// import { PingCompensatedCharacter } from "alclient";
// import BotWebInterface from "bot-web-interface";
// import prettyMilliseconds from "pretty-ms";
// import { IState } from "./controllers/state_interface";
// import { StateController } from "./controllers/state_controller";

// type BWIMetricSchema = {
//     name: string;
//     type: string;
//     label: string;
//     options?: {};
//     getter: () => any;
// };
// type BWIDataSource = {
//     name: string;
//     realm: string;
//     rip: boolean;
//     level: number;
//     health: number;
//     maxHealth: number;
//     mana: number;
//     maxMana: number;
//     xp: number;
//     maxXp: number;
//     isize: number;
//     esize: number;
//     gold: number;
//     party: string;
//     status: string;
//     target: string;
//     cc: number;
//     xpPh: number;
//     xpHisto: number[];
//     goldHisto: number[];
// };

// export class BWIReporter {
//     private statBeatIntrval: number;
//     private bwiInstance: BotWebInterface;
//     private statisticsInterval: NodeJS.Timeout;
//     private stateController: StateController

//     private botDataSources = new Map<string, BWIDataSource>();

//     public constructor(sc: StateController, port: number = 924, statBeatInterval: number = 500) {
//         this.statBeatIntrval = statBeatInterval;
//         this.stateController = sc;

//         this.bwiInstance = new BotWebInterface({
//             port: port,
//             password: null,
//             updateRate: statBeatInterval
//         });

//         for (let botState of this.stateController.getBots) {
//             let bot = botState.getBot()
//             let dataSourceObj: BWIDataSource = {
//                 name: bot.id,
//                 realm: `${bot.serverData.region}${bot.serverData.name}`,
//                 rip: bot.rip,
//                 level: bot.level,
//                 health: bot.hp,
//                 maxHealth: bot.max_hp,
//                 mana: bot.mp,
//                 maxMana: bot.max_mp,
//                 xp: bot.xp,
//                 maxXp: bot.max_xp,
//                 isize: bot.isize,
//                 esize: bot.esize,
//                 gold: bot.gold,
//                 party: bot.party,
//                 status: "Doing something",
//                 target: "None",
//                 cc: bot.cc,
//                 xpPh: 0,
//                 xpHisto: [],
//                 goldHisto: []
//             };

//             this.botDataSources.set(bot.id, dataSourceObj);
//             this.createMonitorUi(this.botDataSources.get(bot.id));
//         }

//         this.statisticsInterval = setInterval(this.updateStatistics.bind(this), this.statBeatIntrval);
//     }

//     private updateStatistics(): void {
//         for (let b of this.stateController.getBots) {
//             let bot = b.getBot()
//             let dataSource: BWIDataSource = this.botDataSources.get(bot.id);

//             dataSource.realm = `${bot.serverData.region}${bot.serverData.name}`;
//             dataSource.rip = bot.rip;
//             if (dataSource.level != bot.level) {
//                 dataSource.xpHisto = [];
//             }
//             dataSource.level = bot.level;
//             dataSource.health = bot.hp;
//             dataSource.maxHealth = bot.max_hp;
//             dataSource.mana = bot.mp;
//             dataSource.maxMana = bot.max_mp;
//             dataSource.xp = bot.xp;
//             dataSource.maxXp = bot.max_xp;
//             dataSource.isize = bot.isize;
//             dataSource.esize = bot.esize;
//             dataSource.gold = bot.gold;
//             dataSource.party = bot.party;
//             dataSource.status = b.getStateType();
//             dataSource.target = bot.getTargetEntity()?.name ?? "None";
//             dataSource.cc = bot.cc;

//             dataSource.goldHisto.push(bot.gold);
//             dataSource.goldHisto.slice(-100);

//             dataSource.xpHisto.push(bot.xp);
//             dataSource.xpHisto.slice(-100);
//             dataSource.xpPh = this.valPh(dataSource.xpHisto);
//         }
//     }

//     private createMonitorUi(ds: BWIDataSource): void {
//         const schema: BWIMetricSchema[] = [
//             { name: "name", type: "text", label: "Name", getter: () => ds.name },
//             { name: "realm", type: "text", label: "Realm", getter: () => ds.realm },
//             { name: "not_rip", type: "text", label: "Alive", getter: () => (ds.rip ? "No" : "Yes") },
//             { name: "level", type: "text", label: "Level", getter: () => ds.level },
//             {
//                 name: "health",
//                 type: "labelProgressBar",
//                 label: "Health",
//                 options: { color: "red" },
//                 getter: () => this.quickBarVal(ds.health, ds.maxHealth)
//             },
//             {
//                 name: "mana",
//                 type: "labelProgressBar",
//                 label: "Mana",
//                 options: { color: "blue" },
//                 getter: () => this.quickBarVal(ds.mana, ds.maxMana)
//             },
//             {
//                 name: "xp",
//                 type: "labelProgressBar",
//                 label: "XP",
//                 options: { color: "green" },
//                 getter: () => this.quickBarVal(ds.xp, ds.maxXp, true)
//             },
//             {
//                 name: "inv",
//                 type: "labelProgressBar",
//                 label: "Inventory",
//                 options: { color: "brown" },
//                 getter: () => this.quickBarVal(ds.isize - ds.esize, ds.isize)
//             },
//             { name: "gold", type: "text", label: "Gold", getter: () => this.humanizeInt(ds.gold, 1) },
//             { name: "party_leader", type: "text", label: "Chief", getter: () => ds.party || "N/A" },
//             { name: "current_status", type: "text", label: "Status", getter: () => ds.status },
//             { name: "target", type: "text", label: "Target", getter: () => ds.target || "None" },
//             { name: "gph", type: "text", label: "Gold/h", getter: () => this.humanizeInt(this.valPh(ds.goldHisto), 1) },
//             { name: "xpph", type: "text", label: "XP/h", getter: () => this.humanizeInt(ds.xpPh, 1) },
//             {
//                 name: "ttlu",
//                 type: "text",
//                 label: "TTLU",
//                 getter: () => (ds.xpPh <= 0 && "N/A") || prettyMilliseconds(((ds.maxXp - ds.xp) * 3_600_000) / ds.xpPh, { unitCount: 2 })
//             },
//             { name: "cc", type: "text", label: "CC", getter: () => Math.round(ds.cc) }
//         ];

//         let ui = this.bwiInstance.publisher.createInterface(
//             schema.map((x) => ({
//                 name: x.name,
//                 type: x.type,
//                 label: x.label,
//                 options: x.options
//             }))
//         );

//         ui.setDataSource(() => {
//             let result = {};
//             schema.forEach((x) => (result[x.name] = x.getter()));
//             return result;
//         });
//     }

//     private humanizeInt(num: number, digits: number): string {
//         num = Math.round(num);
//         let lookup = [
//             { value: 1e3, symbol: "" },
//             { value: 1e6, symbol: "k" },
//             { value: 1e9, symbol: "Mil" },
//             { value: 1e12, symbol: "Bil" },
//             { value: 1e15, symbol: "Tril" }
//         ];

//         let regexp: RegExp = /\.0+$|(\.[0-9]*[1-9])0+$/;
//         let item = lookup.find(function (item) {
//             return Math.abs(num) < item.value;
//         });

//         return item ? ((num * 1e3) / item.value).toFixed(digits).replace(regexp, "$1") + item.symbol : num.toExponential(digits);
//     }

//     private quickBarVal(num: number, denom: number, humanize: boolean = false): [number, string] {
//         let modif = (x: number): string => x.toString();
//         if (humanize) {
//             modif = (x: number): string => this.humanizeInt(x, 1);
//         }

//         return [(100 * num) / denom, `${modif(num)}/${modif(denom)}`];
//     }

//     private valPh(arr: number[]): number {
//         if (arr.length < 2) {
//             return 0;
//         }

//         return ((arr[arr.length - 1] - arr[0]) * 3600000) / (arr.length - 1) / this.statBeatIntrval;
//     }
// }


import BotWebInterface from "bot-web-interface";
import prettyMilliseconds from "pretty-ms";
import { StateController } from "./controllers/state_controller";

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
};

export class BWIReporter {
    private statBeatInterval: number;
    private bwiInstance: BotWebInterface;
    private statisticsInterval: NodeJS.Timeout;
    private stateController: StateController;
    private botDataSources = new Map<string, BWIDataSource>();

    public constructor(sc: StateController, port: number = 924, statBeatInterval: number = 500) {
        this.statBeatInterval = statBeatInterval;
        this.stateController = sc;

        this.bwiInstance = new BotWebInterface({
            port: port,
            password: null,
            updateRate: statBeatInterval,
            theme: 'dark', // Тёмная тема по умолчанию
            layout: 'grid' // Сеточное расположение
        });

        this.initializeDataSources();
        this.statisticsInterval = setInterval(this.updateStatistics.bind(this), this.statBeatInterval);
    }

    private initializeDataSources(): void {
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
                status: "Initializing...",
                target: "None",
                cc: bot.cc,
                xpPh: 0,
                xpHisto: [],
                goldHisto: [],
                // Новые поля
                attack: bot.attack,
                frequency: bot.frequency,
                armor: bot.armor,
                resistance: bot.resistance,
                // Рассчитанные метрики
                dps: dps,
                physicalReduction: physicalReduction,
                magicalReduction: magicalReduction
            };

            this.botDataSources.set(bot.id, dataSourceObj);
            this.createModernMonitorUI(this.botDataSources.get(bot.id));
        }
    }

    private updateStatistics(): void {
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
            dataSource.target = bot.getTargetEntity()?.name ?? "None";
            dataSource.cc = bot.cc;
            
            // Обновляем боевые характеристики
            dataSource.attack = bot.attack;
            dataSource.frequency = bot.frequency;
            dataSource.armor = bot.armor;
            dataSource.resistance = bot.resistance;
            dataSource.dps = bot.attack * bot.frequency;
            dataSource.physicalReduction = this.calculateDamageReduction(bot.armor);
            dataSource.magicalReduction = this.calculateDamageReduction(bot.resistance);

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
        const schema: BWIMetricSchema[] = [
            // Основная информация
            { name: "name", type: "text", label: "Bot", getter: () => ds.name },
            { name: "realm", type: "text", label: "Realm", getter: () => ds.realm },
            
            // ВЕРНУЛ обратно поле Alive как true/false
            { name: "alive", type: "text", label: "Alive", getter: () => ds.rip ? "No (💀)" : "Yes (✅)" },
            
            // СОХРАНИЛ поле Status для состояния State
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
            
            // Дополнительная информация
            { name: "target", type: "text", label: "🎯 Target", getter: () => ds.target || "None" },
            { name: "party", type: "text", label: "👥 Party", getter: () => ds.party || "Solo" },
            { name: "gold", type: "text", label: "💰 Gold", getter: () => this.humanizeInt(ds.gold, 1) },
            { name: "gph", type: "text", label: "📊 Gold/h", getter: () => this.humanizeInt(this.calculatePerHour(ds.goldHisto), 1) },
            { name: "xpph", type: "text", label: "⚡ XP/h", getter: () => this.humanizeInt(ds.xpPh, 1) },
            { name: "cc", type: "text", label: "🎯 CC", getter: () => Math.round(ds.cc) },
            
            // Поле инвентаря (было в исходном коде)
            {
                name: "inv",
                type: "labelProgressBar",
                label: "🎒 Inventory",
                options: { color: "brown" },
                getter: () => this.quickBarVal(ds.isize - ds.esize, ds.isize)
            }
        ];

        let ui = this.bwiInstance.publisher.createInterface(
            schema.map((x) => ({
                name: x.name,
                type: x.type,
                label: x.label,
                options: x.options
            }))
        );

        ui.setDataSource(() => {
            let result = {};
            schema.forEach((x) => (result[x.name] = x.getter()));
            return result;
        });
    }

    // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

    private calculateDamageReduction(defense: number): number {
        // Формула снижения урона на основе защиты (адаптируй под свою игру)
        return Math.min(95, (defense / (defense + 1000)) * 100);
    }

    private calculatePerHour(arr: number[]): number {
        if (arr.length < 2) {
            return 0;
        }
        return ((arr[arr.length - 1] - arr[0]) * 3600000) / (arr.length - 1) / this.statBeatInterval;
    }

    private getTrend(histo: number[]): 'up' | 'down' | 'stable' {
        if (histo.length < 5) return 'stable';
        const recent = histo.slice(-5);
        const avg = recent.reduce((a, b) => a + b) / recent.length;
        const prevAvg = histo.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
        return avg > prevAvg * 1.05 ? 'up' : avg < prevAvg * 0.95 ? 'down' : 'stable';
    }

    private getStatusIcon(status: string): string {
        const icons: Record<string, string> = {
            'combat': 'swords',
            'moving': 'run',
            'farming': 'farm',
            'resting': 'moon',
            'dead': 'skull',
            'trading': 'shopping-cart'
        };
        return icons[status.toLowerCase()] || 'info';
    }

    private getStatusColor(status: string): string {
        const colors: Record<string, string> = {
            'combat': 'error',
            'moving': 'warning',
            'farming': 'success',
            'resting': 'info',
            'dead': 'error',
            'trading': 'secondary'
        };
        return colors[status.toLowerCase()] || 'default';
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

    // Метод для очистки ресурсов
    public destroy(): void {
        if (this.statisticsInterval) {
            clearInterval(this.statisticsInterval);
        }
        this.botDataSources.clear();
    }
}