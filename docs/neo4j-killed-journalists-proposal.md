# Neo4j Schema Proposal — Killed Journalists (UNESCO‑style data)

## Objective

Model the 1,860 records in `data/raw/fej001.json` (see `docs/fej001-json-schema.md`) as a temporal property graph in Neo4j, **using the vocabulary defined in `docs/neo4j-global-event-graph-proposal.md`**, so that:

- killings render on the global map (per country, per point);
- each killing can later be linked to **other events** (lobbying, sanctions, lawsuits, contracts, donations, policy changes…) using the same `Event` label and the same set of relationship types;
- judicial follow‑up evolves over time without rewriting the killing event itself;
- provenance (UNESCO DG condemnations, Member‑State responses) is first‑class.

This proposal is additive: it introduces sub‑labels (`Journalist`, `Killing`, `Country`, `Region`, `Point`, `EnquiryStatus`) and one new edge name (`TARGETED_BY`) on top of the existing model. All other node labels and relationship names are unchanged.

---

## Node labels

### `Principal:Person:Journalist` (one per record)

```text
(:Principal:Person:Journalist)
```

| Property | Source field | Notes |
|---|---|---|
| `id` | `principal:journalist:<uuid>` | Stable ID. |
| `name` | `title_en` | Display name. |
| `gender` | `gender` | `Male` / `Female`. |
| `age` | `age` | Nullable. |
| `staff_type` | `staff` | `Staff` / `Freelancer` / `Not indicated`. |
| `local_or_foreign` | `local` | `Local` / `Foreign`. |
| `media_type` | `media` | `Print` / `TV` / `Radio` / `Online` / `Cross-platform`. |
| `nationalities` | `nationality` | Array of strings. |
| `valid_from` | `date` | Date of death — both lifecycle endpoints map to this date because we only know the death date, not birth. |
| `valid_to` | `date` | Same as `valid_from`. |
| `external_ids` | `{ fej_id, uuid, documentid }` | Map. |

### `Event:Killing` (one per record)

```text
(:Event:Killing)
```

| Property | Source field | Notes |
|---|---|---|
| `id` | `event:killing:<uuid>` | Stable ID, derived from journalist `uuid`. |
| `event_type` | `"Killing"` | Constant. |
| `sub_type` | `"Journalist"` | Constant. |
| `period_from` | `date` | |
| `period_to` | `date` | Same instant. |
| `area_coverage` | `area_coverage` | Nullable. |
| `in_conflict_zone` | `conflict_zone` | Coerced `"True"`/`"False"` → bool. |
| `conflict_zone_label` | `conflict_zone_calc` | Human label. |
| `media_type` | `media` | Duplicated for query convenience. |
| `latitude` / `longitude` | `coordinates.lat` / `.lon` | Nullable. |
| `confidence` | `1.0` | Constant — UNESCO‑recorded. |

### `Location:Country`

```text
(:Location:Country)
```

| Property | Source field |
|---|---|
| `id` | `location:country:<iso2_lower>` |
| `name` | `country_title_en` |
| `iso_a2` | `countries` / `calc_country_code` |
| `country_uuid` | `country_uuid` |
| `regional_group` | `country_regional_group` |
| `geojson` | `country_geometry` (stored once per country, as a JSON string) |

### `Location:Region`

```text
(:Location:Region)
```

| Property | Source field |
|---|---|
| `id` | `location:region:<slug>` |
| `name` | `country_regional_group` |

### `Location:Point` *(optional, used for map pins finer than country)*

```text
(:Location:Point)
```

| Property | Source field |
|---|---|
| `id` | `location:point:<lon>:<lat>` |
| `latitude` | `coordinates.lat` |
| `longitude` | `coordinates.lon` |

### `Topic`

Derived. One node per distinct value across the dataset:

| Topic | id | Source |
|---|---|---|
| Press freedom | `topic:press_freedom` | constant — every killing |
| Journalism (per medium) | `topic:media:print`, `topic:media:tv`, `topic:media:radio`, `topic:media:online`, `topic:media:cross_platform` | `media` |
| Area coverage | `topic:area_coverage:<slug>` | `area_coverage` (e.g. `crime`, `corruption`, `environment`, `indigenous`, `conflict_and_crisis`, `other`) |
| Conflict zone | `topic:conflict_zone` | when `conflict_zone == True` |

### `Source`

One node per distinct URL (`text_2`) across `description_en`, `dg_request`, `state_response`, `state_acknowledgements`.

| Property | Source field |
|---|---|
| `id` | `source:url:<sha1(url)>` (or `source:unesco_dg:<id>` for `description_en` entries) |
| `name` | best‑effort label (e.g. `"UNESCO DG condemnation"`, `"Member State response 2017"`) |
| `source_type` | `UNESCO DG Condemnation` / `DG Request` / `State Response` / `State Acknowledgement` |
| `url` | `description_en.url` or `text_2` |
| `published_year` | `text_1` (when applicable) |
| `retrieved_at` | `updatedat` |

### `Fact:EnquiryStatus` (one per record)

