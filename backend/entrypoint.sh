#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 1. start tailscaled in userspace mode (no TUN device / root caps needed)
# 2. join the tailnet with an ephemeral auth key
# 3. forward 127.0.0.1:$PG_PORT  ->  $DB_TAILSCALE_IP:5432  over the tailnet
# 4. start the FastAPI app
# ---------------------------------------------------------------------------
set -euo pipefail

: "${TS_AUTHKEY:?set TS_AUTHKEY (ephemeral, reusable Tailscale auth key)}"
: "${DB_TAILSCALE_IP:?set DB_TAILSCALE_IP (your PC's Tailscale 100.x.y.z address)}"
LOCAL_PGPORT="${PG_PORT:-5432}"

echo "[ts] starting tailscaled (userspace)…"
/usr/local/bin/tailscaled --tun=userspace-networking --state=mem: >/tmp/tailscaled.log 2>&1 &

echo "[ts] joining tailnet…"
/usr/local/bin/tailscale up --authkey="${TS_AUTHKEY}" --hostname=render-mrm-backend --accept-dns=false

echo "[ts] waiting for DB peer ${DB_TAILSCALE_IP}…"
for _ in $(seq 1 30); do
  if /usr/local/bin/tailscale ping "${DB_TAILSCALE_IP}" >/dev/null 2>&1; then
    echo "[ts] peer reachable"; break
  fi
  sleep 2
done

echo "[fwd] 127.0.0.1:${LOCAL_PGPORT} -> ${DB_TAILSCALE_IP}:5432 (over tailnet)"
socat TCP4-LISTEN:"${LOCAL_PGPORT}",fork,reuseaddr,bind=127.0.0.1 \
  SYSTEM:"/usr/local/bin/tailscale nc ${DB_TAILSCALE_IP} 5432" &

echo "[app] starting uvicorn on :${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
