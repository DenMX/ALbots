import http from "http"
import { registry } from "./registry"

export type MetricsServerHandle = {
    stop(): Promise<void>
}

export function startMetricsServer(host: string, port: number): MetricsServerHandle {
    const server = http.createServer(async (req, res) => {
        if (req.url !== "/metrics" && req.url !== "/metrics/") {
            if (req.url === "/health" || req.url === "/health/") {
                res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
                res.end("ok")
                return
            }
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
            res.end("not found")
            return
        }

        try {
            const body = await registry.metrics()
            res.writeHead(200, {
                "Content-Type": registry.contentType,
                "Cache-Control": "no-cache",
            })
            res.end(body)
        } catch (err) {
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
            res.end(String(err))
        }
    })

    server.listen(port, host, () => {
        console.log(`Metrics: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/metrics`)
    })

    server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Metrics: port ${port} already in use`)
        } else {
            console.error("Metrics server error:", err)
        }
    })

    return {
        stop() {
            return new Promise((resolve, reject) => {
                server.close((e) => (e ? reject(e) : resolve()))
            })
        },
    }
}
