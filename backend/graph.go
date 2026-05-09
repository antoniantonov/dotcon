package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j/dbtype"
)

// GraphNode is the common node shape returned by all graph endpoints.
type GraphNode struct {
	ID         string         `json:"id"`
	Label      string         `json:"label"`
	Type       string         `json:"type"`
	Labels     []string       `json:"labels"`
	Properties map[string]any `json:"properties"`
}

// GraphRelationship is the common relationship shape returned by graph endpoints.
type GraphRelationship struct {
	ID         string         `json:"id"`
	Source     string         `json:"source"`
	Target     string         `json:"target"`
	Type       string         `json:"type"`
	Properties map[string]any `json:"properties"`
}

var allowedNodeLabels = []string{
	"Principal", "Event", "Location", "Topic", "Policy", "Source", "Fact",
}

var allowedRelTypes = []string{
	"PERFORMED", "PARTICIPATED_IN", "OCCURRED_IN", "LOCATED_IN",
	"ASSOCIATED_WITH", "TARGETED", "FUNDED", "RECEIVED_FUNDS",
	"CONTRACTED_WITH", "SUPPORTED_BY_SOURCE", "ASSERTS", "ABOUT", "RELATED_TO",
}

// Pre-built parameterised search queries per node label (avoids Cypher injection).
var searchQueriesByLabel = func() map[string]string {
	m := make(map[string]string, len(allowedNodeLabels))
	for _, label := range allowedNodeLabels {
		m[label] = fmt.Sprintf(
			"MATCH (n:%s) WHERE toLower(n.name) CONTAINS toLower($q) OR toLower(n.id) CONTAINS toLower($q) RETURN n LIMIT 20",
			label,
		)
	}
	return m
}()

// Pre-built MERGE queries per allowed relationship type (avoids Cypher injection).
var mergeRelQueries = func() map[string]string {
	m := make(map[string]string, len(allowedRelTypes))
	for _, relType := range allowedRelTypes {
		m[relType] = fmt.Sprintf(
			`MATCH (a {id: $source_id}), (b {id: $target_id})
MERGE (a)-[r:%s]->(b)
SET r += $props
RETURN type(r) AS rel_type, a.id AS source, b.id AS target`,
			relType,
		)
	}
	return m
}()

func isAllowedLabel(t string) bool {
	for _, l := range allowedNodeLabels {
		if l == t {
			return true
		}
	}
	return false
}

func isAllowedRelType(t string) bool {
	for _, r := range allowedRelTypes {
		if r == t {
			return true
		}
	}
	return false
}

// registerGraphRoutes mounts all /api/graph/* handlers onto the given router group.
func registerGraphRoutes(rg *gin.RouterGroup) {
	rg.GET("/health", graphHealthHandler)
	rg.GET("/node/:id", graphNodeHandler)
	rg.GET("/neighborhood/:id", graphNeighborhoodHandler)
	rg.GET("/path", graphPathHandler)
	rg.GET("/search", graphSearchHandler)
	rg.GET("/locations", graphLocationsHandler)
	rg.GET("/events", graphEventsHandler)
	rg.GET("/map-connections", graphMapConnectionsHandler)
	rg.GET("/types", graphTypesHandler)
	rg.GET("/types/:type/values", graphTypeValuesHandler)
	rg.GET("/journalist-killings", graphJournalistKillingsHandler)
	rg.POST("/principals", graphCreatePrincipalHandler)
	rg.POST("/events", graphCreateEventHandler)
	rg.POST("/relationships", graphCreateRelationshipHandler)
}

// GET /api/graph/health
func graphHealthHandler(c *gin.Context) {
	ctx := c.Request.Context()
	if err := neo4jDriver.VerifyConnectivity(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "database": "neo4j"})
}

// GET /api/graph/node/:id
func graphNodeHandler(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	result, err := session.Run(ctx, "MATCH (n {id: $id}) RETURN n LIMIT 1", map[string]any{"id": id})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(records) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}
	node, _ := records[0].Get("n")
	c.JSON(http.StatusOK, normalizeNode(node.(dbtype.Node)))
}

