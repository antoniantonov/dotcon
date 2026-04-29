const neo4j = require("neo4j-driver");

const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
const user = process.env.NEO4J_USER || "neo4j";
const password = process.env.NEO4J_PASSWORD || "local-password";

let driver = null;

function getDriver() {
  if (!driver) {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 5000,
    });
  }
  return driver;
}

async function getSession() {
  return getDriver().session({ defaultAccessMode: neo4j.session.READ });
}

async function getWriteSession() {
  return getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
}

async function verifyConnectivity() {
  return getDriver().verifyConnectivity();
}

async function runConstraintsAndSeed() {
  const fs = require("fs");
  const path = require("path");
  const initDir = "/init-scripts";

  if (!fs.existsSync(initDir)) {
    console.log("No /init-scripts directory found, skipping Neo4j seed.");
    return;
  }

  const session = await getWriteSession();
  try {
    const files = fs.readdirSync(initDir).sort();
    for (const file of files) {
      if (!file.endsWith(".cypher")) continue;
      const fullPath = path.join(initDir, file);
      const content = fs
        .readFileSync(fullPath, "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      const statements = content
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await session.run(stmt);
      }
      console.log(`Neo4j: applied ${file}`);
    }
  } catch (err) {
    console.error("Neo4j seed error:", err.message);
  } finally {
    await session.close();
  }
}

async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

module.exports = {
  getDriver,
  getSession,
  getWriteSession,
  verifyConnectivity,
  runConstraintsAndSeed,
  closeDriver,
};
