import React, { useRef, useEffect } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  Time,
  SeriesMarker,
} from "lightweight-charts";
import type { PriceData, Marker } from "../api";

interface TradingViewChartProps {
  priceData: PriceData[];
  markers: Marker[];
  chartTitle: string;
}

const TradingViewChart: React.FC<TradingViewChartProps> = ({
  priceData,
  markers,
  chartTitle,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // Refs for the line series to draw various patterns
  const patternSeriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const seriesMarkersRef = useRef<ReturnType<
    typeof createSeriesMarkers<Time>
  > | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize chart if it doesn't exist
    if (!chartRef.current) {
      chartRef.current = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 500, // Fixed height for now
        layout: {
          background: { type: ColorType.Solid, color: "#1a1a1a" },
          textColor: "#d1d4dc",
        },
        grid: {
          vertLines: { color: "#242424" },
          horzLines: { color: "#242424" },
        },
        timeScale: {
          borderColor: "#485c7b",
        },
        rightPriceScale: {
          borderColor: "#485c7b",
        },
      });

      // Use addSeries with the CandlestickSeries object
      candlestickSeriesRef.current = chartRef.current.addSeries(
        CandlestickSeries,
        {
          upColor: "#26a69a",
          downColor: "#ef5350",
          borderVisible: false,
          wickUpColor: "#26a69a",
          wickDownColor: "#ef5350",
        }
      );

      // Attach markers plugin to the candlestick series
      if (candlestickSeriesRef.current) {
        seriesMarkersRef.current = createSeriesMarkers(
          candlestickSeriesRef.current,
          []
        );
      }
    }

    const chart = chartRef.current;
    const candlestickSeries = candlestickSeriesRef.current;
    const seriesMarkers = seriesMarkersRef.current;

    if (!chart || !candlestickSeries) return;

    // Update chart data
    if (priceData.length > 0) {
      // Lightweight charts expects time in string (YYYY-MM-DD) or number (Unix timestamp)
      // Our API returns Unix timestamp, which is good.
      const formattedPriceData = priceData.map((item) => ({
        time: item.time as Time, // Cast to Time type
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }));
      candlestickSeries.setData(formattedPriceData);

      // ========= Handle Bowl Patterns Using pattern_id (one line per bowl) ==========
      //
      // Backend Logic Summary (from _detect_bowl_pattern):
      // - Detects bowl patterns by finding EMA momentum reversal (momentum_60d > 0)
      // - Validates bowl structure: decline → bottom → climb-out
      // - Confirms lip breakout (price > resistance level)
      // - Groups consecutive triggers within 30 days into same pattern_id
      // - Each trigger has: time, score (is_successful_trade), pattern_id
      //
      // Frontend Display:
      // - Groups markers by pattern_id (each pattern_id = one bowl instance)
      // - Draws U-shaped curve for each bowl pattern
      // - Uses distinct colors per pattern_id for visual distinction

      // 1. Detect if we're displaying a bowl pattern
      // Check chart title to determine if we're showing bowl patterns
      const isBowlPattern = chartTitle.toLowerCase().includes("bowl");

      // 2. Filter bowl markers - bowl patterns are identified by:
      //    - Chart title contains "Bowl" AND marker has pattern_id (primary method)
      //    - OR marker text contains "BOWL" (case insensitive) - fallback
      //    Backend sends markers with pattern_id for bowl patterns (3 markers per bowl:
      //    left rim, bottom, right rim - all sharing the same pattern_id)
      const bowlMarkers = markers.filter((m) => {
        // Primary: If chart title indicates bowl pattern and marker has pattern_id
        if (isBowlPattern && m.pattern_id != null) {
          return true;
        }
        // Fallback: Check marker text
        const hasBowlText = m.text?.toUpperCase().includes("BOWL");
        return hasBowlText === true;
      });

      // Debug: Log pattern detection
      console.log(
        `[Pattern Detection] Chart title: "${chartTitle}", isBowlPattern: ${isBowlPattern}`
      );
      console.log(
        `[Pattern Detection] Total markers received: ${markers.length}`
      );
      if (markers.length > 0) {
        console.log(`[Pattern Detection] Sample marker:`, {
          time: markers[0].time,
          pattern_id: markers[0].pattern_id,
          text: markers[0].text,
          position: markers[0].position,
        });
        // Check how many markers have pattern_id
        const markersWithPatternId = markers.filter(
          (m) => m.pattern_id != null
        ).length;
        console.log(
          `[Pattern Detection] Markers with pattern_id: ${markersWithPatternId}`
        );
      }
      if (bowlMarkers.length > 0) {
        console.log(
          `[Pattern Detection] ✓ Found ${bowlMarkers.length} bowl markers out of ${markers.length} total markers`
        );
        console.log(
          `[Pattern Detection] ✓ Bowl patterns detected! Will render U-shaped curves for each pattern_id`
        );
      } else if (isBowlPattern) {
        if (markers.length === 0) {
          console.error(
            `[Pattern Detection] ❌ Backend returned 0 markers! Check backend Django view to ensure it transforms bowl pattern triggers into markers array.`
          );
          console.error(
            `[Pattern Detection] Expected: Backend should call _detect_bowl_pattern() and transform triggers into markers format with time, score, pattern_id`
          );
        } else {
          console.warn(
            `[Pattern Detection] ⚠ No bowl markers detected! Expected markers with pattern_id when chart title contains "Bowl"`
          );
        }
      }

      // 3. Group bowl markers by pattern_id
      // Backend groups consecutive triggers within 30 days (BOWL_GROUPING_WINDOW_DAYS)
      // into the same pattern_id. Each unique pattern_id represents one bowl pattern instance.
      const bowls = new Map<number, Marker[]>();
      bowlMarkers.forEach((marker) => {
        // Convert pattern_id to number, default to -1 if missing
        const id = marker.pattern_id != null ? Number(marker.pattern_id) : -1;
        if (!bowls.has(id)) bowls.set(id, []);
        bowls.get(id)!.push(marker);
      });

      // Fallback: If all markers have the same/missing pattern_id, group by time clusters
      // This handles edge cases where backend might not send unique pattern_ids
      // Uses same 30-day window as backend (BOWL_GROUPING_WINDOW_DAYS = 30)
      if (bowls.size === 1 && bowls.has(-1) && bowlMarkers.length > 0) {
        console.warn(
          "[Bowl Pattern] All markers have same/missing pattern_id. Grouping by time clusters (30-day window)."
        );
        bowls.clear();

        // Sort markers by time
        const sortedMarkers = [...bowlMarkers].sort(
          (a, b) => Number(a.time) - Number(b.time)
        );

        // Group markers that are close together in time (within 30 days)
        // Matches backend's BOWL_GROUPING_WINDOW_DAYS = 30
        const TIME_CLUSTER_THRESHOLD = 30 * 24 * 60 * 60; // 30 days in seconds
        let clusterId = 0;
        let lastTime = 0;

        sortedMarkers.forEach((marker) => {
          const markerTime = Number(marker.time);
          if (
            lastTime === 0 ||
            markerTime - lastTime > TIME_CLUSTER_THRESHOLD
          ) {
            clusterId++;
          }
          if (!bowls.has(clusterId)) bowls.set(clusterId, []);
          bowls.get(clusterId)!.push(marker);
          lastTime = markerTime;
        });
      }

      // Debug: Log pattern grouping
      if (bowls.size > 0) {
        console.log(
          `[Bowl Pattern] ✓ Grouped into ${bowls.size} unique bowl pattern(s)`
        );
        bowls.forEach((markers, id) => {
          console.log(
            `  - Pattern ID ${id}: ${markers.length} markers (left rim, bottom, right rim)`
          );
        });
        console.log(
          `[Bowl Pattern] ✓ Will draw ${bowls.size} U-shaped curve(s) with distinct colors`
        );
      }

      // 4. Clear old bowl series that are no longer needed
      patternSeriesRefs.current.forEach((series, key) => {
        if (!bowls.has(Number(key))) {
          series.setData([]);
        }
      });

      // 5. Color palette for bowl patterns - ensures each pattern_id gets a distinct color
      const bowlColors = [
        "#2962FF", // Blue
        "#FF6D00", // Orange
        "#00BFA5", // Teal
        "#D500F9", // Purple
        "#FFD600", // Yellow
        "#00E676", // Green
        "#FF1744", // Red
        "#FFFFFF", // White
        "#9C27B0", // Deep Purple
        "#00BCD4", // Cyan
      ];

      // 6. Draw U-shaped curves for each bowl pattern
      bowls.forEach((patternMarkers, patternId) => {
        // Sort markers by time to ensure proper curve drawing
        patternMarkers.sort((a, b) => Number(a.time) - Number(b.time));

        const numericPatternId = Number(patternId);

        // Assign color based on pattern_id (consistent color for same pattern_id)
        const colorIndex = Math.abs(numericPatternId) % bowlColors.length;
        const color = bowlColors[colorIndex];

        // Create or reuse the line series for this bowl pattern
        const seriesKey = String(numericPatternId);
        let patternSeries = patternSeriesRefs.current.get(seriesKey);

        if (!patternSeries) {
          // Create new line series for this bowl pattern
          patternSeries = chart.addSeries(LineSeries, {
            color: color,
            lineWidth: 3,
            lineStyle: 0, // Solid line
            crosshairMarkerVisible: false,
            priceLineVisible: false,
          });
          patternSeriesRefs.current.set(seriesKey, patternSeries);
        }

        // Always update color to ensure consistency
        patternSeries.applyOptions({
          color: color,
          lineWidth: 3,
          lineStyle: 0,
        });

        // Find candle data within the bowl pattern's time range
        // The backend groups triggers within 30 days (BOWL_GROUPING_WINDOW_DAYS) into same pattern_id
        // Each trigger represents a point where the pattern is detected (lip breakout confirmed)
        const firstTime = Number(patternMarkers[0].time);
        const lastTime = Number(patternMarkers[patternMarkers.length - 1].time);

        // Extend the range to capture the full bowl pattern structure:
        // - Backend uses BOWL_MIN_DURATION_DAYS (60 days) for EMA lookback
        // - Pattern includes: decline phase → bottom → climb-out → lip breakout
        // - Extend by ~30 days on each side to show the complete U-shape
        const EXTEND_DAYS = 30;
        const extendedFirstTime = firstTime - EXTEND_DAYS * 24 * 60 * 60;
        const extendedLastTime = lastTime + EXTEND_DAYS * 24 * 60 * 60;

        const spanCandles = formattedPriceData
          .filter(
            (c) =>
              Number(c.time) >= extendedFirstTime &&
              Number(c.time) <= extendedLastTime
          )
          .sort((a, b) => Number(a.time) - Number(b.time));

        if (spanCandles.length === 0) {
          patternSeries.setData([]);
          return;
        }

        // Build a smooth U-shaped curve that accurately represents the bowl pattern
        // The bowl pattern has three phases (matching backend logic):
        // 1. Decline phase (left side) - EMA declining, price falling toward bottom
        // 2. Bottom phase - EMA reaches minimum (local minimum), price at lowest
        // 3. Climb-out phase (right side) - EMA ascending (momentum_60d > 0), lip breakout

        // Find the actual minimum low in the pattern (the bottom of the bowl)
        const minLow = Math.min(...spanCandles.map((c) => c.low));
        const minLowIndex = spanCandles.findIndex((c) => c.low === minLow);

        // Get edge prices (start and end of the pattern span)
        const startLow = spanCandles[0].low;
        const endLow = spanCandles[spanCandles.length - 1].low;

        // Calculate where the bottom occurs (normalized 0-1)
        const bottomPosition =
          minLowIndex / Math.max(1, spanCandles.length - 1);

        const lineData = spanCandles.map((c, idx) => {
          // Normalize position from 0 to 1 across the pattern span
          const t = idx / Math.max(1, spanCandles.length - 1);

          // Create a smooth parabolic U-shape using quadratic curve
          // The parabola (t - bottomPosition)^2 creates a curve lowest at bottomPosition
          const distanceFromBottom = t - bottomPosition;
          const parabola = distanceFromBottom * distanceFromBottom;

          // Find the maximum parabola value (at the furthest edge from bottom)
          const maxDistance = Math.max(bottomPosition, 1 - bottomPosition);
          const maxParabola = maxDistance * maxDistance;

          // Normalize parabola: 0 at edges, 1 at bottom
          const normalizedParabola =
            maxParabola > 0 ? parabola / maxParabola : 0;
          const bowlDepth = 1 - normalizedParabola; // 1 at bottom, 0 at edges

          // Linear interpolation between start and end lows
          const edgeInterpolation = startLow * (1 - t) + endLow * t;

          // Apply U-shape: blend between edge interpolation and minimum low
          // bowlDepth determines how much we dip toward the minimum (0.8 = 80% of the way)
          const curvedValue =
            edgeInterpolation + (minLow - edgeInterpolation) * bowlDepth * 0.8;

          // Blend with actual candle low (65% curve, 35% actual) to follow price action
          // This creates a natural-looking bowl that follows the actual price lows
          return {
            time: c.time,
            value: 0.65 * curvedValue + 0.35 * c.low,
          };
        });

        // Set the U-shaped curve data
        patternSeries.setData(lineData);

        // Re-apply color after setting data to ensure it persists
        patternSeries.applyOptions({ color: color });
      });

      // 7. Handle other patterns (NRB, etc.) - display as markers on the candlestick series
      // Exclude bowl markers since they're drawn as U-shaped curves above
      const otherMarkers: SeriesMarker<Time>[] = markers
        .filter((m) => {
          // Exclude bowl markers - they're handled separately as curves
          // Bowl markers are identified by having pattern_id when chart title contains "Bowl"
          const isBowlMarker =
            (isBowlPattern && m.pattern_id != null) ||
            m.text?.toUpperCase().includes("BOWL");
          return !isBowlMarker;
        })
        .map((marker) => ({
          time: marker.time as Time,
          position: (marker.position || "belowBar") as
            | "aboveBar"
            | "belowBar"
            | "inBar",
          color: marker.color || "#2196F3",
          shape: (marker.shape || "circle") as
            | "circle"
            | "square"
            | "arrowUp"
            | "arrowDown",
          text: "", // Clear text to avoid showing pattern names next to markers
        }));

      if (seriesMarkers) {
        seriesMarkers.setMarkers(otherMarkers);
      }

      // Debug: Log marker counts
      if (otherMarkers.length > 0) {
        console.log(
          `[Other Patterns] Displaying ${otherMarkers.length} markers for non-bowl patterns`
        );
      }

      // Adjust the visible range to show all data
      chart.timeScale().fitContent();
    } else {
      candlestickSeries.setData([]); // Clear data if no priceData
      if (seriesMarkers) seriesMarkers.setMarkers([]); // Clear markers
      patternSeriesRefs.current.forEach((series) => series.setData([])); // Clear all pattern lines
    }

    // Handle resizing
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      // Do not remove chartRef.current here if you want to keep the chart instance alive
      // for updates. If you want to destroy and recreate, then uncomment:
      // if (chartRef.current) {
      //   chartRef.current.remove();
      //   chartRef.current = null;
      // }
    };
  }, [priceData, markers, chartTitle]); // Re-run effect when priceData or markers change

  return (
    <div style={{ position: "relative" }}>
      <h2 style={{ color: "#d1d4dc", textAlign: "center" }}>{chartTitle}</h2>
      <div ref={chartContainerRef} style={{ width: "100%", height: "500px" }} />
    </div>
  );
};

export default TradingViewChart;
