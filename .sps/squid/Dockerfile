# ─────────────────────────────────────────────────────────────────────────────
# Squid egress-proxy image
#
# Base: debian:bookworm-slim  (~30 MB compressed)
# Runs as non-root "proxy" user; all required directories are pre-created and
# chowned during the build so no root privileges are needed at runtime.
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

# Install Squid — bookworm ships Squid 5.x which supports the stdio: log target.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends squid \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# ── Runtime directories ───────────────────────────────────────────────────────
# /var/run/squid  — PID file (pid_filename in squid.conf)
# /var/spool/squid — Squid swap/cache dir (kept but cache is disabled)
RUN mkdir -p /var/run/squid /var/spool/squid \
 && chown proxy:proxy /var/run/squid /var/spool/squid

# ── Config ────────────────────────────────────────────────────────────────────
COPY squid.conf /etc/squid/squid.conf
RUN chown proxy:proxy /etc/squid/squid.conf

# ── Swap-dir initialisation ───────────────────────────────────────────────────
# squid -z must run once to create the swap directories; run as proxy user so
# ownership is correct and we never need root at container start.
RUN squid -z --foreground -f /etc/squid/squid.conf 2>/dev/null || true

EXPOSE 3128

USER proxy

# -N  → no daemon mode (foreground, required for Docker log capture)
# -f  → explicit config path
CMD ["squid", "-N", "-f", "/etc/squid/squid.conf"]
