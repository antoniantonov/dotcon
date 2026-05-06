package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j/dbtype"
)

var neo4jDriver neo4j.DriverWithContext

func initNeo4jDriver() error {
	uri := getEnv("NEO4J_URI", "bolt://localhost:7687")
	user := getEnv("NEO4J_USER", "neo4j")
	password := getEnv("NEO4J_PASSWORD", "local-password")

	driver, err := neo4j.NewDriverWithContext(
		uri,
		neo4j.BasicAuth(user, password, ""),
		func(cfg *neo4j.Config) {
			cfg.MaxConnectionPoolSize = 10
			cfg.ConnectionAcquisitionTimeout = 5000
		},
	)
	if err != nil {
		return fmt.Errorf("neo4j driver init: %w", err)
	}
	neo4jDriver = driver
	return nil
}

func getNeo4jReadSession(ctx context.Context) neo4j.SessionWithContext {
	return neo4jDriver.NewSession(ctx, neo4j.SessionConfig{
		AccessMode: neo4j.AccessModeRead,
	})
}

func getNeo4jWriteSession(ctx context.Context) neo4j.SessionWithContext {
	return neo4jDriver.NewSession(ctx, neo4j.SessionConfig{
		AccessMode: neo4j.AccessModeWrite,
	})
}

// toPlain converts Neo4j-specific types to plain JSON-serialisable values.
func toPlain(value any) any {
	if value == nil {
		return nil
	}
	switch v := value.(type) {
	case dbtype.Date:
		return time.Time(v).Format("2006-01-02")
	case dbtype.LocalDateTime:
		return time.Time(v).Format("2006-01-02T15:04:05.999999999")
	case dbtype.LocalTime:
		return time.Time(v).Format("15:04:05.999999999")
	case dbtype.Time:
		return time.Time(v).Format("15:04:05.999999999Z07:00")
	case dbtype.Duration:
		return v.String()
	case time.Time:
		// Neo4j DateTime is represented as time.Time in Go
		return v.Format("2006-01-02T15:04:05.999999999Z07:00")
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = toPlain(item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, val := range v {
			out[k] = toPlain(val)
		}
		return out
	default:
		return v
	}
}

// normalizeNode converts a Neo4j node to the canonical GraphNode shape.
func normalizeNode(node dbtype.Node) GraphNode {
	appID, _ := node.Props["id"].(string)
	name, _ := node.Props["name"].(string)
	label := name
	if label == "" {
		label = appID
	}
	nodeType := ""
	if len(node.Labels) > 0 {
		nodeType = node.Labels[0]
	}
	return GraphNode{
		ID:         appID,
		Label:      label,
		Type:       nodeType,
		Labels:     node.Labels,
		Properties: toPlain(node.Props).(map[string]any),
	}
}

// runConstraintsAndSeed reads Cypher files from /init-scripts and executes each
// statement, mirroring the Node.js backend's runConstraintsAndSeed logic.
func runConstraintsAndSeed(ctx context.Context) {
	initDir := "/init-scripts"
	if _, err := os.Stat(initDir); os.IsNotExist(err) {
		log.Println("No /init-scripts directory found, skipping Neo4j seed.")
		return
	}

	entries, err := os.ReadDir(initDir)
	if err != nil {
		log.Printf("Neo4j seed: cannot read %s: %v", initDir, err)
		return
	}

	// Sort files for deterministic execution order.
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	session := getNeo4jWriteSession(ctx)
	defer session.Close(ctx)

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".cypher") {
			continue
		}
		fullPath := filepath.Join(initDir, entry.Name())
		statements, err := parseCypherFile(fullPath)
		if err != nil {
			log.Printf("Neo4j seed: cannot parse %s: %v", entry.Name(), err)
			continue
		}
		for _, stmt := range statements {
			if _, err := session.Run(ctx, stmt, nil); err != nil {
				log.Printf("Neo4j seed: error in %s: %v", entry.Name(), err)
			}
		}
		log.Printf("Neo4j: applied %s", entry.Name())
	}
}

// parseCypherFile strips // comments and splits file content on semicolons.
func parseCypherFile(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(strings.TrimSpace(line), "//") {
			lines = append(lines, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	content := strings.Join(lines, "\n")
	raw := strings.Split(content, ";")
	var stmts []string
	for _, s := range raw {
		s = strings.TrimSpace(s)
		if s != "" {
			stmts = append(stmts, s)
		}
	}
	return stmts, nil
}
