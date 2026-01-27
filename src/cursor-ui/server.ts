import { StateController } from "../controllers/state_controller";
import express from "express";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import prettyMilliseconds from "pretty-ms";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type EquipSlotData = { name: string; level?: number; q?: number } | null;

export type CursorUIBotData = {
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
    gph: number;
    attack: number;
    frequency: number;
    armor: number;
    resistance: number;
    dps: number;
    physicalReduction: number;
    magicalReduction: number;
    statusInfo: Record<string, unknown>;
    buffs: string[];
    debuffs: string[];
    special: string[];
    ttlu: string;
    equipment: Record<string, EquipSlotData>;
};

type BotDataInternal = CursorUIBotData & {
    goldHisto: number[];
    xpHisto: number[];
};

const STAT_BEAT = 500;
const BUFF_KEYS = [
    "warcry", "mluck", "rspeed", "newcomersblessing", "young",
    "easterluck", "halloween", "citizen0aura", "citizen4aura",
    "darkblessing", "self_healing"
];
const DEBUFF_KEYS = [
    "poisoned", "cursed", "slowed", "stunned", "sick",
    "shocked", "frozen", "marked", "weakness", "stone"
];

function calculateDamageReduction(def: number): number {
    return Math.min(95, (def / (def + 1000)) * 100);
}

function calculatePerHour(arr: number[], intervalMs: number): number {
    if (arr.length < 2) return 0;
    return ((arr[arr.length - 1] - arr[0]) * 3600000) / (arr.length - 1) / intervalMs;
}

function extractStates(statusInfo: unknown, keys: string[]): string[] {
    if (!statusInfo || typeof statusInfo !== "object") return [];
    const s = statusInfo as Record<string, { ms?: number }>;
    const out: string[] = [];
    for (const k of keys) {
        if (s[k]?.ms != null) {
            out.push(`${k}:${Math.floor(s[k].ms! / 1000)}s`);
        }
    }
    return out;
}

function extractSpecial(statusInfo: unknown): string[] {
    if (!statusInfo || typeof statusInfo !== "object") return [];
    const s = statusInfo as Record<string, unknown>;
    const out: string[] = [];

    const burned = s.burned as { intensity?: number; f?: string } | undefined;
    if (burned) {
        const intensity = burned.intensity ?? 0;
        const src = burned.f ?? "?";
        out.push(`burned: ${intensity} dps (${src})`);
    }

    const coop = s.coop as { p?: number; ms?: number } | undefined;
    if (coop) {
        out.push(`coop: ${coop.p ?? 0}% (${Math.floor((coop.ms ?? 0) / 1000)}s)`);
    }

    const mh = s.monsterhunt as { c?: number; id?: string } | undefined;
    if (mh) {
        out.push(`hunt: ${mh.c ?? 0} ${mh.id ?? "?"}`);
    }

    const blink = s.blink as { map?: string } | undefined;
    if (blink) {
        out.push(`blink: ${blink.map ?? "?"}`);
    }

    const typing = s.typing as { ms?: number } | undefined;
    if (typing?.ms) {
        out.push(`typing: ${Math.floor(typing.ms / 1000)}s`);
    }

    const healed = s.healed as { ms?: number } | undefined;
    if (healed?.ms) {
        out.push(`healed: ${Math.floor(healed.ms / 1000)}s`);
    }

    return out;
}

function humanize(num: number, d: number): string {
    let n = Math.round(num);
    const lookup = [
        { v: 1e3, s: "" },
        { v: 1e6, s: "k" },
        { v: 1e9, s: "M" },
        { v: 1e12, s: "B" },
    ];
    const re = /\.0+$|(\.[0-9]*[1-9])0+$/;
    const it = lookup.find((x) => Math.abs(n) < x.v);
    return it
        ? ((n * 1e3) / it.v).toFixed(d).replace(re, "$1") + it.s
        : n.toExponential(d);
}

