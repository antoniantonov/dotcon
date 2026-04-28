const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const neo4jClient = require("./neo4j");
const graphRouter = require("./graph");

const app = express();
const port = process.env.PORT || 4000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const COUNTRY_NAME_ALIASES = [
  ["dem. rep. congo", "democratic republic of the congo"],
  ["central african rep.", "central african republic"],
  ["s. sudan", "south sudan"],
  ["eq. guinea", "equatorial guinea"],
  ["dominican rep.", "dominican republic"],
  ["bosnia and herz.", "bosnia and herzegovina"],
  ["czech rep.", "czech republic"],
  ["solomon is.", "solomon islands"],
  ["w. sahara", "western sahara"],
  ["côte d'ivoire", "ivory coast"],
  ["falkland is.", "falkland islands"],
  ["n. korea", "north korea"],
  ["s. korea", "south korea"],
  ["lao pdr", "laos"],
  ["n. cyprus", "northern cyprus"],
  ["n. macedonia", "north macedonia"],
  ["marshall is.", "marshall islands"],
  ["eswatini", "eswatini"],
];

async function ensurePostgresSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS countries (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      iso_a2 VARCHAR(2) NOT NULL UNIQUE,
      iso_a3 VARCHAR(3) NOT NULL UNIQUE,
      capital VARCHAR(100),
      metadata TEXT DEFAULT 'this is metadata',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_countries_iso_a3 ON countries (iso_a3)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_countries_iso_a2 ON countries (iso_a2)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS country_name_aliases (
      id SERIAL PRIMARY KEY,
      alias VARCHAR(100) NOT NULL UNIQUE,
      canonical_name VARCHAR(100) NOT NULL
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_country_name_aliases_alias ON country_name_aliases (alias)");

  const placeholders = COUNTRY_NAME_ALIASES.map(
    (_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`
  ).join(", ");
  const params = COUNTRY_NAME_ALIASES.flatMap(([alias, canonicalName]) => [
    alias,
    canonicalName,
  ]);

  await pool.query(
    `INSERT INTO country_name_aliases (alias, canonical_name)
     VALUES ${placeholders}
     ON CONFLICT (alias) DO UPDATE
     SET canonical_name = EXCLUDED.canonical_name`,
    params
  );
}

app.use(cors());
app.use(express.json());

// Mount graph API routes
app.use("/api/graph", graphRouter);

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/countries", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT name, iso_a2, iso_a3, capital, metadata FROM countries ORDER BY name"
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching countries:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/country-name-aliases", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT alias, canonical_name FROM country_name_aliases ORDER BY alias"
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching country name aliases:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/countries/:iso", async (req, res) => {
  try {
    const iso = req.params.iso.toUpperCase();
    const { rows } = await pool.query(
      "SELECT name, iso_a2, iso_a3, capital, metadata FROM countries WHERE iso_a3 = $1 OR iso_a2 = $1",
      [iso]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Country not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching country:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function start() {
  try {
    await ensurePostgresSchema();
    app.listen(port, "0.0.0.0", () => {
      console.log(`Backend listening on port ${port}`);
      // Attempt Neo4j initialization (constraints + seed) after server starts
      neo4jClient.runConstraintsAndSeed().catch((err) => {
        console.error("Neo4j init failed (non-fatal):", err.message);
      });
    });
  } catch (err) {
    console.error("Backend startup failed:", err);
    process.exit(1);
  }
}

start();
