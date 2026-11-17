#!/usr/bin/env bash
# Runs ON THE SERVER once (and after a restore): HTTPS for the tailnet via `tailscale serve`.
# Requires "HTTPS Certificates" enabled in the Tailscale admin console (DNS page).
# The config persists across reboots. See DECISIONS.md D6.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
set -a; . ./.env; set +a

tailscale serve --bg --https=8443 "http://${BIND_IP}:${LIBRECHAT_PORT:-3480}"
tailscale serve --bg --https=8444 "http://${BIND_IP}:${ADMIN_PANEL_PORT:-3481}"
tailscale serve status
