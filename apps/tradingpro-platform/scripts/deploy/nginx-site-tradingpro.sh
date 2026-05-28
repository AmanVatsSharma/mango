#!/usr/bin/env bash
#
# Provisions a dedicated nginx site for TradingPro (MarketPulse / marketpulse360.live)
# on the same EC2 instance as TradeBazaar (tradebazar.live). Does not modify the
# TradeBazaar vhost — it only adds sites-available + sites-enabled symlink + certbot.
#
# Requirements: nginx, certbot (python3-certbot-nginx on Debian/Ubuntu). Run as root.
#
# Usage (from repo root on EC2):
#   sudo CERTBOT_EMAIL=ops@example.com ./scripts/deploy/nginx-site-tradingpro.sh
#
# Optional env:
#   DOMAIN=marketpulse360.live (default)
#   UPSTREAM_PORT=4000 (default; matches ecosystem.config.cjs Next port)
#   EXTRA_DOMAINS="www.marketpulse360.live" — space-separated; add each to server_name + certbot -d
#   INSTALL_DEPS=1 — apt-get install nginx python3-certbot-nginx if missing
#   FORCE_RESET=1 — overwrite an existing SSL-managed config (destructive)
#   SKIP_CERTBOT=1 — only write/reload nginx (HTTP), no Let's Encrypt
#
set -euo pipefail

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run with sudo: sudo CERTBOT_EMAIL=you@domain.com $0" >&2
  exit 1
fi

DOMAIN="${DOMAIN:-marketpulse360.live}"
UPSTREAM_PORT="${UPSTREAM_PORT:-4000}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
EXTRA_DOMAINS="${EXTRA_DOMAINS:-}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"
FORCE_RESET="${FORCE_RESET:-0}"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"

SITE_FILE="${DOMAIN}.conf"
AVAILABLE="/etc/nginx/sites-available/${SITE_FILE}"
ENABLED="/etc/nginx/sites-enabled/${SITE_FILE}"

EXTRA_SERVER_NAMES=""
for d in ${EXTRA_DOMAINS}; do
  EXTRA_SERVER_NAMES="${EXTRA_SERVER_NAMES} ${d}"
done

install_deps() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y nginx python3-certbot-nginx
}

if [[ "${INSTALL_DEPS}" == "1" ]]; then
  install_deps
else
  if ! command -v nginx >/dev/null 2>&1; then
    echo "nginx not found. Install it or re-run with INSTALL_DEPS=1" >&2
    exit 1
  fi
  if [[ "${SKIP_CERTBOT}" != "1" ]] && ! command -v certbot >/dev/null 2>&1; then
    echo "certbot not found. Install python3-certbot-nginx or INSTALL_DEPS=1" >&2
    exit 1
  fi
fi

if [[ -f "${AVAILABLE}" ]] && grep -q 'ssl_certificate' "${AVAILABLE}" && [[ "${FORCE_RESET}" != "1" ]]; then
  echo "Existing TLS config at ${AVAILABLE}; refusing to overwrite (certbot-managed)."
  echo "To replace from scratch: sudo FORCE_RESET=1 CERTBOT_EMAIL=... $0"
  nginx -t
  systemctl reload nginx
  exit 0
fi

if [[ -z "${CERTBOT_EMAIL}" && "${SKIP_CERTBOT}" != "1" ]]; then
  echo "Set CERTBOT_EMAIL=you@example.com for Let's Encrypt (or SKIP_CERTBOT=1 for HTTP-only)." >&2
  exit 1
fi

ensure_connection_upgrade_map() {
  if [[ -f /etc/nginx/nginx.conf ]] && grep -qF 'map $http_upgrade $connection_upgrade' /etc/nginx/nginx.conf 2>/dev/null; then
    return 0
  fi
  local f
  shopt -s nullglob
  for f in /etc/nginx/conf.d/*.conf; do
    if grep -qF 'map $http_upgrade $connection_upgrade' "$f" 2>/dev/null; then
      shopt -u nullglob
      return 0
    fi
  done
  shopt -u nullglob

  cat >/etc/nginx/conf.d/tradingpro-connection-upgrade-map.conf <<'MAPEOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
MAPEOF
}

write_http_config() {
  cat >"${AVAILABLE}" <<EOF
# TradingPro (MarketPulse) — ${DOMAIN}
# Upstream: Next.js on 127.0.0.1:${UPSTREAM_PORT} (PM2 tpro-web). Separate from tradebazar.live.

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN}${EXTRA_SERVER_NAMES};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:${UPSTREAM_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF
}

ensure_connection_upgrade_map
write_http_config
ln -sf "${AVAILABLE}" "${ENABLED}"
nginx -t
systemctl reload nginx

if [[ "${SKIP_CERTBOT}" == "1" ]]; then
  echo "HTTP site enabled. TLS skipped (SKIP_CERTBOT=1). Run certbot later."
  exit 0
fi

CERT_ARGS=(-d "${DOMAIN}")
for d in ${EXTRA_DOMAINS}; do
  CERT_ARGS+=(-d "${d}")
done

certbot --nginx "${CERT_ARGS[@]}" --non-interactive --agree-tos --email "${CERTBOT_EMAIL}" --redirect

nginx -t
systemctl reload nginx

echo "Done. ${DOMAIN} → http://127.0.0.1:${UPSTREAM_PORT} with TLS (if certbot succeeded)."
