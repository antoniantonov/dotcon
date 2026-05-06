package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
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

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
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

// corsMiddleware adds permissive CORS headers, mirroring the Node.js cors() defaults.
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func main() {
	ctx := context.Background()

	// ── PostgreSQL ──────────────────────────────────────────────────────────────
	dbURL := getEnv("DATABASE_URL", "postgresql://dotcon:dotcon@localhost:5432/dotcon")
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Cannot connect to PostgreSQL: %v", err)
	}
	db = pool
	defer db.Close()

	if err := ensurePostgresSchema(ctx); err != nil {
		log.Fatalf("Schema migration failed: %v", err)
	}

	// ── Neo4j ───────────────────────────────────────────────────────────────────
	if err := initNeo4jDriver(); err != nil {
		log.Fatalf("Cannot init Neo4j driver: %v", err)
	}
	defer neo4jDriver.Close(ctx)

	// Run Neo4j constraints + seed after the server has started (non-fatal).
	go func() {
		runConstraintsAndSeed(ctx)
	}()

	// ── HTTP server ─────────────────────────────────────────────────────────────
	port := getEnv("PORT", "4000")

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(corsMiddleware())

	r.GET("/health", healthHandler)
	r.GET("/api/countries", countriesHandler)
	r.GET("/api/country-name-aliases", countryAliasesHandler)
	r.GET("/api/countries/:iso", countryByISOHandler)

	registerGraphRoutes(r.Group("/api/graph"))

	addr := fmt.Sprintf("0.0.0.0:%s", port)
	log.Printf("Backend listening on port %s", port)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server error: %v", err)
	}
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