export function startCursorUI(sc: StateController, port: number): { stop: () => Promise<void> } {
    const botMap = new Map<string, BotDataInternal>();
    let updateInterval: ReturnType<typeof setInterval> | null = null;

    function ensureBot(id: string) {
        if (!botMap.has(id)) {
            botMap.set(id, {
                name: id,
                realm: "",
                rip: false,
                level: 0,
                health: 0,
                maxHealth: 1,
                mana: 0,
                maxMana: 1,
                xp: 0,
                maxXp: 1,
                isize: 0,
                esize: 0,
                gold: 0,
                party: "",
                status: "",
                target: "None",
                cc: 0,
                xpPh: 0,
                gph: 0,
                attack: 0,
                frequency: 0,
                armor: 0,
                resistance: 0,
                dps: 0,
                physicalReduction: 0,
                magicalReduction: 0,
                statusInfo: {},
                buffs: [],
                debuffs: [],
                special: [],
                ttlu: "N/A",
                equipment: {},
                goldHisto: [],
                xpHisto: [],
            });
        }
        return botMap.get(id)!;
    }

    const EQUIP_SLOTS: string[] = [
        "earring1", "helmet", "earring2", "amulet", "mainhand", "chest", "gloves", "cape",
        "ring1", "pants", "ring2", "elixir", "belt", "shoes", "offhand", "orb"
    ];

    function collectBots() {
        const bots = sc?.getBots;
        if (!bots) return;

        for (const b of bots) {
            const bot = b.getBot();
            const d = ensureBot(bot.id);

            d.realm = `${bot.serverData?.region ?? ""}${bot.serverData?.name ?? ""}`;
            d.rip = bot.rip;
            if (d.level !== bot.level) d.xpHisto = [];
            d.level = bot.level;
            d.health = bot.hp;
            d.maxHealth = bot.max_hp;
            d.mana = bot.mp;
            d.maxMana = bot.max_mp;
            d.xp = bot.xp;
            d.maxXp = bot.max_xp;
            d.isize = bot.isize;
            d.esize = bot.esize;
            d.gold = bot.gold;
            d.party = bot.party ?? "";
            d.status = b.getStateType?.() ?? "";
            d.target = bot.getTargetEntity?.()?.name ?? "None";
            d.cc = bot.cc;
            d.attack = bot.attack;
            d.frequency = bot.frequency;
            d.armor = bot.armor;
            d.resistance = bot.resistance;
            d.dps = bot.attack * bot.frequency;
            d.physicalReduction = calculateDamageReduction(bot.armor);
            d.magicalReduction = calculateDamageReduction(bot.resistance);
            d.statusInfo = (bot.s as Record<string, unknown>) ?? {};

            d.buffs = extractStates(d.statusInfo, BUFF_KEYS);
            d.debuffs = extractStates(d.statusInfo, DEBUFF_KEYS);
            d.special = extractSpecial(d.statusInfo);

            const sl = (bot as { slots?: Record<string, { name?: string; level?: number; q?: number } | null> }).slots;
            d.equipment = {};
            for (const k of EQUIP_SLOTS) {
                const it = sl?.[k];
                d.equipment[k] = it && it.name != null ? { name: String(it.name), level: it.level, q: it.q } : null;
            }

            d.goldHisto.push(bot.gold);
            if (d.goldHisto.length > 100) d.goldHisto = d.goldHisto.slice(-100);
            d.xpHisto.push(bot.xp);
            if (d.xpHisto.length > 100) d.xpHisto = d.xpHisto.slice(-100);

            d.xpPh = calculatePerHour(d.xpHisto, STAT_BEAT);
            d.gph = calculatePerHour(d.goldHisto, STAT_BEAT);

            if (d.rip) {
                d.ttlu = "DEAD";
            } else if (d.xpPh <= 0) {
                d.ttlu = "N/A";
            } else {
                d.ttlu = prettyMilliseconds(
                    ((d.maxXp - d.xp) * 3_600_000) / d.xpPh,
                    { unitCount: 2 }
                );
            }
        }
    }

    collectBots();
    updateInterval = setInterval(collectBots, STAT_BEAT);

    const app = express();

    app.get("/api/bots", (_req, res) => {
        const list = Array.from(botMap.values()).map(
            ({ goldHisto, xpHisto, ...rest }) => rest
        );
        res.json({
            success: true,
            timestamp: Date.now(),
            count: list.length,
            bots: list,
        });
    });

    const distPath = path.join(process.cwd(), "dist", "cursor-ui");
    const indexPath = path.join(distPath, "index.html");

    if (fs.existsSync(distPath) && fs.existsSync(indexPath)) {
        app.use(express.static(distPath));
        app.get(/^(?!\/api).*$/, (_req, res) => {
            res.sendFile(indexPath);
        });
    } else {
        app.get(/^(?!\/api).*$/, (_req, res) => {
            res.type("html").send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cursor UI</title></head>
<body style="font-family:sans-serif;background:#0f0f14;color:#e0e0e0;padding:2rem;text-align:center;">
  <h1>Cursor UI</h1>
  <p>Build the frontend first: <code>cd src/cursor-ui && npm run build</code></p>
  <p>API works: <a href="/api/bots" style="color:#7c7cff">/api/bots</a></p>
</body></html>`);
        });
    }

    const server = http.createServer(app);
    server.listen(port, "0.0.0.0", () => {
        console.log(`✅ Cursor UI: http://localhost:${port}`);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
            console.error(`❌ Cursor UI: port ${port} in use`);
        } else {
            console.error("Cursor UI server error:", err);
        }
    });

    return {
        async stop() {
            if (updateInterval) clearInterval(updateInterval);
            updateInterval = null;
            botMap.clear();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}
