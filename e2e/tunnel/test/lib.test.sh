#!/usr/bin/env bash
# Unit tests for the pure functions in e2e/tunnel/lib.sh. Needs bash and jq only.
# Run: e2e/tunnel/test/lib.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=../lib.sh
source "${HERE}/../lib.sh"

failures=0
passes=0

pass() { passes=$((passes + 1)); }
fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$1" >&2
  [[ $# -gt 1 ]] && printf '  %s\n' "${@:2}" >&2
  return 0
}

assert_eq() {
  if [[ "$2" == "$3" ]]; then pass; else fail "$1" "expected: $3" "actual:   $2"; fi
}

assert_fails() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then fail "${name}"; else pass; fi
}

# --- parse_tunnel_url -----------------------------------------------------------------------------

# What cloudflared 2026.10 prints on stderr for `tunnel --no-autoupdate --url http://localhost:3000`.
cloudflared_log='2026-11-15T10:00:00Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out.
2026-11-15T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...
2026-11-15T10:00:01Z INF +--------------------------------------------------------------------------------------------+
2026-11-15T10:00:01Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-11-15T10:00:01Z INF |  https://brave-lion-eight-sample.trycloudflare.com                                         |
2026-11-15T10:00:01Z INF +--------------------------------------------------------------------------------------------+
2026-11-15T10:00:01Z INF Version 2026.10.7 (Checksum 1f99fb51)
2026-11-15T10:00:02Z INF Registered tunnel connection connIndex=0 location=fra08 protocol=quic'

assert_eq "reads the quick tunnel URL out of the cloudflared banner" \
  "$(parse_tunnel_url <<<"${cloudflared_log}")" "https://brave-lion-eight-sample.trycloudflare.com"

assert_eq "ignores the api.trycloudflare.com request URL in an error line" \
  "$(parse_tunnel_url <<<'2026-11-15T10:00:00Z ERR Error unmarshaling QuickTunnel response url=https://api.trycloudflare.com/tunnel
2026-11-15T10:00:05Z INF |  https://second-try-works.trycloudflare.com  |')" "https://second-try-works.trycloudflare.com"

assert_fails "finds nothing before the banner is printed" parse_tunnel_url <<<'2026-11-15T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...'

# --- is_https_origin ------------------------------------------------------------------------------

if is_https_origin "https://brave-lion-eight-sample.trycloudflare.com"; then pass; else fail "a quick tunnel URL is an https origin"; fi
if is_https_origin "https://qa.example.com:8443"; then pass; else fail "an https origin may carry a port"; fi
assert_fails "http is not accepted (the iOS SDK rejects it)" is_https_origin "http://localhost:3000"
assert_fails "a path is not an origin" is_https_origin "https://x.trycloudflare.com/api"
assert_fails "a trailing newline or command is not accepted" is_https_origin $'https://x.trycloudflare.com\nrm -rf /'
assert_fails "an empty value is not accepted" is_https_origin ""

# --- kv_get ---------------------------------------------------------------------------------------

kv_file="$(mktemp)"
trap 'rm -f "${kv_file}"' EXIT
printf '%s\n' 'E2E_APP_URL=https://brave-lion-eight-sample.trycloudflare.com' 'E2E_JOURNEY_RESULT=success' >"${kv_file}"

assert_eq "reads a value by key" "$(kv_get E2E_JOURNEY_RESULT "${kv_file}")" "success"
assert_eq "keeps everything after the first =" \
  "$(kv_get E2E_APP_URL "${kv_file}")" "https://brave-lion-eight-sample.trycloudflare.com"
assert_fails "a missing key fails" kv_get E2E_SERVER_FAILED "${kv_file}"
# shellcheck disable=SC2016 # the literal text is the point
printf '%s\n' 'X=$(touch /tmp/pwned)' >"${kv_file}"
# shellcheck disable=SC2016
assert_eq "never evaluates the value" "$(kv_get X "${kv_file}")" '$(touch /tmp/pwned)'

# --- artifact_id ----------------------------------------------------------------------------------

# GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts?name=<name>, trimmed.
listing='{"total_count":3,"artifacts":[
  {"id":101,"name":"e2e-server-attempt-1","expired":false,"created_at":"2026-11-15T10:00:00Z"},
  {"id":103,"name":"e2e-server-attempt-1","expired":true,"created_at":"2026-11-15T10:09:00Z"},
  {"id":102,"name":"e2e-server-attempt-1","expired":false,"created_at":"2026-11-15T10:05:00Z"},
  {"id":104,"name":"e2e-server-attempt-10","expired":false,"created_at":"2026-11-15T10:10:00Z"}]}'

assert_eq "picks the newest unexpired artifact with exactly that name" \
  "$(artifact_id e2e-server-attempt-1 <<<"${listing}")" "102"
assert_fails "finds nothing while the artifact is not uploaded yet" \
  artifact_id e2e-journey-done-attempt-1 <<<'{"total_count":0,"artifacts":[]}'

printf '%d passed, %d failed\n' "${passes}" "${failures}"
[[ ${failures} -eq 0 ]]