Captures the judicial enquiry snapshot so it can evolve over time without rewriting the killing.

| Property | Source field |
|---|---|
| `id` | `fact:enquiry:<uuid>` |
| `status` | `enquiry_status` |
| `status_home` | `enquiry_status_home` |
| `status_min` | `enquiry_status_min` |
| `status_stat` | `enquiry_status_stat` |
| `resolution_year` | `date_resolution` |
| `observed_at` | `updatedat` |
| `confidence` | `1.0` |

---

## Relationships

| From | Edge | To | Properties | Notes |
|---|---|---|---|---|
| `:Journalist` | `LOCATED_IN` | `:Country` | `{role: "nationality", confidence}` | One per nationality string. |
| `:Killing` | `TARGETED` | `:Journalist` | — | Existing controlled vocab; victim is the target. |
| `:Journalist` | `TARGETED_BY` | `:Killing` | — | New convenience inverse so map queries can start from the journalist. |
| `:Killing` | `OCCURRED_IN` | `:Country` | — | From `countries` / `calc_country_code`. |
| `:Killing` | `OCCURRED_AT` | `:Point` | — | Optional, when `coordinates` present. |
| `:Country` | `PART_OF` | `:Region` | — | From `country_regional_group`. |
| `:Point` | `LOCATED_IN` | `:Country` | — | Optional. |
| `:Killing` | `ASSOCIATED_WITH` | `:Topic` | — | One per topic (press freedom, media type, area coverage, conflict zone). |
| `:Killing` | `SUPPORTED_BY_SOURCE` | `:Source` | `{role: "dg_condemnation" \| "dg_request" \| "state_response" \| "state_acknowledgement", year}` | One per parsed source URL. |
| `:Fact:EnquiryStatus` | `ABOUT` | `:Killing` | — | |
| `:Source` | `ASSERTS` | `:Fact:EnquiryStatus` | `{year}` | For every `state_response` URL. |

### Why `TARGETED_BY` is added

The existing proposal defines `TARGETED` as `(:Event)-[:TARGETED]->(:Principal)`. For killings the natural narrative starts from the victim ("show me the events that targeted this journalist"). `TARGETED_BY` is the explicit inverse with the same semantics; both edges are written to keep traversal in either direction cheap, and to keep `TARGETED` consistent with how it is used elsewhere in the graph (e.g. lobbying targets a policy).

---

## Constraints

Add to `db/neo4j/init/01-constraints.cypher` (the existing `principal_id`, `event_id`, `location_id`, `topic_id`, `source_id`, `fact_id` already cover the parent labels). New constraints for the sub‑labels:

```cypher
CREATE CONSTRAINT journalist_id IF NOT EXISTS
FOR (n:Journalist) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT killing_id IF NOT EXISTS
FOR (n:Killing) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT country_id IF NOT EXISTS
FOR (n:Country) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT region_id IF NOT EXISTS
FOR (n:Region) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT point_id IF NOT EXISTS
FOR (n:Point) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT enquiry_status_id IF NOT EXISTS
FOR (n:EnquiryStatus) REQUIRE n.id IS UNIQUE;
```

Spatial / index helpers (optional, useful for the map):

```cypher
CREATE INDEX killing_period_from IF NOT EXISTS FOR (n:Killing) ON (n.period_from);
CREATE INDEX country_iso_a2      IF NOT EXISTS FOR (n:Country) ON (n.iso_a2);
CREATE POINT INDEX point_geo     IF NOT EXISTS FOR (n:Point)   ON (n.location);
```

(If using a `point` property rather than separate lat/long, store it as `n.location = point({latitude: …, longitude: …})`.)

---

## Example: ingesting one record

Input record (abridged):

```json
{
  "id": 3216,
  "uuid": "f89ebf67-c844-49a1-ac2e-dc439a2d0877",
  "title_en": "Jacinto Hernández Torres",
  "date": "2016-06-13",
  "gender": "Male",
  "nationality": ["Mexican"],
  "media": "Radio",
  "staff": "Freelancer",
  "local": "Local",
  "conflict_zone": "False",
  "conflict_zone_calc": "Not a Conflict Zone",
  "countries": "MX",
  "country_title_en": "Mexico",
  "country_regional_group": "Latin America and the Caribbean",
  "coordinates": {"lon": -97.91, "lat": 22.25},
  "enquiry_status": "Ongoing/Unresolved"
}
```

Cypher (idempotent):

