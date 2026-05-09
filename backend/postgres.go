package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var db *pgxpool.Pool

// countryNameAliases mirrors the Node.js COUNTRY_NAME_ALIASES list.
var countryNameAliases = [][2]string{
	{"dem. rep. congo", "democratic republic of the congo"},
	{"central african rep.", "central african republic"},
	{"s. sudan", "south sudan"},
	{"eq. guinea", "equatorial guinea"},
	{"dominican rep.", "dominican republic"},
	{"bosnia and herz.", "bosnia and herzegovina"},
	{"czech rep.", "czech republic"},
	{"solomon is.", "solomon islands"},
	{"w. sahara", "western sahara"},
	{"côte d'ivoire", "ivory coast"},
	{"falkland is.", "falkland islands"},
	{"n. korea", "north korea"},
	{"s. korea", "south korea"},
	{"lao pdr", "laos"},
	{"n. cyprus", "northern cyprus"},
	{"n. macedonia", "north macedonia"},
	{"marshall is.", "marshall islands"},
	{"eswatini", "eswatini"},
}

// initPostgres opens a pgx connection pool and assigns it to the package-level db.
func initPostgres(ctx context.Context) error {
	dbURL := getEnv("DATABASE_URL", "postgresql://dotcon:dotcon@localhost:5432/dotcon")
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("postgres connect: %w", err)
	}
	db = pool
	return nil
}

// isoA2ToA3 caches the iso_a2 → iso_a3 mapping from the countries table so
// graph handlers can derive iso_a3 for nodes that only carry iso_a2 (the
// fej001 ingest tool only writes iso_a2 on Location:Country nodes).
// Keys and values are upper-case.
var isoA2ToA3 = map[string]string{}

// loadIsoMap populates isoA2ToA3 from the countries table. Safe to call after
// ensurePostgresSchema has run; tolerant of an empty table.
func loadIsoMap(ctx context.Context) error {
	rows, err := db.Query(ctx, "SELECT iso_a2, iso_a3 FROM countries")
	if err != nil {
		return fmt.Errorf("load iso map: %w", err)
	}
	defer rows.Close()
	m := make(map[string]string, 250)
	for rows.Next() {
		var a2, a3 string
		if err := rows.Scan(&a2, &a3); err != nil {
			return fmt.Errorf("scan iso row: %w", err)
		}
		m[strings.ToUpper(a2)] = strings.ToUpper(a3)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate iso rows: %w", err)
	}
	isoA2ToA3 = m
	return nil
}

// ensurePostgresSchema creates tables/indices if they do not exist and upserts
// the country name aliases, mirroring the Node.js ensurePostgresSchema logic.
func ensurePostgresSchema(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS countries (
			id SERIAL PRIMARY KEY,
			name VARCHAR(100) NOT NULL,
			iso_a2 VARCHAR(2) NOT NULL UNIQUE,
			iso_a3 VARCHAR(3) NOT NULL UNIQUE,
			capital VARCHAR(100),
			metadata TEXT DEFAULT 'this is metadata',
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_countries_iso_a3 ON countries (iso_a3)`,
		`CREATE INDEX IF NOT EXISTS idx_countries_iso_a2 ON countries (iso_a2)`,
		`CREATE TABLE IF NOT EXISTS country_name_aliases (
			id SERIAL PRIMARY KEY,
			alias VARCHAR(100) NOT NULL UNIQUE,
			canonical_name VARCHAR(100) NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_country_name_aliases_alias ON country_name_aliases (alias)`,
	}
	for _, stmt := range statements {
		if _, err := db.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("schema init: %w", err)
		}
	}

	// Upsert country name aliases.
	if len(countryNameAliases) == 0 {
		return nil
	}
	placeholders := make([]string, len(countryNameAliases))
	args := make([]any, 0, len(countryNameAliases)*2)
	for i, pair := range countryNameAliases {
		placeholders[i] = fmt.Sprintf("($%d, $%d)", i*2+1, i*2+2)
		args = append(args, pair[0], pair[1])
	}
	upsertSQL := fmt.Sprintf(
		`INSERT INTO country_name_aliases (alias, canonical_name) VALUES %s
		 ON CONFLICT (alias) DO UPDATE SET canonical_name = EXCLUDED.canonical_name`,
		strings.Join(placeholders, ", "),
	)
	if _, err := db.Exec(ctx, upsertSQL, args...); err != nil {
		return fmt.Errorf("alias upsert: %w", err)
	}
	return nil
}

// GET /health
func healthHandler(c *gin.Context) {
	ctx := c.Request.Context()
	if _, err := db.Exec(ctx, "SELECT 1"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// GET /api/countries
func countriesHandler(c *gin.Context) {
	ctx := c.Request.Context()
	rows, err := db.Query(ctx,
		"SELECT name, iso_a2, iso_a3, capital, metadata FROM countries ORDER BY name",
	)
	if err != nil {
		log.Printf("Error fetching countries: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}
	defer rows.Close()

	type Country struct {
		Name     string  `json:"name"`
		IsoA2    string  `json:"iso_a2"`
		IsoA3    string  `json:"iso_a3"`
		Capital  *string `json:"capital"`
		Metadata *string `json:"metadata"`
	}

	countries := make([]Country, 0)
	for rows.Next() {
		var country Country
		if err := rows.Scan(&country.Name, &country.IsoA2, &country.IsoA3, &country.Capital, &country.Metadata); err != nil {
			log.Printf("Error scanning country: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			return
		}
		countries = append(countries, country)
	}
	if err := rows.Err(); err != nil {
		log.Printf("Error iterating countries: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}
	c.JSON(http.StatusOK, countries)
}

// GET /api/country-name-aliases
func countryAliasesHandler(c *gin.Context) {
	ctx := c.Request.Context()
	rows, err := db.Query(ctx,
		"SELECT alias, canonical_name FROM country_name_aliases ORDER BY alias",
	)
	if err != nil {
		log.Printf("Error fetching country aliases: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}
	defer rows.Close()

	type Alias struct {
		Alias         string `json:"alias"`
		CanonicalName string `json:"canonical_name"`
	}

	aliases := make([]Alias, 0)
	for rows.Next() {
		var a Alias
		if err := rows.Scan(&a.Alias, &a.CanonicalName); err != nil {
			log.Printf("Error scanning alias: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			return
		}
		aliases = append(aliases, a)
	}
	if err := rows.Err(); err != nil {
		log.Printf("Error iterating aliases: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}
	c.JSON(http.StatusOK, aliases)
}

// GET /api/countries/:iso
func countryByISOHandler(c *gin.Context) {
	ctx := c.Request.Context()
	iso := strings.ToUpper(c.Param("iso"))

	type Country struct {
		Name     string  `json:"name"`
		IsoA2    string  `json:"iso_a2"`
		IsoA3    string  `json:"iso_a3"`
		Capital  *string `json:"capital"`
		Metadata *string `json:"metadata"`
	}

	var country Country
	err := db.QueryRow(ctx,
		"SELECT name, iso_a2, iso_a3, capital, metadata FROM countries WHERE iso_a3 = $1 OR iso_a2 = $1",
		iso,
	).Scan(&country.Name, &country.IsoA2, &country.IsoA3, &country.Capital, &country.Metadata)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Country not found"})
			return
		}
		log.Printf("Error fetching country %s: %v", iso, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}
	c.JSON(http.StatusOK, country)
}
