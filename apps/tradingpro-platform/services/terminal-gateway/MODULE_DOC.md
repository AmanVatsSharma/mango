# terminal-gateway

## Purpose

Long-running **WebSocket → PTY** bridge for the admin console **Live shell**. Deploy beside Next.js (e.g. PM2 on EC2). Requires `TERMINAL_GATEWAY_JWT_SECRET` shared with the Next app that signs tokens at `POST /api/admin/terminal/session`.

## Changelog

- **2026-03-25 (IST)** — Added `.gitignore` for `node_modules/`, `dist/`, local `.env*`, and common IDE/log artifacts.
- **2026-03-25 (IST)** — Initial gateway: auth frame, `node-pty` spawn, resize, idle + max session timeout, IST structured logs.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `TERMINAL_GATEWAY_JWT_SECRET` | yes | Same secret as Next `TERMINAL_GATEWAY_JWT_SECRET` |
| `TERMINAL_GATEWAY_HOST` | no | Default `127.0.0.1` |
| `TERMINAL_GATEWAY_PORT` | no | Default `3001` |
| `TERMINAL_GATEWAY_PATH` | no | WebSocket path, default `/ws` |
| `TERMINAL_SHELL` | no | Shell binary (default `$SHELL` or `/bin/bash`) |
| `TERMINAL_CWD` | no | Initial cwd (default `$HOME` or `/`) |
| `TERMINAL_SESSION_MAX_MS` | no | Max session length (default `3600000`) |
| `TERMINAL_SESSION_IDLE_MS` | no | Idle disconnect (default `900000`) |
| `TERMINAL_MAX_ROWS` | no | Clamp resize rows (default `200`) |
| `TERMINAL_MAX_COLS` | no | Clamp cols (default `400`) |

## Wire protocol (browser ↔ gateway)

1. Client opens WebSocket to `wsUrl` (must include path e.g. `wss://host/admin-term/ws`).
2. First message **must** be JSON: `{ "t": "auth", "token": "<jwt>" }` within 10s.
3. Server replies `{ "t": "ready", "sessionId": "..." }` on success.
4. Input from browser: `{ "t": "in", "d": "<string from xterm onData>" }`.
5. Output to browser: `{ "t": "out", "d": "<base64 utf-8 bytes from PTY>" }`.
6. Resize: `{ "t": "resize", "cols": 120, "rows": 40 }`.

## Security

Full shell on the gateway host. Run as a **dedicated low-privilege OS user**, bind to loopback, expose only via reverse-proxy + WSS + IP allowlist if needed.
