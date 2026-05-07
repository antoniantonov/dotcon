package main

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"flag"
	"io"
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// Record mirrors the relevant subset of fields from data/raw/fej001.json.
// Fields documented in docs/fej001-json-schema.md.
type Record struct {
	ID                   int      `json:"id"`
	UUID                 string   `json:"uuid"`
	DocumentID           string   `json:"documentid"`
	TitleEN              string   `json:"title_en"`
	CreatedAt            string   `json:"createdat"`
	UpdatedAt            string   `json:"updatedat"`
	PublishedAt          string   `json:"publishedat"`
	Date                 string   `json:"date"`
	Gender               string   `json:"gender"`
	Age                  *int     `json:"age"`
	Staff                *string  `json:"staff"`
	Local                string   `json:"local"`
	Media                string   `json:"media"`
	Nationality          []string `json:"nationality"`
	AreaCoverage         *string  `json:"area_coverage"`
	ConflictZone         string   `json:"conflict_zone"`
	ConflictZoneCalc     string   `json:"conflict_zone_calc"`
	Countries            *string  `json:"countries"`
	CalcCountryCode      *string  `json:"calc_country_code"`
	CountryTitleEN       *string  `json:"country_title_en"`
	CountryUUID          *string  `json:"country_uuid"`
	CountryRegionalGroup *string  `json:"country_regional_group"`
	Coordinates          *struct {
		Lon float64 `json:"lon"`
		Lat float64 `json:"lat"`
	} `json:"coordinates"`
	CountryGeometry    json.RawMessage `json:"country_geometry"`
	EnquiryStatus      *string         `json:"enquiry_status"`
	EnquiryStatusHome  *string         `json:"enquiry_status_home"`
	EnquiryStatusMin   *string         `json:"enquiry_status_min"`
	EnquiryStatusStat  *string         `json:"enquiry_status_stat"`
	DateResolution     *int            `json:"date_resolution"`
	DescriptionEN      *string         `json:"description_en"`
	DGRequest          string          `json:"dg_request"`
	StateResponse      string          `json:"state_response"`
	StateAcknowledges  string          `json:"state_acknowledgements"`
}

// DescriptionEN parsed shape.
type descEN struct {
	ID    int     `json:"id"`
	URL   string  `json:"url"`
	Title *string `json:"title"`
}

// dg_request / state_response / state_acknowledgements parsed shape.
type yearLink struct {
	ID    int    `json:"id"`
	Text1 string `json:"text_1"`
	Text2 string `json:"text_2"`
}

// pythonRepr converts a Python literal repr string ("[{'id': 1, 'text_1': '2017'}]")
// into a JSON string suitable for json.Unmarshal. Best-effort.
//
// Steps:
//  1. Replace bare None/True/False with null/true/false (only when not embedded in identifiers).
//  2. Replace single-quoted strings with double-quoted strings, escaping any embedded double quotes
//     and unescaping the Python single-quote escapes \\' .
//
// We process character-by-character to avoid mangling apostrophes inside string values.
func pythonReprToJSON(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	var b strings.Builder
	b.Grow(len(s))
	i := 0
	for i < len(s) {
		c := s[i]
		switch c {
		case '\'':
			// Start of a single-quoted string. Find matching close, handling \\ and \'.
			b.WriteByte('"')
			i++
			for i < len(s) {
				ch := s[i]
				if ch == '\\' && i+1 < len(s) {
					next := s[i+1]
					switch next {
					case '\'':
						b.WriteByte('\'')
						i += 2
						continue
					case '"':
						b.WriteString(`\"`)
						i += 2
						continue
					case '\\':
						b.WriteString(`\\`)
						i += 2
						continue
					default:
						b.WriteByte(ch)
						b.WriteByte(next)
						i += 2
						continue
					}
				}
				if ch == '"' {
					b.WriteString(`\"`)
					i++
					continue
				}
				if ch == '\n' {
					b.WriteString(`\n`)
					i++
					continue
				}
				if ch == '\r' {
					b.WriteString(`\r`)
					i++
					continue
				}
				if ch == '\t' {
					b.WriteString(`\t`)
					i++
					continue
				}
				if ch == '\'' {
					break
				}
				b.WriteByte(ch)
				i++
			}
			b.WriteByte('"')
			if i < len(s) && s[i] == '\'' {
				i++
			}
		case 'N':
			if strings.HasPrefix(s[i:], "None") && wordBoundary(s, i+4) {
				b.WriteString("null")
				i += 4
			} else {
				b.WriteByte(c)
				i++
			}
		case 'T':
			if strings.HasPrefix(s[i:], "True") && wordBoundary(s, i+4) {
				b.WriteString("true")
				i += 4
			} else {
				b.WriteByte(c)
				i++
			}
		case 'F':
			if strings.HasPrefix(s[i:], "False") && wordBoundary(s, i+5) {
				b.WriteString("false")
				i += 5
			} else {
				b.WriteByte(c)
				i++
			}
		default:
			b.WriteByte(c)
			i++
		}
	}
	return b.String()
}

