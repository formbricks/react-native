#!/usr/bin/env bash
# Fails on a partial re-run of the server/iOS pair. The two jobs swap per-attempt artifacts, so on
# "Re-run failed jobs" that restarts only one of them, the other is kept from an earlier attempt
# and never uploads this attempt's artifact; the restarted job would wait for it until its timeout.
# Usage: require-full-rerun.sh <partner-job-name>
# Env: GH_TOKEN (needs actions: read), GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

partner="${1:?usage: require-full-rerun.sh <partner-job-name>}"
: "${GITHUB_REPOSITORY:?}" "${GITHUB_RUN_ID:?}" "${GITHUB_RUN_ATTEMPT:?}" "${GH_TOKEN:?GH_TOKEN must allow actions: read}"

((GITHUB_RUN_ATTEMPT > 1)) || exit 0
# A partner that is not listed yet is still being created for this attempt, so only an older
# attempt counts as kept.
if last="$(gh api --paginate "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?filter=all&per_page=100" | jq -s '{jobs: (map(.jobs) | add)}' | job_last_attempt "${partner}")" &&
  ((last < GITHUB_RUN_ATTEMPT)); then
  die "\"${partner}\" was kept from attempt ${last}, so it will not hand anything over to attempt ${GITHUB_RUN_ATTEMPT}. Use \"Re-run all jobs\" for the iOS golden journey."
fi
log "\"${partner}\" runs in attempt ${GITHUB_RUN_ATTEMPT} too"
