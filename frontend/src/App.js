import React, { useState, useEffect } from "react";
import WorldMap from "./WorldMap";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4000";

export default function App() {
  const [countries, setCountries] = useState([]);
  const [nameAliases, setNameAliases] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/countries`).then((res) => res.json()),
      fetch(`${API_URL}/api/country-name-aliases`).then((res) => res.json()),
    ])
      .then(([countriesData, aliasesData]) => {
        const map = {};
        countriesData.forEach((c) => {
          map[c.iso_a3] = c;
          map[c.iso_a2] = c;
          map[c.name.toLowerCase()] = c;
        });
        setCountries(map);

        const aliasMap = {};
        aliasesData.forEach((a) => {
          aliasMap[a.alias] = a.canonical_name;
        });
        setNameAliases(aliasMap);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load data:", err);
        setLoading(false);
      });
  }, []); 

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.title}>Dot Con</span>
      </header>
      {loading ? (
        <div style={styles.loading}>Loading…</div>
      ) : (
        <WorldMap countries={countries} nameAliases={nameAliases} />
      )}
    </div>
  );
}

const styles = {
  container: {
    width: "100vw",
    height: "100vh",
    background: "#111",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    pointerEvents: "none",
  },
  title: {
    color: "#999",
    fontSize: "14px",
    fontWeight: 300,
    letterSpacing: "3px",
    textTransform: "uppercase",
  },
  loading: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#555",
    fontSize: "13px",
    fontWeight: 300,
    letterSpacing: "2px",
  },
};
