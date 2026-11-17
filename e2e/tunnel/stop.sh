#!/usr/bin/env bash
# Closes the tunnel start.sh opened. With a directory argument, first copies cloudflared's log there.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if [[ $# -gt 0 && -f "${E2E_TUNNEL_STATE_DIR}/cloudflared.log" ]]; then
  mkdir -p "$1"
  cp "${E2E_TUNNEL_STATE_DIR}/cloudflared.log" "$1/cloudflared.log"
fi
if [[ -f "${E2E_TUNNEL_STATE_DIR}/cloudflared.pid" ]]; then
  kill "$(cat "${E2E_TUNNEL_STATE_DIR}/cloudflared.pid")" 2>/dev/null || true
  rm -f "${E2E_TUNNEL_STATE_DIR}/cloudflared.pid"
fi
