#!/usr/bin/env bash
# Runs ON THE SERVER once (and after a restore): HTTPS for the tailnet via `tailscale serve`.
# Requires "HTTPS Certificates" enabled in the Tailscale admin console (DNS page).
# The config persists across reboots. See DECISIONS.md D6.
set -euo pipefail
cd "$(dirname "$0")"

# Read single values; never `source` .env (values like `1000 * 60 * 15` are not shell-safe).
env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }
bind_ip=$(env_value BIND_IP)
lc_port=$(env_value LIBRECHAT_PORT)
admin_port=$(env_value ADMIN_PANEL_PORT)

tailscale serve --bg --https=8443 "http://${bind_ip}:${lc_port:-3480}"
tailscale serve --bg --https=8444 "http://${bind_ip}:${admin_port:-3481}"
tailscale serve status
