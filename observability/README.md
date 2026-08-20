# ALbots observability (server)

Prometheus scrapes the bot client, **VictoriaMetrics** stores history (~24 months), Grafana reads from VictoriaMetrics.

```
DenXM-PC :9100  →  Prometheus (scrape 15s, keep 7d)
                         ↓ remote_write
                  VictoriaMetrics (retention 24 months)
                         ↓
                      Grafana :3000
```

## 1. Client (DenXM-PC)

Add to `credentials.json` (see `credentials.example.json`):

```json
"metrics": {
  "enabled": true,
  "port": 9100,
  "host": "0.0.0.0",
  "pollIntervalMs": 5000,
  "statePath": "./metrics-state.json"
}
```

HP/MP are **not** exported. Deaths (`albots_rip` + `albots_character_deaths_total`) are live and historical. XP / level are sampled every **5 minutes**.

Check locally: `http://localhost:9100/metrics`

**Windows firewall:** allow inbound TCP **9100** from your server's LAN IP (or subnet).

## 2. Docker Compose (same LAN server)

```bash
cd observability
docker compose up -d
```

- Grafana: `http://<server>:3000` (login `admin` / `admin`)
- VictoriaMetrics: `http://<server>:8428` (PromQL-compatible)
- Prometheus scrape UI: `http://<server>:9090` (debug targets; Grafana uses VM)

Edit `prometheus/prometheus.yml` if needed:

```yaml
targets: ["192.168.6.7:9100"]
```

In Prometheus → Status → Targets, **albots** should be **UP**. After that, series appear in VM within a few scrapes.

## 3. Docker Swarm

Same compose file:

```bash
docker swarm init   # if not already a swarm manager
cd observability
docker stack deploy -c docker-compose.yml albots-obs
```

Swarm ignores `container_name` / `depends_on`; service DNS names stay `prometheus`, `victoriametrics`, `grafana`.

The bind-mount `./prometheus/prometheus.yml` must exist **on the node** that runs Prometheus (same as Compose). Prefer pinning that service to the node that has the repo, or copy the file to a shared path.

## 4. VictoriaMetrics user / permissions

Image: `victoriametrics/victoria-metrics:v1.114.0` — runs as **root (UID 0)** inside the container (official default).

- **Named volume** `victoriametrics-data`: no `chown` needed.
- **Host bind-mount**: root in the container can write anywhere; optional `chown` only if you add `user: "1000:1000"`.

### `permission denied` on `flock.lock`

Happens when the data volume was first written **as root**, then the service was started with **`user: "1000:1000"`** (or the reverse).

**Fix A — recommended (keep data):** remove `user:` from the VM service (already done in compose) and restart:

```bash
docker compose up -d victoriametrics
# Swarm:
docker service update --force albots-obs_victoriametrics
```

**Fix B — empty volume is OK:**

```bash
docker compose down
docker volume rm observability_victoriametrics-data
# Swarm: docker volume rm albots-obs_victoriametrics-data
docker compose up -d
```

**Fix C — keep non-root user on bind-mount:**

```bash
sudo chown -R 1000:1000 /opt/albots/vm-data
```

Prometheus config is mounted **read-only** with SELinux relabel (`:ro,z`). Grafana provisioning is the same; Grafana data uses a named volume (bind-mount would need UID **472**).

If Prometheus still logs `open /etc/prometheus/prometheus.yml: permission denied` after 755/644, it is **not** Unix DAC: `chmod` would have taken effect immediately on the same inode. Typical leftover causes:

- **SELinux** (`user_home_t` on `~/...`): compose uses `:z`; recreate the container after pulling compose (`docker compose up -d --force-recreate prometheus`). Check: `getenforce` and `ls -Z prometheus/prometheus.yml`.
- **Wrong mount**: `docker inspect albots-prometheus --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'` must point at the file you chmod'd.
- **Snap Docker**: cannot bind-mount some home paths; install Docker from the official repo or put the stack under `/opt`.

Retention: `-retentionPeriod=24` = **24 months**.

## 5. Cursor UI (Metrics tab)

In `credentials.json`:

```json
"grafanaDashboardUrl": "http://YOUR_SERVER_IP:3000/d/albots-overview/albots-overview?orgId=1&kiosk"
```

**Do not use Grafana `/goto/…` short links.**

## 6. Reload after config change

```bash
docker compose exec prometheus kill -HUP 1
docker compose restart grafana
```

Swarm:

```bash
docker service update --force albots-obs_grafana
```

If an old Grafana volume still points datasources at Prometheus only:

```bash
docker compose down
docker volume rm observability_grafana-data
docker compose up -d
```

(This resets Grafana admin password to `admin` / `admin`.)
