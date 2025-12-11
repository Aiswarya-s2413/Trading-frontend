// App.tsx
import React, { useState } from "react";
import TradingViewChart from "./components/TradingViewChart";
import {
  fetchPatternScanData,
  fetchRawPriceHistory,
  type PriceData,
  type Marker,
  type SeriesPoint,
  fetchWeek52High,
  type Week52HighResponse,
} from "./api";
import "./App.css";
import SymbolSearch from "./components/SymbolSearch";

const PATTERNS = ["Narrow Range Break", "Bowl"] as const;

// Parameters matching backend `series` values
const PARAMETERS = [
  { label: "Close (default)", value: "close" }, // no series param → price candles
  { label: "EMA 21", value: "ema21" },
  { label: "EMA 50", value: "ema50" },
  { label: "EMA 200", value: "ema200" },
  { label: "RSC 30", value: "rsc30" },
  { label: "RSC 500", value: "rsc500" },
] as const;

type ParameterValue = (typeof PARAMETERS)[number]["value"];

function App() {
  // --- Form State ---
  const [scrip, setScrip] = useState<string>("");
  const [pattern, setPattern] = useState<string>("Narrow Range Break");
  const [weeks, setWeeks] = useState<number>(52); // default 52
  const [parameter, setParameter] = useState<ParameterValue>("close");

  // you can expose successRate later if needed; keep 0 for now
  const [successRate] = useState<number>(0);

  // --- Data State ---
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [seriesName, setSeriesName] = useState<string | null>(null);
  const [seriesData, setSeriesData] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isFilteredView, setIsFilteredView] = useState<boolean>(false);
  const [week52High, setWeek52High] = useState<number | null>(null);
  const [week52HighDate, setWeek52HighDate] = useState<string | null>(null);
  const [week52HighMessage, setWeek52HighMessage] = useState<string | null>(
    null
  );
  const [week52HighLoading, setWeek52HighLoading] = useState<boolean>(false);

  const fetchFilteredData = async () => {
    if (!scrip) {
      setError("Please enter a symbol.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // map parameter -> backend series
      const seriesParam = parameter === "close" ? null : (parameter as string);

      const data = await fetchPatternScanData(
        scrip,
        pattern,
        null, // nrbLookback: backend ignores now
        successRate, // effectively no filter (0)
        pattern === "Narrow Range Break" ? weeks : undefined,
        seriesParam // 👈 tell backend which series to use
      );

      console.log("[App] Received data:", {
        scrip: data.scrip,
        pattern: data.pattern,
        priceDataCount: data.price_data?.length || 0,
        markersCount: data.markers?.length || 0,
        series: data.series,
        seriesPoints: data.series_data?.length || 0,
      });

      setPriceData(data.price_data || []);
      setMarkers(data.markers || []);
      setSeriesName(data.series ?? null);
      setSeriesData(data.series_data ?? []);
      setIsFilteredView(true);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data");
      setPriceData([]);
      setMarkers([]);
      setSeriesData([]);
      setSeriesName(null);
      setIsFilteredView(false);
    } finally {
      setLoading(false);
    }
  };

  // Optional: button to load raw history (no filters)
  const fetchRaw = async () => {
    if (!scrip) {
      setError("Please enter a symbol.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRawPriceHistory(scrip, 10);
      setPriceData(data.price_data || []);
      setMarkers([]);
      setSeriesData([]);
      setSeriesName(null);
      setIsFilteredView(false);
    } catch (err: any) {
      setError(err.message || "Failed to fetch raw price history");
      setPriceData([]);
      setMarkers([]);
      setSeriesData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFilteredData();
  };

  const fetchWeekHigh = async () => {
    if (!scrip) {
      setError("Please enter a symbol.");
      return;
    }
    // Clear previous state before new fetch
    setWeek52High(null);
    setWeek52HighDate(null);
    setWeek52HighMessage(null);
    setWeek52HighLoading(true);
    setError(null);
    try {
      const data: Week52HighResponse = await fetchWeek52High(scrip);
      console.log("[App] 52W high response:", data);
      setWeek52High(data.week52_high);
      setWeek52HighDate(data.cutoff_date ?? null);
      if (data.message) {
        setWeek52HighMessage(data.message);
      } else if (data.week52_high == null) {
        setWeek52HighMessage("No price data found for the past 52 weeks.");
      } else {
        setWeek52HighMessage(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch 52-week high");
      setWeek52High(null);
      setWeek52HighDate(null);
      setWeek52HighMessage(null);
    } finally {
      setWeek52HighLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>Trading Pattern Analyzer</h1>

      <form onSubmit={handleSubmit} className="input-form">
        {/* Symbol text input (you'll replace this with dropdown+search) */}
        <label>
          Symbol:
          <SymbolSearch
            value={scrip}
            onChange={(val) => setScrip(val)}
            onSelect={(val) => {
              setScrip(val);
              // Optionally, auto-load raw history on select:
              // fetchRaw();
            }}
          />
        </label>

        {/* Pattern Dropdown */}
        <label>
          Pattern:
          <select value={pattern} onChange={(e) => setPattern(e.target.value)}>
            {PATTERNS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        {/* Parameter Dropdown */}
        <label>
          Parameter:
          <select
            value={parameter}
            onChange={(e) => setParameter(e.target.value as ParameterValue)}
          >
            {PARAMETERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {/* Weeks only for NRB */}
        {pattern === "Narrow Range Break" && (
          <label>
            Weeks (1–100):
            <input
              type="number"
              value={weeks}
              onChange={(e) => setWeeks(parseInt(e.target.value || "1", 10))}
              min={1}
              max={100}
            />
          </label>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Apply Filter"}
        </button>

        <button
          type="button"
          onClick={fetchRaw}
          disabled={loading}
          style={{ marginLeft: "8px" }}
        >
          {loading ? "Loading..." : "Raw 10Y Price"}
        </button>

        <button
          type="button"
          onClick={fetchWeekHigh}
          disabled={week52HighLoading || loading}
          style={{ marginLeft: "8px" }}
        >
          {week52HighLoading ? "Loading..." : "52W High"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {(week52High !== null || week52HighMessage) && (
        <div className="week52-card">
          <strong>52-Week High: </strong>
          {week52High !== null ? (
            <span>{week52High.toFixed(2)}</span>
          ) : (
            <span>{week52HighMessage || "Not available"}</span>
          )}
          {week52HighDate && (
            <span style={{ marginLeft: 8, color: "#94a3b8" }}>
              (Since {week52HighDate})
            </span>
          )}
        </div>
      )}

      <div className="chart-container-wrapper">
        <TradingViewChart
          priceData={priceData}
          markers={markers}
          chartTitle={
            scrip
              ? isFilteredView
                ? `${scrip} - ${pattern}${
                    parameter !== "close" ? ` [${parameter.toUpperCase()}]` : ""
                  }`
                : `${scrip} - 10Y Price History`
              : "Select a symbol to view chart"
          }
          parameterSeriesName={seriesName}
          parameterSeriesData={seriesData}
          week52High={week52High}
        />
      </div>
    </div>
  );
}

export default App;
