# Neo4j Global Event Graph Proposal

## Objective

Design a local Neo4j-backed graph model for representing global events, facts, principals, locations, sources, and relationships between them.

The goal is to support:

- cyclical relationships between entities and events
- connection discovery between global actors
- temporal analysis
- provenance and source tracking
- graph analytics and machine learning later
- visual exploration on the global map

This proposal intentionally focuses only on **Neo4j** as the graph store.

---

## Recommended Database

Use **Neo4j Community Edition locally** as the graph database.

Neo4j is a good fit because:

- it stores relationships as first-class data
- cyclical graph structures are natural
- Cypher queries are expressive for graph traversal
- it supports rich node and relationship properties
- it has a mature graph analytics ecosystem
- Neo4j Graph Data Science can later support algorithms such as:
  - PageRank
  - community detection
  - node similarity
  - link prediction
  - centrality analysis
  - shortest paths
  - graph embeddings

Recommended local architecture:

```text
React frontend
        |
Node/Express API
        |
Neo4j Community Edition
```

PostgreSQL may remain in the project for current application data, but this proposal covers only the Neo4j graph model and related API design.

---

## Domain Model

The data should be modeled as a **temporal property graph**.

In this model:

- important objects are represented as **nodes**
- relationships between objects are represented as **edges**
- both nodes and edges can have properties
- time ranges can exist on nodes, edges, and events
- source/provenance data is represented directly in the graph

Example conceptual loop:

```text
Lockheed Martin
  -> performed
Money Spend / Lobbying Event
  -> occurred in
USA
  -> location of
Lockheed Martin
```

This kind of cycle is expected and useful.

---

## Core Node Labels

### `Principal`

Represents an actor that can perform, receive, influence, target, own, fund, or participate in something.

Examples:

- Lockheed Martin
- Raytheon
- US Department of Defense
- a lobbying firm
- a government official
- a political organization

Recommended labels may be combined:

```text
(:Principal:Organization:Company)
(:Principal:GovernmentAgency)
(:Principal:Person)
```

Recommended properties:

```json
{
  "id": "principal:lockheed_martin",
  "name": "Lockheed Martin",
  "principal_type": "Company",
  "industry": "Defense",
  "country": "USA",
  "valid_from": "1989-10-01",
  "valid_to": null,
  "aliases": ["Lockheed", "Lockheed Martin Corp"],
  "external_ids": {},
  "metadata": {}
}
```

Use `valid_to: null` to represent an active/current entity.

---

### `Event`

Represents an action, occurrence, or observable activity.

Examples:

- Money Spend
- Lobbying
- Contract Award
- Donation
- Sanction
- Meeting
- Policy Change
- Arms Sale
- Acquisition
- Lawsuit

Recommended properties:

```json
{
  "id": "event:money_spend:lockheed:lobbying:2025q4",
  "event_type": "Money Spend",
  "sub_type": "Lobbying",
  "value": 100000,
  "currency": "USD",
  "period_from": "2025-10-01",
  "period_to": "2025-12-31",
  "confidence": 0.95,
  "metadata": {}
}
```

Events should be the primary place to store event-specific values like amount, currency, event type, and event time period.

---

### `Location`

Represents geographic or political locations.

Examples:

- USA
- Bulgaria
- Washington DC
- European Union
- Middle East

Recommended properties:

```json
{
  "id": "location:usa",
  "name": "USA",
  "location_type": "Country",
  "iso_a2": "US",
  "iso_a3": "USA",
  "latitude": null,
  "longitude": null,
  "metadata": {}
}
```

Locations can represent countries, cities, regions, organizations of states, or custom geopolitical areas.

---

### `Topic`

Represents themes, policy areas, industries, or subjects connected to events.

Examples:

- Lobbying
- Defense
- Missile systems
- F-35
- Export control
- Ukraine aid
- Military procurement

Recommended properties:

```json
{
  "id": "topic:lobbying",
  "name": "Lobbying",
  "category": "Political Influence",
  "metadata": {}
}
```

Topics are useful for clustering, filtering, recommendations, and graph analytics.

