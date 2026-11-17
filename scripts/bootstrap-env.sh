#!/usr/bin/env bash
# Runs ON THE SERVER once: creates .env from .env.example and generates every __HEXn__ secret.
# Secrets are created on the server and never leave it. Refuses to overwrite an existing .env.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo ".env already exists; not touching it." >&2
  exit 1
fi

umask 077
while IFS= read -r line || [ -n "$line" ]; do
  while [[ "$line" =~ __HEX([0-9]+)__ ]]; do
    n=${BASH_REMATCH[1]}
    line=${line/__HEX${n}__/$(openssl rand -hex "$n")}
  done
  printf '%s\n' "$line"
done < .env.example > .env

# LibreChat runs as the image's `node` user (uid 1000) and reads /app/.env.
chown 1000:1000 .env

echo "Created $(pwd)/.env (mode 600). Now set BIND_IP, DOMAIN_*, and API keys."
