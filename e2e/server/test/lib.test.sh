#!/usr/bin/env bash
# Unit tests for the pure functions in e2e/server/lib.sh. Needs bash and jq only.
# Run: e2e/server/test/lib.test.sh
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

# assert_json_eq <name> <actual-json> <expected-json>: compares JSON semantically (key order ignored).
assert_json_eq() {
  if jq -e --argjson a "$2" --argjson b "$3" -n '$a == $b' >/dev/null 2>&1; then
    pass
  else
    fail "$1" "expected: $3" "actual:   $2"
  fi
}

assert_eq() {
  if [[ "$2" == "$3" ]]; then pass; else fail "$1" "expected: $3" "actual:   $2"; fi
}

# --- action class payload -------------------------------------------------------------------------

assert_json_eq "action class payload is the V1 code action qa-action" \
  "$(build_action_class_payload clsdkqaws00000000000000001)" \
  '{"workspaceId":"clsdkqaws00000000000000001","name":"QA Action","description":"SDK E2E trigger","type":"code","key":"qa-action"}'

# --- contact attribute key payload ----------------------------------------------------------------

assert_json_eq "attribute key payload is the custom string key plan" \
  "$(build_attribute_key_payload clsdkqaws00000000000000001)" \
  '{"workspaceId":"clsdkqaws00000000000000001","key":"plan","name":"Plan","description":"SDK E2E targeting attribute","type":"custom","dataType":"string"}'

# --- survey payload -------------------------------------------------------------------------------

action_class='{"id":"clac0000000000000000000001","name":"QA Action","description":"SDK E2E trigger","type":"code","key":"qa-action","noCodeConfig":null,"workspaceId":"clsdkqaws00000000000000001","createdAt":"2026-11-15T10:00:00.000Z","updatedAt":"2026-11-15T10:00:00.000Z"}'

assert_json_eq "survey payload is the NPS + open text app survey triggered by the created action class" \
  "$(build_survey_payload clsdkqaws00000000000000001 "${action_class}")" \
  '{
    "workspaceId": "clsdkqaws00000000000000001",
    "name": "SDK E2E golden journey",
    "type": "app",
    "status": "inProgress",
    "displayOption": "respondMultiple",
    "recontactDays": 0,
    "delay": 0,
    "autoClose": null,
    "displayPercentage": null,
    "keepEndingCardOpen": true,
    "isAutoProgressingEnabled": false,
    "triggers": [{"actionClass": {"id":"clac0000000000000000000001","name":"QA Action","description":"SDK E2E trigger","type":"code","key":"qa-action","noCodeConfig":null,"workspaceId":"clsdkqaws00000000000000001","createdAt":"2026-11-15T10:00:00.000Z","updatedAt":"2026-11-15T10:00:00.000Z"}}],
    "questions": [
      {"id": "qa_nps", "type": "nps", "headline": {"default": "How likely are you to recommend us?"}, "required": true,
       "lowerLabel": {"default": "Not likely"}, "upperLabel": {"default": "Very likely"}, "isColorCodingEnabled": false,
       "buttonLabel": {"default": "Next"}},
      {"id": "qa_feedback", "type": "openText", "headline": {"default": "What could we improve?"}, "required": true,
       "inputType": "text", "longAnswer": false, "placeholder": {"default": "Type your answer"},
       "buttonLabel": {"default": "Finish"}}
    ],
    "endings": [{"id": "clsdkqaend0000000000000001", "type": "endScreen", "headline": {"default": "Thanks!"}}]
  }'

# --- segment filter SQL ---------------------------------------------------------------------------

assert_eq "segment SQL sets plan = pro on the survey's private segment" \
  "$(build_segment_filter_sql clsdkqaws00000000000000001 clsurvey000000000000000001)" \
  "UPDATE \"Segment\" SET \"filters\" = '[{\"id\":\"clsdkqaflt0000000000000001\",\"connector\":null,\"resource\":{\"id\":\"clsdkqaflt0000000000000002\",\"root\":{\"type\":\"attribute\",\"contactAttributeKey\":\"plan\"},\"qualifier\":{\"operator\":\"equals\"},\"value\":\"pro\"}}]'::jsonb, \"updated_at\" = now() WHERE \"workspaceId\" = 'clsdkqaws00000000000000001' AND \"title\" = 'clsurvey000000000000000001' AND \"isPrivate\" = true;"

