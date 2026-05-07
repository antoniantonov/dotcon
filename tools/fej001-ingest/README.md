# fej001-ingest

Streaming Go ingester that loads `data/raw/fej001.json` (UNESCO‑style "Killed Journalists" dataset, 1,860 records) into Neo4j using the schema in `docs/neo4j-killed-journalists-proposal.md`.

## Why Go

The backend is being migrated to Go; this tool is in Go to stay consistent with that direction. It is intentionally kept as a standalone CLI in `tools/` so it can be rewritten or merged into the backend later without disturbing the rest of the repo.

## Build and run

```bash
cd tools/fej001-ingest
go build ./...

# Dry run — parses every record and maps it to Cypher params, but does not write to Neo4j.
go run . -input ../../data/raw/fej001.json -dry-run

# Real ingest against the local Neo4j started by docker-compose.
go run . \
  -input ../../data/raw/fej001.json \
  -uri bolt://localhost:7687 \
  -user neo4j \
  -password local-password \
  -batch 200
```

Flags:

| Flag | Default | Notes |
|---|---|---|
| `-input` | `data/raw/fej001.json` | Path to the JSON file. |
| `-uri` | `bolt://localhost:7687` | Neo4j Bolt URI. |
| `-user` | `$NEO4J_USER` or `neo4j` | |
| `-password` | `$NEO4J_PASSWORD` or `local-password` | |
| `-database` | `neo4j` | |
| `-batch` | `200` | Records per `UNWIND … MERGE` write transaction. |
| `-dry-run` | `false` | Skip all Neo4j writes. |

## What it does

1. Streams the JSON array via `json.Decoder` (one record at a time — the file is one ~7 MB line).
2. Best‑effort parses the four Python‑repr string fields (`description_en`, `dg_request`, `state_response`, `state_acknowledgements`). Parse failures are counted and logged at the end; they do not abort the run.
3. Deduplicates country boundaries (`country_geometry`): the GeoJSON for a country is attached to the `Location:Country` node only the first time that country is seen.
4. Creates `IF NOT EXISTS` constraints for the new sub‑labels (`Journalist`, `Killing`, `Country`, `Region`, `Point`, `EnquiryStatus`) at startup, in addition to the parent‑label constraints already in `db/neo4j/init/01-constraints.cypher`.
5. Writes one batch per N records using a single `UNWIND $batch AS row …` Cypher script. Re‑runs are idempotent thanks to `MERGE` on stable `id` properties.

## Verifying after ingest

```cypher
MATCH (k:Killing) RETURN count(k);
MATCH (k:Killing)-[:OCCURRED_IN]->(c:Country)
RETURN c.iso_a2, count(k) AS killings ORDER BY killings DESC LIMIT 10;
```
