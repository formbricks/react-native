#!/usr/bin/env bash
# Deletes what seed.sh and the journey created, through the V1 management API: the survey's
# responses, the survey, the action class and the attribute key. On a throwaway stack down.sh is
# the real cleanup; this matters against a shared server and proves the DELETE endpoints.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_state

failed=0
delete() {
  api DELETE "$1"
  if [[ "${API_STATUS}" == 2?? || "${API_STATUS}" == 404 ]]; then
    log "DELETE $1: ${API_STATUS}"
  else
    printf '::error::DELETE %s failed with HTTP %s: %s\n' "$1" "${API_STATUS}" "${API_BODY}" >&2
    failed=1
  fi
}

if [[ -n "${SURVEY_ID:-}" ]]; then
  responses="$(api_ok GET "/api/v1/management/responses?surveyId=${SURVEY_ID}&limit=100")"
  for response_id in $(jq -r '.data[].id' <<<"${responses}"); do
    delete "/api/v1/management/responses/${response_id}"
  done
  delete "/api/v1/management/surveys/${SURVEY_ID}"
fi
[[ -n "${ACTION_CLASS_ID:-}" ]] && delete "/api/v1/management/action-classes/${ACTION_CLASS_ID}"
[[ -n "${ATTRIBUTE_KEY_ID:-}" ]] && delete "/api/v1/management/contact-attribute-keys/${ATTRIBUTE_KEY_ID}"

# Everything is gone, so seed.sh may run again.
((failed)) || : >"${E2E_STATE_FILE}"
exit "${failed}"
