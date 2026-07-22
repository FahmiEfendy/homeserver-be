# TODO — Homeserver Backend (`be-homeserver`)

Planned improvements and future work items.

---

## High Priority

- [x] **Update `CONTAINER_PATHS`** — Change relative paths (`../..`) to absolute Docker mount paths (`/homeserver/apps/...`) to match the volume mount in `docker-compose.yml`
- [x] **Add rate limiting** — Prevent abuse on `/vitals` and `/docker` endpoints (both shell out to system commands)
- [x] **Add request timeout** — Set maximum execution time for `docker stats` and `docker ps` commands to prevent hanging

## Medium Priority

- [ ] **Container grouping** — Categorize containers by type (database, app, infra, monitoring, media) in `/docker` response
- [ ] **Add `/docker/:name` endpoint** — Fetch stats for a single container by name
- [ ] **Structured logging** — Replace `console.log`/`console.error` with structured JSON logs for Loki/Promtail ingestion
- [ ] **Prometheus metrics endpoint** — Expose `/metrics` in Prometheus format for integration with existing monitoring stack
- [ ] **Cache Docker stats** — Cache `docker stats` response for 5–10 seconds to reduce Docker socket load under concurrent requests

## Low Priority

- [ ] **WebSocket support** — Push real-time updates to the frontend instead of polling
- [ ] **Container log tailing** — Add `GET /docker/:name/logs` endpoint for recent log lines
- [ ] **Docker Compose status** — Detect which compose project each container belongs to
- [ ] **Uptime history** — Track and expose container uptime/restart history
- [ ] **Alerting** — Detect unhealthy containers and trigger notifications
- [ ] **Unit tests** — Add automated tests with a mocked Docker socket
- [ ] **TypeScript migration** — Convert `server.js` to TypeScript for type safety

## Tech Debt

- [ ] **Remove hardcoded port** — Read `PORT` from environment variable instead of hardcoded `3002`
- [ ] **Tighten CORS** — Replace `Access-Control-Allow-Origin: *` with specific allowed origins
- [ ] **Error response standardization** — Use consistent error response format across all endpoints
- [ ] **Graceful shutdown** — Handle `SIGTERM`/`SIGINT` for clean Docker container stops
