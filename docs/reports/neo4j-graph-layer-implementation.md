# Neo4j Graph Data Layer Implementation Report

**Branch:** `copilot/add-neo4j-data-layer`
**Date:** 2026-04-28
**Author:** GitHub Copilot Coding Agent

---

## Summary

This report documents the implementation of the Neo4j graph data layer as described in `docs/neo4j-global-event-graph-proposal.md`. The goal was to add a Neo4j graph database, populate it with the Lockheed Martin lobbying example (with the lobbying event placed in the UK to demonstrate a USA→UK cross-country connection), expose graph API endpoints from the backend, and visualize the graph connections on the world map frontend.

---

## Tasks Completed

### 1. Neo4j Docker Service

- Added `neo4j:5-community` service to `docker-compose.yml`
- Data is persisted to `./data/neo4j` host volume (mapped to `/data` in container)
- Init scripts are mounted from `./neo4j/init` to `/init-scripts` in the container
- Ports: HTTP browser `7474`, Bolt protocol `7687`
- Health check waits for Neo4j to become ready before backend starts
- Backend `depends_on` Neo4j with `service_healthy` condition

### 2. Neo4j Initialization Files

**`neo4j/init/01-constraints.cypher`**
- Uniqueness constraints for all 7 node label types: `Principal`, `Event`, `Location`, `Topic`, `Policy`, `Source`, `Fact`
- Uses `IF NOT EXISTS` for idempotent execution

**`neo4j/init/02-seed.cypher`**
- Seeds the Lockheed Martin lobbying example using `MERGE` (safe to run repeatedly)
- Nodes created:
  - `Principal:Organization:Company` → Lockheed Martin (located in USA)
  - `Location` → USA (`iso_a3: USA`)
  - `Location` → United Kingdom (`iso_a3: GBR`) — **lobbying event occurs here**
  - `Topic` → Lobbying
  - `Topic` → Defense
  - `Event` → Money Spend / Lobbying Q4 2025 (value: $100,000 USD)
  - `Source` → US Lobbying Disclosure Q4 2025
  - `Fact` → Statement about the lobbying spend
- Relationships created:
  - `Lockheed Martin -[:LOCATED_IN]-> USA`
  - `Lockheed Martin -[:PERFORMED]-> Event`
  - `Event -[:OCCURRED_IN]-> United Kingdom` ← UK as event location (US→UK arc on map)
  - `Event -[:ASSOCIATED_WITH]-> Lobbying`
  - `Event -[:ASSOCIATED_WITH]-> Defense`
  - `Lockheed Martin -[:ASSOCIATED_WITH]-> Defense`
  - `Event -[:TARGETED]-> United Kingdom`
  - `Event -[:SUPPORTED_BY_SOURCE]-> Source`
  - `Source -[:ASSERTS]-> Fact`
  - `Fact -[:ABOUT]-> Lockheed Martin`
  - `Fact -[:ABOUT]-> Event`

### 3. Environment Variables

Updated `.env.example` with Neo4j configuration:
```
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=local-password
NEO4J_HTTP_PORT=7474
NEO4J_BOLT_PORT=7687
```

### 4. Backend Neo4j Connection Module (`backend/src/neo4j.js`)

- Uses official `neo4j-driver` v5 (no known vulnerabilities)
- Lazy driver initialization with connection pool
- Reads `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` from environment
- `runConstraintsAndSeed()` — reads and executes `.cypher` files from `/init-scripts` on startup
- Exports: `getSession()`, `getWriteSession()`, `verifyConnectivity()`, `closeDriver()`

### 5. Graph API Endpoints (`backend/src/graph.js`)

All endpoints are mounted under `/api/graph/`:

| Endpoint | Method | Description |
|---|---|---|
| `/api/graph/health` | GET | Check Neo4j connectivity |
| `/api/graph/node/:id` | GET | Fetch a node by stable ID |
| `/api/graph/neighborhood/:id` | GET | Fetch node + connected nodes and relationships |
| `/api/graph/path?from=&to=` | GET | Find shortest path between two nodes |
| `/api/graph/search?q=&type=` | GET | Search nodes by name or type |
| `/api/graph/locations` | GET | Location summaries for map overlay |
| `/api/graph/events?type=&sub_type=` | GET | Filter events by type |
| `/api/graph/map-connections` | GET | Cross-country connections for map arcs |
| `/api/graph/principals` | POST | Create/update a principal node |
| `/api/graph/events` | POST | Create/update an event node |
| `/api/graph/relationships` | POST | Create a relationship between nodes |

