# `fej001.json` — Source Data Schema

## Overview

`data/raw/fej001.json` is a snapshot export of records describing journalists who were killed or who died in the line of duty. The file appears to originate from a Strapi CMS that backs a UNESCO/IFEX‑style "Killed Journalists" observatory dataset (the embedded URLs reference UNESCO Director‑General condemnations and `unesdoc.unesco.org`).

| Property | Value |
|---|---|
| Top‑level type | JSON array |
| Record count | **1,860** |
| Distinct keys per record | 41 (every record carries every key) |
| File size on disk | ~7.1 MB, single line, no terminator |
| `id` (int) uniqueness | unique across all 1,860 records |
| `uuid` (string) uniqueness | unique across all 1,860 records |
| `date` range | 1993‑06‑02 → 2026‑04‑22 |

Because the file is a single very long line (no newlines), readers must either load the whole document into memory or use a streaming JSON tokenizer. The provided Go ingester (`tools/fej001-ingest`) uses `encoding/json.Decoder` to consume one record at a time.

## Field reference

The "Nulls" column is the count out of 1,860 records.

### Identity & timestamps

| Field | Type | Nulls | Notes |
|---|---|---|---|
| `id` | int | 0 | Strapi numeric id. Unique. |
| `uuid` | string | 0 | UUID v4. Unique. Recommended stable id. |
| `documentid` | string | 0 | Strapi document id (e.g. `k7cd21p0pz9xq44cc0jp79ex`). |
| `title_en` | string | 0 | Display title — in practice the journalist's name. |
| `createdat` | string (ISO‑8601 with offset) | 0 | Record creation timestamp. |
| `updatedat` | string (ISO‑8601 with offset) | 0 | Last update timestamp. Often equal to `publishedat`. |
| `publishedat` | string (ISO‑8601 with offset) | 0 | Publication timestamp. |
| `strapi_stage` | null | 1860 | Always null in this snapshot. |
| `strapi_assignee` | null | 1860 | Always null in this snapshot. |

### Person

| Field | Type | Nulls | Notes |
|---|---|---|---|
| `nationality` | array of string \| null | 1 | Usually 1 value, sometimes 2 (10 records). E.g. `["American"]`. |
| `gender` | string | 0 | Enum: `Male` (1717), `Female` (143). |
| `age` | int \| null | 1247 | Age at time of death. |
| `staff` | string \| null | 9 | Enum: `Staff`, `Freelancer`, `Not indicated`. |
| `local` | string | 0 | Enum: `Local` (1741), `Foreign` (119). |

### Event circumstances

| Field | Type | Nulls | Notes |
|---|---|---|---|
| `date` | string `YYYY-MM-DD` | 0 | Date of death. |
| `media` | string | 0 | Enum: `Print`, `TV`, `Radio`, `Online`, `Cross-platform`. |
| `area_coverage` | string \| null | 1804 | Enum (when present): `Conflict and crisis`, `Other`, `Crime`, `Corruption`, `Environment`, `Indigenous`. |
| `conflict_zone` | string | 0 | String boolean: `"True"` (971) or `"False"` (889). |
| `conflict_zone_calc` | string | 0 | Human label mirroring `conflict_zone`: `Conflict Zone` / `Not a Conflict Zone`. |

### Location

| Field | Type | Nulls | Notes |
|---|---|---|---|
| `countries` | string \| null | 3 | ISO‑3166‑1 alpha‑2 country code (e.g. `US`). Single value, **never comma‑separated** in this dataset. |
| `calc_country_code` | string \| null | 3 | Same ISO‑2 code as `countries`. Authoritative. |
| `calc_country` | string | 0 | ⚠️ **Do not trust as country name.** In this snapshot this column carries the **journalist name** in many rows (likely a Strapi computed‑field mis‑mapping). Use `country_title_en` instead. |
| `country_title_en` | string \| null | 4 | Country name in English (e.g. `United States of America`). |
| `country_uuid` | string \| null | 4 | UUID of the country in the upstream geo dataset. |
| `country_regional_group` | string \| null | 4 | UNESCO regional grouping (e.g. `Europe and North America`, `Africa`, `Arab States`, `Asia and the Pacific`, `Latin America and the Caribbean`). |
| `coordinates` | object `{lon: number, lat: number}` \| null | 4 | Point of the killing (often city‑level). |
| `country_geometry` | GeoJSON `Feature` \| null | 4 | Country boundary (`MultiPolygon`). |
| `geo_shape` | GeoJSON `Feature` \| null | 4 | **Identical** to `country_geometry` in all observed records. Safe to drop one of the two on ingest. |

