#!/usr/bin/env bash
# Seeds the golden-journey data through the V1 management API and writes the created ids to
# $E2E_STATE_FILE. Run after up.sh and before any SDK traffic.
#   1. action class qa-action (code)
#   2. app survey: NPS + open text, triggered by qa-action
#   3. segment filter plan = pro on the survey's private segment (SQL: V1 cannot set it)
#   4. contact attribute key plan (the first call behind the Contacts license)
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

mkdir -p "$(dirname "${E2E_STATE_FILE}")"
: >"${E2E_STATE_FILE}"
save() {
  printf '%s=%q\n' "$1" "$2" >>"${E2E_STATE_FILE}"
  log "$1=$2"
}

log "Creating the action class ${E2E_ACTION_KEY}"
action_class="$(api_ok POST /api/v1/management/action-classes "$(build_action_class_payload "${E2E_WORKSPACE_ID}")" | jq -c '.data')"
save ACTION_CLASS_ID "$(jq -r '.id' <<<"${action_class}")"

log "Creating the app survey"
survey_id="$(api_ok POST /api/v1/management/surveys "$(build_survey_payload "${E2E_WORKSPACE_ID}" "${action_class}")" | jq -r '.data.id')"
save SURVEY_ID "${survey_id}"
authzed_expect drained outbox drain

if [[ "${E2E_EXPERIMENT_ANON:-}" == 1 ]]; then log "EXPERIMENT: no targeting"; exit 0; fi

log "Targeting the survey to ${E2E_ATTRIBUTE_KEY} = ${E2E_ATTRIBUTE_VALUE}"
updated="$(build_segment_filter_sql "${E2E_WORKSPACE_ID}" "${survey_id}" | psql_exec -f - 2>&1)"
[[ "${updated}" == *"UPDATE 1"* ]] || die "expected to update the survey's private segment once, got: ${updated}"

log "Creating the contact attribute key ${E2E_ATTRIBUTE_KEY} (needs the Contacts license)"
if [[ -z "${FORMBRICKS_QA_LICENSE_KEY:-}" ]]; then
  die "FORMBRICKS_QA_LICENSE_KEY is not set. Add the QA Enterprise license (with Contacts) as the FORMBRICKS_QA_LICENSE_KEY secret; contacts, attributes and segment targeting need it."
fi
attribute_key_id="$(api_ok POST /api/v1/management/contact-attribute-keys "$(build_attribute_key_payload "${E2E_WORKSPACE_ID}")" | jq -r '.data.id')"
save ATTRIBUTE_KEY_ID "${attribute_key_id}"

log "Seeded. The SDK journey uses workspaceId=${E2E_WORKSPACE_ID}, action ${E2E_ACTION_KEY}, ${E2E_ATTRIBUTE_KEY}=${E2E_ATTRIBUTE_VALUE}"
