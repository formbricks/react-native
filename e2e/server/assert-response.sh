#!/usr/bin/env bash
# Asserts through the V1 management API that the journey stored a finished response from the SDK
# user, with plan = pro in its attribute snapshot and the expected answers. Polls for up to
# E2E_ASSERT_TIMEOUT_SECONDS (default 60).
# Env: E2E_USER_ID (required), E2E_NPS (default 9), E2E_FEEDBACK (required).
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_state
: "${SURVEY_ID:?seed state has no SURVEY_ID}"
: "${E2E_USER_ID:?set E2E_USER_ID to the userId the SDK journey used}"
: "${E2E_FEEDBACK:?set E2E_FEEDBACK to the open-text answer the SDK journey typed}"
nps="${E2E_NPS:-9}"
reason_file="$(mktemp)"
trap 'rm -f "${reason_file}"' EXIT
deadline=$((SECONDS + ${E2E_ASSERT_TIMEOUT_SECONDS:-60}))

log "Waiting for a finished response from ${E2E_USER_ID} on survey ${SURVEY_ID}"
while true; do
  body="$(api_ok GET "/api/v1/management/responses?surveyId=${SURVEY_ID}&limit=50")"
  if response="$(find_matching_response "${E2E_USER_ID}" "${E2E_ATTRIBUTE_VALUE}" "${nps}" "${E2E_FEEDBACK}" <<<"${body}" 2>"${reason_file}")"; then
    log "Found it:"
    jq '{id, finished, contact, contactAttributes, data}' <<<"${response}"
    exit 0
  fi
  if ((SECONDS >= deadline)); then
    cat "${reason_file}" >&2
    die "no matching response within ${E2E_ASSERT_TIMEOUT_SECONDS:-60}s"
  fi
  sleep 2
done
