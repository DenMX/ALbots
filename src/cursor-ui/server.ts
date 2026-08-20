import { StateController } from "../controllers/state_controller";
import { StateStrategy } from "../common_functions/state_strategy";
import express from "express";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import prettyMilliseconds from "pretty-ms";
import { loadUiConfig } from "../metrics/config";
import httpProxy from "http-proxy";

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
    // Текущий state-режим и цель стратегии (для UI)
    state_type?: string;
    wantedMob?: string | string[];
    statusInfo: Record<string, unknown>;
    buffs: string[];
    debuffs: string[];
    special: string[];
    ttlu: string;
    equipment: Record<string, EquipSlotData>;
    /** Строки из IState.getLogs() */
    logs: string[];
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

    const upstreamOrigin = "https://adventure.land";

    function rewriteCommText(text: string): string {
        let out = text;

        // Make AL runtime call our same-origin proxy routes.
        // Note: we only rewrite inside quoted strings to reduce chance of breaking code.
        out = out.replace(/(["'])\/api\//g, "$1/al/api/");
        out = out.replace(/(["'])\/js\//g, "$1/al/js/");
        out = out.replace(/(["'])\/css\//g, "$1/al/css/");
        out = out.replace(/(["'])\/data\.js/g, "$1/al/data.js");
        out = out.replace(/(["'])\/images\//g, "$1/al/images/");
        out = out.replace(/(["'])\/sounds\//g, "$1/al/sounds/");
        out = out.replace(/url\((['"]?)\/css\//g, "url($1/al/css/");
        out = out.replace(/url\((['"]?)\/images\//g, "url($1/al/images/");
        out = out.replace(/url\((['"]?)\/sounds\//g, "url($1/al/sounds/");
        out = out.replace(/\/al\/css\/fonts\/m5x7\.ttf\b/g, "/al/css/fonts/m5x7.ttf?proxyfix=3");

        // Also handle fully-qualified references.
        out = out.replace(/https:\/\/adventure\.land/g, "/al");

        // Keep a canonical-looking base_url for third-party scripts, then reroute outgoing
        // requests back into /al/* through the injected compat shim.
        out = out.replace(/base_url="https:\/\/adventure\.land"/g, 'base_url=""');

        // Observe / character switching sometimes reconstructs socket targets from runtime vars
        // instead of using the already rewritten server list. Force any direct adventure.land ws target
        // back through our local websocket proxy right before socket.io connects.
        out = out.replace(
            'var query = (args.secret && "desktop=" + ((!is_comm && 1) || "") + "&secret=" + args.secret) || undefined;',
            `if (server_address && /\\.adventure\\.land$/i.test(server_address) && server_path && /\\/ws[1-4]\\//.test(server_path)) {
\t\tserver_path = "/al-ws/" + server_address + server_path;
\t\tserver_address = window.location.host;
\t}
\tvar query = (args.secret && "desktop=" + ((!is_comm && 1) || "") + "&secret=" + args.secret) || undefined;`
        );

        return out;
    }

    function shouldRewriteJs(rest: string): boolean {
        // Rewriting vendor bundles like jQuery / socket.io / pixi can easily break them.
        // We only rewrite Adventure Land's own runtime files that contain hardcoded paths/origins.
        return /^(common_functions|old_common_functions|functions|game|html|comm|payments|keyboard)\.js$/i.test(path.basename(rest));
    }

    function rewriteCommHtml(html: string, browserHost: string): string {
        let out = html;

        // Rewrite main document asset links.
        out = out.replace(/(href|src)=["']\/js\//g, '$1="/al/js/');
        out = out.replace(/(href|src)=["']\/css\//g, '$1="/al/css/');
        out = out.replace(/(href|src)=["']\/data\.js/g, '$1="/al/data.js');
        out = out.replace(/(href|src)=["']\/images\//g, '$1="/al/images/');
        out = out.replace(/(href|src)=["']\/sounds\//g, '$1="/al/sounds/');

        // Keep a canonical-looking base_url for third-party scripts, then rely on the
        // compat shim to transparently reroute requests into our local /al/* proxy namespace.
        out = out.replace(/var\s+base_url="https:\/\/adventure\.land";/g, 'var base_url="";');

        // Rewrite default websocket target into our local websocket proxy.
        // Example we saw in live comm HTML:
        //   var server_address="de.adventure.land",server_path="/ws1/";
        out = out.replace(
            /server_address="([^"]+)"\s*,\s*server_path="([^"]+)"/g,
            (_m, addr: string, wsPath: string) => `server_address="${browserHost}",server_path="/al-ws/${addr}${wsPath}"`
        );

        const compatShim = `
<script>
(function() {
  var proxyOrigin = window.location.origin;
  var canonicalOrigin = "https://adventure.land";
  var canonicalPath = "/comm";

  function normalizeUrl(input) {
    if (!input || typeof input !== "string") return input;
    if (input.startsWith("https://adventure.land/al/")) return proxyOrigin + input.slice("https://adventure.land".length);
    if (input.startsWith("http://adventure.land/al/")) return proxyOrigin + input.slice("http://adventure.land".length);
    if (input.startsWith("/api/")) return proxyOrigin + "/al" + input;
    if (input.startsWith("/images/")) return proxyOrigin + "/al" + input;
    if (input.startsWith("/sounds/")) return proxyOrigin + "/al" + input;
    if (input.startsWith("/css/")) return proxyOrigin + "/al" + input;
    if (input.startsWith("/js/")) return proxyOrigin + "/al" + input;
    if (input === "/data.js" || input.startsWith("/data.js?")) return proxyOrigin + "/al" + input;
    if (input.startsWith(canonicalOrigin + "/api/")) return proxyOrigin + "/al/api/" + input.slice((canonicalOrigin + "/api/").length);
    if (input.startsWith(canonicalOrigin + "/images/")) return proxyOrigin + "/al/images/" + input.slice((canonicalOrigin + "/images/").length);
    if (input.startsWith(canonicalOrigin + "/sounds/")) return proxyOrigin + "/al/sounds/" + input.slice((canonicalOrigin + "/sounds/").length);
    if (input.startsWith(canonicalOrigin + "/css/")) return proxyOrigin + "/al/css/" + input.slice((canonicalOrigin + "/css/").length);
    if (input.startsWith(canonicalOrigin + "/js/")) return proxyOrigin + "/al/js/" + input.slice((canonicalOrigin + "/js/").length);
    if (input.startsWith(canonicalOrigin + "/data.js")) return proxyOrigin + "/al/data.js" + input.slice((canonicalOrigin + "/data.js").length);
    return input;
  }

  window.__AL_PROXY__ = {
    enabled: true,
    proxyOrigin: proxyOrigin,
    canonicalOrigin: canonicalOrigin,
    canonicalPath: canonicalPath,
    normalizeUrl: normalizeUrl
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/comm-sw.js", { scope: "/" }).catch(function(err) {
      console.warn("comm service worker registration failed", err);
    });
  }

  function patchUrlProperty(proto, prop) {
    var desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set || !desc.get) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: function() { return desc.get.call(this); },
      set: function(value) { return desc.set.call(this, normalizeUrl(value)); }
    });
  }

  patchUrlProperty(HTMLImageElement.prototype, "src");
  patchUrlProperty(HTMLScriptElement.prototype, "src");
  patchUrlProperty(HTMLIFrameElement.prototype, "src");
  patchUrlProperty(HTMLLinkElement.prototype, "href");
  patchUrlProperty(HTMLAnchorElement.prototype, "href");

  var originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if ((name === "src" || name === "href") && typeof value === "string") {
      value = normalizeUrl(value);
    }
    return originalSetAttribute.call(this, name, value);
  };

  if (window.fetch) {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function(resource, init) {
      if (typeof resource === "string") resource = normalizeUrl(resource);
      else if (resource && typeof resource.url === "string") resource = normalizeUrl(resource.url);
      return originalFetch(resource, init);
    };
  }

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === "string") arguments[1] = normalizeUrl(url);
    return originalOpen.apply(this, arguments);
  };

  try {
    Object.defineProperty(document, "baseURI", {
      configurable: true,
      get: function() { return canonicalOrigin + canonicalPath; }
    });
  } catch (_err) {}

  var style = document.createElement("style");
  style.textContent = [
    "html,body{font-family:pixel,sans-serif !important;}",
    "button,input,select,textarea{font-family:pixel,sans-serif;}",
    ".gamebutton,.button,.textbutton,.whiteheader,.tinybutton,.slimbutton,.gray,.codeui{font-family:pixel,sans-serif;}",
    ".CodeMirror,.CodeMirror pre{font-family:pixel,monospace !important;}"
  ].join("");
  document.head.appendChild(style);
})();
</script>`;

        out = out.replace(/<head>/i, `<head>${compatShim}`);

        return out;
    }

    function rewriteServerObjectsInJson(obj: unknown, browserHost: string): void {
        const addrKeyCandidates = new Set(["address", "server_address", "serverAddress"]);
        const pathKeyCandidates = new Set(["path", "server_path", "serverPath"]);

        function visit(node: any) {
            if (!node) return;
            if (Array.isArray(node)) {
                for (const x of node) visit(x);
                return;
            }
            if (typeof node !== "object") return;

            // If this object looks like AL server entry, rewrite it to point to our local websocket proxy.
            const address = addrKeyCandidates.has("address") ? node.address : undefined;
            const serverAddress = node.server_address ?? node.serverAddress;
            const path = node.path ?? node.server_path ?? node.serverPath;

            const effectiveAddress: unknown = node.address ?? serverAddress;

            if (typeof effectiveAddress === "string" && typeof path === "string") {
                const addrStr = effectiveAddress;
                // Heuristic: websocket paths look like "/ws1/".."/ws4/".
                if (addrStr.includes(".adventure.land") && /\/ws[1-4]\//.test(path)) {
                    node.address = browserHost;
                    node.server_address = browserHost;
                    node.path = `/al-ws/${addrStr}${path}`;
                    node.server_path = `/al-ws/${addrStr}${path}`;
                }
            }

            for (const v of Object.values(node)) visit(v);
        }

        visit(obj as any);
    }

    async function readRequestBody(req: any): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return Buffer.concat(chunks);
    }

    function copyResponseHeaders(from: Headers, to: any) {
        from.forEach((v, k) => {
            const lk = k.toLowerCase();
            // Node/proxy will set these automatically.
            if (lk === "content-length" || lk === "transfer-encoding") return;
            // We'll normalise/handle Set-Cookie separately.
            if (lk === "set-cookie") return;
            to.setHeader(k, v);
        });
    }

    function getWildcardPath(params: unknown, key = "rest"): string | undefined {
        if (!params || typeof params !== "object") return undefined;
        const value = (params as Record<string, unknown>)[key];
        if (Array.isArray(value)) return value.join("/");
        if (typeof value === "string") return value;
        return undefined;
    }

    function getForwardHeaders(req: any): Record<string, string> {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers ?? {})) {
            if (typeof v === "string") headers[k] = v;
        }
        delete headers.host;
        return headers;
    }

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
                state_type: "",
                wantedMob: undefined,
                statusInfo: {},
                buffs: [],
                debuffs: [],
                special: [],
                ttlu: "N/A",
                equipment: {},
                logs: [],
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

        const activeIds = new Set<string>();
        for (const b of bots) {
            if(!b) continue
            let bot
            try {
                bot = b.getBot()
            } catch {
                continue
            }
            if(!bot?.id) continue
            activeIds.add(bot.id);
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
            // status: человекочитаемое описание состояния (как раньше)
            d.status = b.getStateType?.() ?? "";

            // state_type: "сырой" тип состояния из StateStrategy (farm|boss|event|quest)
            if (b instanceof StateStrategy) {
                const cs = b.currentState;
                d.state_type = cs?.state_type ?? "";
            } else {
                d.state_type = "";
            }

            // wantedMob: целевой моб / список мобов из стратегии (через новый IState.getWantedMob)
            const w = b.getWantedMob?.();
            if (w !== undefined && w !== null) {
                d.wantedMob = w as unknown as string | string[];
            } else {
                d.wantedMob = undefined;
            }
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

            const logLines = b.getLogs?.();
            d.logs = Array.isArray(logLines) ? [...logLines] : [];

            const sl = (bot as { slots?: Record<string, { name?: string; level?: number; q?: number } | null> }).slots;
            d.equipment = {};
            for (const k of EQUIP_SLOTS) {
                const it = sl?.[k];
                d.equipment[k] = it && it.name != null ? { name: String(it.name), level: it.level, q: it.q } : null;
            }

            d.goldHisto.push(bot.gold);
            if (d.goldHisto.length > 500) d.goldHisto = d.goldHisto.slice(-500);
            d.xpHisto.push(bot.xp);
            if (d.xpHisto.length > 500) d.xpHisto = d.xpHisto.slice(-500);

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

        for (const id of [...botMap.keys()]) {
            if (!activeIds.has(id)) {
                botMap.delete(id);
            }
        }
    }

    collectBots();
    updateInterval = setInterval(collectBots, STAT_BEAT);

    const app = express();

    // Storage Access API: allow embedded `adventure.land` iframe to request access to cookies.
    // This is needed for Chrome/Chromium when third-party cookie access is restricted.
    app.use((_req, res, next) => {
        res.setHeader("Permissions-Policy", 'storage-access=(self "https://adventure.land")');
        next();
    });

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

    app.get("/comm-sw.js", (_req, res) => {
        res.type("application/javascript").setHeader("Cache-Control", "no-store");
        res.send(`
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function mapUrl(input) {
  const url = new URL(input);
  const selfOrigin = self.location.origin;

  if ((url.origin === "https://adventure.land" || url.origin === "http://adventure.land") && url.pathname.startsWith("/al/")) {
    return new URL(url.pathname + url.search, selfOrigin).toString();
  }

  if (url.origin === "https://adventure.land" || url.origin === "http://adventure.land") {
    if (url.pathname.startsWith("/api/")) return new URL("/al" + url.pathname + url.search, selfOrigin).toString();
    if (url.pathname.startsWith("/images/")) return new URL("/al" + url.pathname + url.search, selfOrigin).toString();
    if (url.pathname.startsWith("/sounds/")) return new URL("/al" + url.pathname + url.search, selfOrigin).toString();
    if (url.pathname.startsWith("/css/")) return new URL("/al" + url.pathname + url.search, selfOrigin).toString();
    if (url.pathname.startsWith("/js/")) return new URL("/al" + url.pathname + url.search, selfOrigin).toString();
    if (url.pathname === "/data.js") return new URL("/al/data.js" + url.search, selfOrigin).toString();
  }

  return null;
}

self.addEventListener("fetch", (event) => {
  const mapped = mapUrl(event.request.url);
  if (!mapped) return;

  event.respondWith(fetch(mapped, {
    method: event.request.method,
    headers: event.request.headers,
    body: ["GET", "HEAD"].includes(event.request.method) ? undefined : event.request.body,
    redirect: "follow"
  }));
});
`);
    });

    app.get("/api/ui-config", (_req, res) => {
        const ui = loadUiConfig("./credentials.json");
        res.json({ success: true, ...ui });
    });

    async function handleCommDocument(req: any, res: any) {
        const browserHost = req.headers.host ?? "localhost:3001";
        try {
            const response = await fetch(`${upstreamOrigin}/comm`, {
                headers: {
                    ...getForwardHeaders(req),
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                },
            });
            if (!response.ok) {
                res.status(response.status).send(`Upstream error: ${response.statusText}`);
                return;
            }
            const html = await response.text();
            const rewritten = rewriteCommHtml(html, browserHost);
            res.type("html").send(rewritten);
        } catch (err) {
            res.status(500).send(`Comm proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // Same-origin proxy for Comm.
    // We serve both /al/comm and /comm so third-party scripts that key off pathname
    // can behave as if they are running on the original adventure.land/comm page.
    app.get("/al/comm", handleCommDocument);
    app.get("/comm", handleCommDocument);

    app.get("/al/js/*rest", async (req, res) => {
        try {
            const rest = getWildcardPath(req.params);
            if (!rest) {
                res.status(400).send("Missing js path");
                return;
            }
            const response = await fetch(`${upstreamOrigin}/js/${rest}`, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            });
            if (!response.ok) {
                res.status(response.status).send(`Upstream error: ${response.statusText}`);
                return;
            }
            const contentType = response.headers.get("content-type") ?? "application/javascript";
            const text = await response.text();
            res.type(contentType).send(shouldRewriteJs(rest) ? rewriteCommText(text) : text);
        } catch (err) {
            res.status(500).send(`Comm js proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    app.get("/al/css/*rest", async (req, res) => {
        try {
            const rest = getWildcardPath(req.params);
            if (!rest) {
                res.status(400).send("Missing css path");
                return;
            }
            const response = await fetch(`${upstreamOrigin}/css/${rest}`, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            });
            if (!response.ok) {
                res.status(response.status).send(`Upstream error: ${response.statusText}`);
                return;
            }
            const contentType = response.headers.get("content-type") ?? "text/css";
            if (/\.(ttf|otf|woff2?|eot)$/i.test(rest) || contentType.includes("font/") || contentType === "application/octet-stream") {
                copyResponseHeaders(response.headers, res);
                const body = Buffer.from(await response.arrayBuffer());
                res.send(body);
                return;
            }
            const text = await response.text();
            res.type(contentType).send(rewriteCommText(text));
        } catch (err) {
            res.status(500).send(`Comm css proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    app.get("/al/data.js", async (req, res) => {
        try {
            const response = await fetch(`${upstreamOrigin}/data.js`, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            });
            if (!response.ok) {
                res.status(response.status).send(`Upstream error: ${response.statusText}`);
                return;
            }
            const contentType = response.headers.get("content-type") ?? "application/javascript";
            const text = await response.text();
            res.type(contentType).send(rewriteCommText(text));
        } catch (err) {
            res.status(500).send(`Comm data.js proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    // Images/sounds can be proxied without rewriting.
    app.get("/al/images/*rest", async (req, res) => {
        try {
            const rest = getWildcardPath(req.params);
            if (!rest) {
                res.status(400).send("Missing image path");
                return;
            }
            const response = await fetch(`${upstreamOrigin}/images/${rest}`);
            if (!response.ok) {
                res.status(response.status).send(`Upstream error: ${response.statusText}`);
                return;
            }
            copyResponseHeaders(response.headers, res);
            const body = Buffer.from(await response.arrayBuffer());
            res.send(body);
        } catch (err) {
            res.status(500).send(`Comm images proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    app.get("/al/sounds/*rest", async (req, res) => {
        try {
            const rest = getWildcardPath(req.params);
            if (!rest) {
                res.status(400).send("Missing sound path");
                return;
            }
            const response = await fetch(`${upstreamOrigin}/sounds/${rest}`);
            if (!response.ok) {
                res.status(response.status).send(`Upstream error: ${response.statusText}`);
                return;
            }
            copyResponseHeaders(response.headers, res);
            const body = Buffer.from(await response.arrayBuffer());
            res.send(body);
        } catch (err) {
            res.status(500).send(`Comm sounds proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    // Proxy AL APIs used by Comm. We rewrite server host/path for websocket proxy.
    app.all("/al/api/*rest", async (req, res) => {
        const browserHost = req.headers.host ?? "localhost:3001";
        const rest = getWildcardPath(req.params);
        if (!rest) {
            res.status(400).send("Missing api path");
            return;
        }
        const upstreamUrl = new URL(`${upstreamOrigin}/api/${rest}`);
        upstreamUrl.search = new URL(req.url ?? "", `http://${browserHost}`).search;

        try {
            const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readRequestBody(req);
            const headers = getForwardHeaders(req);

            const response = await fetch(upstreamUrl.toString(), {
                method: req.method,
                headers,
                body: body && body.length ? body : undefined,
            });

            res.status(response.status);

            const contentType = response.headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
                const json = await response.json();
                rewriteServerObjectsInJson(json, browserHost);

                // Persist auth locally on localhost so the proxied /al/comm can present it to Adventure Land.
                // HAR showed signup_or_login returns { success, user, auth } without Set-Cookie.
                if (
                    rest === "signup_or_login" &&
                    json &&
                    typeof json === "object" &&
                    "success" in json &&
                    "user" in json &&
                    "auth" in json &&
                    (json as Record<string, unknown>).success === true &&
                    typeof (json as Record<string, unknown>).user === "string" &&
                    typeof (json as Record<string, unknown>).auth === "string"
                ) {
                    const localAuth = `${(json as Record<string, string>).user}-${(json as Record<string, string>).auth}`;
                    res.setHeader("set-cookie", `auth=${localAuth}; Path=/; SameSite=Lax`);
                }

                res.json(json);
                return;
            }

            // Best-effort: drop/normalise Set-Cookie so it can attach to localhost if it appears.
            const setCookie = response.headers.get("set-cookie");
            if (setCookie) {
                res.setHeader("set-cookie", setCookie.replace(/Domain=[^;]+;?/gi, "").replace(/;\s*/g, "; "));
            }

            copyResponseHeaders(response.headers, res);
            const buf = Buffer.from(await response.arrayBuffer());
            res.send(buf);
        } catch (err) {
            res.status(500).send(`Comm api proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    // Fallback for any other resources referenced by Comm (fonts, favicons, images, etc).
    // Keep it after /al/api/* so API calls don't get swallowed by the generic resource proxy.
    app.get("/al/*rest", async (req, res) => {
        try {
            const rest = getWildcardPath(req.params);
            if (!rest) {
                res.status(404).send("Not found");
                return;
            }
            const response = await fetch(`${upstreamOrigin}/${rest}`, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            });
            if (!response.ok) {
                res.status(response.status).send(`Upstream error: ${response.statusText}`);
                return;
            }

            const contentType = response.headers.get("content-type") ?? "";
            if (contentType.includes("javascript") || contentType.includes("text/css")) {
                const text = await response.text();
                res.type(contentType).send(rewriteCommText(text));
                return;
            }

            copyResponseHeaders(response.headers, res);
            const body = Buffer.from(await response.arrayBuffer());
            res.send(body);
        } catch (err) {
            res.status(500).send(`Comm resource proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    app.get("/api/panels-frame", (req, res) => {
        const player = typeof req.query.player === "string" ? req.query.player.trim() : "";
        const playerAttr = player.replace(/"/g, "&quot;").replace(/</g, "&lt;");
        res.type("html").send(`
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comm & Players</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;background:#0c0c10}
.layout{display:flex;flex-direction:column;height:100%;gap:0}
.comm-wrap{flex:1;min-height:0;border:1px solid #27272a;border-radius:10px;overflow:hidden}
.player-wrap{height:320px;min-height:0;flex-shrink:0;border:1px solid #27272a;border-radius:10px;overflow:hidden}
.comm-wrap iframe,.player-wrap iframe{width:100%;height:100%;border:none;display:block}
</style>
</head>
<body>
<div class="layout">
  <div class="comm-wrap"><iframe src="/comm" loading="lazy" allow="storage-access"></iframe></div>
  <div class="player-wrap"><iframe id="pf" data-player="${playerAttr}" loading="lazy"></iframe></div>
</div>
<script>
(function(){var e=document.getElementById('pf');var p=e.getAttribute('data-player');e.src=p?'https://adventure.land/player/'+encodeURIComponent(p):'about:blank';})();
</script>
</body>
</html>`);
    });

    app.get("/api/proxy/comm", async (_req, res) => {
        try {
            const response = await fetch("https://adventure.land/comm", {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
            });
            if (!response.ok) {
                res.status(response.status).send(`Error: ${response.statusText}`);
                return;
            }
            const html = await response.text();
            // Rewrite relative URLs to absolute URLs
            const rewrittenHtml = html
                .replace(/href="\//g, 'href="https://adventure.land/')
                .replace(/src="\//g, 'src="https://adventure.land/')
                .replace(/action="\//g, 'action="https://adventure.land/');
            res.type("html").send(rewrittenHtml);
        } catch (err) {
            res.status(500).send(`Proxy error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

    app.get("/api/adventure-login", (_req, res) => {
        res.type("html").send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Adventure Land Login</title></head>
<body>
<form id="f" action="https://adventure.land/comm" method="POST" target="_self">
<input type="text" name="email" placeholder="Email" />
<input type="password" name="password" placeholder="Password" />
<button type="submit">Login</button>
</form>
<script>
(function(){
var f = document.getElementById('f');
if (f.email.value && f.password.value) {
  f.submit();
} else {
  window.location.href = 'https://adventure.land/comm';
}
})();
</script>
</body></html>`);
    });

    const distPath = path.join(process.cwd(), "dist", "cursor-ui");
    const indexPath = path.join(distPath, "index.html");

    if (fs.existsSync(distPath) && fs.existsSync(indexPath)) {
        app.use(express.static(distPath));
        app.get(/^(?!\/api|\/al).*$/, (_req, res) => {
            res.sendFile(indexPath);
        });
    } else {
        app.get(/^(?!\/api|\/al).*$/, (_req, res) => {
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

    // Websocket proxy for Comm:
    //   local:  /al-ws/<upstreamHost>/<upstreamWsPath>/*
    //   upstream: wss://<upstreamHost>/<upstreamWsPath>/*
    //
    // We rely on earlier HTML/JSON rewrites to point Comm websocket to /al-ws/...
    const wsProxy = httpProxy.createProxyServer({ changeOrigin: true, ws: true });
    server.on("upgrade", (req, socket, head) => {
        try {
            const url = req.url ?? "";
            if (!url.startsWith("/al-ws/")) return;

            const parsed = new URL(url, `http://${req.headers.host ?? "localhost"}`);
            const parts = parsed.pathname.split("/").filter(Boolean); // ["al-ws", "<host>", "<path1>", ...]

            const upstreamHost = parts[1];
            const upstreamPathParts = parts.slice(2);
            if (!upstreamHost || upstreamPathParts.length === 0) {
                socket.destroy();
                return;
            }

            let upstreamPath = "/" + upstreamPathParts.join("/");
            if (parsed.pathname.endsWith("/")) upstreamPath += "/";

            // Rewrite request URL to upstream path, preserve query string.
            req.url = upstreamPath + parsed.search;

            const upstreamTarget = `https://${upstreamHost}`;
            wsProxy.ws(req, socket as any, head, { target: upstreamTarget });
        } catch {
            socket.destroy();
        }
    });
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
