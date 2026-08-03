#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 1. start tailscaled in userspace mode (no TUN device / root caps needed)
# 2. join the tailnet with an ephemeral auth key
# 3. forward 127.0.0.1:$PG_PORT  ->  $DB_TAILSCALE_IP:5432  over the tailnet
# 4. start the FastAPI app
# ---------------------------------------------------------------------------
set -euo pipefail

: "${TS_AUTHKEY:?TS_AUTHKEY is required}"
: "${DB_TAILSCALE_IP:?DB_TAILSCALE_IP is required}"
LOCAL_PGPORT="${PG_PORT:-5432}"

echo "[ts] starting tailscaled (userspace)…"
/usr/local/bin/tailscaled --tun=userspace-networking --state=mem: >/tmp/tailscaled.log 2>&1 &

echo "[ts] joining tailnet…"
/usr/local/bin/tailscale up --authkey="${TS_AUTHKEY}" --hostname=render-mrm-backend --accept-dns=false

# Give the tunnel a few seconds to establish, but DON'T block startup for long:
# uvicorn must open its port quickly or Render's health check fails the deploy.
# init_db is best-effort (app/main.py), so the DB need not be reachable yet.
echo "[ts] letting the tunnel establish (max ~12s)…"
for _ in $(seq 1 6); do
  /usr/local/bin/tailscale ping "${DB_TAILSCALE_IP}" >/dev/null 2>&1 && { echo "[ts] peer reachable"; break; }
  sleep 2
done

echo "[fwd] 127.0.0.1:${LOCAL_PGPORT} -> ${DB_TAILSCALE_IP}:5432 (over tailnet)"
socat TCP4-LISTEN:"${LOCAL_PGPORT}",fork,reuseaddr,bind=127.0.0.1 \
  SYSTEM:"/usr/local/bin/tailscale nc ${DB_TAILSCALE_IP} 5432" &

echo "[app] starting uvicorn on :${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
