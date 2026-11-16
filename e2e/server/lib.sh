#!/usr/bin/env bash
# Shared constants and functions for the SDK E2E server harness. Source it; do not run it.
# Dependencies: bash, jq, curl, docker compose. No language toolchain.
# shellcheck disable=SC2034 # constants are read by the scripts that source this file

# Fixed test-only identifiers. They must match bootstrap.sql.
E2E_WORKSPACE_ID="clsdkqaws00000000000000001"
E2E_ACTION_KEY="qa-action"
E2E_ATTRIBUTE_KEY="plan"
E2E_ATTRIBUTE_VALUE="pro"
# Test-only API key inserted by bootstrap.sql (manage permission on the workspace).
E2E_API_KEY="fbk_sdk_e2e_qa_fixed_test_secret_not_for_prod_0001"

E2E_SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_COMPOSE_FILE="${E2E_SERVER_DIR}/docker-compose.yml"
# Where the server is reachable from this machine.
FORMBRICKS_URL="${FORMBRICKS_URL:-http://localhost:3000}"
# seed.sh writes the ids it created here; assert-response.sh and cleanup.sh read them.
E2E_STATE_FILE="${E2E_STATE_FILE:-${E2E_SERVER_DIR}/.state/seed.env}"

# --- payload builders (pure) ----------------------------------------------------------------------

# build_action_class_payload <workspaceId>
build_action_class_payload() {
  jq -cn --arg ws "$1" --arg key "${E2E_ACTION_KEY}" \
    '{workspaceId: $ws, name: "QA Action", description: "SDK E2E trigger", type: "code", key: $key}'
}

# build_attribute_key_payload <workspaceId>
build_attribute_key_payload() {
  jq -cn --arg ws "$1" --arg key "${E2E_ATTRIBUTE_KEY}" \
    '{workspaceId: $ws, key: $key, name: "Plan", description: "SDK E2E targeting attribute", type: "custom", dataType: "string"}'
}

# build_survey_payload <workspaceId> <actionClassJson>
# The app survey of the golden journey: NPS (qa_nps) then open text (qa_feedback), triggered by the
# action class returned from POST /api/v1/management/action-classes (the whole object is required).
# respondMultiple never blocks a rerun with the same userId; recontactDays 0 overrides the workspace
# cooldown; keepEndingCardOpen keeps the "Thanks!" card until the user closes the survey.
build_survey_payload() {
  jq -cn --arg ws "$1" --argjson actionClass "$2" '{
    workspaceId: $ws,
    name: "SDK E2E golden journey",
    type: "app",
    status: "inProgress",
    displayOption: "respondMultiple",
    recontactDays: 0,
    delay: 0,
    autoClose: null,
    displayPercentage: null,
    keepEndingCardOpen: true,
    isAutoProgressingEnabled: false,
    triggers: [{actionClass: $actionClass}],
    questions: [
      {id: "qa_nps", type: "nps", headline: {default: "How likely are you to recommend us?"}, required: true,
       lowerLabel: {default: "Not likely"}, upperLabel: {default: "Very likely"}, isColorCodingEnabled: false,
       buttonLabel: {default: "Next"}},
      {id: "qa_feedback", type: "openText", headline: {default: "What could we improve?"}, required: true,
       inputType: "text", longAnswer: false, placeholder: {default: "Type your answer"},
       buttonLabel: {default: "Finish"}}
    ],
    endings: [{id: "clsdkqaend0000000000000001", type: "endScreen", headline: {default: "Thanks!"}}]
  }'
}

# is_cuid <value>: true for the lowercase alphanumeric ids Prisma generates (cuid / cuid2).
is_cuid() {
  [[ "$1" =~ ^[a-z0-9]{2,64}$ ]]
}

# build_segment_filter_sql <workspaceId> <surveyId>
# The V1 survey PUT cannot set segment filters (its `segment` schema needs Date objects that JSON
# cannot carry), so the harness writes `plan = pro` onto the survey's private segment in SQL. Creating
# an app survey creates that segment with title = survey id. Run it before any SDK traffic: it skips
# the app's cache invalidation. Both ids are interpolated, so both must be cuids.
build_segment_filter_sql() {
  local workspace_id="$1" survey_id="$2" filters
  is_cuid "${workspace_id}" || { echo "not a cuid: workspace id '${workspace_id}'" >&2; return 1; }
  is_cuid "${survey_id}" || { echo "not a cuid: survey id '${survey_id}'" >&2; return 1; }
  filters="$(jq -cn --arg key "${E2E_ATTRIBUTE_KEY}" --arg value "${E2E_ATTRIBUTE_VALUE}" '[{
    id: "clsdkqaflt0000000000000001", connector: null,
    resource: {id: "clsdkqaflt0000000000000002", root: {type: "attribute", contactAttributeKey: $key},
               qualifier: {operator: "equals"}, value: $value}
  }]')"
  printf '%s\n' "UPDATE \"Segment\" SET \"filters\" = '${filters}'::jsonb, \"updated_at\" = now() WHERE \"workspaceId\" = '${workspace_id}' AND \"title\" = '${survey_id}' AND \"isPrivate\" = true;"
}