// GET /api/graph/neighborhood/:id
func graphNeighborhoodHandler(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	query := `MATCH (center {id: $id})
OPTIONAL MATCH (center)-[r]-(neighbor)
RETURN center, collect(distinct r) AS rels, collect(distinct neighbor) AS neighbors`

	result, err := session.Run(ctx, query, map[string]any{"id": id})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(records) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}

	record := records[0]
	centerRaw, _ := record.Get("center")
	center := centerRaw.(dbtype.Node)

	nodes := []GraphNode{normalizeNode(center)}

	neighborsRaw, _ := record.Get("neighbors")
	for _, nRaw := range neighborsRaw.([]any) {
		if nRaw == nil {
			continue
		}
		n, ok := nRaw.(dbtype.Node)
		if !ok {
			continue
		}
		if _, hasID := n.Props["id"]; hasID {
			nodes = append(nodes, normalizeNode(n))
		}
	}

	relsRaw, _ := record.Get("rels")
	var relationships []GraphRelationship
	for _, rRaw := range relsRaw.([]any) {
		if rRaw == nil {
			continue
		}
		r, ok := rRaw.(dbtype.Relationship)
		if !ok {
			continue
		}
		relationships = append(relationships, GraphRelationship{
			ID:         r.ElementId,
			Source:     r.StartElementId,
			Target:     r.EndElementId,
			Type:       r.Type,
			Properties: toPlain(r.Props).(map[string]any),
		})
	}
	if relationships == nil {
		relationships = []GraphRelationship{}
	}

	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "relationships": relationships})
}

// GET /api/graph/path?from=id1&to=id2
func graphPathHandler(c *gin.Context) {
	ctx := c.Request.Context()
	from := c.Query("from")
	to := c.Query("to")
	if from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from and to query params required"})
		return
	}

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	query := `MATCH path = shortestPath((a {id: $from})-[*..10]-(b {id: $to}))
RETURN path`

	result, err := session.Run(ctx, query, map[string]any{"from": from, "to": to})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(records) == 0 {
		c.JSON(http.StatusOK, gin.H{"nodes": []any{}, "relationships": []any{}})
		return
	}

	pathRaw, _ := records[0].Get("path")
	path := pathRaw.(dbtype.Path)

	nodeMap := make(map[string]GraphNode)
	for _, n := range path.Nodes {
		appID, _ := n.Props["id"].(string)
		if appID != "" {
			nodeMap[appID] = normalizeNode(n)
		}
	}

	var relationships []GraphRelationship
	for i, rel := range path.Relationships {
		startAppID, _ := path.Nodes[i].Props["id"].(string)
		endAppID, _ := path.Nodes[i+1].Props["id"].(string)
		relationships = append(relationships, GraphRelationship{
			ID:         rel.ElementId,
			Source:     startAppID,
			Target:     endAppID,
			Type:       rel.Type,
			Properties: toPlain(rel.Props).(map[string]any),
		})
	}
	if relationships == nil {
		relationships = []GraphRelationship{}
	}

	nodes := make([]GraphNode, 0, len(nodeMap))
	for _, n := range nodeMap {
		nodes = append(nodes, n)
	}

	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "relationships": relationships})
}

