#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

port=4173
session_url="http://127.0.0.1:$port/api/kitchen/session"

if curl -fsS --max-time 2 "$session_url" > /dev/null 2>&1; then
  exit 0
fi

if [[ ${CODESPACES:-false} == true ]]; then
  port_domain="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  preview_host="${CODESPACE_NAME:?Missing Codespace name}-$port.$port_domain"
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$preview_host"
  export SHAWARMA_CODESPACE_ORIGIN="https://$preview_host"
fi

# Separate the preview from the lifecycle command's process group.
setsid --fork node node_modules/vite/bin/vite.js preview --host 0.0.0.0 --port "$port" --strictPort \
  </dev/null >/tmp/shawarma-craft-preview.log 2>&1 &

for attempt in {1..30}; do
  if curl -fsS --max-time 2 "$session_url" > /dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

cat /tmp/shawarma-craft-preview.log >&2
exit 1