# --- response matcher (pure) ----------------------------------------------------------------------

# find_matching_response <userId> <plan> <nps> <feedback> < list-responses-body
# Reads the body of GET /api/v1/management/responses ({"data": [...]}) on stdin. Prints the first
# finished response from <userId> whose attribute snapshot has plan = <plan> and whose answers are
# <nps> and <feedback>, and returns 0. Otherwise prints what it saw to stderr and returns 1.
find_matching_response() {
  local body
  body="$(cat)"
  if jq -ce --arg user "$1" --arg plan "$2" --argjson nps "$3" --arg fb "$4" '
      first(.data[]
        | select(.finished == true
            and .contact.userId == $user
            and .contactAttributes.plan == $plan
            and .data.qa_nps == $nps
            and .data.qa_feedback == $fb))' <<<"${body}"; then
    return 0
  fi
  {
    echo "no finished response matches userId=$1 plan=$2 qa_nps=$3 qa_feedback=$4; responses seen:"
    jq -c '.data[]? | {id, finished, userId: .contact.userId, contactAttributes, data}' <<<"${body}" || echo "${body}"
  } >&2
  return 1
}

# --- formbricks-authzed output (pure) -------------------------------------------------------------

# authzed_status < cli-output
# `formbricks-authzed` prints one JSON result line, possibly after log lines. Prints the `status` of
# the last JSON object that has one; returns 1 when there is none.
authzed_status() {
  local status
  status="$(jq -Rr 'fromjson? | objects | .status // empty | strings' | tail -n 1)"
  [[ -n "${status}" ]] || return 1
  printf '%s\n' "${status}"
}

# is_license_gate_failure <httpStatus> <body>
# True when a 403 comes from the Enterprise (Contacts) license gate rather than from authorization.
is_license_gate_failure() {
  [[ "$1" == "403" ]] && grep -qi 'enterprise' <<<"$2"
}

# --- I/O helpers ----------------------------------------------------------------------------------

log() { printf '==> %s\n' "$*" >&2; }

# die <message>: the ::error:: prefix becomes an annotation on GitHub Actions and is plain text elsewhere.
die() {
  printf '::error::%s\n' "$*" >&2
  exit 1
}

compose() { docker compose -f "${E2E_COMPOSE_FILE}" "$@"; }

psql_exec() { compose exec -T postgres psql -U postgres -d formbricks -v ON_ERROR_STOP=1 "$@"; }

# authzed <args...>: runs the formbricks-authzed CLI inside the app container, which has its env.
authzed() { compose exec -T formbricks formbricks-authzed "$@"; }

# authzed_expect <status> <args...>: runs the CLI and dies unless it reports <status>.
authzed_expect() {
  local expected="$1" out status
  shift
  out="$(authzed "$@" 2>&1)" || true
  status="$(authzed_status <<<"${out}")" || status=""
  if [[ "${status}" != "${expected}" ]]; then
    printf '%s\n' "${out}" >&2
    die "formbricks-authzed $* reported '${status:-no result}', expected '${expected}'"
  fi
  log "formbricks-authzed $*: ${status}"
}

# api <method> <path> [jsonBody]: calls the management API with the test key.
# Sets API_STATUS (000 on a network error) and API_BODY.
api() {
  local method="$1" path="$2" body="${3:-}" tmp
  tmp="$(mktemp)"
  local args=(-sS -o "${tmp}" -w '%{http_code}' -X "${method}" -H "x-api-key: ${E2E_API_KEY}" -H "Accept: application/json")
  if [[ -n "${body}" ]]; then
    args+=(-H "Content-Type: application/json" --data-binary "${body}")
  fi
  API_STATUS="$(curl "${args[@]}" "${FORMBRICKS_URL}${path}")" || API_STATUS="000"
  API_BODY="$(cat "${tmp}")"
  rm -f "${tmp}"
}

# api_ok <method> <path> [jsonBody]: like api, but retries briefly on 401/403 (the SpiceDB projection
# of a just-created resource can lag the outbox) and dies on any non-2xx. Prints the body.
api_ok() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    api "$@"
    if [[ "${API_STATUS}" == 2?? ]]; then
      printf '%s\n' "${API_BODY}"
      return 0
    fi
    if is_license_gate_failure "${API_STATUS}" "${API_BODY}"; then
      die "$1 $2 hit the Enterprise license gate (HTTP 403: ${API_BODY}). The server needs the ENTERPRISE_LICENSE_KEY secret: an Enterprise license with the Contacts feature."
    fi
    if [[ "${API_STATUS}" != "401" && "${API_STATUS}" != "403" ]]; then
      break
    fi
    log "$1 $2 returned ${API_STATUS} (attempt ${attempt}), retrying"
    sleep 2
  done
  die "$1 $2 failed with HTTP ${API_STATUS}: ${API_BODY}"
}

# require_state: loads the ids seed.sh wrote.
require_state() {
  [[ -f "${E2E_STATE_FILE}" ]] || die "no seed state at ${E2E_STATE_FILE}; run seed.sh first"
  # shellcheck source=/dev/null
  source "${E2E_STATE_FILE}"
}
