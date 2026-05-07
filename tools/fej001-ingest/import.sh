#!/usr/bin/env bash
# tools/fej001-ingest/import.sh
#
# Build the fej001-ingest Go binary and run it against the local Neo4j
# (the one started by docker-compose at the repo root).
#
# Usage:
#   ./tools/fej001-ingest/import.sh                  # build + ingest
#   ./tools/fej001-ingest/import.sh --dry-run        # build + parse-only
#   NEO4J_URI=bolt://otherhost:7687 ./import.sh      # override target

set -euo pipefail

# Resolve paths relative to this script so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BIN="$SCRIPT_DIR/fej001-ingest"
INPUT="${INPUT:-$REPO_ROOT/data/raw/fej001.json}"

NEO4J_URI="${NEO4J_URI:-bolt://localhost:${NEO4J_BOLT_PORT:-7687}}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-local-password}"
NEO4J_DATABASE="${NEO4J_DATABASE:-neo4j}"
BATCH="${BATCH:-200}"

EXTRA_FLAGS=()
for arg in "$@"; do
  EXTRA_FLAGS+=("$arg")
done

log() { printf '\033[1;36m[import.sh]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[import.sh ERROR]\033[0m %s\n' "$*" >&2; }

log "================================================================"
log " fej001-ingest — import journalist killings into Neo4j"
log "================================================================"
log "repo root      : $REPO_ROOT"
log "input file     : $INPUT"
log "Neo4j URI      : $NEO4J_URI"
log "Neo4j user     : $NEO4J_USER"
log "Neo4j database : $NEO4J_DATABASE"
log "batch size     : $BATCH"
log "extra flags    : ${EXTRA_FLAGS[*]:-(none)}"
log

if [[ ! -f "$INPUT" ]]; then
  err "input file not found: $INPUT"
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  err "go is not installed or not on PATH"
  exit 1
fi

log "[1/3] building Go binary -> $BIN"
( cd "$SCRIPT_DIR" && go build -o "$BIN" ./... )
log "  ✓ build complete ($(du -h "$BIN" | awk '{print $1}'))"
log

log "[2/3] running ingester"
log "----------------------------------------------------------------"
"$BIN" \
  -input "$INPUT" \
  -uri "$NEO4J_URI" \
  -user "$NEO4J_USER" \
  -password "$NEO4J_PASSWORD" \
  -database "$NEO4J_DATABASE" \
  -batch "$BATCH" \
  ${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"}
status=$?
log "----------------------------------------------------------------"

if [[ $status -ne 0 ]]; then
  err "ingester exited with status $status"
  exit $status
fi

log "[3/3] ✓ ingest finished successfully"
log "Open Neo4j Browser at http://localhost:${NEO4J_HTTP_PORT:-7474} (user: $NEO4J_USER) to explore."