---

### `Policy`

Represents a bill, regulation, government policy, procurement program, executive action, or legal framework.

Examples:

- F-35 Procurement Program
- Foreign Military Financing
- Export Control Reform
- Ukraine Security Assistance Initiative

Recommended properties:

```json
{
  "id": "policy:f35_procurement",
  "name": "F-35 Procurement Program",
  "policy_type": "Procurement Program",
  "jurisdiction": "USA",
  "valid_from": null,
  "valid_to": null,
  "metadata": {}
}
```

---

### `Source`

Represents where a claim, event, or relationship came from.

Examples:

- lobbying disclosure
- government filing
- SEC filing
- procurement record
- news article
- manually curated dataset

Recommended properties:

```json
{
  "id": "source:us_lobbying_disclosure:2025q4",
  "name": "US Lobbying Disclosure Q4 2025",
  "source_type": "Government Filing",
  "url": "local-or-external-reference",
  "retrieved_at": "2026-04-28",
  "published_at": null,
  "metadata": {}
}
```

Source nodes are important for explainability and trust.

---

### `Fact`

Represents a specific claim or assertion.

A `Fact` node is useful when:

- multiple sources support the same claim
- sources disagree
- confidence scoring is needed
- provenance should be preserved independently from events

Recommended properties:

```json
{
  "id": "fact:lockheed_spent_100k_lobbying_2025q4",
  "statement": "Lockheed Martin spent 100000 USD on lobbying from 2025-10 to 2025-12",
  "confidence": 0.95,
  "created_at": "2026-04-28T00:00:00Z",
  "metadata": {}
}
```

---

## Core Relationship Types

Relationship names should be controlled and consistent. Avoid unlimited free-form relationship types because that makes analytics harder later.

### `PERFORMED`

Connects a principal to an event it performed.

```text
(:Principal)-[:PERFORMED]->(:Event)
```

Example properties:

```json
{
  "role": "spender",
  "period_from": "2025-10-01",
  "period_to": "2025-12-31",
  "confidence": 0.95
}
```

---

### `PARTICIPATED_IN`

Connects a principal to an event it participated in without necessarily being the main actor.

```text
(:Principal)-[:PARTICIPATED_IN]->(:Event)
```

Example roles:

- attendee
- recipient
- intermediary
- advisor
- contractor
- target

---

### `OCCURRED_IN`

Connects an event to a location.

```text
(:Event)-[:OCCURRED_IN]->(:Location)
```

---

### `LOCATED_IN`

Connects a principal to a location.

```text
(:Principal)-[:LOCATED_IN]->(:Location)
```

Example properties:

```json
{
  "period_from": "1989-10-01",
  "period_to": null,
  "confidence": 1.0
}
```

---

### `ASSOCIATED_WITH`

Connects events, principals, policies, or facts to topics.

```text
(:Event)-[:ASSOCIATED_WITH]->(:Topic)
(:Principal)-[:ASSOCIATED_WITH]->(:Topic)
(:Policy)-[:ASSOCIATED_WITH]->(:Topic)
```

---

### `TARGETED`

Connects an event to the principal, policy, topic, or location it targeted.

```text
(:Event)-[:TARGETED]->(:Principal)
(:Event)-[:TARGETED]->(:Policy)
(:Event)-[:TARGETED]->(:Topic)
(:Event)-[:TARGETED]->(:Location)
```

Useful for lobbying, sanctions, military actions, media campaigns, and influence operations.

---

### `FUNDED`

Connects a principal to another principal, event, policy, or organization that received funding.

```text
(:Principal)-[:FUNDED]->(:Principal)
(:Principal)-[:FUNDED]->(:Event)
```

Recommended properties:

```json
{
  "value": 100000,
  "currency": "USD",
  "period_from": "2025-10-01",
  "period_to": "2025-12-31",
  "confidence": 0.95
}
```

---

### `RECEIVED_FUNDS`

Connects an event or principal to a funding recipient when the direction should be explicit.

```text
(:Event)-[:RECEIVED_FUNDS]->(:Principal)
```

