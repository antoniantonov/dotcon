import React, { useEffect, useState, useMemo, memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Line,
  Marker,
} from "react-simple-maps";
import { geoMercator, geoPath as d3GeoPath } from "d3-geo";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const mapProjection = geoMercator()
  .scale(140)
  .center([0, 30])
  .translate([400, 300]);
const pathGenerator = d3GeoPath(mapProjection);

const MIN_ZOOM = 1;
const MAX_ZOOM = 20;
const ZOOM_FACTOR = 1.5;
const LABEL_MIN_WIDTH = 60;

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4000";

// Approximate centroids for countries by ISO A3 code
const COUNTRY_CENTROIDS = {
  USA: [-98.5, 39.5],
  GBR: [-3.4, 55.4],
  DEU: [10.4, 51.2],
  FRA: [2.2, 46.2],
  CHN: [104, 35],
  RUS: [100, 60],
  IND: [78.9, 20.6],
  JPN: [138, 36],
  AUS: [133, -25],
  CAN: [-96, 60],
  BRA: [-51.9, -14.2],
  ZAF: [25, -29],
  EGY: [30, 26],
  SAU: [45, 24],
  ISR: [34.9, 31.5],
  UKR: [31.2, 49],
  POL: [19.1, 52],
  BGR: [25.5, 42.7],
};

// Node type colors
const NODE_COLORS = {
  Principal: "#4a9eff",
  Event: "#ff9d4a",
  Location: "#4aff9d",
  Topic: "#ff4a9d",
  Fact: "#c97bff",
  Source: "#ffff4a",
  Policy: "#ff7b7b",
};

const CONNECTION_COLOR = "#4a9eff";

const STYLE_DEFAULT = {
  fill: "#222",
  stroke: "#333",
  strokeWidth: 0.4,
  outline: "none",
};

const STYLE_HOVER = {
  fill: "#fff",
  stroke: "#555",
  strokeWidth: 0.6,
  outline: "none",
  cursor: "pointer",
};

const STYLE_PRESSED = {
  fill: "#ccc",
  stroke: "#555",
  strokeWidth: 0.6,
  outline: "none",
};

const STYLE_HIGHLIGHTED = {
  fill: "#1a3a5c",
  stroke: "#4a9eff",
  strokeWidth: 0.8,
  outline: "none",
};

function lookupCountry(geo, countries, nameAliases) {
  const props = geo.properties;
  const iso3 = props.ISO_A3 || props.iso_a3 || "";
  const iso2 = props.ISO_A2 || props.iso_a2 || "";
  const geoName = props.NAME || props.name || "Unknown";

  let match = countries[iso3] || countries[iso2];
  if (!match) {
    const nameLower = geoName.toLowerCase();
    match = countries[nameLower] || countries[nameAliases[nameLower]];
  }
  return (
    match || { name: geoName, capital: "N/A", metadata: "this is metadata" }
  );
}

function Tooltip({ info, position }) {
  if (!info) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: position.x + 14,
        top: position.y - 10,
        background: "rgba(0,0,0,0.88)",
        border: "1px solid #333",
        borderRadius: "4px",
        padding: "10px 14px",
        pointerEvents: "none",
        zIndex: 1000,
        minWidth: "140px",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: "13px",
          fontWeight: 400,
          letterSpacing: "0.5px",
          marginBottom: "3px",
        }}
      >
        {info.name}
      </div>
      {info.capital && (
        <div
          style={{
            color: "#888",
            fontSize: "11px",
            fontWeight: 300,
            marginBottom: "6px",
          }}
        >
          Capital: {info.capital}
        </div>
      )}
      {info.graphInfo && (
        <div
          style={{
            color: "#4a9eff",
            fontSize: "10px",
            fontWeight: 300,
            borderTop: "1px solid #333",
            paddingTop: "5px",
          }}
        >
          {info.graphInfo}
        </div>
      )}
      {!info.graphInfo && info.metadata && (
        <div
          style={{
            color: "#555",
            fontSize: "10px",
            fontWeight: 300,
            fontStyle: "italic",
            borderTop: "1px solid #333",
            paddingTop: "5px",
          }}
        >
          {info.metadata}
        </div>
      )}
    </div>
  );
}

