# TODO — Homeserver Backend (`be-homeserver`)

Planned improvements and future work items.

---

## 🔴 Critical


## 🟡 Medium

- [ ] **Add `/docker/:name` endpoint** — Fetch stats for a single container by name

## 🟢 Nice to Have

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