### Enquiry / judicial follow‑up

| Field | Type | Nulls | Notes |
|---|---|---|---|
| `enquiry_status` | string \| null | 209 | Enum: `Ongoing/Unresolved`, `No Information Received So Far`, `Resolved`, `New request`, `Unresolved – Archived`, `Ongoing/Unresolved – Reported by Member State as killed by foreign actors beyond national jurisdiction`. |
| `enquiry_status_home` | string \| null | 209 | Same enum, may differ between views. |
| `enquiry_status_min` | string \| null | 209 | Same enum. |
| `enquiry_status_stat` | string \| null | 209 | Same enum. |
| `date_resolution` | int \| null | 1643 | Year of resolution (e.g. `2024`). |

### Sources & state response

These four fields are **strings containing Python literal repr** (single quotes, `None`/`True`/`False`). They must be normalised to JSON before parsing — replace `'` with `"`, `None` with `null`, `True`/`False` with `true`/`false`. The Go ingester handles this and falls back to storing the raw string if parsing fails.

| Field | Type after parsing | Notes |
|---|---|---|
| `description_en` | object `{id: int, url: string, title: string\|null}` (1853 of 1860) | Single UNESCO Director‑General condemnation link (often via `web.archive.org`). 7 records have null. |
| `dg_request` | array of `{id: int, text_1: string, text_2: string}` | One entry per follow‑up year. `text_1` is a year (e.g. `"2017"`). `text_2` is a URL when available, otherwise empty. |
| `state_response` | array of `{id: int, text_1: string, text_2: string}` | Member‑State responses by year. `text_2` typically a `unesdoc.unesco.org` URL. |
| `state_acknowledgements` | array (often empty `[]`) | Same shape as `state_response` when populated. |

### Always‑null fields

Present in every record but never populated in this snapshot. Safe to ignore on ingest.

- `description_es`, `description_fr`, `language`, `main_image`, `strapi_stage`, `strapi_assignee`.

## Sub‑structures

### `coordinates`

```json
{ "lon": -77.04, "lat": 38.9 }
```

### `country_geometry` / `geo_shape`

GeoJSON `Feature` whose geometry is a `MultiPolygon` (country boundary, sometimes with many islands), with an empty `properties` object.

```json
{
  "type": "Feature",
  "geometry": { "type": "MultiPolygon", "coordinates": [ /* … */ ] },
  "properties": {}
}
```

Because a country boundary is enormous and is duplicated across every record for the same country, it should be stored **once per country** (e.g. on a `Location:Country` node), not on every event.

### Parsed shape of the Python‑repr fields

```json
// description_en
{ "id": 6062454, "url": "https://web.archive.org/...", "title": null }

// dg_request, state_response, state_acknowledgements
[ { "id": 53048, "text_1": "2017", "text_2": "https://unesdoc.unesco.org/..." }, … ]
```

## Data‑quality notes

1. **`calc_country` is mis‑mapped**: it holds the journalist name, not the country name. Use `country_title_en` for the country display name and `countries`/`calc_country_code` for the ISO‑2 code.
2. **`country_geometry` and `geo_shape` are duplicates**. Drop one on ingest.
3. **`conflict_zone` is a string**, not a JSON boolean. Coerce `"True"` → `true`, `"False"` → `false`.
4. **`description_en`, `dg_request`, `state_response`, `state_acknowledgements`** are stringified Python literals, not JSON. Normalise quotes / `None`‑`null` / `True`‑`true` / `False`‑`false` before parsing.
5. **`nationality` may have 2 entries** (10 records) — model as an array, not a single value.
6. **A small number of records (3–4) lack any country information**. The ingester should still create the `Event:Killing` and `Principal:Journalist` nodes for those records and skip the country relationships.
7. **Multiple `enquiry_status_*` fields** carry mostly the same enum value but can diverge. Preserve all four on the `Fact:EnquiryStatus` node for fidelity.

## Recommended ingestion order

1. Stream the array, decoding one record at a time.
2. Per record, parse the four Python‑repr fields (best effort, log fallbacks).
3. Build a small in‑memory dedupe map for `Location:Country` (keyed by ISO‑2) so the country geometry is upserted only once per country across the run.
4. Batch records into UNWIND‑driven Cypher writes (see `docs/neo4j-killed-journalists-proposal.md`).