function formatMoney(value, currency) {
  if (value === null || value === undefined) return "N/A";

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return [value, currency].filter(Boolean).join(" ");
  }

  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(numericValue);
    } catch (_err) {
      return `${numericValue.toLocaleString()} ${currency}`;
    }
  }

  return numericValue.toLocaleString();
}

function formatDateRange(connection) {
  if (connection.period_from && connection.period_to) {
    return `${connection.period_from} → ${connection.period_to}`;
  }
  return connection.period_from || connection.period_to || "N/A";
}

function ConnectionTooltip({ info, position, color, pinned }) {
  if (!info) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: position.x + 14,
        top: position.y - 10,
        background: "rgba(0,0,0,0.9)",
        border: `1px solid ${color}`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 0 18px ${color}44`,
        borderRadius: "4px",
        padding: "10px 14px",
        pointerEvents: "none",
        zIndex: 1001,
        minWidth: "190px",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: "12px",
          fontWeight: 500,
          letterSpacing: "0.5px",
          marginBottom: "7px",
        }}
      >
        {pinned ? "Selected connection" : "Connection"}
      </div>
      <div style={{ color: "#aaa", fontSize: "11px", lineHeight: 1.7 }}>
        <div>
          <span style={{ color: "#666" }}>Principal:</span>{" "}
          <span style={{ color: "#ddd" }}>{info.principal_name || "N/A"}</span>
        </div>
        <div>
          <span style={{ color: "#666" }}>Value:</span>{" "}
          <span style={{ color }}>{formatMoney(info.value, info.currency)}</span>
        </div>
        <div>
          <span style={{ color: "#666" }}>Date:</span>{" "}
          <span style={{ color: "#ddd" }}>{formatDateRange(info)}</span>
        </div>
      </div>
    </div>
  );
}

function getConnectionKey(connection, index) {
  return `${connection.source_node_id || "source"}-${connection.target_node_id || "target"}-${index}`;
}

const CONTROL_BTN = {
  width: 32,
  height: 32,
  background: "rgba(0,0,0,0.75)",
  border: "1px solid #444",
  borderRadius: 4,
  color: "#ccc",
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  userSelect: "none",
  lineHeight: 1,
  padding: 0,
};

function MapControls({ onZoomIn, onZoomOut, onPan }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        right: 24,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 100,
      }}
    >
      <button style={CONTROL_BTN} onClick={onZoomIn} title="Zoom in">+</button>
      <button style={CONTROL_BTN} onClick={onZoomOut} title="Zoom out">−</button>
      <div style={{ height: 8 }} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button style={CONTROL_BTN} onClick={() => onPan("up")} title="Pan up">↑</button>
      </div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
        <button style={CONTROL_BTN} onClick={() => onPan("left")} title="Pan left">←</button>
        <button style={CONTROL_BTN} onClick={() => onPan("right")} title="Pan right">→</button>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button style={CONTROL_BTN} onClick={() => onPan("down")} title="Pan down">↓</button>
      </div>
    </div>
  );
}

function CountryLabels({ geographies, zoom, countries, nameAliases }) {
  const geoData = useMemo(
    () =>
      geographies.map((geo) => {
        const centroid = pathGenerator.centroid(geo);
        const bounds = pathGenerator.bounds(geo);
        const info = lookupCountry(geo, countries, nameAliases);
        return { key: geo.rsmKey, centroid, bounds, name: info.name };
      }),
    [geographies, countries, nameAliases]
  );

  return (
    <>
      {geoData.map((d) => {
        if (isNaN(d.centroid[0]) || isNaN(d.centroid[1])) return null;
        const projWidth = d.bounds[1][0] - d.bounds[0][0];
        if (projWidth * zoom < LABEL_MIN_WIDTH) return null;
        return (
          <text
            key={`label-${d.key}`}
            x={d.centroid[0]}
            y={d.centroid[1]}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: `${13 / zoom}px`,
              fill: "rgba(255,255,255,0.75)",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              fontWeight: 400,
              letterSpacing: "0.5px",
              pointerEvents: "none",
            }}
          >
            {d.name}
          </text>
        );
      })}
    </>
  );
}

function GraphFilterDropdown({ filterType, filterValue, onFilterChange, graphAvailable }) {
  const filterOptions = [
    { label: "All connections", type: "", value: "" },
    { label: "Event: Money Spend", type: "event_type", value: "Money Spend" },
    { label: "Event: Lobbying", type: "sub_type", value: "Lobbying" },
    { label: "Principal: Lockheed Martin", type: "principal", value: "Lockheed Martin" },
    { label: "Topic: Lobbying", type: "topic", value: "Lobbying" },
    { label: "Topic: Defense", type: "topic", value: "Defense" },
  ];

  const selected = filterOptions.find(
    (o) => o.type === filterType && o.value === filterValue
  ) || filterOptions[0];

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "flex-end",
      }}
    >
      <select
        value={`${selected.type}|${selected.value}`}
        onChange={(e) => {
          const [type, value] = e.target.value.split("|");
          onFilterChange(type, value);
        }}
        style={{
          background: "rgba(0,0,0,0.85)",
          border: "1px solid #444",
          borderRadius: 4,
          color: "#ccc",
          fontSize: 12,
          padding: "6px 10px",
          cursor: "pointer",
          outline: "none",
          minWidth: 200,
        }}
      >
        {filterOptions.map((opt) => (
          <option key={`${opt.type}|${opt.value}`} value={`${opt.type}|${opt.value}`}>
            {opt.label}
          </option>
        ))}
      </select>
      {!graphAvailable && (
        <div
          style={{
            background: "rgba(0,0,0,0.75)",
            border: "1px solid #333",
            borderRadius: 4,
            color: "#666",
            fontSize: 10,
            padding: "4px 8px",
          }}
        >
          Graph DB offline
        </div>
      )}
    </div>
  );
}

function GraphLegend({ visible, connections }) {
  if (!visible || connections.length === 0) return null;
  const types = [...new Set(connections.map((c) => c.sub_type || c.event_type))].filter(Boolean);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: 24,
        zIndex: 100,
        background: "rgba(0,0,0,0.82)",
        border: "1px solid #333",
        borderRadius: 4,
        padding: "10px 14px",
        color: "#888",
        fontSize: 11,
      }}
    >
      <div style={{ color: "#ccc", marginBottom: 6, fontSize: 12 }}>Graph Connections</div>
      {types.map((t) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div style={{ width: 24, height: 2, background: "#4a9eff", borderRadius: 1 }} />
          <span>{t}</span>
        </div>
      ))}
      <div style={{ marginTop: 6, color: "#555", fontSize: 10 }}>
        {connections.length} connection{connections.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function WorldMap({ countries, nameAliases = {} }) {
  const [tooltipInfo, setTooltipInfo] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ coordinates: [0, 30], zoom: 1 });
  const [graphConnections, setGraphConnections] = useState([]);
  const [locationSummaries, setLocationSummaries] = useState({});
  const [graphAvailable, setGraphAvailable] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [hoveredConnection, setHoveredConnection] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterType) params.set("filter_type", filterType);
    if (filterValue) params.set("filter_value", filterValue);
    const url = `${API_URL}/api/graph/map-connections?${params.toString()}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Graph API not available");
        return res.json();
      })
      .then((data) => {
        setGraphConnections(data.connections || []);
        setGraphAvailable(true);
      })
      .catch(() => {
        setGraphAvailable(false);
        setGraphConnections([]);
        setHoveredConnection(null);
        setSelectedConnection(null);
      });
  }, [filterType, filterValue]);

  useEffect(() => {
    fetch(`${API_URL}/api/graph/locations`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json();
      })
      .then((data) => {
        const map = {};
        (data || []).forEach((loc) => {
          if (loc.iso_a3) map[loc.iso_a3] = loc;
        });
        setLocationSummaries(map);
      })
      .catch(() => {});
  }, []);

  const highlightedIsoSet = useMemo(() => {
    const set = new Set();
    graphConnections.forEach((c) => {
      if (c.source_iso_a3) set.add(c.source_iso_a3);
      if (c.target_iso_a3) set.add(c.target_iso_a3);
    });
    return set;
  }, [graphConnections]);

  const drawableConnections = useMemo(
    () =>
      graphConnections
        .map((connection, index) => ({
          connection,
          key: getConnectionKey(connection, index),
          from: COUNTRY_CENTROIDS[connection.source_iso_a3],
          to: COUNTRY_CENTROIDS[connection.target_iso_a3],
        }))
        .filter(
          ({ connection, from, to }) =>
            connection.source_iso_a3 && connection.target_iso_a3 && from && to
        ),
    [graphConnections]
  );

  const activeConnection = selectedConnection || hoveredConnection;

  const handleMouseEnter = (geo) => {
    const info = lookupCountry(geo, countries, nameAliases);
    const iso3 = geo.properties.ISO_A3 || geo.properties.iso_a3 || "";
    const summary = locationSummaries[iso3];
    if (summary && (summary.event_count > 0 || summary.connected_principals.length > 0)) {
      info.graphInfo = `${summary.event_count} event(s) · ${summary.connected_principals.join(", ")}`;
    }
    setTooltipInfo(info);
  };

  const handleMouseLeave = () => setTooltipInfo(null);
  const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });
  const handleMoveEnd = (pos) => setPosition(pos);

  const handleConnectionMouseEnter = (connection, key, e) => {
    setTooltipInfo(null);
    if (!selectedConnection) {
      setHoveredConnection({
        connection,
        key,
        position: { x: e.clientX, y: e.clientY },
      });
    }
  };

  const handleConnectionMouseMove = (connection, key, e) => {
    setTooltipInfo(null);
    if (!selectedConnection) {
      setHoveredConnection({
        connection,
        key,
        position: { x: e.clientX, y: e.clientY },
      });
    }
  };

  const handleConnectionMouseLeave = () => {
    if (!selectedConnection) setHoveredConnection(null);
  };

  const handleConnectionClick = (connection, key, e) => {
    e.stopPropagation();
    setTooltipInfo(null);
    setHoveredConnection(null);
    setSelectedConnection({
      connection,
      key,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const handleZoomIn = () =>
    setPosition((prev) => ({
      ...prev,
      zoom: Math.min(prev.zoom * ZOOM_FACTOR, MAX_ZOOM),
    }));

  const handleZoomOut = () =>
    setPosition((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom / ZOOM_FACTOR, MIN_ZOOM),
    }));

  const handlePan = (direction) => {
    setPosition((prev) => {
      const step = 30 / prev.zoom;
      const [lng, lat] = prev.coordinates;
      switch (direction) {
        case "up":
          return { ...prev, coordinates: [lng, Math.min(lat + step, 85)] };
        case "down":
          return { ...prev, coordinates: [lng, Math.max(lat - step, -85)] };
        case "left":
          return { ...prev, coordinates: [lng - step, lat] };
        case "right":
          return { ...prev, coordinates: [lng + step, lat] };
        default:
          return prev;
      }
    });
  };

  const handleFilterChange = (type, value) => {
    setFilterType(type);
    setFilterValue(value);
    setHoveredConnection(null);
    setSelectedConnection(null);
  };

  return (
    <div
      style={{ flex: 1, width: "100%", height: "100%", position: "relative" }}
      onMouseMove={handleMouseMove}
      onClick={() => {
        setHoveredConnection(null);
        setSelectedConnection(null);
      }}
    >
      <Tooltip info={tooltipInfo} position={mousePos} />
      <ConnectionTooltip
        info={activeConnection?.connection}
        position={activeConnection?.position || mousePos}
        color={CONNECTION_COLOR}
        pinned={Boolean(selectedConnection)}
      />
      <GraphFilterDropdown
        filterType={filterType}
        filterValue={filterValue}
        onFilterChange={handleFilterChange}
        graphAvailable={graphAvailable}
      />
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onPan={handlePan}
      />
      <GraphLegend visible={graphAvailable} connections={graphConnections} />
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [0, 30] }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          zoom={position.zoom}
          center={position.coordinates}
          onMoveEnd={handleMoveEnd}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) => (
              <>
                {geographies.map((geo) => {
                  const iso3 =
                    geo.properties.ISO_A3 || geo.properties.iso_a3 || "";
                  const isHighlighted = highlightedIsoSet.has(iso3);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => handleMouseEnter(geo)}
                      onMouseLeave={handleMouseLeave}
                      vectorEffect="non-scaling-stroke"
                      style={{
                        default: isHighlighted
                          ? STYLE_HIGHLIGHTED
                          : STYLE_DEFAULT,
                        hover: STYLE_HOVER,
                        pressed: STYLE_PRESSED,
                      }}
                    />
                  );
                })}
                <CountryLabels
                  geographies={geographies}
                  zoom={position.zoom}
                  countries={countries}
                  nameAliases={nameAliases}
                />
                {/* Draw connection arcs between countries */}
                {drawableConnections.map(({ connection, key, from, to }) => {
                  const isActive =
                    selectedConnection?.key === key || hoveredConnection?.key === key;
                  return (
                    <React.Fragment key={`connection-${key}`}>
                      <Line
                        from={from}
                        to={to}
                        stroke="rgba(74,158,255,0)"
                        strokeWidth={12 / position.zoom}
                        strokeLinecap="round"
                        style={{ cursor: "pointer", pointerEvents: "stroke" }}
                        onMouseEnter={(e) =>
                          handleConnectionMouseEnter(connection, key, e)
                        }
                        onMouseMove={(e) =>
                          handleConnectionMouseMove(connection, key, e)
                        }
                        onMouseLeave={handleConnectionMouseLeave}
                        onClick={(e) => handleConnectionClick(connection, key, e)}
                      />
                      <Line
                        from={from}
                        to={to}
                        stroke={CONNECTION_COLOR}
                        strokeWidth={(isActive ? 3 : 1.5) / position.zoom}
                        strokeLinecap="round"
                        strokeDasharray={`${4 / position.zoom},${3 / position.zoom}`}
                        opacity={isActive ? 1 : 0.78}
                        pointerEvents="none"
                      />
                    </React.Fragment>
                  );
                })}
                {/* Source (principal) markers */}
                {graphConnections
                  .filter(
                    (c) =>
                      c.source_iso_a3 && COUNTRY_CENTROIDS[c.source_iso_a3]
                  )
                  .map((conn, idx) => (
                    <Marker
                      key={`src-marker-${idx}`}
                      coordinates={COUNTRY_CENTROIDS[conn.source_iso_a3]}
                    >
                      <circle
                        r={4 / position.zoom}
                        fill={NODE_COLORS.Principal}
                        stroke="#111"
                        strokeWidth={1 / position.zoom}
                      />
                    </Marker>
                  ))}
                {/* Target (event) markers */}
                {graphConnections
                  .filter(
                    (c) =>
                      c.target_iso_a3 && COUNTRY_CENTROIDS[c.target_iso_a3]
                  )
                  .map((conn, idx) => (
                    <Marker
                      key={`tgt-marker-${idx}`}
                      coordinates={COUNTRY_CENTROIDS[conn.target_iso_a3]}
                    >
                      <circle
                        r={4 / position.zoom}
                        fill={NODE_COLORS.Event}
                        stroke="#111"
                        strokeWidth={1 / position.zoom}
                      />
                    </Marker>
                  ))}
              </>
            )}
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
