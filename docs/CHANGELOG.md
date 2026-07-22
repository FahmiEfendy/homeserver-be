# Changelog — Homeserver Backend (`be-homeserver`)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.0] — 2026-07-22

### Added

- **Structured JSON logging** — Replaced `morgan` with custom request logger middleware emitting structured JSON lines (timestamp, level, method, URL, status, latency, IP) for easy ingestion.
- **Docker stats caching** — In-memory 5-second caching with concurrency lock to protect the Docker socket.
- **Container grouping** — Categorized container stats dynamically in `/docker` responses (database, monitoring, infra, media, app groups).
- **Prometheus metrics endpoint** — `/metrics` exporting Node.js process stats and custom HTTP request counters.
- **Rate limiting** — IP-based sliding window rate limiter (100 req/min) returning `429` status with `Retry-After` headers.
- **Command execution timeouts** — Added a 5,000ms execution timeout to shell commands in `runCmd`.
- **Absolute container paths** — Dynamic resolution fallback for `/homeserver` mapping workspace root path locally.
- **Dynamic CORS control** — Tightened CORS matching with preflight `OPTIONS` request support (`204 No Content`) and configurable allowed origins via `ALLOWED_ORIGINS`.
- **Configurable port** — Server dynamically reads `PORT` from environment variables with safe fallback validation.
- **Standardized error responses** — Uniform JSON error responses via `sendError`.
- **Graceful shutdown** — Implemented SIGTERM/SIGINT listeners with a 10s watchdog timeout.

### Fixed

- Docker stats cache invalidation on command errors to prevent serving stale metrics.
- Port environment variable parsing with validation rules.
- Global unhandled promise rejection catching and structured logging.

### Removed

- `morgan` dependency.

---

## [0.1.0] — 2026-06-26

### Added

- **System Vitals API** (`GET /vitals`)
  - CPU load average (normalized per core)
  - RAM usage (used / total in GB)
  - Disk usage percentage (root partition)
  - CPU temperature reading (Linux `hwmon`)

- **Docker Monitor API** (`GET /docker`)
  - Real-time container stats via `docker stats --no-stream`
  - Container status via `docker ps -a`
  - Merged stats + status response per container
  - Git branch detection for public-facing app containers

- **Health Check API** (`GET /health`)
  - Returns service status and process uptime

- **Infrastructure**
  - Morgan HTTP request logging (`dev` format)
  - CORS headers (`Access-Control-Allow-Origin: *`)
  - Docker-in-Docker via `docker-cli` in Alpine image
  - GitHub Actions CI/CD pipeline → GHCR
  - Production-ready `docker-compose.yml` with security hardening
