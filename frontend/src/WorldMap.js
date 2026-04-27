import React, { useState, memo, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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

function WorldMap({ countries }) {
  const [tooltipInfo, setTooltipInfo] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback(
    (geo) => {
      const props = geo.properties;
      const iso3 = props.ISO_A3 || props.iso_a3 || "";
      const iso2 = props.ISO_A2 || props.iso_a2 || "";
      const geoName = props.NAME || props.name || "Unknown";

      const match = countries[iso3] || countries[iso2];
      setTooltipInfo(
        match || { name: geoName, capital: "N/A", metadata: "this is metadata" }
      );
    },
    [countries]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipInfo(null);
  }, []);

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      style={{ flex: 1, width: "100%", height: "100%", position: "relative" }}
      onMouseMove={handleMouseMove}
    >
      <Tooltip info={tooltipInfo} position={mousePos} />
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 140,
          center: [0, 30],
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={() => handleMouseEnter(geo)}
                  onMouseLeave={handleMouseLeave}
                  style={{
                    default: STYLE_DEFAULT,
                    hover: STYLE_HOVER,
                    pressed: STYLE_PRESSED,
                  }}
                />
              ))
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
