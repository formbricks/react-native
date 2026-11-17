#!/usr/bin/env bash
# Waits for another job of this workflow run to upload an artifact, then unpacks it.
# Usage: await-artifact.sh <artifact-name> <out-dir> [timeout-seconds, default 900]
# Env: GH_TOKEN (needs actions: read), GITHUB_REPOSITORY, GITHUB_RUN_ID (set on every runner).
# Artifacts from actions/upload-artifact v4+ are listed by the REST API as soon as their upload
# step finishes, while the run is still in progress.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

name="${1:?usage: await-artifact.sh <artifact-name> <out-dir> [timeout-seconds]}"
out_dir="${2:?usage: await-artifact.sh <artifact-name> <out-dir> [timeout-seconds]}"
timeout="${3:-900}"
: "${GITHUB_REPOSITORY:?}" "${GITHUB_RUN_ID:?}" "${GH_TOKEN:?GH_TOKEN must allow actions: read}"

log "Waiting up to ${timeout}s for artifact ${name}"
deadline=$((SECONDS + timeout))
until id="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?name=${name}&per_page=100" 2>/dev/null | artifact_id "${name}")"; do
  ((SECONDS < deadline)) || die "artifact ${name} did not appear within ${timeout}s"
  sleep 10
done

zip_file="$(mktemp)"
trap 'rm -f "${zip_file}"' EXIT
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${id}/zip" >"${zip_file}"
mkdir -p "${out_dir}"
unzip -o -q "${zip_file}" -d "${out_dir}"
log "Artifact ${name} (id ${id}) is in ${out_dir}: $(ls "${out_dir}")"
