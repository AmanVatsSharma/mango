# TradingPro on EC2 (PM2 + nginx, alongside TradeBazaar)

TradeBazaar typically binds **Next 3000** and **terminal-gateway 3001**. TradingPro uses **4000** for Next.js (`tpro-web`); terminal-gateway is optional.

## One-command nginx + TLS for `marketpulse360.live`

From the **tradingpro-platform** repo root on EC2 (after DNS A/AAAA for `marketpulse360.live` points to this instance and PM2 is serving Next on **4000**):

```bash
sudo CERTBOT_EMAIL=you@example.com ./scripts/deploy/nginx-site-tradingpro.sh
```

This creates a **separate** vhost at `/etc/nginx/sites-available/marketpulse360.live.conf` (does not edit `tradebazar.live`). It proxies to `127.0.0.1:4000`, enables the site, runs **certbot** `--nginx`, and reloads nginx.

Options:

| Env | Meaning |
| --- | --- |
| `DOMAIN` | Default `marketpulse360.live` |
| `UPSTREAM_PORT` | Default `4000` |
| `EXTRA_DOMAINS` | e.g. `www.marketpulse360.live` (space-separated); DNS must resolve here |
| `INSTALL_DEPS=1` | `apt-get install nginx python3-certbot-nginx` |
| `SKIP_CERTBOT=1` | HTTP-only (no Let's Encrypt) |
| `FORCE_RESET=1` | Overwrite an existing certbot-managed config file |

If a TLS config already exists for this domain, the script **refuses to overwrite** unless `FORCE_RESET=1`.

## PM2

1. Build: `npm ci`, `npx prisma migrate deploy`, `npm run build` (add terminal-gateway build only if you use the admin Live shell).
2. Set server env (or `.env.production`): `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_URL`, `NEXT_PUBLIC_BASE_URL` — all must use your **TradingPro public HTTPS domain**, not TradeBazaar’s.
3. Optional admin terminal: `TERMINAL_GATEWAY_ENABLED=true`, gateway on **4001**, nginx `/ws` to 4001, `NEXT_PUBLIC_TERMINAL_WS_URL` (see manual example below).
4. From the deploy directory: `pm2 start ecosystem.config.cjs` then `pm2 save` (TradeBazaar can already be running; process names are `tpro-*` so they do not collide with `vtrade-*`).
5. Adjust every `cwd` in [ecosystem.config.cjs](../../ecosystem.config.cjs) if your path is not `/home/ubuntu/tradingpro-platform`.

## nginx (example)

Replace `tradingpro.example.com` and certificate paths. Upstreams assume defaults in ecosystem: Next **127.0.0.1:4000**, gateway **127.0.0.1:4001**, gateway path `/ws`.

```nginx
upstream tpro_next {
    server 127.0.0.1:4000;
    keepalive 32;
}

upstream tpro_terminal {
    server 127.0.0.1:4001;
    keepalive 8;
}

server {
    listen 443 ssl http2;
    server_name tradingpro.example.com;

    # ssl_certificate ...;
    # ssl_certificate_key ...;

    location / {
        proxy_pass http://tpro_next;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://tpro_terminal;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

After `nginx -t`, reload nginx and issue TLS (e.g. certbot) for the new `server_name`.
