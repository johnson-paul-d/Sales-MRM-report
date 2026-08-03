# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Backend image for Render, with Tailscale (userspace) so the app can reach
# a Postgres that lives on a private tailnet — no public DB port required.
#
# The app connects to 127.0.0.1:$PG_PORT, which a socat forwarder relays over
# the tailnet to $DB_TAILSCALE_IP:5432. So on Render set PG_HOST=localhost.
# ---------------------------------------------------------------------------

# Grab the static Tailscale binaries from the official image.
FROM tailscale/tailscale:stable AS ts

FROM python:3.12-slim

# socat = the localhost->tailnet TCP forwarder; ca-certificates = TLS to control plane.
RUN apt-get update \
 && apt-get install -y --no-install-recommends socat ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ts /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=ts /usr/local/bin/tailscale  /usr/local/bin/tailscale

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x /app/entrypoint.sh

# Render overrides $PORT at runtime; this is just a local default.
ENV PORT=8000
CMD ["/app/entrypoint.sh"]
