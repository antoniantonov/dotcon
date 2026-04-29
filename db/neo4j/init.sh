#!/bin/bash
# Neo4j initialization script - runs constraints and seed data on first startup
# This script is executed by the custom Neo4j entrypoint

set -e

NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="${NEO4J_AUTH%%/*}"
NEO4J_PASSWORD="${NEO4J_AUTH##*/}"

INIT_DIR="/init-scripts"
MARKER_FILE="/data/databases/.neo4j_initialized"

if [ -f "$MARKER_FILE" ]; then
  echo "Neo4j already initialized, skipping seed."
  exit 0
fi

echo "Waiting for Neo4j to be ready..."
for i in $(seq 1 30); do
  if cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "RETURN 1" >/dev/null 2>&1; then
    echo "Neo4j is ready."
    break
  fi
  echo "Waiting... ($i/30)"
  sleep 2
done

for script in $(ls "$INIT_DIR"/*.cypher | sort); do
  echo "Running $script..."
  cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" --file "$script"
done

touch "$MARKER_FILE"
echo "Neo4j initialization complete."