func wordBoundary(s string, i int) bool {
	if i >= len(s) {
		return true
	}
	c := s[i]
	return !(c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))
}

func parsePyDict[T any](raw string) (*T, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	js := pythonReprToJSON(raw)
	var v T
	if err := json.Unmarshal([]byte(js), &v); err != nil {
		return nil, err
	}
	return &v, nil
}

func parsePyList[T any](raw string) ([]T, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	js := pythonReprToJSON(raw)
	var v []T
	if err := json.Unmarshal([]byte(js), &v); err != nil {
		return nil, err
	}
	return v, nil
}

// MappedRecord is the row passed to the UNWIND Cypher write.
type MappedRecord struct {
	JournalistID   string                 `json:"journalist_id"`
	JournalistProp map[string]any         `json:"journalist_props"`
	KillingID      string                 `json:"killing_id"`
	KillingProp    map[string]any         `json:"killing_props"`
	CountryID      string                 `json:"country_id"`
	CountryProp    map[string]any         `json:"country_props"`
	HasCountry     bool                   `json:"has_country"`
	RegionID       string                 `json:"region_id"`
	RegionProp     map[string]any         `json:"region_props"`
	HasRegion      bool                   `json:"has_region"`
	PointID        string                 `json:"point_id"`
	PointProp      map[string]any         `json:"point_props"`
	HasPoint       bool                   `json:"has_point"`
	Topics         []map[string]any       `json:"topics"`
	Nationalities  []map[string]any       `json:"nationalities"`
	Sources        []map[string]any       `json:"sources"`
	EnquiryID      string                 `json:"enquiry_id"`
	EnquiryProp    map[string]any         `json:"enquiry_props"`
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func slug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugRe.ReplaceAllString(s, "_")
	return strings.Trim(s, "_")
}

