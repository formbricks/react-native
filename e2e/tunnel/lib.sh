#!/usr/bin/env bash
# Shared functions for the tunnel hand-off between the Linux server job and a macOS journey job.
# Source it; do not run it. Dependencies: bash, jq, curl, unzip, gh (all on GitHub's runners).
#
# GitHub's macOS runners cannot run Docker, so the server stays on Linux and a Cloudflare quick
# tunnel gives it an https:// URL. A job's outputs only publish when the job ends, but the Linux job
# must stay alive while the macOS job runs, so the two jobs swap run artifacts instead:
#   Linux  uploads e2e-server-attempt-<n>        (E2E_APP_URL=<tunnel>, or E2E_SERVER_FAILED=1)
#   macOS  uploads e2e-journey-done-attempt-<n>  (E2E_JOURNEY_RESULT=success|failure)
# Each side polls for the other's artifact with await-artifact.sh.

E2E_TUNNEL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_TUNNEL_STATE_DIR="${E2E_TUNNEL_STATE_DIR:-${E2E_TUNNEL_DIR}/.state}"

# --- pure -----------------------------------------------------------------------------------------

# parse_tunnel_url < cloudflared-log: prints the quick tunnel URL from cloudflared's banner.
parse_tunnel_url() {
  local url
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | grep -v '^https://api\.trycloudflare\.com$' | head -n 1)"
  [[ -n "${url}" ]] || return 1
  printf '%s\n' "${url}"
}

# is_https_origin <url>: true for a bare https origin (host and optional port, no path). The value
# crosses jobs in an artifact, so it is checked before an app or a shell uses it.
is_https_origin() {
  [[ "$1" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(:[0-9]{1,5})?$ ]]
}

# kv_get <key> <file>: prints the value of a KEY=value line. Never sources or evaluates the file.
kv_get() {
  local line
  line="$(grep -m 1 -E "^$1=" "$2")" || return 1
  printf '%s\n' "${line#*=}"
}

# artifact_id <name> < run-artifacts-listing: prints the id of the newest unexpired artifact with
# exactly that name from GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts.
artifact_id() {
  jq -er --arg name "$1" '
    [.artifacts[] | select(.name == $name and .expired == false)]
    | sort_by(.created_at) | last | .id // empty'
}

# job_last_attempt <job-name> < run-jobs-listing: prints the highest run_attempt among the jobs
# named <job-name> (or "<caller> / <job-name>" when the workflow is called) in
# GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs?filter=all. Fails when there is none.
job_last_attempt() {
  jq -er --arg name "$1" '
    [.jobs[] | select(.name == $name or (.name | endswith(" / " + $name))) | .run_attempt]
    | max // empty'
}

# --- I/O ------------------------------------------------------------------------------------------

log() { printf '==> %s\n' "$*" >&2; }

# die <message>: the ::error:: prefix becomes an annotation on GitHub Actions and is plain text elsewhere.
die() {
  printf '::error::%s\n' "$*" >&2
  exit 1
}
