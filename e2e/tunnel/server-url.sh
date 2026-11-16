#!/usr/bin/env bash
# Prints the tunnel URL from the server job's artifact (start.sh's server.env), or fails clearly when
# the server job reported a failure instead or the URL is not a bare https origin.
# Usage: server-url.sh <server.env>
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

file="${1:?usage: server-url.sh <server.env>}"
[[ -f "${file}" ]] || die "no ${file}: the server artifact is missing it"
if kv_get E2E_SERVER_FAILED "${file}" >/dev/null; then
  die "the server job failed before it opened the tunnel; see its log"
fi
url="$(kv_get E2E_APP_URL "${file}")" || die "${file} has no E2E_APP_URL"
is_https_origin "${url}" || die "E2E_APP_URL is not a bare https origin: ${url}"
printf '%s\n' "${url}"