```cypher
MERGE (j:Principal:Person:Journalist {id: "principal:journalist:f89ebf67-c844-49a1-ac2e-dc439a2d0877"})
SET j.name = "Jacinto Hernández Torres",
    j.gender = "Male",
    j.nationalities = ["Mexican"],
    j.media_type = "Radio",
    j.staff_type = "Freelancer",
    j.local_or_foreign = "Local",
    j.valid_from = date("2016-06-13"),
    j.valid_to   = date("2016-06-13"),
    j.external_ids = {fej_id: 3216, uuid: "f89ebf67-c844-49a1-ac2e-dc439a2d0877"};

MERGE (k:Event:Killing {id: "event:killing:f89ebf67-c844-49a1-ac2e-dc439a2d0877"})
SET k.event_type = "Killing",
    k.sub_type   = "Journalist",
    k.period_from = date("2016-06-13"),
    k.period_to   = date("2016-06-13"),
    k.in_conflict_zone = false,
    k.conflict_zone_label = "Not a Conflict Zone",
    k.media_type = "Radio",
    k.latitude   = 22.25,
    k.longitude  = -97.91,
    k.confidence = 1.0;

MERGE (c:Location:Country {id: "location:country:mx"})
SET c.name = "Mexico", c.iso_a2 = "MX";

MERGE (r:Location:Region {id: "location:region:latin_america_and_the_caribbean"})
SET r.name = "Latin America and the Caribbean";

MERGE (p:Location:Point {id: "location:point:-97.91:22.25"})
SET p.latitude = 22.25, p.longitude = -97.91,
    p.location = point({latitude: 22.25, longitude: -97.91});

MERGE (t_press:Topic {id: "topic:press_freedom"})         SET t_press.name = "Press Freedom";
MERGE (t_radio:Topic {id: "topic:media:radio"})           SET t_radio.name = "Radio Journalism";

MERGE (j)-[:LOCATED_IN {role: "nationality"}]->(c);
MERGE (k)-[:TARGETED]->(j);
MERGE (j)-[:TARGETED_BY]->(k);
MERGE (k)-[:OCCURRED_IN]->(c);
MERGE (k)-[:OCCURRED_AT]->(p);
MERGE (p)-[:LOCATED_IN]->(c);
MERGE (c)-[:PART_OF]->(r);
MERGE (k)-[:ASSOCIATED_WITH]->(t_press);
MERGE (k)-[:ASSOCIATED_WITH]->(t_radio);

MERGE (f:Fact:EnquiryStatus {id: "fact:enquiry:f89ebf67-c844-49a1-ac2e-dc439a2d0877"})
SET f.status = "Ongoing/Unresolved",
    f.observed_at = datetime("2026-04-27T08:44:01-07:00"),
    f.confidence = 1.0;

MERGE (f)-[:ABOUT]->(k);
```

The Go ingester runs this whole shape via batched `UNWIND $batch AS row …` writes; one row per record.

---

## Map queries

### Killings per country (for choropleth)

```cypher
MATCH (k:Killing)-[:OCCURRED_IN]->(c:Country)
RETURN c.iso_a2 AS iso_a2, c.name AS country, count(k) AS killings
ORDER BY killings DESC;
```

### Killings as map pins within a bounding box

```cypher
MATCH (k:Killing)-[:OCCURRED_AT]->(p:Point)
WHERE p.latitude  >= $minLat AND p.latitude  <= $maxLat
  AND p.longitude >= $minLng AND p.longitude <= $maxLng
RETURN k.id AS id, k.period_from AS date, p.latitude AS lat, p.longitude AS lng,
       [(k)-[:TARGETED]->(j) | j.name][0] AS journalist;
```

### Country summary panel

```cypher
MATCH (c:Country {iso_a2: $iso})
OPTIONAL MATCH (k:Killing)-[:OCCURRED_IN]->(c)
WITH c, collect(k) AS killings
RETURN c.name AS country,
       size(killings) AS total_killings,
       [k IN killings | k.period_from] AS dates,
       size([k IN killings WHERE k.in_conflict_zone]) AS in_conflict_zone;
```

### Linking a killing to other events later

Because `Killing` carries the generic `Event` label, any future event node can connect to it via the existing vocabulary, no schema change required:

```cypher
MATCH (lawsuit:Event {sub_type: "Lawsuit"}), (k:Event:Killing {id: $killing_id})
MERGE (lawsuit)-[:RELATED_TO {relationship_category: "follow_up", description: "Civil suit filed by family"}]->(k);

MATCH (sanction:Event {event_type: "Sanction"}), (k:Killing {id: $killing_id})
MERGE (sanction)-[:RELATED_TO {description: "Sanction in response to killing"}]->(k);
```

---

## Implementation tasks

1. Extend `db/neo4j/init/01-constraints.cypher` with the new sub‑label constraints and indexes above.
2. Run `tools/fej001-ingest` against a local Neo4j to load `data/raw/fej001.json`.
3. (Backend, Go) Add map endpoints that wrap the queries in this document:
   - `GET /api/graph/killings/by-country`
   - `GET /api/graph/killings/points?bbox=…`
   - `GET /api/graph/killings/country/:iso`
4. (Frontend) Render choropleth from `by-country` and pins from `points`.

## Acceptance criteria

- All 1,860 records appear as `Killing` events in Neo4j after one ingester run.
- A second ingester run produces zero duplicates (idempotency).
- Country boundaries are stored once per country, not per event.
- Each `Killing` is linkable to a future `Event` node using `RELATED_TO` / `ASSOCIATED_WITH` / `TARGETED` without changing this schema.
