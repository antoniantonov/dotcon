  import React, { useState, memo, useCallback, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { geoMercator, geoPath as d3GeoPath } from "d3-geo";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Must match ComposableMap internals (default width=800, height=600)
const mapProjection = geoMercator().scale(140).center([0, 30]).translate([400, 300]);
const pathGenerator = d3GeoPath(mapProjection);

const MIN_ZOOM = 1;
const MAX_ZOOM = 20;
const ZOOM_FACTOR = 1.5;
const LABEL_MIN_WIDTH = 60;

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
  return match || { name: geoName, capital: "N/A", metadata: "this is metadata" };
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
      <div
        style={{
          color: "#888",
          fontSize: "11px",
          fontWeight: 300,
          marginBottom: "6px",
        }}
      >
        Capital: {info.capital || "N/A"}
      </div>
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
        {info.metadata || "this is metadata"}
      </div>
    </div>
  );
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

function WorldMap({ countries, nameAliases = {} }) {
  const [tooltipInfo, setTooltipInfo] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ coordinates: [0, 30], zoom: 1 });

  const handleMouseEnter = useCallback(
    (geo) => {
      setTooltipInfo(lookupCountry(geo, countries, nameAliases));
    },
    [countries, nameAliases]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipInfo(null);
  }, []);

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMoveEnd = useCallback((pos) => {
    setPosition(pos);
  }, []);

  const handleZoomIn = useCallback(() => {
    setPosition((prev) => ({
      ...prev,
      zoom: Math.min(prev.zoom * ZOOM_FACTOR, MAX_ZOOM),
    }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPosition((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom / ZOOM_FACTOR, MIN_ZOOM),
    }));
  }, []);

  const handlePan = useCallback((direction) => {
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
  }, []);

  return (
    <div
      style={{ flex: 1, width: "100%", height: "100%", position: "relative" }}
      onMouseMove={handleMouseMove}
    >
      <Tooltip info={tooltipInfo} position={mousePos} />
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onPan={handlePan}
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
            {({ geographies }) => (
              <>
                {geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => handleMouseEnter(geo)}
                    onMouseLeave={handleMouseLeave}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      default: STYLE_DEFAULT,
                      hover: STYLE_HOVER,
                      pressed: STYLE_PRESSED,
                    }}
                  />
                ))}
                <CountryLabels
                  geographies={geographies}
                  zoom={position.zoom}
                  countries={countries}
                  nameAliases={nameAliases}
                />
              </>
            )}
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