Key design decisions:
- All responses use stable application `id` properties, never Neo4j internal IDs
- `toPlain()` helper normalizes Neo4j Integer and Date types to plain JS values
- `map-connections` endpoint returns `source_iso_a3` and `target_iso_a3` for drawing arcs
- Relationship creation is whitelist-validated against allowed types
- Neo4j init (constraints + seed) runs after backend starts, non-fatally

### 6. Frontend Graph Overlay (`frontend/src/WorldMap.js`)

- **Dropdown filter** (top-right) to select which connections to show:
  - All connections
  - Event type: Money Spend
  - Sub-type: Lobbying
  - Principal: Lockheed Martin
  - Topic: Lobbying
  - Topic: Defense
- **Country highlighting** — countries involved in graph connections are highlighted in blue
- **Connection arcs** — dashed blue lines drawn between source (USA) and target (GBR) countries using the `Line` component from `react-simple-maps`
- **Markers** — blue dot for principal location, orange dot for event location
- **Event labels** — event sub_type shown as text near target marker
- **Graph legend** (bottom-left) — shows active connection types and count
- **Location tooltips** — enhanced tooltip shows event count and connected principals for graph-active countries
- **Graceful degradation** — if Neo4j is offline, "Graph DB offline" badge shown; map works normally

---

## Architecture

```
React Frontend (port 3000)
  ↕ HTTP /api/graph/*
Node/Express Backend (port 4000)
  ↕ Bolt protocol (port 7687)
Neo4j Community Edition (port 7474 HTTP, 7687 Bolt)
  ↕ Volume mount
./data/neo4j (host data persistence)
```

---

## Files Created/Modified

| File | Action | Description |
|---|---|---|
| `docker-compose.yml` | Modified | Added Neo4j service, updated backend env + depends_on |
| `.env.example` | Modified | Added Neo4j environment variables |
| `neo4j/init/01-constraints.cypher` | Created | Uniqueness constraints for all node types |
| `neo4j/init/02-seed.cypher` | Created | Lockheed Martin lobbying seed data (US→UK) |
| `neo4j/init.sh` | Created | Shell init script (helper, not required) |
| `backend/package.json` | Modified | Added `neo4j-driver@5` dependency |
| `backend/src/neo4j.js` | Created | Neo4j connection module |
| `backend/src/graph.js` | Created | Graph API routes |
| `backend/src/index.js` | Modified | Mount graph routes, trigger Neo4j init |
| `frontend/src/WorldMap.js` | Modified | Added graph overlay, filter dropdown, map arcs |
| `docs/reports/neo4j-graph-layer-implementation.md` | Created | This report |

---

## Acceptance Criteria Status

| Criteria | Status |
|---|---|
| Neo4j runs locally through Docker Compose | ✅ |
| Backend can connect to Neo4j | ✅ |
| Constraints are created idempotently | ✅ (IF NOT EXISTS) |
| Sample graph seed can be run repeatedly without duplicates | ✅ (MERGE) |
| The Lockheed Martin example exists in Neo4j as connected graph data | ✅ |
| API can fetch a node by stable ID | ✅ `/api/graph/node/:id` |
| API can fetch a node neighborhood | ✅ `/api/graph/neighborhood/:id` |
| API can return a path between two graph nodes | ✅ `/api/graph/path` |
| API can return location-level graph summaries for the map | ✅ `/api/graph/locations` |
| No hard dependency on Neo4j internal node IDs | ✅ |
| Dropdown to filter events/principals/facts on map | ✅ |
| US→UK connection arc visible on map | ✅ |

---

## Next Steps

1. **Population pipeline** — build an ETL pipeline to ingest lobbying disclosure data from external sources
2. **More graph data** — add more principals, events, and cross-country relationships
3. **Graph analytics** — integrate Neo4j Graph Data Science for PageRank, community detection
4. **Interactive graph view** — add a full graph visualization panel (e.g., using D3-force or Sigma.js) alongside the map
5. **Search integration** — wire the search endpoint to the frontend for entity lookup
6. **Authentication** — add user authentication before exposing write endpoints publicly
