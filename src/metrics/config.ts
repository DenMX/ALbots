import fs from "fs"

export type MetricsConfig = {
    enabled: boolean
    port: number
    host: string
    pollIntervalMs: number
    /** Persist cumulative counters across client restarts */
    statePath: string
    /** Full Grafana dashboard URL for Cursor UI iframe (e.g. .../d/albots-overview/...?kiosk) */
    grafanaDashboardUrl: string | null
}

const DEFAULTS: MetricsConfig = {
    enabled: false,
    port: 9100,
    host: "0.0.0.0",
    pollIntervalMs: 5000,
    statePath: "./metrics-state.json",
    grafanaDashboardUrl: null,
}

/** Optional block in credentials.json; env vars override file values. */
export function loadMetricsConfig(credentialsPath = "./credentials.json"): MetricsConfig {
    let fromFile: Partial<MetricsConfig> = {}

    try {
        const raw = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"))
        if (raw.metrics && typeof raw.metrics === "object") {
            fromFile = raw.metrics
        }
    } catch {
        /* credentials missing or invalid — metrics stay disabled */
    }

    const enabledEnv = process.env.METRICS_ENABLED
    const portEnv = process.env.METRICS_PORT
    const hostEnv = process.env.METRICS_HOST
    const pollEnv = process.env.METRICS_POLL_MS

    const enabled =
        enabledEnv !== undefined
            ? enabledEnv === "1" || enabledEnv.toLowerCase() === "true"
            : fromFile.enabled === true

    const grafanaEnv = process.env.GRAFANA_DASHBOARD_URL
    const grafanaFromFile =
        typeof fromFile.grafanaDashboardUrl === "string" && fromFile.grafanaDashboardUrl.trim()
            ? fromFile.grafanaDashboardUrl.trim()
            : null

    const stateEnv = process.env.METRICS_STATE_PATH

    return {
        enabled,
        port: portEnv ? Number(portEnv) : (fromFile.port ?? DEFAULTS.port),
        host: hostEnv ?? fromFile.host ?? DEFAULTS.host,
        pollIntervalMs: pollEnv ? Number(pollEnv) : (fromFile.pollIntervalMs ?? DEFAULTS.pollIntervalMs),
        statePath: stateEnv?.trim() || (typeof fromFile.statePath === "string" && fromFile.statePath.trim()
            ? fromFile.statePath.trim()
            : DEFAULTS.statePath),
        grafanaDashboardUrl: grafanaEnv?.trim() || grafanaFromFile,
    }
}

/**
 * Grafana /goto/ short links redirect to the host used when the link was created (often localhost).
 * Rewrite to the provisioned dashboard path on the same host as configured in credentials.
 */
export function normalizeGrafanaDashboardUrl(url: string | null): string | null {
    if (!url?.trim()) return null
    const trimmed = url.trim()
    try {
        const parsed = new URL(trimmed)
        if (parsed.pathname.includes("/goto/")) {
            parsed.pathname = "/d/albots-overview/albots-overview"
            if (!parsed.searchParams.has("orgId")) parsed.searchParams.set("orgId", "1")
            if (!parsed.searchParams.has("kiosk")) parsed.searchParams.set("kiosk", "")
            return parsed.toString()
        }
        return trimmed
    } catch {
        return trimmed
    }
}

/** Cursor UI settings from credentials.json (metrics block). */
export function loadUiConfig(credentialsPath = "./credentials.json") {
    return {
        grafanaDashboardUrl: normalizeGrafanaDashboardUrl(
            loadMetricsConfig(credentialsPath).grafanaDashboardUrl,
        ),
    }
}
