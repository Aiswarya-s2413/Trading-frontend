import React, { useState, useEffect } from "react";
import TradingViewChart from "./components/TradingViewChart";
import { fetchPatternScanData, fetchRawPriceHistory } from "./api";
import type { PriceData, Marker } from "./api";
import "./App.css"; // Your main app styles

const PATTERNS = ["Narrow Range Break", "Bowl"]; // Keep these in sync with your backend
const TIME_FRAMES = ["Daily", "Weekly"]; // Example, adapt as needed

function App() {
  // --- Form State ---
  const [scrip, setScrip] = useState<string>("RELIANCE.NS");
  const [pattern, setPattern] = useState<string>("Narrow Range Break");
  const [timeFrame, setTimeFrame] = useState<string>("Daily"); // For future use, not directly in current API
  const [nrbLookback, setNrbLookback] = useState<number>(7); // Matches nrb_lookback in backend
  const [weeks, setWeeks] = useState<number>(20); // Weeks parameter for NRB (1-100)
  const [successRate, setSuccessRate] = useState<number>(0); // Matches success_rate in backend
  const [parameterValue, setParameterValue] = useState<string>(""); // For future 'Parameter' input
  const [successTimeframe, setSuccessTimeframe] = useState<string>(""); // For future 'Success Timeframe' input

  // --- Data State ---
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isFilteredView, setIsFilteredView] = useState<boolean>(false);

  // --- Fetch filtered (pattern scan) data ---
  const fetchFilteredData = async () => {
    setLoading(true);
    setError(null);
    try {
      // For NRB: use default nrbLookback (7) since user only selects weeks
      // For Bowl: ensure minimum 60 days
      const actualNrbLookback =
        pattern === "Bowl" 
          ? Math.max(nrbLookback, 60) 
          : pattern === "Narrow Range Break" 
          ? 7 // Default value for NRB (not shown to user)
          : nrbLookback;

      const data = await fetchPatternScanData(
        scrip,
        pattern,
        actualNrbLookback,
        successRate,
        pattern === "Narrow Range Break" ? weeks : undefined // Only pass weeks for NRB pattern
        // Add other parameters here if your API supports them dynamically
        // parameterValue,
        // successTimeframe,
      );

      // Debug: Log what we received
      console.log("[App] Received data:", {
        scrip: data.scrip,
        pattern: data.pattern,
        priceDataCount: data.price_data?.length || 0,
        markersCount: data.markers?.length || 0,
      });

      setPriceData(data.price_data || []);
      setMarkers(data.markers || []);
      setIsFilteredView(true);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data");
      setPriceData([]); // Clear data on error
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  };

  // --- Fetch initial raw (unfiltered) 10-year data on first mount ---
  const fetchInitialRawData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRawPriceHistory(scrip, 10);
      setPriceData(data.price_data);
      setMarkers([]); // No pattern markers in raw view
      setIsFilteredView(false);
    } catch (err: any) {
      setError(err.message || "Failed to fetch raw price history");
      setPriceData([]);
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  };

  // --- Initial Load ---
  useEffect(() => {
    fetchInitialRawData();
  }, []); // Only run once on mount for initial data

  // --- Handle Form Submission ---
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFilteredData();
  };

  // --- Render ---
  return (
    <div className="App">
      <h1>Trading Pattern Analyzer</h1>

      <form onSubmit={handleSubmit} className="input-form">
        {/* Scrip Input */}
        <label>
          Scrip:
          <input
            type="text"
            value={scrip}
            onChange={(e) => setScrip(e.target.value)}
            required
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

        {/* TimeFrame Dropdown - Only show for Bowl pattern (NRB uses weeks input instead) */}
        {pattern === "Bowl" && (
          <label>
            TimeFrame:
            <select
              value={timeFrame}
              onChange={(e) => setTimeFrame(e.target.value)}
            >
              {TIME_FRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Weeks Input - Only for NRB pattern */}
        {pattern === "Narrow Range Break" && (
          <label>
            Weeks (Timeframe):
            <input
              type="number"
              value={weeks}
              onChange={(e) => setWeeks(parseInt(e.target.value))}
              min="1"
              max="100"
              required
            />
          </label>
        )}
        {/* For Bowl, ensure nrbLookback is at least 60 for the API guardrail */}
        {pattern === "Bowl" && (
          <label>
            Min. Bowl Duration (Days):
            <input
              type="number"
              value={Math.max(nrbLookback, 60)} // Display min 60, but internal state might be lower
              onChange={(e) => setNrbLookback(parseInt(e.target.value))}
              min="60"
              required
            />
          </label>
        )}

        {/* Parameter Input (Placeholder for future, e.g., 'EMA 200' value) */}
        <label>
          Parameter:
          <input
            type="text"
            value={parameterValue}
            onChange={(e) => setParameterValue(e.target.value)}
            placeholder="e.g., 200, 50"
          />
        </label>

        {/* Success Rate Input */}
        <label>
          Success Rate (%):
          <input
            type="number"
            value={successRate}
            onChange={(e) => setSuccessRate(parseFloat(e.target.value))}
            min="0"
            max="100"
            step="0.1"
            required
          />
        </label>

        {/* Success Timeframe (Placeholder for future, e.g., 'n weeks') */}
        <label>
          Success Timeframe:
          <input
            type="text"
            value={successTimeframe}
            onChange={(e) => setSuccessTimeframe(e.target.value)}
            placeholder="e.g., 2 weeks"
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Submit"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      <div className="chart-container-wrapper">
        <TradingViewChart
          priceData={priceData}
          markers={markers}
          chartTitle={
            isFilteredView
              ? `${scrip} - ${pattern} Pattern`
              : `${scrip} - 10Y Price History`
          }
        />
      </div>
    </div>
  );
}

export default App;