---

### `CONTRACTED_WITH`

Connects two principals involved in a contract relationship.

```text
(:Principal)-[:CONTRACTED_WITH]->(:Principal)
```

Recommended properties:

```json
{
  "contract_id": "optional-local-id",
  "value": 5000000,
  "currency": "USD",
  "period_from": "2025-01-01",
  "period_to": "2025-12-31",
  "confidence": 0.9
}
```

---

### `SUPPORTED_BY_SOURCE`

Connects an event, fact, or relationship-bearing node to a source.

```text
(:Event)-[:SUPPORTED_BY_SOURCE]->(:Source)
(:Fact)-[:SUPPORTED_BY_SOURCE]->(:Source)
```

---

### `ASSERTS`

Connects a source to a fact it asserts.

```text
(:Source)-[:ASSERTS]->(:Fact)
```

---

### `ABOUT`

Connects a fact to the things it is about.

```text
(:Fact)-[:ABOUT]->(:Principal)
(:Fact)-[:ABOUT]->(:Event)
(:Fact)-[:ABOUT]->(:Topic)
(:Fact)-[:ABOUT]->(:Policy)
(:Fact)-[:ABOUT]->(:Location)
```

---

### `RELATED_TO`

A generic fallback relationship for curated connections that do not yet have a more specific relationship type.

Use sparingly.

```text
(:Principal)-[:RELATED_TO]->(:Principal)
(:Event)-[:RELATED_TO]->(:Event)
(:Topic)-[:RELATED_TO]->(:Topic)
```

Recommended properties:

```json
{
  "relationship_category": "curated",
  "description": "short explanation",
  "confidence": 0.75
}
```

---

## Temporal Modeling

Time is central to this graph.

Use real dates instead of strings like `Now`.

Recommended convention:

- active/current end date: `null`
- known start date: `valid_from` or `period_from`
- known end date: `valid_to` or `period_to`
- date learned by system: `observed_at`
- ingestion timestamp: `created_at`
- update timestamp: `updated_at`

Use these fields consistently:

### Entity validity

Use on principals, policies, locations, and long-lived concepts.

```json
{
  "valid_from": "1989-10-01",
  "valid_to": null
}
```

### Event period

Use on events and event-like relationships.

```json
{
  "period_from": "2025-10-01",
  "period_to": "2025-12-31"
}
```

### Observation and ingestion

Use for provenance and auditability.

```json
{
  "observed_at": "2026-04-28T00:00:00Z",
  "created_at": "2026-04-28T00:00:00Z",
  "updated_at": "2026-04-28T00:00:00Z"
}
```

---

## Example: Money Spend / Lobbying Event

Input data:

```yaml
EventType: Money Spend
SubType: Lobbying
Value: 100000
TimePeriod: 10/2025-12/2025

Who did it:
Principal: Lockheed Martin
Location: USA
TimePeriod: 10/1989-Now
```

Graph representation:

```text
(:Principal:Organization:Company {
  id: "principal:lockheed_martin",
  name: "Lockheed Martin",
  principal_type: "Company",
  industry: "Defense",
  valid_from: "1989-10-01",
  valid_to: null
})

(:Location {
  id: "location:usa",
  name: "USA",
  location_type: "Country",
  iso_a2: "US",
  iso_a3: "USA"
})

(:Event {
  id: "event:money_spend:lockheed:lobbying:2025q4",
  event_type: "Money Spend",
  sub_type: "Lobbying",
  value: 100000,
  currency: "USD",
  period_from: "2025-10-01",
  period_to: "2025-12-31",
  confidence: 0.95
})

(:Topic {
  id: "topic:lobbying",
  name: "Lobbying",
  category: "Political Influence"
})
```

Relationships:

```text
(:Principal {id: "principal:lockheed_martin"})
  -[:LOCATED_IN {
    period_from: "1989-10-01",
    period_to: null,
    confidence: 1.0
  }]->
(:Location {id: "location:usa"})

(:Principal {id: "principal:lockheed_martin"})
  -[:PERFORMED {
    role: "spender",
    confidence: 0.95
  }]->
(:Event {id: "event:money_spend:lockheed:lobbying:2025q4"})

(:Event {id: "event:money_spend:lockheed:lobbying:2025q4"})
  -[:OCCURRED_IN]->
(:Location {id: "location:usa"})

(:Event {id: "event:money_spend:lockheed:lobbying:2025q4"})
  -[:ASSOCIATED_WITH]->
(:Topic {id: "topic:lobbying"})
```

---

## Implementation Guidance

### 1. Add Neo4j to local Docker Compose

Add a local Neo4j service using the community image.

Recommended local ports:

- HTTP browser: `7474`
- Bolt protocol: `7687`

Recommended environment variables:

```text
NEO4J_AUTH=neo4j/local-password
```

Use a local Docker volume for Neo4j data.

---

### 2. Add backend Neo4j connection

Use the official Neo4j JavaScript driver in the Node/Express backend.

Backend configuration should read from environment variables:

```text
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=local-password
```

The backend should own all graph writes and reads. The frontend should not connect directly to Neo4j.

---

### 3. Add graph API endpoints

Initial API endpoints can be simple and local-first.

Recommended endpoints:

```text
GET  /api/graph/health
POST /api/graph/principals
POST /api/graph/events
POST /api/graph/relationships
GET  /api/graph/node/:id
GET  /api/graph/neighborhood/:id
GET  /api/graph/path
GET  /api/graph/search
```

Suggested behavior:

- `GET /api/graph/health` checks Neo4j connectivity.
- `POST /api/graph/principals` creates or updates a principal.
- `POST /api/graph/events` creates or updates an event.
- `POST /api/graph/relationships` creates a relationship between existing nodes.
- `GET /api/graph/node/:id` returns one graph node.
- `GET /api/graph/neighborhood/:id` returns connected nodes and relationships around one node.
- `GET /api/graph/path` finds paths between two nodes.
- `GET /api/graph/search` searches nodes by name, type, topic, or location.

---

### 4. Use stable application IDs

Each node should have a stable `id` property independent from Neo4j internal IDs.

Recommended ID patterns:

```text
principal:lockheed_martin
location:usa
topic:lobbying
policy:f35_procurement
event:money_spend:lockheed:lobbying:2025q4
source:us_lobbying_disclosure:2025q4
fact:lockheed_spent_100k_lobbying_2025q4
```

Do not rely on Neo4j internal node IDs for application logic.

---

### 5. Add uniqueness constraints

Create uniqueness constraints for node IDs.

Recommended Cypher:

```cypher
CREATE CONSTRAINT principal_id IF NOT EXISTS
FOR (n:Principal)
REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT event_id IF NOT EXISTS
FOR (n:Event)
REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT location_id IF NOT EXISTS
FOR (n:Location)
REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT topic_id IF NOT EXISTS
FOR (n:Topic)
REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT policy_id IF NOT EXISTS
FOR (n:Policy)
REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT source_id IF NOT EXISTS
FOR (n:Source)
REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT fact_id IF NOT EXISTS
FOR (n:Fact)
REQUIRE n.id IS UNIQUE;
```

---

### 6. Seed a small sample graph

Add a local seed script that creates:

- `Principal: Lockheed Martin`
- `Location: USA`
- `Topic: Lobbying`
- `Event: Money Spend / Lobbying / 2025 Q4`
- relationships between them

The seed should use `MERGE` so it is safe to run repeatedly.

Example Cypher:

```cypher
MERGE (lockheed:Principal:Organization:Company {id: "principal:lockheed_martin"})
SET lockheed.name = "Lockheed Martin",
    lockheed.principal_type = "Company",
    lockheed.industry = "Defense",
    lockheed.valid_from = date("1989-10-01"),
    lockheed.valid_to = null;

MERGE (usa:Location {id: "location:usa"})
SET usa.name = "USA",
    usa.location_type = "Country",
    usa.iso_a2 = "US",
    usa.iso_a3 = "USA";

MERGE (lobbying:Topic {id: "topic:lobbying"})
SET lobbying.name = "Lobbying",
    lobbying.category = "Political Influence";

MERGE (event:Event {id: "event:money_spend:lockheed:lobbying:2025q4"})
SET event.event_type = "Money Spend",
    event.sub_type = "Lobbying",
    event.value = 100000,
    event.currency = "USD",
    event.period_from = date("2025-10-01"),
    event.period_to = date("2025-12-31"),
    event.confidence = 0.95;

MERGE (lockheed)-[located:LOCATED_IN]->(usa)
SET located.period_from = date("1989-10-01"),
    located.period_to = null,
    located.confidence = 1.0;

MERGE (lockheed)-[performed:PERFORMED]->(event)
SET performed.role = "spender",
    performed.confidence = 0.95;

MERGE (event)-[:OCCURRED_IN]->(usa);
MERGE (event)-[:ASSOCIATED_WITH]->(lobbying);
```

---

## Map Integration

The global map can use graph data to show:

- events by location
- principals located in a country
- relationships between countries
- connections between principals across countries
- event counts by geography
- money flow between locations
- paths from one entity to another

Recommended frontend graph query shape:

```json
{
  "nodes": [
    {
      "id": "principal:lockheed_martin",
      "label": "Lockheed Martin",
      "type": "Principal",
      "properties": {}
    }
  ],
  "relationships": [
    {
      "id": "rel-local-id-or-generated-id",
      "source": "principal:lockheed_martin",
      "target": "event:money_spend:lockheed:lobbying:2025q4",
      "type": "PERFORMED",
      "properties": {}
    }
  ]
}
```

For map overlays, the backend can aggregate graph data into location summaries:

```json
{
  "location_id": "location:usa",
  "iso_a3": "USA",
  "event_count": 1,
  "total_money_spend": 100000,
  "top_topics": ["Lobbying"],
  "connected_principals": ["Lockheed Martin"]
}
```

---

## Analytics and ML Readiness

Store data in a way that supports later feature extraction.

Important node properties:

```json
{
  "name": "Lockheed Martin",
  "type": "Company",
  "industry": "Defense",
  "country": "USA",
  "aliases": ["Lockheed", "Lockheed Martin Corp"],
  "external_ids": {}
}
```

Important relationship properties:

```json
{
  "weight": 100000,
  "currency": "USD",
  "confidence": 0.95,
  "period_from": "2025-10-01",
  "period_to": "2025-12-31",
  "source_id": "source:us_lobbying_disclosure:2025q4"
}
```

Potential analytics:

- centrality: identify influential principals
- community detection: find clusters of actors and topics
- path finding: explain how two entities are connected
- temporal analysis: compare graph changes over time
- link prediction: identify likely missing connections
- anomaly detection: detect unusual money flows or relationship spikes
- embeddings: convert graph topology into vectors for ML pipelines

---

## Initial Implementation Tasks for Background Agent

1. Add local Neo4j service to Docker Compose.
2. Add Neo4j environment variables to local environment files.
3. Install official Neo4j JavaScript driver in the backend.
4. Add backend Neo4j connection module.
5. Add startup or seed script for Neo4j constraints.
6. Add sample graph seed data for the Lockheed Martin lobbying example.
7. Add graph API endpoints under `/api/graph/*`.
8. Add backend graph response normalization to return `{ nodes, relationships }`.
9. Add location aggregation endpoint for map overlays.
10. Add minimal frontend integration to request graph neighborhood or location summaries.

---

## Acceptance Criteria

The implementation is complete when:

- Neo4j runs locally through Docker Compose.
- Backend can connect to Neo4j.
- Constraints are created idempotently.
- Sample graph seed can be run repeatedly without duplicates.
- The Lockheed Martin example exists in Neo4j as connected graph data.
- API can fetch a node by stable ID.
- API can fetch a node neighborhood.
- API can return a path between two graph nodes.
- API can return location-level graph summaries for the map.
- No hard dependency on Neo4j internal node IDs exists in application logic.