if build_segment_filter_sql clsdkqaws00000000000000001 "x' OR '1'='1" >/dev/null 2>&1; then
  fail "segment SQL rejects a survey id that is not a cuid"
else
  pass
fi

if build_segment_filter_sql "" clsurvey000000000000000001 >/dev/null 2>&1; then
  fail "segment SQL rejects an empty workspace id"
else
  pass
fi

# --- response matcher -----------------------------------------------------------------------------

# response <id> <finished> <userId> <plan|""> <nps> <feedback>
response() {
  jq -cn --arg id "$1" --argjson finished "$2" --arg user "$3" --arg plan "$4" --argjson nps "$5" --arg fb "$6" '{
    id: $id, surveyId: "clsurvey000000000000000001", finished: $finished,
    data: {qa_nps: $nps, qa_feedback: $fb},
    contact: {id: "clcontact00000000000000001", userId: $user},
    contactAttributes: ({userId: $user} + (if $plan == "" then {} else {plan: $plan} end))
  }'
}
list() { jq -cn '{data: $ARGS.positional}' --jsonargs "$@"; }

match_id() {
  local out
  out="$(printf '%s' "$1" | find_matching_response qa-user-1 pro 9 "Faster loading" 2>/dev/null)" || {
    echo "NO_MATCH"
    return 0
  }
  jq -r '.id' <<<"${out}"
}

assert_eq "matcher picks the finished response of the user, skipping the partial one" \
  "$(match_id "$(list "$(response r-partial false qa-user-1 pro 9 "")" "$(response r-done true qa-user-1 pro 9 "Faster loading")")")" \
  "r-done"

assert_eq "matcher ignores an unfinished response" \
  "$(match_id "$(list "$(response r1 false qa-user-1 pro 9 "Faster loading")")")" \
  "NO_MATCH"

assert_eq "matcher ignores another user's response" \
  "$(match_id "$(list "$(response r1 true qa-user-2 pro 9 "Faster loading")")")" \
  "NO_MATCH"

assert_eq "matcher requires the plan attribute on the response" \
  "$(match_id "$(list "$(response r1 true qa-user-1 "" 9 "Faster loading")")")" \
  "NO_MATCH"

assert_eq "matcher requires the plan value pro" \
  "$(match_id "$(list "$(response r1 true qa-user-1 free 9 "Faster loading")")")" \
  "NO_MATCH"

assert_eq "matcher requires the NPS answer" \
  "$(match_id "$(list "$(response r1 true qa-user-1 pro 8 "Faster loading")")")" \
  "NO_MATCH"

assert_eq "matcher requires the open-text answer" \
  "$(match_id "$(list "$(response r1 true qa-user-1 pro 9 "Something else")")")" \
  "NO_MATCH"

assert_eq "matcher finds nothing in an empty list" \
  "$(match_id '{"data":[]}')" \
  "NO_MATCH"

# --- formbricks-authzed output --------------------------------------------------------------------

assert_eq "authzed status reads the status of the CLI's JSON line" \
  "$(printf '%s\n' '{"claimed":3,"delivered":3,"failed":0,"deadLettered":0,"remaining":0,"status":"drained"}' | authzed_status)" \
  "drained"

assert_eq "authzed status skips log lines and takes the last JSON result" \
  "$(printf '%s\n' 'Loaded env' '{"level":30,"msg":"draining"}' '{"status":"prepared","steps":[]}' | authzed_status)" \
  "prepared"

if printf '%s\n' 'Error: connect ECONNREFUSED' | authzed_status >/dev/null 2>&1; then
  fail "authzed status fails when the CLI printed no JSON result"
else
  pass
fi

# --- license gate hint ----------------------------------------------------------------------------

if is_license_gate_failure 403 '{"code":"forbidden","message":"Contacts are only enabled for Enterprise Edition, please upgrade."}'; then
  pass
else
  fail "a 403 about Enterprise Edition is the license gate"
fi

if is_license_gate_failure 403 '{"error":"User identification is only available for enterprise users."}'; then
  pass
else
  fail "a 403 about enterprise users is the license gate"
fi

if is_license_gate_failure 403 '{"message":"You are not authorized to access this resource"}'; then
  fail "a 403 about authorization is not the license gate"
else
  pass
fi

if is_license_gate_failure 500 '{"message":"Enterprise license check failed"}'; then
  fail "only a 403 is the license gate"
else
  pass
fi

printf '%d passed, %d failed\n' "${passes}" "${failures}"
[[ ${failures} -eq 0 ]]
