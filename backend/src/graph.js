const express = require("express");
const neo4jClient = require("./neo4j");

const router = express.Router();

// Helper: convert Neo4j integers and dates to plain JS values
function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "object" && value.constructor && value.constructor.name === "Integer") {
    return value.toNumber();
  }
  if (typeof value === "object" && value.constructor && value.constructor.name === "Date") {
    return value.toString();
  }
  if (typeof value === "object" && value.constructor && value.constructor.name === "DateTime") {
    return value.toString();
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object" && value !== null) {
    const out = {};
    for (const k of Object.keys(value)) out[k] = toPlain(value[k]);
    return out;
  }
  return value;
}

function normalizeNode(record, alias = "n") {
  const node = record.get(alias);
  return {
    id: node.properties.id,
    label: node.properties.name || node.properties.id,
    type: node.labels[0],
    labels: node.labels,
    properties: toPlain(node.properties),
  };
}

function normalizeRelationship(rel) {
  return {
    id: rel.identity.toString(),
    source: rel.start.toString(),
    target: rel.end.toString(),
    type: rel.type,
    properties: toPlain(rel.properties),
  };
}

// GET /api/graph/health
router.get("/health", async (_req, res) => {
  try {
    await neo4jClient.verifyConnectivity();
    res.json({ status: "ok", database: "neo4j" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// GET /api/graph/node/:id
router.get("/node/:id", async (req, res) => {
  const session = await neo4jClient.getSession();
  try {
    const result = await session.run(
      "MATCH (n {id: $id}) RETURN n LIMIT 1",
      { id: req.params.id }
    );
    if (result.records.length === 0) {
      return res.status(404).json({ error: "Node not found" });
    }
    res.json(normalizeNode(result.records[0]));
  } catch (err) {
    console.error("graph/node error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// GET /api/graph/neighborhood/:id
// Returns the node and all directly connected nodes and relationships
router.get("/neighborhood/:id", async (req, res) => {
  const session = await neo4jClient.getSession();
  try {
    const result = await session.run(
      `MATCH (center {id: $id})
       OPTIONAL MATCH (center)-[r]-(neighbor)
       RETURN center, collect(distinct r) AS rels, collect(distinct neighbor) AS neighbors`,
      { id: req.params.id }
    );
    if (result.records.length === 0) {
      return res.status(404).json({ error: "Node not found" });
    }
    const record = result.records[0];
    const center = record.get("center");
    const rels = record.get("rels");
    const neighbors = record.get("neighbors");

    const nodes = [
      {
        id: center.properties.id,
        label: center.properties.name || center.properties.id,
        type: center.labels[0],
        labels: center.labels,
        properties: toPlain(center.properties),
      },
    ];
    neighbors.forEach((n) => {
      if (n && n.properties && n.properties.id) {
        nodes.push({
          id: n.properties.id,
          label: n.properties.name || n.properties.id,
          type: n.labels[0],
          labels: n.labels,
          properties: toPlain(n.properties),
        });
      }
    });

    const relationships = rels
      .filter((r) => r !== null)
      .map((r) => ({
        id: r.identity.toString(),
        source: r.startNodeElementId || r.start.toString(),
        target: r.endNodeElementId || r.end.toString(),
        sourceId: null,
        targetId: null,
        type: r.type,
        properties: toPlain(r.properties),
      }));

    res.json({ nodes, relationships });
  } catch (err) {
    console.error("graph/neighborhood error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// GET /api/graph/path?from=id1&to=id2
router.get("/path", async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "from and to query params required" });
  }
  const session = await neo4jClient.getSession();
  try {
    const result = await session.run(
      `MATCH path = shortestPath((a {id: $from})-[*..10]-(b {id: $to}))
       RETURN path`,
      { from, to }
    );
    if (result.records.length === 0) {
      return res.json({ nodes: [], relationships: [] });
    }
    const path = result.records[0].get("path");
    const nodeMap = new Map();
    path.segments.forEach((seg) => {
      [seg.start, seg.end].forEach((n) => {
        if (n && n.properties.id) {
          nodeMap.set(n.properties.id, {
            id: n.properties.id,
            label: n.properties.name || n.properties.id,
            type: n.labels[0],
            labels: n.labels,
            properties: toPlain(n.properties),
          });
        }
      });
    });
    const relationships = path.segments.map((seg) => ({
      id: seg.relationship.identity.toString(),
      source: seg.start.properties.id,
      target: seg.end.properties.id,
      type: seg.relationship.type,
      properties: toPlain(seg.relationship.properties),
    }));
    res.json({ nodes: Array.from(nodeMap.values()), relationships });
  } catch (err) {
    console.error("graph/path error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

const ALLOWED_NODE_LABELS = ["Principal", "Event", "Location", "Topic", "Policy", "Source", "Fact"];
const ALLOWED_REL_TYPES = [
  "PERFORMED", "PARTICIPATED_IN", "OCCURRED_IN", "LOCATED_IN",
  "ASSOCIATED_WITH", "TARGETED", "FUNDED", "RECEIVED_FUNDS",
  "CONTRACTED_WITH", "SUPPORTED_BY_SOURCE", "ASSERTS", "ABOUT", "RELATED_TO",
];

// Pre-built parameterized queries for each allowed node label (avoids interpolation)
const SEARCH_QUERIES_BY_LABEL = Object.fromEntries(
  ALLOWED_NODE_LABELS.map((label) => [
    label,
    `MATCH (n:${label}) WHERE toLower(n.name) CONTAINS toLower($q) OR toLower(n.id) CONTAINS toLower($q) RETURN n LIMIT 20`,
  ])
);

// Pre-built MERGE queries for each allowed relationship type (avoids interpolation)
const MERGE_REL_QUERIES = Object.fromEntries(
  ALLOWED_REL_TYPES.map((relType) => [
    relType,
    `MATCH (a {id: $source_id}), (b {id: $target_id})
     MERGE (a)-[r:${relType}]->(b)
     SET r += $props
     RETURN type(r) AS rel_type, a.id AS source, b.id AS target`,
  ])
);
router.get("/search", async (req, res) => {
  const { q = "", type } = req.query;
  const session = await neo4jClient.getSession();
  try {
    let query, params;
    if (type) {
      if (!ALLOWED_NODE_LABELS.includes(type)) {
        await session.close();
        return res.status(400).json({ error: `Node type '${type}' is not allowed` });
      }
      query = SEARCH_QUERIES_BY_LABEL[type];
      params = { q };
    } else {
      query = `MATCH (n) WHERE toLower(n.name) CONTAINS toLower($q) OR toLower(n.id) CONTAINS toLower($q) RETURN n LIMIT 20`;
      params = { q };
    }
    const result = await session.run(query, params);
    const nodes = result.records.map((r) => normalizeNode(r));
    res.json({ nodes });
  } catch (err) {
    console.error("graph/search error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// GET /api/graph/locations
// Returns location-level summaries for map overlay
router.get("/locations", async (_req, res) => {
  const session = await neo4jClient.getSession();
  try {
    const result = await session.run(
      `MATCH (loc:Location)
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
    );
    const locations = result.records.map((r) => ({
      location_id: r.get("loc").properties.id,
      name: r.get("loc").properties.name,
      iso_a3: r.get("loc").properties.iso_a3,
      iso_a2: r.get("loc").properties.iso_a2,
      event_count: toPlain(r.get("event_count")),
      total_money_spend: toPlain(r.get("total_money_spend")),
      connected_principals: r.get("connected_principals").filter(Boolean),
      top_topics: r.get("top_topics").filter(Boolean),
    }));
    res.json(locations);
  } catch (err) {
    console.error("graph/locations error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// GET /api/graph/events?type=Money+Spend&sub_type=Lobbying
router.get("/events", async (req, res) => {
  const { type, sub_type } = req.query;
  const session = await neo4jClient.getSession();
  try {
    let whereClauses = [];
    let params = {};
    if (type) {
      whereClauses.push("e.event_type = $type");
      params.type = type;
    }
    if (sub_type) {
      whereClauses.push("e.sub_type = $sub_type");
      params.sub_type = sub_type;
    }
    const where = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
    const result = await session.run(
      `MATCH (e:Event) ${where}
       OPTIONAL MATCH (p:Principal)-[:PERFORMED]->(e)
       OPTIONAL MATCH (e)-[:OCCURRED_IN]->(loc:Location)
       OPTIONAL MATCH (p)-[:LOCATED_IN]->(ploc:Location)
       RETURN e, collect(distinct p) AS principals, loc, ploc`,
      params
    );
    const items = result.records.map((r) => ({
      event: {
        id: r.get("e").properties.id,
        label: r.get("e").properties.label || r.get("e").properties.id,
        type: "Event",
        properties: toPlain(r.get("e").properties),
      },
      principals: r.get("principals").filter(Boolean).map((p) => ({
        id: p.properties.id,
        label: p.properties.name || p.properties.id,
        type: p.labels[0],
        properties: toPlain(p.properties),
      })),
      event_location: r.get("loc")
        ? {
            id: r.get("loc").properties.id,
            name: r.get("loc").properties.name,
            iso_a3: r.get("loc").properties.iso_a3,
          }
        : null,
      principal_location: r.get("ploc")
        ? {
            id: r.get("ploc").properties.id,
            name: r.get("ploc").properties.name,
            iso_a3: r.get("ploc").properties.iso_a3,
          }
        : null,
    }));
    res.json(items);
  } catch (err) {
    console.error("graph/events error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// GET /api/graph/map-connections
// Returns node+relationship data formatted for map overlay rendering
// Each connection has source_iso_a3 and target_iso_a3 for drawing arcs between countries
router.get("/map-connections", async (req, res) => {
  const { filter_type, filter_value } = req.query;
  const session = await neo4jClient.getSession();
  try {
    // Find principals with locations who performed events in different locations
    let baseQuery = `
      MATCH (p:Principal)-[:LOCATED_IN]->(ploc:Location),
            (p)-[:PERFORMED]->(e:Event)-[:OCCURRED_IN]->(eloc:Location)
      WHERE ploc.id <> eloc.id
    `;
    const params = {};

    if (filter_type === "event_type" && filter_value) {
      baseQuery += " AND e.event_type = $filter_value";
      params.filter_value = filter_value;
    } else if (filter_type === "sub_type" && filter_value) {
      baseQuery += " AND e.sub_type = $filter_value";
      params.filter_value = filter_value;
    } else if (filter_type === "principal" && filter_value) {
      baseQuery += " AND p.name = $filter_value";
      params.filter_value = filter_value;
    } else if (filter_type === "topic" && filter_value) {
      baseQuery += `
        WITH p, ploc, e, eloc
        MATCH (e)-[:ASSOCIATED_WITH]->(t:Topic {name: $filter_value})
      `;
      params.filter_value = filter_value;
    }

    baseQuery += `
      OPTIONAL MATCH (e)-[:ASSOCIATED_WITH]->(t:Topic)
      RETURN p, ploc, e, eloc, collect(distinct t.name) AS topics
    `;

    const result = await session.run(baseQuery, params);

    const nodes = new Map();
    const connections = [];

    result.records.forEach((r) => {
      const principal = r.get("p");
      const principalLoc = r.get("ploc");
      const event = r.get("e");
      const eventLoc = r.get("eloc");
      const topics = r.get("topics");

      [
        { node: principal, type: principal.labels[0] },
        { node: principalLoc, type: "Location" },
        { node: event, type: "Event" },
        { node: eventLoc, type: "Location" },
      ].forEach(({ node, type }) => {
        if (node && node.properties.id && !nodes.has(node.properties.id)) {
          nodes.set(node.properties.id, {
            id: node.properties.id,
            label: node.properties.name || node.properties.id,
            type,
            labels: node.labels,
            properties: toPlain(node.properties),
          });
        }
      });

      connections.push({
        source_node_id: principal.properties.id,
        source_iso_a3: principalLoc.properties.iso_a3,
        source_location_name: principalLoc.properties.name,
        target_node_id: event.properties.id,
        target_iso_a3: eventLoc.properties.iso_a3,
        target_location_name: eventLoc.properties.name,
        event_type: event.properties.event_type,
        sub_type: event.properties.sub_type,
        value: toPlain(event.properties.value),
        currency: event.properties.currency,
        topics,
        principal_name: principal.properties.name,
        event_label: event.properties.label || event.properties.id,
      });
    });

    res.json({
      nodes: Array.from(nodes.values()),
      connections,
    });
  } catch (err) {
    console.error("graph/map-connections error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// POST /api/graph/principals - create or update a principal
router.post("/principals", async (req, res) => {
  const { id, name, principal_type, industry, country, valid_from, valid_to, aliases, metadata } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: "id and name are required" });
  }
  const session = await neo4jClient.getWriteSession();
  try {
    const result = await session.run(
      `MERGE (n:Principal {id: $id})
       SET n.name = $name,
           n.principal_type = $principal_type,
           n.industry = $industry,
           n.country = $country,
           n.valid_from = CASE WHEN $valid_from IS NOT NULL THEN date($valid_from) ELSE null END,
           n.valid_to = CASE WHEN $valid_to IS NOT NULL THEN date($valid_to) ELSE null END,
           n.aliases = $aliases,
           n.updated_at = datetime()
       RETURN n`,
      { id, name, principal_type: principal_type || null, industry: industry || null, country: country || null, valid_from: valid_from || null, valid_to: valid_to || null, aliases: aliases || [], metadata: metadata || {} }
    );
    res.json(normalizeNode(result.records[0]));
  } catch (err) {
    console.error("graph/principals POST error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// POST /api/graph/events - create or update an event
router.post("/events", async (req, res) => {
  const { id, event_type, sub_type, value, currency, period_from, period_to, confidence, label } = req.body;
  if (!id || !event_type) {
    return res.status(400).json({ error: "id and event_type are required" });
  }
  const session = await neo4jClient.getWriteSession();
  try {
    const result = await session.run(
      `MERGE (n:Event {id: $id})
       SET n.event_type = $event_type,
           n.sub_type = $sub_type,
           n.label = $label,
           n.value = $value,
           n.currency = $currency,
           n.period_from = CASE WHEN $period_from IS NOT NULL THEN date($period_from) ELSE null END,
           n.period_to = CASE WHEN $period_to IS NOT NULL THEN date($period_to) ELSE null END,
           n.confidence = $confidence,
           n.updated_at = datetime()
       RETURN n`,
      { id, event_type, sub_type: sub_type || null, label: label || null, value: value || 0, currency: currency || "USD", period_from: period_from || null, period_to: period_to || null, confidence: confidence || 0.5 }
    );
    res.json(normalizeNode(result.records[0]));
  } catch (err) {
    console.error("graph/events POST error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// POST /api/graph/relationships - create a relationship
router.post("/relationships", async (req, res) => {
  const { source_id, target_id, type, properties } = req.body;
  if (!source_id || !target_id || !type) {
    return res.status(400).json({ error: "source_id, target_id, and type are required" });
  }
  if (!ALLOWED_REL_TYPES.includes(type)) {
    return res.status(400).json({ error: `Relationship type '${type}' is not allowed` });
  }
  const session = await neo4jClient.getWriteSession();
  try {
    const result = await session.run(
      MERGE_REL_QUERIES[type],
      { source_id, target_id, props: properties || {} }
    );
    if (result.records.length === 0) {
      return res.status(404).json({ error: "Source or target node not found" });
    }
    const r = result.records[0];
    res.json({ type: r.get("rel_type"), source: r.get("source"), target: r.get("target") });
  } catch (err) {
    console.error("graph/relationships POST error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

module.exports = router;
