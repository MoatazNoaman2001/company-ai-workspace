#!/usr/bin/env bash
# Runs ON THE SERVER from /opt/company-ai (CI uploads it there with the compose files).
# Pulls pinned images, starts the stack, and fails if LibreChat is not healthy.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: $(pwd)/.env is missing. Run: bash bootstrap-env.sh" >&2
  exit 1
fi
if grep -q '__HEX[0-9]*__' .env; then
  echo "ERROR: .env still has ungenerated secrets. Run: bash bootstrap-env.sh" >&2
  exit 1
fi

echo "==> pulling images"
docker compose pull --quiet
echo "==> starting stack"
docker compose up -d --remove-orphans

echo "==> waiting for LibreChat health"
status=starting
for _ in $(seq 1 40); do
  status=$(docker inspect -f '{{.State.Health.Status}}' company-ai-api 2>/dev/null || echo missing)
  [ "$status" = healthy ] && break
  sleep 5
done

docker compose ps --format 'table {{.Name}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

if [ "$status" != healthy ]; then
  echo "ERROR: LibreChat is $status" >&2
  docker compose logs --tail=80 api >&2
  exit 1
fi

# LibreChat falls back to defaults on an invalid librechat.yaml; treat that as a failed deploy.
if docker compose logs --since 10m api 2>&1 | grep -qiE 'invalid custom config|config validation error'; then
  echo "ERROR: librechat.yaml was rejected:" >&2
  docker compose logs --since 10m api 2>&1 | grep -iE -A5 'invalid custom config|config validation error' >&2
  exit 1
fi

docker image prune -f >/dev/null
echo "==> deploy OK"