// GET /api/graph/search?q=&type=
func graphSearchHandler(c *gin.Context) {
	ctx := c.Request.Context()
	q := c.DefaultQuery("q", "")
	nodeType := c.Query("type")

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	var query string
	params := map[string]any{"q": q}

	if nodeType != "" {
		if !isAllowedLabel(nodeType) {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Node type '%s' is not allowed", nodeType)})
			return
		}
		query = searchQueriesByLabel[nodeType]
	} else {
		query = `MATCH (n) WHERE toLower(n.name) CONTAINS toLower($q) OR toLower(n.id) CONTAINS toLower($q) RETURN n LIMIT 20`
	}

	result, err := session.Run(ctx, query, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	nodes := make([]GraphNode, 0, len(records))
	for _, rec := range records {
		nRaw, _ := rec.Get("n")
		nodes = append(nodes, normalizeNode(nRaw.(dbtype.Node)))
	}
	c.JSON(http.StatusOK, gin.H{"nodes": nodes})
}

// GET /api/graph/locations
func graphLocationsHandler(c *gin.Context) {
	ctx := c.Request.Context()

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	query := `MATCH (loc:Location)
OPTIONAL MATCH (e:Event)-[:OCCURRED_IN]->(loc)
OPTIONAL MATCH (p:Principal)-[:LOCATED_IN]->(loc)
OPTIONAL MATCH (e2:Event)-[:OCCURRED_IN]->(loc)
OPTIONAL MATCH (e2)-[:ASSOCIATED_WITH]->(t:Topic)
WITH loc,
     count(distinct e) AS event_count,
     sum(distinct coalesce(e.value, 0)) AS total_money_spend,
     collect(distinct p.name) AS connected_principals,
     collect(distinct t.name) AS top_topics
RETURN loc, event_count, total_money_spend, connected_principals, top_topics`

	result, err := session.Run(ctx, query, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type LocationSummary struct {
		LocationID          string   `json:"location_id"`
		Name                string   `json:"name"`
		IsoA3               string   `json:"iso_a3"`
		IsoA2               string   `json:"iso_a2"`
		EventCount          any      `json:"event_count"`
		TotalMoneySpend     any      `json:"total_money_spend"`
		ConnectedPrincipals []string `json:"connected_principals"`
		TopTopics           []string `json:"top_topics"`
	}

	locations := make([]LocationSummary, 0, len(records))
	for _, rec := range records {
		locRaw, _ := rec.Get("loc")
		loc := locRaw.(dbtype.Node)
		isoA3, _ := loc.Props["iso_a3"].(string)
		isoA2, _ := loc.Props["iso_a2"].(string)
		locID, _ := loc.Props["id"].(string)
		locName, _ := loc.Props["name"].(string)

		eventCount, _ := rec.Get("event_count")
		totalMoneySpend, _ := rec.Get("total_money_spend")

		connRaw, _ := rec.Get("connected_principals")
		connPrincipals := filterStrings(connRaw)

		topicsRaw, _ := rec.Get("top_topics")
		topTopics := filterStrings(topicsRaw)

		locations = append(locations, LocationSummary{
			LocationID:          locID,
			Name:                locName,
			IsoA3:               isoA3,
			IsoA2:               isoA2,
			EventCount:          toPlain(eventCount),
			TotalMoneySpend:     toPlain(totalMoneySpend),
			ConnectedPrincipals: connPrincipals,
			TopTopics:           topTopics,
		})
	}
	c.JSON(http.StatusOK, locations)
}

// GET /api/graph/events?type=&sub_type=
func graphEventsHandler(c *gin.Context) {
	ctx := c.Request.Context()
	eventType := c.Query("type")
	subType := c.Query("sub_type")

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	var whereClauses []string
	params := map[string]any{}
	if eventType != "" {
		whereClauses = append(whereClauses, "e.event_type = $type")
		params["type"] = eventType
	}
	if subType != "" {
		whereClauses = append(whereClauses, "e.sub_type = $sub_type")
		params["sub_type"] = subType
	}
	where := ""
	if len(whereClauses) > 0 {
		where = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	query := fmt.Sprintf(`MATCH (e:Event) %s
OPTIONAL MATCH (p:Principal)-[:PERFORMED]->(e)
OPTIONAL MATCH (e)-[:OCCURRED_IN]->(loc:Location)
OPTIONAL MATCH (p)-[:LOCATED_IN]->(ploc:Location)
RETURN e, collect(distinct p) AS principals, loc, ploc`, where)

	result, err := session.Run(ctx, query, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type EventItem struct {
		Event             map[string]any   `json:"event"`
		Principals        []map[string]any `json:"principals"`
		EventLocation     any              `json:"event_location"`
		PrincipalLocation any              `json:"principal_location"`
	}

	items := make([]EventItem, 0, len(records))
	for _, rec := range records {
		eRaw, _ := rec.Get("e")
		e := eRaw.(dbtype.Node)
		eID, _ := e.Props["id"].(string)
		eLabel, _ := e.Props["label"].(string)
		if eLabel == "" {
			eLabel = eID
		}

		event := map[string]any{
			"id":         eID,
			"label":      eLabel,
			"type":       "Event",
			"properties": toPlain(e.Props),
		}

		principalsRaw, _ := rec.Get("principals")
		principals := make([]map[string]any, 0)
		for _, pRaw := range principalsRaw.([]any) {
			if pRaw == nil {
				continue
			}
			p, ok := pRaw.(dbtype.Node)
			if !ok {
				continue
			}
			pID, _ := p.Props["id"].(string)
			pName, _ := p.Props["name"].(string)
			pLabel := pName
			if pLabel == "" {
				pLabel = pID
			}
			pType := ""
			if len(p.Labels) > 0 {
				pType = p.Labels[0]
			}
			principals = append(principals, map[string]any{
				"id":         pID,
				"label":      pLabel,
				"type":       pType,
				"properties": toPlain(p.Props),
			})
		}

		var eventLocation any
		locRaw, hasLoc := rec.Get("loc")
		if hasLoc && locRaw != nil {
			if loc, ok := locRaw.(dbtype.Node); ok {
				locID, _ := loc.Props["id"].(string)
				locName, _ := loc.Props["name"].(string)
				locIso, _ := loc.Props["iso_a3"].(string)
				eventLocation = map[string]any{
					"id":     locID,
					"name":   locName,
					"iso_a3": locIso,
				}
			}
		}

		var principalLocation any
		plocRaw, hasPloc := rec.Get("ploc")
		if hasPloc && plocRaw != nil {
			if ploc, ok := plocRaw.(dbtype.Node); ok {
				plocID, _ := ploc.Props["id"].(string)
				plocName, _ := ploc.Props["name"].(string)
				plocIso, _ := ploc.Props["iso_a3"].(string)
				principalLocation = map[string]any{
					"id":     plocID,
					"name":   plocName,
					"iso_a3": plocIso,
				}
			}
		}

		items = append(items, EventItem{
			Event:             event,
			Principals:        principals,
			EventLocation:     eventLocation,
			PrincipalLocation: principalLocation,
		})
	}
	c.JSON(http.StatusOK, items)
}

// GET /api/graph/map-connections
func graphMapConnectionsHandler(c *gin.Context) {
	ctx := c.Request.Context()
	filterType := c.Query("filter_type")
	filterValue := c.Query("filter_value")

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	baseQuery := `MATCH (p:Principal)-[:LOCATED_IN]->(ploc:Location),
      (p)-[:PERFORMED]->(e:Event)-[:OCCURRED_IN]->(eloc:Location)
WHERE ploc.id <> eloc.id`

	params := map[string]any{}

	switch filterType {
	case "event_type":
		if filterValue != "" {
			baseQuery += " AND e.event_type = $filter_value"
			params["filter_value"] = filterValue
		}
	case "sub_type":
		if filterValue != "" {
			baseQuery += " AND e.sub_type = $filter_value"
			params["filter_value"] = filterValue
		}
	case "principal":
		if filterValue != "" {
			baseQuery += " AND p.name = $filter_value"
			params["filter_value"] = filterValue
		}
	case "topic":
		if filterValue != "" {
			baseQuery += `
WITH p, ploc, e, eloc
MATCH (e)-[:ASSOCIATED_WITH]->(t:Topic {name: $filter_value})`
			params["filter_value"] = filterValue
		}
	}

	baseQuery += `
OPTIONAL MATCH (e)-[:ASSOCIATED_WITH]->(t:Topic)
RETURN p, ploc, e, eloc, collect(distinct t.name) AS topics`

	result, err := session.Run(ctx, baseQuery, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	nodeMap := make(map[string]GraphNode)
	var connections []map[string]any

	for _, rec := range records {
		pRaw, _ := rec.Get("p")
		principal := pRaw.(dbtype.Node)

		plocRaw, _ := rec.Get("ploc")
		principalLoc := plocRaw.(dbtype.Node)

		eRaw, _ := rec.Get("e")
		event := eRaw.(dbtype.Node)

		elocRaw, _ := rec.Get("eloc")
		eventLoc := elocRaw.(dbtype.Node)

		topicsRaw, _ := rec.Get("topics")
		topics := filterStrings(topicsRaw)

		for _, node := range []dbtype.Node{principal, principalLoc, event, eventLoc} {
			appID, _ := node.Props["id"].(string)
			if appID != "" {
				if _, exists := nodeMap[appID]; !exists {
					nodeMap[appID] = normalizeNode(node)
				}
			}
		}

		principalID, _ := principal.Props["id"].(string)
		principalName, _ := principal.Props["name"].(string)
		srcIso, _ := principalLoc.Props["iso_a3"].(string)
		srcLocName, _ := principalLoc.Props["name"].(string)
		eventID, _ := event.Props["id"].(string)
		eventLabel, _ := event.Props["label"].(string)
		if eventLabel == "" {
			eventLabel = eventID
		}
		tgtIso, _ := eventLoc.Props["iso_a3"].(string)
		tgtLocName, _ := eventLoc.Props["name"].(string)

		connections = append(connections, map[string]any{
			"source_node_id":       principalID,
			"source_iso_a3":        srcIso,
			"source_location_name": srcLocName,
			"target_node_id":       eventID,
			"target_iso_a3":        tgtIso,
			"target_location_name": tgtLocName,
			"event_type":           toPlain(event.Props["event_type"]),
			"sub_type":             toPlain(event.Props["sub_type"]),
			"value":                toPlain(event.Props["value"]),
			"currency":             toPlain(event.Props["currency"]),
			"period_from":          toPlain(event.Props["period_from"]),
			"period_to":            toPlain(event.Props["period_to"]),
			"topics":               topics,
			"principal_name":       principalName,
			"event_label":          eventLabel,
		})
	}

	nodes := make([]GraphNode, 0, len(nodeMap))
	for _, n := range nodeMap {
		nodes = append(nodes, n)
	}
	if connections == nil {
		connections = []map[string]any{}
	}

	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "connections": connections})
}

// POST /api/graph/principals
func graphCreatePrincipalHandler(c *gin.Context) {
	ctx := c.Request.Context()
	var body struct {
		ID            string   `json:"id"`
		Name          string   `json:"name"`
		PrincipalType string   `json:"principal_type"`
		Industry      string   `json:"industry"`
		Country       string   `json:"country"`
		ValidFrom     string   `json:"valid_from"`
		ValidTo       string   `json:"valid_to"`
		Aliases       []string `json:"aliases"`
		Metadata      any      `json:"metadata"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.ID == "" || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id and name are required"})
		return
	}

	session := getNeo4jWriteSession(ctx)
	defer session.Close(ctx)

	var validFrom, validTo any
	if body.ValidFrom != "" {
		validFrom = body.ValidFrom
	}
	if body.ValidTo != "" {
		validTo = body.ValidTo
	}
	aliases := body.Aliases
	if aliases == nil {
		aliases = []string{}
	}

	query := `MERGE (n:Principal {id: $id})
SET n.name = $name,
    n.principal_type = $principal_type,
    n.industry = $industry,
    n.country = $country,
    n.valid_from = CASE WHEN $valid_from IS NOT NULL THEN date($valid_from) ELSE null END,
    n.valid_to = CASE WHEN $valid_to IS NOT NULL THEN date($valid_to) ELSE null END,
    n.aliases = $aliases,
    n.updated_at = datetime()
RETURN n`

	result, err := session.Run(ctx, query, map[string]any{
		"id":             body.ID,
		"name":           body.Name,
		"principal_type": nullString(body.PrincipalType),
		"industry":       nullString(body.Industry),
		"country":        nullString(body.Country),
		"valid_from":     validFrom,
		"valid_to":       validTo,
		"aliases":        aliases,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	nRaw, _ := records[0].Get("n")
	c.JSON(http.StatusOK, normalizeNode(nRaw.(dbtype.Node)))
}

// POST /api/graph/events
func graphCreateEventHandler(c *gin.Context) {
	ctx := c.Request.Context()
	var body struct {
		ID         string  `json:"id"`
		EventType  string  `json:"event_type"`
		SubType    string  `json:"sub_type"`
		Value      float64 `json:"value"`
		Currency   string  `json:"currency"`
		PeriodFrom string  `json:"period_from"`
		PeriodTo   string  `json:"period_to"`
		Confidence float64 `json:"confidence"`
		Label      string  `json:"label"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.ID == "" || body.EventType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id and event_type are required"})
		return
	}

	session := getNeo4jWriteSession(ctx)
	defer session.Close(ctx)

	var periodFrom, periodTo any
	if body.PeriodFrom != "" {
		periodFrom = body.PeriodFrom
	}
	if body.PeriodTo != "" {
		periodTo = body.PeriodTo
	}
	currency := body.Currency
	if currency == "" {
		currency = "USD"
	}
	confidence := body.Confidence
	if confidence == 0 {
		confidence = 0.5
	}

	query := `MERGE (n:Event {id: $id})
SET n.event_type = $event_type,
    n.sub_type = $sub_type,
    n.label = $label,
    n.value = $value,
    n.currency = $currency,
    n.period_from = CASE WHEN $period_from IS NOT NULL THEN date($period_from) ELSE null END,
    n.period_to = CASE WHEN $period_to IS NOT NULL THEN date($period_to) ELSE null END,
    n.confidence = $confidence,
    n.updated_at = datetime()
RETURN n`

	result, err := session.Run(ctx, query, map[string]any{
		"id":          body.ID,
		"event_type":  body.EventType,
		"sub_type":    nullString(body.SubType),
		"label":       nullString(body.Label),
		"value":       body.Value,
		"currency":    currency,
		"period_from": periodFrom,
		"period_to":   periodTo,
		"confidence":  confidence,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	nRaw, _ := records[0].Get("n")
	c.JSON(http.StatusOK, normalizeNode(nRaw.(dbtype.Node)))
}

// POST /api/graph/relationships
func graphCreateRelationshipHandler(c *gin.Context) {
	ctx := c.Request.Context()
	var body struct {
		SourceID   string         `json:"source_id"`
		TargetID   string         `json:"target_id"`
		Type       string         `json:"type"`
		Properties map[string]any `json:"properties"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.SourceID == "" || body.TargetID == "" || body.Type == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source_id, target_id, and type are required"})
		return
	}
	if !isAllowedRelType(body.Type) {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Relationship type '%s' is not allowed", body.Type)})
		return
	}

	session := getNeo4jWriteSession(ctx)
	defer session.Close(ctx)

	props := body.Properties
	if props == nil {
		props = map[string]any{}
	}

	result, err := session.Run(ctx, mergeRelQueries[body.Type], map[string]any{
		"source_id": body.SourceID,
		"target_id": body.TargetID,
		"props":     props,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(records) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Source or target node not found"})
		return
	}
	r := records[0]
	relType, _ := r.Get("rel_type")
	src, _ := r.Get("source")
	tgt, _ := r.Get("target")
	c.JSON(http.StatusOK, gin.H{"type": relType, "source": src, "target": tgt})
}

// GET /api/graph/types
// Returns the list of node types available for the two-tier picker.
func graphTypesHandler(c *gin.Context) {
	out := make([]map[string]string, 0, len(allowedNodeLabels))
	for _, l := range allowedNodeLabels {
		out = append(out, map[string]string{"type": l, "label": l})
	}
	c.JSON(http.StatusOK, out)
}

// Pre-built parameterised "distinct values" queries per allowed node label.
// For Event we expose sub_type (falling back to event_type) so the user sees
// human-readable categories like "Lobbying" or "Journalist Killing".
// For every other label we use the node's name.
var distinctValuesQueriesByLabel = func() map[string]string {
	m := make(map[string]string, len(allowedNodeLabels))
	for _, label := range allowedNodeLabels {
		var query string
		if label == "Event" {
			query = `MATCH (n:Event)
WITH coalesce(n.sub_type, n.event_type) AS v
WHERE v IS NOT NULL AND v <> ''
RETURN v AS value, count(*) AS count
ORDER BY value`
		} else {
			query = fmt.Sprintf(`MATCH (n:%s)
WITH coalesce(n.name, n.id) AS v
WHERE v IS NOT NULL AND v <> ''
RETURN v AS value, count(*) AS count
ORDER BY value`, label)
		}
		m[label] = query
	}
	return m
}()

// GET /api/graph/types/:type/values
// Returns the distinct values for the given node type. Used to populate the
// second (right-hand) dropdown after the user picks a type.
func graphTypeValuesHandler(c *gin.Context) {
	ctx := c.Request.Context()
	nodeType := c.Param("type")
	if !isAllowedLabel(nodeType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Node type '%s' is not allowed", nodeType)})
		return
	}

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	result, err := session.Run(ctx, distinctValuesQueriesByLabel[nodeType], nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	values := make([]map[string]any, 0, len(records))
	for _, rec := range records {
		v, _ := rec.Get("value")
		count, _ := rec.Get("count")
		values = append(values, map[string]any{
			"value": toPlain(v),
			"count": toPlain(count),
		})
	}
	c.JSON(http.StatusOK, values)
}

// GET /api/graph/journalist-killings
// Returns one item per individual killing event, with the location it occurred
// in and the journalist's name. The frontend aggregates per-location to draw
// the 3D bar markers and lists names in the popup.
func graphJournalistKillingsHandler(c *gin.Context) {
	ctx := c.Request.Context()

	session := getNeo4jReadSession(ctx)
	defer session.Close(ctx)

	// Match either by sub_type or event_type for robustness.
	// Pull the journalist name either from the Event itself (hand-written seed
	// in 03-journalists.cypher) or from the linked Journalist node (fej001
	// ingest writes `(e)-[:TARGETED]->(:Journalist)` and stores `name` there).
	query := `MATCH (e:Event)-[:OCCURRED_IN]->(loc:Location)
WHERE e.sub_type = "Journalist Killing" OR e.event_type = "Journalist Killing"
OPTIONAL MATCH (e)-[:TARGETED]->(j:Journalist)
RETURN e, loc, j.name AS journalist_node_name,
       e.area_coverage AS area_coverage,
       e.conflict_zone_label AS conflict_zone_label,
       e.in_conflict_zone AS in_conflict_zone
ORDER BY e.period_from`

	result, err := session.Run(ctx, query, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	records, err := result.Collect(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	killings := make([]map[string]any, 0, len(records))
	for _, rec := range records {
		eRaw, _ := rec.Get("e")
		event, ok := eRaw.(dbtype.Node)
		if !ok {
			continue
		}
		locRaw, _ := rec.Get("loc")
		loc, ok := locRaw.(dbtype.Node)
		if !ok {
			continue
		}

		journalistName, _ := event.Props["journalist_name"].(string)
		if journalistName == "" {
			// fej001 ingest puts the name on the Journalist node, not the Event.
			if jn, ok := rec.Get("journalist_node_name"); ok {
				if s, ok := jn.(string); ok {
					journalistName = s
				}
			}
		}
		if journalistName == "" {
			// Final fallback to the event label so the popup is never empty.
			if lbl, ok := event.Props["label"].(string); ok {
				journalistName = lbl
			}
		}
		eventID, _ := event.Props["id"].(string)
		locName, _ := loc.Props["name"].(string)
		locIso, _ := loc.Props["iso_a3"].(string)
		locID, _ := loc.Props["id"].(string)

		// Derive a human-readable "reason" for the killing. Prefer the
		// topical area_coverage (Crime / Corruption / Environment / …) when
		// present; otherwise fall back to the conflict-zone label so we
		// never return a totally empty reason for fej001-ingested rows.
		var reason string
		if ac, ok := event.Props["area_coverage"].(string); ok && ac != "" {
			reason = ac
		}
		if reason == "" {
			if czl, ok := event.Props["conflict_zone_label"].(string); ok && czl != "" {
				reason = czl
			}
		}
		if reason == "" {
			if b, ok := event.Props["in_conflict_zone"].(bool); ok && b {
				reason = "Conflict Zone"
			}
		}

		// Fej001-ingested countries only carry iso_a2; derive iso_a3 from the
		// PG-backed lookup so the frontend (keyed by iso_a3) can render them.
		if locIso == "" {
			if a2, ok := loc.Props["iso_a2"].(string); ok && a2 != "" {
				if a3, found := isoA2ToA3[strings.ToUpper(a2)]; found {
					locIso = a3
				}
			}
		}

		killings = append(killings, map[string]any{
			"event_id":        eventID,
			"journalist_name": journalistName,
			"location_id":     locID,
			"location_name":   locName,
			"iso_a3":          locIso,
			"period_from":     toPlain(event.Props["period_from"]),
			"period_to":       toPlain(event.Props["period_to"]),
			"reason":          reason,
		})
	}

	c.JSON(http.StatusOK, killings)
}

// filterStrings converts []any to []string, dropping nil/non-string entries.
func filterStrings(raw any) []string {
	arr, ok := raw.([]any)
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

// nullString returns nil if s is empty, otherwise returns s. Used for optional
// Cypher parameters where NULL is semantically different from an empty string.
func nullString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
