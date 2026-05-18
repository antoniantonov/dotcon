import React, { useEffect, useState, useMemo, memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Line,
  Marker,
} from "react-simple-maps";
import { geoMercator, geoPath as d3GeoPath, geoCentroid } from "d3-geo";

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
  MEX: [-102, 23.6],
  PHL: [122, 13],
  PSE: [35.2, 31.9],
  LBN: [35.9, 33.9],
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
const PICKER_TYPE_ALLOWLIST = new Set(["Event", "Principal"]);

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

function TopRightPicker({
  types,
  typeKey,
  valueKey,
  values,
  valuesLoading,
  onTypeChange,
  onValueChange,
  graphAvailable,
}) {
  const baseSelectStyle = {
    background: "rgba(0,0,0,0.85)",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#ccc",
    fontSize: 12,
    padding: "6px 10px",
    cursor: "pointer",
    outline: "none",
    minWidth: 160,
  };

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
      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={typeKey}
          onChange={(e) => onTypeChange(e.target.value)}
          style={baseSelectStyle}
          title="Pick the type of object to display"
        >
          <option value="">Type…</option>
          {types.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={valueKey}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={!typeKey || valuesLoading}
          style={{
            ...baseSelectStyle,
            opacity: !typeKey || valuesLoading ? 0.5 : 1,
            cursor: !typeKey || valuesLoading ? "default" : "pointer",
          }}
          title={typeKey ? `Pick a ${typeKey}` : "Select a type first"}
        >
          <option value="">
            {!typeKey
              ? "Select type first"
              : valuesLoading
              ? "Loading…"
              : `All ${typeKey}s`}
          </option>
          {values.map((v) => (
            <option key={String(v.value)} value={String(v.value)}>
              {v.count != null ? `${v.value} (${v.count})` : v.value}
            </option>
          ))}
        </select>
      </div>
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
        bottom: 96,
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

// ── Time slider helpers ────────────────────────────────────────────────────────

const SLIDER_TICKS = 200;
const SLIDER_SCALES = [
  { label: "5y", years: 5 },
  { label: "10y", years: 10 },
  { label: "20y", years: 20 },
  { label: "50y", years: 50 },
  { label: "All", years: null },
];
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;
const FALLBACK_EARLIEST_MS = Date.UTC(1900, 0, 1);

function parseDateMs(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  // Accept YYYY-MM-DD or any value Date can parse.
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function computeSliderRange(scaleYears, allEvents, nowMs) {
  if (scaleYears != null) {
    return { startMs: nowMs - scaleYears * MS_PER_YEAR, endMs: nowMs };
  }
  // "All time" — take earliest period_from across all events.
  let earliest = nowMs;
  for (const e of allEvents) {
    const f = parseDateMs(e.period_from);
    if (f != null && f < earliest) earliest = f;
  }
  if (earliest === nowMs) earliest = FALLBACK_EARLIEST_MS;
  return { startMs: earliest, endMs: nowMs };
}

function formatTimeLabel(ms) {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

// Returns true if the event is visible at the slider's current time.
// An event is visible while sliderTime ∈ [period_from, max(period_to, period_from + tickMs)],
// so events that span less than one tick still show for a tick's worth of time.
function isEventActive(event, sliderTimeMs, tickMs) {
  const f = parseDateMs(event.period_from);
  const t = parseDateMs(event.period_to);
  if (f == null && t == null) return true; // undated → always visible
  const start = f != null ? f : t;
  const rawEnd = t != null ? t : f;
  const end = Math.max(rawEnd, start + tickMs);
  return sliderTimeMs >= start && sliderTimeMs <= end;
}

function TimeSlider({
  scaleYears,
  onScaleChange,
  tick,
  onTickChange,
  startMs,
  endMs,
  showAll,
  onShowAllChange,
}) {
  const sliderTimeMs = startMs + ((endMs - startMs) * tick) / SLIDER_TICKS;
  const tickMs = (endMs - startMs) / SLIDER_TICKS;
  const tickDays = Math.max(1, Math.round(tickMs / (24 * 3600 * 1000)));

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 24,
        right: 24,
        zIndex: 150,
        background: "rgba(0,0,0,0.85)",
        border: "1px solid #333",
        borderRadius: 6,
        padding: "10px 16px",
        color: "#ccc",
        fontSize: 11,
        display: "flex",
        alignItems: "center",
        gap: 14,
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          color: showAll ? "#4a9eff" : "#aaa",
          whiteSpace: "nowrap",
        }}
        title="Disable slider and show every selected event"
      >
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => onShowAllChange(e.target.checked)}
          style={{ accentColor: "#4a9eff" }}
        />
        Show all events
      </label>
      <div style={{ display: "flex", gap: 4 }}>
        {SLIDER_SCALES.map((s) => (
          <button
            key={s.label}
            onClick={() => onScaleChange(s.years)}
            disabled={showAll}
            style={{
              background:
                scaleYears === s.years && !showAll
                  ? "rgba(74,158,255,0.25)"
                  : "rgba(255,255,255,0.04)",
              color: showAll ? "#555" : scaleYears === s.years ? "#4a9eff" : "#aaa",
              border: `1px solid ${
                scaleYears === s.years && !showAll ? "#4a9eff" : "#333"
              }`,
              borderRadius: 3,
              padding: "3px 8px",
              fontSize: 11,
              cursor: showAll ? "default" : "pointer",
              opacity: showAll ? 0.5 : 1,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 10,
          opacity: showAll ? 0.4 : 1,
        }}
      >
        <span style={{ color: "#666", fontSize: 10, minWidth: 70 }}>
          {formatTimeLabel(startMs)}
        </span>
        <input
          type="range"
          min={0}
          max={SLIDER_TICKS}
          step={1}
          value={tick}
          disabled={showAll}
          onChange={(e) => onTickChange(Number(e.target.value))}
          style={{
            flex: 1,
            accentColor: "#4a9eff",
            cursor: showAll ? "default" : "pointer",
          }}
        />
        <span style={{ color: "#666", fontSize: 10, minWidth: 70, textAlign: "right" }}>
          {formatTimeLabel(endMs)}
        </span>
      </div>
      <div
        style={{
          color: showAll ? "#555" : "#4a9eff",
          fontSize: 11,
          minWidth: 130,
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
        title={`1 tick ≈ ${tickDays} day${tickDays !== 1 ? "s" : ""}`}
      >
        {showAll ? "All events" : `${formatTimeLabel(sliderTimeMs)} · ${tickDays}d/tick`}
      </div>
    </div>
  );
}

// ── Journalist killings ────────────────────────────────────────────────────────

function aggregateKillingsByLocation(killings) {
  // Returns: [{ iso_a3, location_name, count, names: [...], items: [...] }]
  const byIso = new Map();
  for (const k of killings) {
    if (!k.iso_a3) continue;
    if (!byIso.has(k.iso_a3)) {
      byIso.set(k.iso_a3, {
        iso_a3: k.iso_a3,
        location_name: k.location_name || k.iso_a3,
        count: 0,
        names: [],
        items: [],
      });
    }
    const entry = byIso.get(k.iso_a3);
    entry.count += 1;
    entry.names.push(k.journalist_name || "Unknown");
    entry.items.push(k);
  }
  return [...byIso.values()].sort((a, b) => b.count - a.count);
}

function JournalistMarker({
  agg,
  coords,
  zoom,
  isHovered,
  isSelected,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onClick,
}) {
  if (!coords) return null;
  // Vertical bar above the centroid whose length is proportional to the
  // number of killings, capped at MAX_BAR_UNITS so it doesn't run off-screen.
  const color = "#ff5c5c";
  const active = isHovered || isSelected;
  const MAX_BAR_UNITS = 15;
  const unitHeight = (active ? 9 : 7) / zoom; // matches former dot spacing
  const barWidth = (active ? 4 : 3) / zoom;
  const cappedUnits = Math.min(agg.count, MAX_BAR_UNITS);
  const barHeight = Math.max(unitHeight, cappedUnits * unitHeight);
  const hitPad = 4 / zoom;
  return (
    <Marker coordinates={coords}>
      <rect
        x={-barWidth / 2}
        y={-barHeight}
        width={barWidth}
        height={barHeight}
        fill={color}
        stroke={active ? "#fff" : "#111"}
        strokeWidth={(active ? 1 : 0.6) / zoom}
        pointerEvents="none"
      />
      {/* Wide invisible hit-target spanning the full bar */}
      <rect
        x={-Math.max(8 / zoom, barWidth / 2 + hitPad)}
        y={-barHeight - hitPad}
        width={Math.max(16 / zoom, barWidth + 2 * hitPad)}
        height={barHeight + 2 * hitPad}
        fill="transparent"
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      />
    </Marker>
  );
}

function JournalistsPopup({ agg, position, onClose }) {
  if (!agg) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: Math.min(position.x + 14, window.innerWidth - 320),
        top: Math.min(position.y - 10, window.innerHeight - 320),
        background: "rgba(0,0,0,0.92)",
        border: "1px solid #ff5c5c",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 0 20px rgba(255,92,92,0.35)",
        borderRadius: 6,
        padding: "12px 14px",
        zIndex: 1100,
        minWidth: 280,
        maxWidth: 320,
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>
          Journalists killed · {agg.location_name}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: 16,
            padding: 0,
            lineHeight: 1,
          }}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
      </div>
      <div
        style={{
          color: "#ff5c5c",
          fontSize: 11,
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: "1px solid #333",
        }}
      >
        Total: {agg.count}
      </div>
      <div
        style={{
          maxHeight: 220,
          overflowY: "auto",
          color: "#ddd",
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        {agg.items.map((item, i) => (
          <div
            key={item.event_id || i}
            style={{
              padding: "4px 0",
              borderBottom: i < agg.items.length - 1 ? "1px solid #1f1f1f" : "none",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              columnGap: 10,
              alignItems: "baseline",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: "#eee",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={item.journalist_name || "Unknown"}
              >
                {item.journalist_name || "Unknown"}
              </div>
              {item.period_from && (
                <div style={{ color: "#666", fontSize: 10 }}>{item.period_from}</div>
              )}
            </div>
            <div
              style={{
                color: item.reason ? "#ff9d9d" : "#555",
                fontSize: 11,
                fontStyle: item.reason ? "normal" : "italic",
                textAlign: "right",
                whiteSpace: "nowrap",
              }}
              title={item.reason || "No reason recorded"}
            >
              {item.reason || "—"}
            </div>
          </div>
        ))}
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

  // Two-tier picker: pickerType (e.g. "Event") + pickerValue (e.g. "Lobbying").
  const [pickerType, setPickerType] = useState("");
  const [pickerValue, setPickerValue] = useState("");
  const [availableTypes, setAvailableTypes] = useState([]);
  const [availableValues, setAvailableValues] = useState([]);
  const [valuesLoading, setValuesLoading] = useState(false);

  const [hoveredConnection, setHoveredConnection] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);

  // Journalist killings.
  const [journalistKillings, setJournalistKillings] = useState([]);
  const [hoveredKilling, setHoveredKilling] = useState(null);
  const [selectedKilling, setSelectedKilling] = useState(null);

  // Time slider state.
  const [scaleYears, setScaleYears] = useState(20);
  const [sliderTick, setSliderTick] = useState(SLIDER_TICKS); // default: now
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Stable "now" so sliding doesn't shift the window every render.
  const nowMsRef = React.useRef(Date.now());
  const nowMs = nowMsRef.current;

  // Determine if the current selection is the "Journalist Killing" view.
  const isJournalistView =
    pickerType === "Event" &&
    pickerValue.toLowerCase().trim() === "journalist killing";

  // Map (pickerType, pickerValue) → backend filter_type/filter_value for /map-connections.
  const backendFilter = useMemo(() => {
    if (isJournalistView) return null; // not used
    if (!pickerType || !pickerValue) return { filterType: "", filterValue: "" };
    switch (pickerType) {
      case "Event":
        return { filterType: "sub_type", filterValue: pickerValue };
      case "Principal":
        return { filterType: "principal", filterValue: pickerValue };
      case "Topic":
        return { filterType: "topic", filterValue: pickerValue };
      default:
        // Other types (Location/Policy/Source/Fact) don't filter map-connections.
        return { filterType: "", filterValue: "" };
    }
  }, [pickerType, pickerValue, isJournalistView]);

  // Fetch list of types once.
  useEffect(() => {
    fetch(`${API_URL}/api/graph/types`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) =>
        setAvailableTypes(
          Array.isArray(data) ? data.filter((t) => PICKER_TYPE_ALLOWLIST.has(t.type)) : []
        )
      )
      .catch(() => setAvailableTypes([]));
  }, []);

  // Fetch values for the chosen type whenever it changes.
  useEffect(() => {
    if (!pickerType) {
      setAvailableValues([]);
      return;
    }
    setValuesLoading(true);
    fetch(`${API_URL}/api/graph/types/${encodeURIComponent(pickerType)}/values`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setAvailableValues(Array.isArray(data) ? data : []);
        setValuesLoading(false);
      })
      .catch(() => {
        setAvailableValues([]);
        setValuesLoading(false);
      });
  }, [pickerType]);

  // Fetch connections (skipped in journalist view).
  useEffect(() => {
    if (isJournalistView) {
      setGraphConnections([]);
      setHoveredConnection(null);
      setSelectedConnection(null);
      return;
    }
    const params = new URLSearchParams();
    if (backendFilter.filterType) params.set("filter_type", backendFilter.filterType);
    if (backendFilter.filterValue) params.set("filter_value", backendFilter.filterValue);
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
  }, [backendFilter, isJournalistView]);

  // Fetch journalist killings (only when selected).
  useEffect(() => {
    if (!isJournalistView) {
      setJournalistKillings([]);
      setHoveredKilling(null);
      setSelectedKilling(null);
      return;
    }
    fetch(`${API_URL}/api/graph/journalist-killings`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setJournalistKillings(Array.isArray(data) ? data : []);
        setGraphAvailable(true);
      })
      .catch(() => {
        setGraphAvailable(false);
        setJournalistKillings([]);
      });
  }, [isJournalistView]);

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

  // Time-slider window. "All time" derives min from earliest event period_from.
  const allEventsForRange = useMemo(
    () => [...graphConnections, ...journalistKillings],
    [graphConnections, journalistKillings]
  );
  const { startMs, endMs } = useMemo(
    () => computeSliderRange(scaleYears, allEventsForRange, nowMs),
    [scaleYears, allEventsForRange, nowMs]
  );
  const tickMs = (endMs - startMs) / SLIDER_TICKS;
  const sliderTimeMs = startMs + tickMs * sliderTick;

  // Apply time filter (or pass-through when "Show all events" is checked).
  const visibleConnections = useMemo(() => {
    if (showAllEvents || isJournalistView) return graphConnections;
    return graphConnections.filter((c) => isEventActive(c, sliderTimeMs, tickMs));
  }, [graphConnections, sliderTimeMs, tickMs, showAllEvents, isJournalistView]);

  const visibleKillings = useMemo(() => {
    if (!isJournalistView) return [];
    if (showAllEvents) return journalistKillings;
    return journalistKillings.filter((k) => isEventActive(k, sliderTimeMs, tickMs));
  }, [isJournalistView, journalistKillings, sliderTimeMs, tickMs, showAllEvents]);

  const killingAggregations = useMemo(
    () => aggregateKillingsByLocation(visibleKillings),
    [visibleKillings]
  );


  const highlightedIsoSet = useMemo(() => {
    const set = new Set();
    visibleConnections.forEach((c) => {
      if (c.source_iso_a3) set.add(c.source_iso_a3);
      if (c.target_iso_a3) set.add(c.target_iso_a3);
    });
    if (isJournalistView) {
      killingAggregations.forEach((agg) => {
        if (agg.iso_a3) set.add(agg.iso_a3);
      });
    }
    return set;
  }, [visibleConnections, killingAggregations, isJournalistView]);

  const drawableConnections = useMemo(
    () =>
      visibleConnections
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
    [visibleConnections]
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

  const handleFilterTypeChange = (newType) => {
    setPickerType(newType);
    setPickerValue("");
    setHoveredConnection(null);
    setSelectedConnection(null);
    setHoveredKilling(null);
    setSelectedKilling(null);
  };

  const handleFilterValueChange = (newValue) => {
    setPickerValue(newValue);
    setHoveredConnection(null);
    setSelectedConnection(null);
    setHoveredKilling(null);
    setSelectedKilling(null);
  };

  const handleKillingMouseEnter = (agg, e) => {
    setTooltipInfo(null);
    if (!selectedKilling) {
      setHoveredKilling({
        agg,
        position: { x: e.clientX, y: e.clientY },
      });
    }
  };

  const handleKillingMouseMove = (agg, e) => {
    if (!selectedKilling) {
      setHoveredKilling({
        agg,
        position: { x: e.clientX, y: e.clientY },
      });
    }
  };

  const handleKillingMouseLeave = () => {
    if (!selectedKilling) setHoveredKilling(null);
  };

  const handleKillingClick = (agg, e) => {
    e.stopPropagation();
    setTooltipInfo(null);
    setHoveredKilling(null);
    setSelectedKilling({
      agg,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  return (
    <div
      style={{ flex: 1, width: "100%", height: "100%", position: "relative" }}
      onMouseMove={handleMouseMove}
      onClick={() => {
        setHoveredConnection(null);
        setSelectedConnection(null);
        setSelectedKilling(null);
        setHoveredKilling(null);
      }}
    >
      <Tooltip info={tooltipInfo} position={mousePos} />
      <ConnectionTooltip
        info={activeConnection?.connection}
        position={activeConnection?.position || mousePos}
        color={CONNECTION_COLOR}
        pinned={Boolean(selectedConnection)}
      />
      {/* Hover preview popup for journalist marker (no list, just count) */}
      {hoveredKilling && !selectedKilling && (
        <div
          style={{
            position: "fixed",
            left: hoveredKilling.position.x + 14,
            top: hoveredKilling.position.y - 10,
            background: "rgba(0,0,0,0.9)",
            border: "1px solid #ff5c5c",
            borderRadius: 4,
            padding: "8px 12px",
            color: "#fff",
            fontSize: 12,
            pointerEvents: "none",
            zIndex: 1050,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 2 }}>
            {hoveredKilling.agg.location_name}
          </div>
          <div style={{ color: "#ff5c5c", fontSize: 11 }}>
            {hoveredKilling.agg.count} journalist
            {hoveredKilling.agg.count !== 1 ? "s" : ""} killed · click for details
          </div>
        </div>
      )}
      {selectedKilling && (
        <JournalistsPopup
          agg={selectedKilling.agg}
          position={selectedKilling.position}
          onClose={() => setSelectedKilling(null)}
        />
      )}
      <TopRightPicker
        types={availableTypes}
        typeKey={pickerType}
        valueKey={pickerValue}
        values={availableValues}
        valuesLoading={valuesLoading}
        onTypeChange={handleFilterTypeChange}
        onValueChange={handleFilterValueChange}
        graphAvailable={graphAvailable}
      />
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onPan={handlePan}
      />
      <GraphLegend visible={graphAvailable && !isJournalistView} connections={visibleConnections} />
      <TimeSlider
        scaleYears={scaleYears}
        onScaleChange={(y) => {
          setScaleYears(y);
          setSliderTick(SLIDER_TICKS); // reset to "now" end of new range
        }}
        tick={sliderTick}
        onTickChange={setSliderTick}
        startMs={startMs}
        endMs={endMs}
        showAll={showAllEvents}
        onShowAllChange={setShowAllEvents}
      />
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
            {({ geographies }) => {
              // Build iso_a3 -> [lon, lat] centroid map from the loaded
              // world-atlas features. Falls back to the hard-coded
              // COUNTRY_CENTROIDS for entries that may be missing (e.g.
              // disputed territories not in the topojson).
              const centroidByIso = {};
              geographies.forEach((g) => {
                const iso = g.properties.ISO_A3 || g.properties.iso_a3;
                if (iso) centroidByIso[iso] = geoCentroid(g);
              });
              const lookupCentroid = (iso) =>
                centroidByIso[iso] || COUNTRY_CENTROIDS[iso] || null;
              return (
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
                {!isJournalistView &&
                  drawableConnections.map(({ connection, key, from, to }) => {
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
                {!isJournalistView &&
                  visibleConnections
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
                {!isJournalistView &&
                  visibleConnections
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
                {/* Journalist killings — vertical stack of dots per location */}
                {isJournalistView &&
                  killingAggregations.map((agg) => (
                    <JournalistMarker
                      key={`killing-${agg.iso_a3}`}
                      agg={agg}
                      coords={lookupCentroid(agg.iso_a3)}
                      zoom={position.zoom}
                      isHovered={hoveredKilling?.agg.iso_a3 === agg.iso_a3}
                      isSelected={selectedKilling?.agg.iso_a3 === agg.iso_a3}
                      onMouseEnter={(e) => handleKillingMouseEnter(agg, e)}
                      onMouseMove={(e) => handleKillingMouseMove(agg, e)}
                      onMouseLeave={handleKillingMouseLeave}
                      onClick={(e) => handleKillingClick(agg, e)}
                    />
                  ))}
              </>
              );
            }}
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
