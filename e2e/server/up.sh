#!/usr/bin/env bash
# Boots the Formbricks server under test and bootstraps the E2E tenant.
#   1. docker compose up --wait: Postgres, Valkey, SpiceDB, Formbricks (migrates itself on boot)
#   2. formbricks-authzed upgrade prepare: applies the SpiceDB schema (nothing else does)
#   3. bootstrap.sql: Organization, Workspace, Language, attribute keys, ApiKey, ApiKeyWorkspace
#   4. formbricks-authzed outbox drain + status: projects those rows into SpiceDB
#   5. GET /api/v1/management/me: the API key works
# Env: FORMBRICKS_VERSION (image tag, default latest), ENTERPRISE_LICENSE_KEY (optional here).
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

export FORMBRICKS_VERSION="${FORMBRICKS_VERSION:-latest}"
if [[ -z "${ENTERPRISE_LICENSE_KEY:-}" ]]; then
  printf '::warning::%s\n' "ENTERPRISE_LICENSE_KEY is empty: the server boots without Enterprise features and seeding stops at the license gate."
fi

log "Starting ghcr.io/formbricks/formbricks:${FORMBRICKS_VERSION} with Postgres, Valkey and SpiceDB"
compose pull --quiet
if ! compose up --detach --wait --wait-timeout 420; then
  compose ps --all >&2 || true
  compose logs --no-color --tail 200 formbricks >&2 || true
  die "the server stack did not become healthy"
fi
log "Server is healthy: $(compose exec -T formbricks node -e "console.log(require('/home/nextjs/apps/web/package.json').version)" 2>/dev/null || echo 'version unknown')"

log "Applying the SpiceDB schema"
authzed_expect prepared upgrade prepare

log "Inserting the E2E tenant"
psql_exec -f - <"${E2E_SERVER_DIR}/bootstrap.sql"

log "Projecting the tenant into SpiceDB"
authzed_expect drained outbox drain
authzed_expect healthy outbox status

log "Checking the API key"
api_ok GET /api/v1/management/me | jq -c '{id, workspace}'
log "Server ready at ${FORMBRICKS_URL}, workspace ${E2E_WORKSPACE_ID}"
