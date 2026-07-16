/**
 * Watchdog: npm start, crash logs, restart on crash or 0 bots for 10+ minutes.
 */
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT, "logs");
const CRASH_DIR = path.join(LOG_DIR, "crashes");
const SESSION_LOG = path.join(LOG_DIR, "client-session.log");
const WATCHDOG_LOG = path.join(LOG_DIR, "watchdog.log");

const UI_PORT = Number(process.env.CURSOR_UI_PORT) || 3001;
const API_URL = `http://127.0.0.1:${UI_PORT}/api/bots`;
const ZERO_BOTS_RESTART_MS = 10 * 60 * 1000;
const POLL_MS = 30 * 1000;
const RESTART_DELAY_MS = 5000;
const STARTUP_GRACE_MS = 3 * 60 * 1000;
const TAIL_LINES = 400;

let child = null;
let zeroBotsSince = null;
let clientStartedAt = 0;
let intentionalRestartReason = null;
let pollTimer = null;

function ensureDirs() {
    fs.mkdirSync(CRASH_DIR, { recursive: true });
}

function ts() {
    return new Date().toISOString();
}

function logWatchdog(msg) {
    const line = `[${ts()}] ${msg}\n`;
    fs.appendFileSync(WATCHDOG_LOG, line);
    console.log(line.trimEnd());
}

function tailFile(filePath, lines = TAIL_LINES) {
    if (!fs.existsSync(filePath)) return "";
    const content = fs.readFileSync(filePath, "utf8");
    return content.split(/\r?\n/).slice(-lines).join("\n");
}

function saveCrashLog(kind, extra = "") {
    const stamp = ts().replace(/[:.]/g, "-");
    const file = path.join(CRASH_DIR, `${kind}-${stamp}.log`);
    const body = [
        `time: ${ts()}`,
        `kind: ${kind}`,
        extra,
        "",
        "=== session tail ===",
        tailFile(SESSION_LOG),
        "",
    ].join("\n");
    fs.writeFileSync(file, body);
    logWatchdog(`Saved crash log: ${path.relative(ROOT, file)}`);
}

function killProcessTree(pid) {
    if (!pid) return;
    try {
        if (process.platform === "win32") {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
        } else {
            process.kill(-pid, "SIGTERM");
        }
    } catch {
        try {
            process.kill(pid, "SIGKILL");
        } catch {
            /* already dead */
        }
    }
}

function appendSession(prefix, chunk) {
    fs.appendFileSync(SESSION_LOG, chunk);
}

function startClient() {
    if (child) return;

    clientStartedAt = Date.now();
    zeroBotsSince = null;
    logWatchdog("Starting npm start...");

    appendSession("", `\n\n===== CLIENT START ${ts()} =====\n`);

    child = spawn("npm start", {
        cwd: ROOT,
        shell: true,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (buf) => appendSession("", buf.toString()));
    child.stderr.on("data", (buf) => appendSession("", buf.toString()));

    child.on("exit", (code, signal) => {
        const reason = intentionalRestartReason;
        intentionalRestartReason = null;
        const meta = `exitCode: ${code ?? "null"}\nsignal: ${signal ?? "null"}\nreason: ${reason ?? "crash"}`;
        saveCrashLog(reason ? "restart" : "crash", meta);
        child = null;
        logWatchdog(`Client exited (code=${code}, signal=${signal}). Restart in ${RESTART_DELAY_MS}ms`);
        setTimeout(startClient, RESTART_DELAY_MS);
    });

    child.on("error", (err) => {
        logWatchdog(`Client spawn error: ${err}`);
    });
}

function restartClient(reason) {
    if (!child) {
        startClient();
        return;
    }
    logWatchdog(`Restarting client: ${reason}`);
    intentionalRestartReason = reason;
    const pid = child.pid;
    child = null;
    killProcessTree(pid);
}

async function pollBots() {
    if (!child) return;

    const uptime = Date.now() - clientStartedAt;
    if (uptime < STARTUP_GRACE_MS) return;

    try {
        const res = await fetch(API_URL, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const count = data?.count ?? 0;

        if (count === 0) {
            if (!zeroBotsSince) {
                zeroBotsSince = Date.now();
                logWatchdog("Active bots = 0, timer started (10 min)");
            } else if (Date.now() - zeroBotsSince >= ZERO_BOTS_RESTART_MS) {
                saveCrashLog("zero-bots", `zeroBotsDurationMs: ${Date.now() - zeroBotsSince}`);
                restartClient("zero_bots_10min");
            }
        } else {
            if (zeroBotsSince) logWatchdog(`Active bots = ${count}, zero-bot timer cleared`);
            zeroBotsSince = null;
        }
    } catch (err) {
        // API not ready or client hung without exit — do not treat as zero bots
        if (zeroBotsSince) {
            zeroBotsSince = null;
            logWatchdog(`API check failed, zero-bot timer cleared: ${err.message ?? err}`);
        }
    }
}

function main() {
    ensureDirs();
    logWatchdog("Watchdog started");
    logWatchdog(`API: ${API_URL}, zero-bots restart: ${ZERO_BOTS_RESTART_MS / 60000} min`);

    process.on("SIGINT", () => {
        logWatchdog("Watchdog stopped (SIGINT)");
        if (pollTimer) clearInterval(pollTimer);
        if (child) killProcessTree(child.pid);
        process.exit(0);
    });

    startClient();
    pollTimer = setInterval(() => {
        pollBots().catch((e) => logWatchdog(`poll error: ${e}`));
    }, POLL_MS);
}

main();
