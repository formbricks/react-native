#!/usr/bin/env bash
# Opens a Cloudflare quick tunnel to the local Formbricks server and waits until the server answers
# through it. Writes E2E_APP_URL=<https URL> to $E2E_TUNNEL_STATE_DIR/server.env (the artifact the
# macOS job reads) and prints the URL. stop.sh closes the tunnel.
# Env: FORMBRICKS_URL (default http://localhost:3000), CLOUDFLARED (default cloudflared on PATH),
#      E2E_TUNNEL_TIMEOUT_SECONDS (default 180, for the URL and then for reachability).
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

origin="${FORMBRICKS_URL:-http://localhost:3000}"
timeout="${E2E_TUNNEL_TIMEOUT_SECONDS:-180}"
log_file="${E2E_TUNNEL_STATE_DIR}/cloudflared.log"
mkdir -p "${E2E_TUNNEL_STATE_DIR}"

log "Opening a quick tunnel to ${origin} ($("${CLOUDFLARED:-cloudflared}" --version))"
# A quick tunnel is refused when a cloudflared config file exists; none does on a runner.
nohup "${CLOUDFLARED:-cloudflared}" tunnel --no-autoupdate --url "${origin}" >"${log_file}" 2>&1 &
echo $! >"${E2E_TUNNEL_STATE_DIR}/cloudflared.pid"

deadline=$((SECONDS + timeout))
until url="$(parse_tunnel_url <"${log_file}")"; do
  if ! kill -0 "$(cat "${E2E_TUNNEL_STATE_DIR}/cloudflared.pid")" 2>/dev/null; then
    cat "${log_file}" >&2
    die "cloudflared exited before it printed a tunnel URL"
  fi
  if ((SECONDS >= deadline)); then
    cat "${log_file}" >&2
    die "cloudflared printed no tunnel URL within ${timeout}s"
  fi
  sleep 1
done
is_https_origin "${url}" || die "cloudflared printed an unexpected URL: ${url}"

# The hostname takes a few seconds to resolve and route. Check it here so the macOS job never
# caches a negative DNS answer for it.
log "Waiting for ${url}/health"
deadline=$((SECONDS + timeout))
until curl -fsS --max-time 10 "${url}/health" >/dev/null 2>&1; do
  if ((SECONDS >= deadline)); then
    tail -n 50 "${log_file}" >&2
    die "the server did not answer through ${url} within ${timeout}s"
  fi
  sleep 3
done

printf 'E2E_APP_URL=%s\n' "${url}" >"${E2E_TUNNEL_STATE_DIR}/server.env"
log "Tunnel ready: ${url}"
printf '%s\n' "${url}"