func sha1hex(s string) string {
	h := sha1.Sum([]byte(s))
	return hex.EncodeToString(h[:])
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// mapRecord converts a Record into a MappedRecord plus a country-geometry side table.
// countriesGeo collects ISO2 -> geojson string so geometry is upserted only once per country.
func mapRecord(r *Record, countriesGeo map[string]string, parseFails *int) MappedRecord {
	m := MappedRecord{}
	m.JournalistID = "principal:journalist:" + r.UUID
	jProps := map[string]any{
		"name":             r.TitleEN,
		"gender":           r.Gender,
		"media_type":       r.Media,
		"local_or_foreign": r.Local,
		"nationalities":    r.Nationality,
		"valid_from":       r.Date,
		"valid_to":         r.Date,
		"fej_id":           r.ID,
		"uuid":             r.UUID,
		"documentid":       r.DocumentID,
	}
	if r.Age != nil {
		jProps["age"] = *r.Age
	}
	if r.Staff != nil {
		jProps["staff_type"] = *r.Staff
	}
	m.JournalistProp = jProps

	m.KillingID = "event:killing:" + r.UUID
	kProps := map[string]any{
		"event_type":          "Killing",
		"sub_type":            "Journalist",
		"period_from":         r.Date,
		"period_to":           r.Date,
		"in_conflict_zone":    strings.EqualFold(r.ConflictZone, "true"),
		"conflict_zone_label": r.ConflictZoneCalc,
		"media_type":          r.Media,
		"confidence":          1.0,
	}
	if r.AreaCoverage != nil {
		kProps["area_coverage"] = *r.AreaCoverage
	}
	if r.Coordinates != nil {
		kProps["latitude"] = r.Coordinates.Lat
		kProps["longitude"] = r.Coordinates.Lon
	}
	m.KillingProp = kProps

	iso := strings.ToUpper(strings.TrimSpace(deref(r.CalcCountryCode)))
	if iso == "" {
		iso = strings.ToUpper(strings.TrimSpace(deref(r.Countries)))
	}
	if iso != "" {
		m.HasCountry = true
		m.CountryID = "location:country:" + strings.ToLower(iso)
		cProps := map[string]any{"iso_a2": iso}
		if r.CountryTitleEN != nil {
			cProps["name"] = *r.CountryTitleEN
		}
		if r.CountryUUID != nil {
			cProps["country_uuid"] = *r.CountryUUID
		}
		if r.CountryRegionalGroup != nil {
			cProps["regional_group"] = *r.CountryRegionalGroup
		}
		// Geometry: only attach the first time we see this iso, keeps payloads small on later batches.
		if _, ok := countriesGeo[iso]; !ok && len(r.CountryGeometry) > 0 && string(r.CountryGeometry) != "null" {
			geo := string(r.CountryGeometry)
			countriesGeo[iso] = geo
			cProps["geojson"] = geo
		}
		m.CountryProp = cProps
	}

	if r.CountryRegionalGroup != nil {
		s := slug(*r.CountryRegionalGroup)
		if s != "" {
			m.HasRegion = true
			m.RegionID = "location:region:" + s
			m.RegionProp = map[string]any{"name": *r.CountryRegionalGroup}
		}
	}

	if r.Coordinates != nil {
		latStr := strconv.FormatFloat(r.Coordinates.Lat, 'f', -1, 64)
		lonStr := strconv.FormatFloat(r.Coordinates.Lon, 'f', -1, 64)
		m.HasPoint = true
		m.PointID = "location:point:" + lonStr + ":" + latStr
		m.PointProp = map[string]any{
			"latitude":  r.Coordinates.Lat,
			"longitude": r.Coordinates.Lon,
		}
	}

	// Topics
	topics := []map[string]any{
		{"id": "topic:press_freedom", "name": "Press Freedom"},
	}
	if r.Media != "" {
		topics = append(topics, map[string]any{
			"id":   "topic:media:" + slug(r.Media),
			"name": r.Media + " Journalism",
		})
	}
	if r.AreaCoverage != nil && *r.AreaCoverage != "" {
		topics = append(topics, map[string]any{
			"id":   "topic:area_coverage:" + slug(*r.AreaCoverage),
			"name": *r.AreaCoverage,
		})
	}
	if strings.EqualFold(r.ConflictZone, "true") {
		topics = append(topics, map[string]any{"id": "topic:conflict_zone", "name": "Conflict Zone"})
	}
	m.Topics = topics

	// Nationalities -> Country nodes (best-effort; nationality strings are demonyms not ISO codes,
	// so we model them as Topic-like Country nodes keyed by demonym slug to avoid colliding with
	// real country ISO IDs).
	for _, nat := range r.Nationality {
		nat = strings.TrimSpace(nat)
		if nat == "" {
			continue
		}
		m.Nationalities = append(m.Nationalities, map[string]any{
			"id":   "location:nationality:" + slug(nat),
			"name": nat,
		})
	}

	// Sources
	sources := []map[string]any{}
	if r.DescriptionEN != nil && strings.TrimSpace(*r.DescriptionEN) != "" {
		if d, err := parsePyDict[descEN](*r.DescriptionEN); err == nil && d != nil && d.URL != "" {
			sources = append(sources, map[string]any{
				"id":          "source:unesco_dg:" + strconv.Itoa(d.ID),
				"name":        "UNESCO DG condemnation",
				"source_type": "UNESCO DG Condemnation",
				"url":         d.URL,
				"role":        "dg_condemnation",
				"year":        nil,
			})
		} else if err != nil {
			*parseFails++
		}
	}
	addList := func(raw, sourceType, role string) {
		items, err := parsePyList[yearLink](raw)
		if err != nil {
			*parseFails++
			return
		}
		for _, it := range items {
			if strings.TrimSpace(it.Text2) == "" {
				continue
			}
			sources = append(sources, map[string]any{
				"id":             "source:url:" + sha1hex(it.Text2)[:16],
				"name":           sourceType + " " + it.Text1,
				"source_type":    sourceType,
				"url":            it.Text2,
				"role":           role,
				"published_year": it.Text1,
				"year":           it.Text1,
			})
		}
	}
	addList(r.DGRequest, "DG Request", "dg_request")
	addList(r.StateResponse, "State Response", "state_response")
	addList(r.StateAcknowledges, "State Acknowledgement", "state_acknowledgement")
	m.Sources = sources

	m.EnquiryID = "fact:enquiry:" + r.UUID
	eProps := map[string]any{
		"observed_at": r.UpdatedAt,
		"confidence":  1.0,
	}
	if r.EnquiryStatus != nil {
		eProps["status"] = *r.EnquiryStatus
	}
	if r.EnquiryStatusHome != nil {
		eProps["status_home"] = *r.EnquiryStatusHome
	}
	if r.EnquiryStatusMin != nil {
		eProps["status_min"] = *r.EnquiryStatusMin
	}
	if r.EnquiryStatusStat != nil {
		eProps["status_stat"] = *r.EnquiryStatusStat
	}
	if r.DateResolution != nil {
		eProps["resolution_year"] = *r.DateResolution
	}
	m.EnquiryProp = eProps

	return m
}

// writeCypher is the Cypher run once per batch. It uses generic Principal/Event/Location/Topic/Source/Fact
// labels (which already have uniqueness constraints in db/neo4j/init/01-constraints.cypher) plus the
// new sub-labels documented in docs/neo4j-killed-journalists-proposal.md.
const writeCypher = `
UNWIND $batch AS row

MERGE (j:Principal:Person:Journalist {id: row.journalist_id})
SET j += row.journalist_props

MERGE (k:Event:Killing {id: row.killing_id})
SET k += row.killing_props

MERGE (k)-[:TARGETED]->(j)
MERGE (j)-[:TARGETED_BY]->(k)

WITH row, j, k
FOREACH (_ IN CASE WHEN row.has_country THEN [1] ELSE [] END |
  MERGE (c:Location:Country {id: row.country_id})
  SET c += row.country_props
  MERGE (k)-[:OCCURRED_IN]->(c)
)

WITH row, j, k
FOREACH (_ IN CASE WHEN row.has_region THEN [1] ELSE [] END |
  MERGE (r:Location:Region {id: row.region_id})
  SET r += row.region_props
  FOREACH (__ IN CASE WHEN row.has_country THEN [1] ELSE [] END |
    MERGE (c2:Location:Country {id: row.country_id})
    MERGE (c2)-[:PART_OF]->(r)
  )
)

WITH row, j, k
FOREACH (_ IN CASE WHEN row.has_point THEN [1] ELSE [] END |
  MERGE (p:Location:Point {id: row.point_id})
  SET p += row.point_props
  MERGE (k)-[:OCCURRED_AT]->(p)
  FOREACH (__ IN CASE WHEN row.has_country THEN [1] ELSE [] END |
    MERGE (c3:Location:Country {id: row.country_id})
    MERGE (p)-[:LOCATED_IN]->(c3)
  )
)

WITH row, j, k
UNWIND row.topics AS t
  MERGE (tn:Topic {id: t.id}) SET tn.name = t.name
  MERGE (k)-[:ASSOCIATED_WITH]->(tn)

WITH row, j, k
UNWIND (CASE WHEN row.nationalities IS NULL OR size(row.nationalities) = 0 THEN [null] ELSE row.nationalities END) AS nat
  FOREACH (_ IN CASE WHEN nat IS NULL THEN [] ELSE [1] END |
    MERGE (nc:Location {id: nat.id}) SET nc.name = nat.name, nc.location_type = "Nationality"
    MERGE (j)-[:LOCATED_IN {role: "nationality"}]->(nc)
  )

WITH row, j, k
UNWIND (CASE WHEN row.sources IS NULL OR size(row.sources) = 0 THEN [null] ELSE row.sources END) AS src
  FOREACH (_ IN CASE WHEN src IS NULL THEN [] ELSE [1] END |
    MERGE (s:Source {id: src.id})
    SET s.name = src.name, s.source_type = src.source_type, s.url = src.url
    MERGE (k)-[r:SUPPORTED_BY_SOURCE]->(s)
    SET r.role = src.role, r.year = src.year
  )

WITH row, k
MERGE (f:Fact:EnquiryStatus {id: row.enquiry_id})
SET f += row.enquiry_props
MERGE (f)-[:ABOUT]->(k)
`

const constraintsCypher = `
CREATE CONSTRAINT principal_id IF NOT EXISTS FOR (n:Principal) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT event_id     IF NOT EXISTS FOR (n:Event)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT location_id  IF NOT EXISTS FOR (n:Location)  REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT topic_id     IF NOT EXISTS FOR (n:Topic)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT source_id    IF NOT EXISTS FOR (n:Source)    REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT fact_id      IF NOT EXISTS FOR (n:Fact)      REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT journalist_id     IF NOT EXISTS FOR (n:Journalist)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT killing_id        IF NOT EXISTS FOR (n:Killing)        REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT country_id        IF NOT EXISTS FOR (n:Country)        REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT region_id         IF NOT EXISTS FOR (n:Region)         REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT point_id          IF NOT EXISTS FOR (n:Point)          REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT enquiry_status_id IF NOT EXISTS FOR (n:EnquiryStatus)  REQUIRE n.id IS UNIQUE;
`

func main() {
	var (
		input    = flag.String("input", "data/raw/fej001.json", "Path to fej001.json")
		uri      = flag.String("uri", "bolt://localhost:7687", "Neo4j Bolt URI")
		user     = flag.String("user", envOr("NEO4J_USER", "neo4j"), "Neo4j user")
		password = flag.String("password", envOr("NEO4J_PASSWORD", "local-password"), "Neo4j password")
		database = flag.String("database", "neo4j", "Neo4j database name")
		batch    = flag.Int("batch", 200, "Records per write transaction")
		dryRun   = flag.Bool("dry-run", false, "Parse and map records without writing to Neo4j")
	)
	flag.Parse()

	start := time.Now()
	log.Printf("=== fej001-ingest starting ===")
	log.Printf("input=%s uri=%s user=%s database=%s batch=%d dry_run=%v",
		*input, *uri, *user, *database, *batch, *dryRun)

	fi, err := os.Stat(*input)
	if err != nil {
		log.Fatalf("stat input: %v", err)
	}
	log.Printf("input file size: %d bytes (%.2f MB)", fi.Size(), float64(fi.Size())/1024/1024)

	f, err := os.Open(*input)
	if err != nil {
		log.Fatalf("open input: %v", err)
	}
	defer f.Close()

	dec := json.NewDecoder(f)
	tok, err := dec.Token()
	if err != nil {
		log.Fatalf("read opening token: %v", err)
	}
	if d, ok := tok.(json.Delim); !ok || d != '[' {
		log.Fatalf("expected JSON array, got %v", tok)
	}

	var driver neo4j.DriverWithContext
	var session neo4j.SessionWithContext
	ctx := context.Background()
	if !*dryRun {
		log.Printf("connecting to Neo4j at %s …", *uri)
		driver, err = neo4j.NewDriverWithContext(*uri, neo4j.BasicAuth(*user, *password, ""))
		if err != nil {
			log.Fatalf("driver: %v", err)
		}
		defer driver.Close(ctx)
		if err := driver.VerifyConnectivity(ctx); err != nil {
			log.Fatalf("verify connectivity: %v", err)
		}
		log.Printf("✓ Neo4j connection verified")
		session = driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: *database})
		defer session.Close(ctx)

		stmts := splitStatements(constraintsCypher)
		log.Printf("creating %d constraints…", len(stmts))
		for _, stmt := range stmts {
			if _, err := session.Run(ctx, stmt, nil); err != nil {
				log.Fatalf("constraint: %v\n%s", err, stmt)
			}
		}
		log.Printf("✓ constraints ensured")
	}

	countriesGeo := map[string]string{}
	parseFails := 0
	batchRows := make([]map[string]any, 0, *batch)
	total := 0
	batchNum := 0
	log.Printf("streaming records from %s …", *input)
	flush := func() error {
		if len(batchRows) == 0 {
			return nil
		}
		batchNum++
		bStart := time.Now()
		if !*dryRun {
			_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
				return tx.Run(ctx, writeCypher, map[string]any{"batch": batchRows})
			})
			if err != nil {
				return err
			}
		}
		log.Printf("  batch #%-3d  rows=%-4d  total=%-5d  took=%s",
			batchNum, len(batchRows), total, time.Since(bStart).Round(time.Millisecond))
		batchRows = batchRows[:0]
		return nil
	}

	for dec.More() {
		var r Record
		if err := dec.Decode(&r); err != nil {
			log.Fatalf("decode record %d: %v", total, err)
		}
		mapped := mapRecord(&r, countriesGeo, &parseFails)
		row := mappedToMap(mapped)
		batchRows = append(batchRows, row)
		total++
		if len(batchRows) >= *batch {
			if err := flush(); err != nil {
				log.Fatalf("flush: %v", err)
			}
		}
	}
	if err := flush(); err != nil {
		log.Fatalf("final flush: %v", err)
	}

	if _, err := dec.Token(); err != nil && err != io.EOF {
		log.Printf("warning: closing token: %v", err)
	}

	log.Printf("--- ingest complete ---")
	log.Printf("records_read=%d  batches=%d  distinct_countries=%d  python_repr_parse_fails=%d  elapsed=%s  dry_run=%v",
		total, batchNum, len(countriesGeo), parseFails, time.Since(start).Round(time.Millisecond), *dryRun)

	if !*dryRun {
		log.Printf("--- verifying database contents ---")
		verifications := []struct {
			label, query string
		}{
			{"Journalist nodes", "MATCH (n:Journalist) RETURN count(n) AS c"},
			{"Killing nodes", "MATCH (n:Killing) RETURN count(n) AS c"},
			{"Country nodes", "MATCH (n:Country) RETURN count(n) AS c"},
			{"Region nodes", "MATCH (n:Region) RETURN count(n) AS c"},
			{"Point nodes", "MATCH (n:Point) RETURN count(n) AS c"},
			{"Topic nodes", "MATCH (n:Topic) RETURN count(n) AS c"},
			{"Source nodes", "MATCH (n:Source) RETURN count(n) AS c"},
			{"EnquiryStatus nodes", "MATCH (n:EnquiryStatus) RETURN count(n) AS c"},
			{":TARGETED edges", "MATCH ()-[r:TARGETED]->() RETURN count(r) AS c"},
			{":OCCURRED_IN edges", "MATCH ()-[r:OCCURRED_IN]->() RETURN count(r) AS c"},
			{":OCCURRED_AT edges", "MATCH ()-[r:OCCURRED_AT]->() RETURN count(r) AS c"},
			{":ASSOCIATED_WITH edges", "MATCH ()-[r:ASSOCIATED_WITH]->() RETURN count(r) AS c"},
			{":SUPPORTED_BY_SOURCE edges", "MATCH ()-[r:SUPPORTED_BY_SOURCE]->() RETURN count(r) AS c"},
			{":ABOUT edges", "MATCH ()-[r:ABOUT]->() RETURN count(r) AS c"},
		}
		maxLen := 0
		for _, v := range verifications {
			if len(v.label) > maxLen {
				maxLen = len(v.label)
			}
		}
		for _, v := range verifications {
			res, err := session.Run(ctx, v.query, nil)
			if err != nil {
				log.Printf("  %-*s : query error: %v", maxLen, v.label, err)
				continue
			}
			rec, err := res.Single(ctx)
			if err != nil {
				log.Printf("  %-*s : single error: %v", maxLen, v.label, err)
				continue
			}
			log.Printf("  %-*s : %d", maxLen, v.label, rec.Values[0])
		}

		log.Printf("--- top 10 countries by killings ---")
		res, err := session.Run(ctx,
			`MATCH (k:Killing)-[:OCCURRED_IN]->(c:Country)
			 RETURN c.iso_a2 AS iso, coalesce(c.name, '?') AS name, count(k) AS killings
			 ORDER BY killings DESC LIMIT 10`, nil)
		if err != nil {
			log.Printf("  top-countries query error: %v", err)
		} else {
			for res.Next(ctx) {
				rec := res.Record()
				log.Printf("  %s  %-30s  %d", rec.Values[0], rec.Values[1], rec.Values[2])
			}
		}

		log.Printf("✓ ingest verified")
	}
	log.Printf("=== fej001-ingest finished in %s ===", time.Since(start).Round(time.Millisecond))
}

func mappedToMap(m MappedRecord) map[string]any {
	b, _ := json.Marshal(m)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return out
}

func splitStatements(s string) []string {
	parts := strings.Split(s, ";")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func envOr(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

