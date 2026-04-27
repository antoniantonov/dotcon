const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 4000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

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

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend listening on port ${port}`);
});
