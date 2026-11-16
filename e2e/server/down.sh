#!/usr/bin/env bash
# Stops the stack and deletes its volumes. With a directory argument, first saves each service's
# logs there (for a CI artifact).
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if [[ $# -gt 0 ]]; then
  mkdir -p "$1"
  compose ps --all >"$1/ps.txt" 2>&1 || true
  for service in $(compose config --services); do
    compose logs --no-color --timestamps "${service}" >"$1/${service}.log" 2>&1 || true
  done
fi
compose down --volumes --remove-orphans
