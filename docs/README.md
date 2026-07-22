# Homeserver Backend (`be-homeserver`)

> Node.js API that exposes system vitals and Docker container statistics for the homeserver dashboard.

## Overview

A lightweight HTTP server built with Node's native `http` module that provides real-time system metrics and Docker container monitoring. It serves as the data layer for the homeserver dashboard frontend.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/vitals` | System vitals — CPU load, RAM usage, disk usage, temperature |
| `GET` | `/docker` | Docker container stats — CPU%, memory, network I/O, status, group, git branch |
| `GET` | `/metrics` | Prometheus metrics — process uptime, memory, HTTP request counters |
| `GET` | `/health` | Health check — returns `{ status: "ok", uptime: <seconds> }` |
| `OPTIONS` | `*` | CORS preflight — returns `204 No Content` with CORS headers |
| `*` | `*` | 404 — all other routes return `{ "error": "Not Found" }` |

### `GET /vitals`

Returns current host system metrics:

```json
{
  "cpuLoad": "12.5",
  "ramUsed": "2.1",
  "ramTotal": "4.0",
  "disk": "45%",
  "temp": "52.3°C"
}
```

### `GET /docker`

Returns stats for all running Docker containers with merged status, group classification, and git branch info:

```json
[
  {
    "Name": "twc-be",
    "CPUPerc": "0.15%",
    "MemUsage": "45.2MiB / 256MiB",
    "NetIO": "1.2kB / 3.4kB",
    "Status": "Up 3 hours (healthy)",
    "Group": "app",
    "Branch": "main"
  }
]
```

Response is cached for **5 seconds** to protect the Docker socket from concurrent hammering.

### `GET /metrics`

Returns Prometheus-compatible plain text (`text/plain; version=0.0.4`):

```
# HELP node_process_uptime_seconds Uptime of the Node.js process in seconds.
# TYPE node_process_uptime_seconds gauge
node_process_uptime_seconds 3600.123

# HELP node_process_memory_usage_bytes Memory usage in bytes.
# TYPE node_process_memory_usage_bytes gauge
node_process_memory_usage_bytes{type="rss"} 28311552

# HELP http_requests_total Total number of HTTP requests.
# TYPE http_requests_total counter
http_requests_total{method="GET",endpoint="/vitals",status="200"} 42
```

## Monitored Containers

The following containers are monitored via Docker socket:

| Container | Type |
|-----------|------|
| `db-mongo` | Database — MongoDB |
| `db-mysql` | Database — MySQL |
| `db-postgres` | Database — PostgreSQL |
| `electricity-tracker-app` | App — Next.js Full-Stack |
| `infra-nginx` | Infra — Reverse Proxy |
| `infra-portainer` | Infra — Container Management |
| `infra-watchtower` | Infra — Auto-Update |
| `kei-japanese-app` | App — Kei Japanese |
| `media-openinary` | Media — Self-Hosted Platform |
| `monitoring-cadvisor` | Monitoring — Container Metrics |
| `monitoring-grafana` | Monitoring — Dashboard |
| `monitoring-loki` | Monitoring — Log Storage |
| `monitoring-node-exporter` | Monitoring — Host Metrics |
| `monitoring-prometheus` | Monitoring — Metrics Collection |
| `monitoring-promtail` | Monitoring — Log Collector |
| `twc-be` | App — The Wine Corner Backend |
| `twc-fe` | App — The Wine Corner Frontend |
| `yp-be` | App — Your Places Backend |
| `yp-fe` | App — Your Places Frontend |

## Git Branch Detection

For public-facing apps, the backend reads `.git/HEAD` to determine the active branch. Supported containers and their mapped paths:

| Container Key | Git Path (in container) |
|---------------|------------------------|
| `fe-homeserver` | `/homeserver/apps/homeserver/fe-homeserver` |
| `be-homeserver` | `/homeserver/apps/homeserver/be-homeserver` |
| `twc-fe` | `/homeserver/apps/the-wine-corner/fe-the-wine-corner` |
| `twc-be` | `/homeserver/apps/the-wine-corner/be-the-wine-corner` |
| `yp-fe` | `/homeserver/apps/your-places/fe-your-places` |
| `yp-be` | `/homeserver/apps/your-places/be-your-places` |

## Architecture

```
┌────────────────────────────────────────┐
│           be-homeserver              │
│  ┌────────────────────────────────┐  │
│  │  Node.js HTTP Server (:3002)  │  │
│  │  ├── /vitals → os module      │  │
│  │  ├── /docker → docker CLI     │  │
│  │  ├── /metrics → prom format   │  │
│  │  └── /health → uptime check   │  │
│  └────────────────────────────────┘  │
│                                      │
│  Middleware:                          │
│  • Rate limiting (100 req/min/IP)   │
│  • JSON request logger              │
│  • Dynamic CORS (ALLOWED_ORIGINS)   │
│                                      │
│  Mounts:                             │
│  • /var/run/docker.sock (ro)         │
│  • /homeserver (ro) — git repos     │
└──────────────────────────────────────┘
```

## Environment Variables

Configure via a `.env` file or shell environment. Copy `.env.example` to get started:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | Port the HTTP server listens on |
| `ALLOWED_ORIGINS` | `*` (all) | Comma-separated list of allowed CORS origins (e.g. `http://localhost:4321,https://homeserver.local`) |

## Local Development

```bash
# Install dependencies
npm install

# Start the server
npm run dev
# → Vitals API running on port 3002

# Test endpoints
curl http://localhost:3002/health
curl http://localhost:3002/vitals
curl http://localhost:3002/docker
```

> **Note:** `/docker` endpoint requires Docker daemon access. When running locally, ensure Docker Desktop is running.

## Deployment

### CI/CD Pipeline

1. Push to `main` branch triggers GitHub Actions workflow
2. Docker image is built and pushed to `ghcr.io/fahmiefendy/be-homeserver`
3. Tagged with `latest` and commit SHA
4. Watchtower on the homeserver detects the new image and auto-updates

### Manual Deployment

```bash
cd apps/homeserver
docker compose pull homeserver-be
docker compose up -d homeserver-be
```

## Docker Configuration

- **Base image:** `node:22-alpine` + `docker-cli`
- **Port:** `3002` (internal, not exposed to host — behind Nginx proxy)
- **Resource limits:** 128MB RAM, 0.25 CPU
- **Security:** read-only filesystem, no-new-privileges, Docker socket read-only
