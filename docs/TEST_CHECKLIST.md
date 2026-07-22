# Test Checklist — Homeserver Backend (`be-homeserver`)

Manual and automated test procedures for validating the backend service.

---

## API Endpoint Tests

### `GET /health`

- [ ] Returns `200` with `{ "status": "ok", "uptime": <number> }`
- [ ] `uptime` value increases between requests
- [ ] Response `Content-Type` is `application/json`
- [ ] CORS header is present when `Origin` matches `ALLOWED_ORIGINS`

### `GET /vitals`

- [ ] Returns `200` with valid JSON
- [ ] `cpuLoad` is a numeric string (e.g., `"12.5"`)
- [ ] `ramUsed` and `ramTotal` are numeric strings in GB
- [ ] `disk` is a percentage string (e.g., `"45%"`) or `"N/A"`
- [ ] `temp` is a temperature string (e.g., `"52.3°C"`) or `"N/A"`
- [ ] Response completes within 5 seconds

### `GET /docker`

- [ ] Returns `200` with a JSON array
- [ ] Each entry contains: `Name`, `CPUPerc`, `MemUsage`, `NetIO`, `Status`, `Group`
- [ ] `Group` is one of: `database`, `monitoring`, `infra`, `media`, `app`
- [ ] `Status` field includes health status (e.g., `"Up 3 hours (healthy)"`)
- [ ] Public app containers include `Branch` field (e.g., `"main"`)
- [ ] Non-app containers do not include `Branch` field
- [ ] All monitored containers are listed when all are running
- [ ] Response completes within 10 seconds
- [ ] Second call within 5 s returns the cached result (no Docker CLI re-execution)
- [ ] After Docker socket failure, next call returns `500` (not stale data)

### Unknown Routes

- [ ] `GET /unknown` returns `404` with JSON body `{ "error": "Not Found" }`
- [ ] `GET /api/vitals` returns `404` (no `/api` prefix)

---

## Docker Socket Connectivity

- [ ] Container can execute `docker stats --no-stream` successfully
- [ ] Container can execute `docker ps -a` successfully
- [ ] Socket is mounted read-only (cannot execute `docker run` or `docker rm`)

---

## Git Branch Detection

- [ ] `fe-homeserver` branch is correctly detected from `/homeserver/apps/homeserver/fe-homeserver/.git/HEAD`
- [ ] `be-homeserver` branch is correctly detected
- [ ] `twc-fe`, `twc-be`, `yp-fe`, `yp-be` branches are correctly detected
- [ ] Returns `null` gracefully when `.git/HEAD` file is missing
- [ ] Handles detached HEAD state (returns short SHA)

---

## Security & Hardening

- [ ] Container runs with `read_only: true` filesystem
- [ ] `no-new-privileges` security option is active
- [ ] Container respects memory limit (128MB)
- [ ] Container respects CPU limit (0.25)
- [ ] Docker socket is mounted as read-only
- [ ] No ports exposed to host (only accessible via proxy network)

---

## Health Check (Docker)

- [ ] Docker health check passes after `start_period` (15s)
- [ ] Container status shows `(healthy)` after startup
- [ ] Container auto-restarts on crash (`unless-stopped`)
- [ ] Health check fails gracefully when service is down

---

## Error Handling

- [ ] `/docker` returns `500` with error JSON when Docker socket is unavailable
- [ ] `/docker` returns `500` when stats output cannot be parsed
- [ ] `/vitals` gracefully handles missing temperature sensor (`"N/A"`)
- [ ] `/vitals` gracefully handles missing disk info (`"N/A"`)
- [ ] Server logs errors as structured JSON with `level: "error"` for troubleshooting

---

## Performance

- [ ] `/health` responds in < 50ms
- [ ] `/vitals` responds in < 3s under normal load
- [ ] `/docker` responds in < 10s with all containers running
- [ ] Memory usage stays below 128MB under sustained polling (every 5s for 5 min)

---

## Rate Limiting

- [ ] Sending 101 requests from the same IP within 60 s returns `429` on the 101st
- [ ] `Retry-After` header is present on `429` responses (value in seconds)
- [ ] A different IP is not affected by another IP's rate limit
- [ ] Rate limit window resets after 60 s

---

## CORS & Preflight

- [ ] `OPTIONS` request returns `204 No Content` with `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`
- [ ] Allowed origin receives `Access-Control-Allow-Origin` reflecting the request `Origin`
- [ ] Allowed origin response includes `Vary: Origin`
- [ ] Disallowed origin does not receive `Access-Control-Allow-Origin` header
- [ ] Wildcard mode (`ALLOWED_ORIGINS=*`) returns `Access-Control-Allow-Origin: *`

---

## Structured JSON Logging

- [ ] Each HTTP request produces a single JSON log line on stdout
- [ ] Log line contains: `timestamp`, `level`, `message`, `method`, `url`, `status`, `durationMs`, `ip`
- [ ] Error conditions (Docker failure, rate limit) log a `warn` or `error` level entry
- [ ] Unhandled promise rejections are logged as `error` and do not crash the process

---

## Prometheus `/metrics`

- [ ] Returns `200` with `Content-Type: text/plain; version=0.0.4`
- [ ] Contains `node_process_uptime_seconds` gauge
- [ ] Contains `node_process_memory_usage_bytes` with `rss`, `heapTotal`, `heapUsed` labels
- [ ] Contains `http_requests_total` counter with `method`, `endpoint`, `status` labels
- [ ] Counter increments on subsequent requests

---

## Graceful Shutdown

- [ ] Sending `SIGTERM` calls `server.close()` and exits with code `0`
- [ ] Sending `SIGINT` (Ctrl+C) calls `server.close()` and exits with code `0`
- [ ] Shutdown logs `{ level: "info", message: "HTTP server closed. Exiting process." }`
- [ ] Process force-exits after 10 s if open connections prevent clean shutdown (exit code `1`)
