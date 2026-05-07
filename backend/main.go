package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
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
	if err := initPostgres(ctx); err != nil {
		log.Fatalf("Cannot connect to PostgreSQL: %v", err)
	}
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
