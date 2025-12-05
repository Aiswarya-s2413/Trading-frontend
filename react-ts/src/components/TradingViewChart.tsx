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
  // Refs for NRB narrow-range horizontal lines (high & low for each regime)
  const nrbRangeSeriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
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
      const formattedPriceData = priceData.map((item) => ({
        time: item.time as Time, // Unix timestamp (seconds)
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }));
      candlestickSeries.setData(formattedPriceData);

      // ========= Handle Bowl Patterns Using pattern_id (one line per bowl) ==========
      const isBowlPattern = chartTitle.toLowerCase().includes("bowl");

      const bowlMarkers = markers.filter((m) => {
        const mm: any = m;
        if (isBowlPattern && mm.pattern_id != null) return true;
        const hasBowlText = mm.text?.toUpperCase().includes("BOWL");
        return hasBowlText === true;
      });

      console.log(
        `[Pattern Detection] Chart title: "${chartTitle}", isBowlPattern: ${isBowlPattern}`
      );
      console.log(
        `[Pattern Detection] Total markers received: ${markers.length}`,
        markers
      );

      if (markers.length > 0) {
        const mm: any = markers[0];
        console.log(`[Pattern Detection] Sample marker:`, {
          time: mm.time,
          pattern_id: mm.pattern_id,
          text: mm.text,
          position: mm.position,
          range_low: mm.range_low,
          range_high: mm.range_high,
          range_start_time: mm.range_start_time,
          range_end_time: mm.range_end_time,
          nrb_id: mm.nrb_id,
          direction: mm.direction,
          nr_high: mm.nr_high,
          nr_low: mm.nr_low,
        });
        const markersWithPatternId = markers.filter(
          (m) => (m as any).pattern_id != null
        ).length;
        console.log(
          `[Pattern Detection] Markers with pattern_id: ${markersWithPatternId}`
        );
      }

      if (bowlMarkers.length > 0) {
        console.log(
          `[Pattern Detection] ✓ Found ${bowlMarkers.length} bowl markers out of ${markers.length} total markers`
        );
      } else if (isBowlPattern) {
        if (markers.length === 0) {
          console.error(
            `[Pattern Detection] ❌ Backend returned 0 markers for bowl`
          );
        } else {
          console.warn(
            `[Pattern Detection] ⚠ No bowl markers detected! Expected markers with pattern_id when chart title contains "Bowl"`
          );
        }
      }

      // 3. Group bowl markers by pattern_id
      const bowls = new Map<number, Marker[]>();
      bowlMarkers.forEach((marker) => {
        const mm: any = marker;
        const id = mm.pattern_id != null ? Number(mm.pattern_id) : -1;
        if (!bowls.has(id)) bowls.set(id, []);
        bowls.get(id)!.push(marker);
      });

      // Fallback: group by time if no pattern_id
      if (bowls.size === 1 && bowls.has(-1) && bowlMarkers.length > 0) {
        console.warn(
          "[Bowl Pattern] All markers have same/missing pattern_id. Grouping by time clusters (30-day window)."
        );
        bowls.clear();

        const sortedMarkers = [...bowlMarkers].sort(
          (a, b) =>
            Number((a as any).time) - Number((b as any).time)
        );

        const TIME_CLUSTER_THRESHOLD = 30 * 24 * 60 * 60; // 30 days in seconds
        let clusterId = 0;
        let lastTime = 0;

        sortedMarkers.forEach((marker) => {
          const markerTime = Number((marker as any).time);
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

      if (bowls.size > 0) {
        console.log(
          `[Bowl Pattern] ✓ Grouped into ${bowls.size} unique bowl pattern(s)`
        );
        bowls.forEach((markers, id) => {
          console.log(
            `  - Pattern ID ${id}: ${markers.length} markers (left rim, bottom, right rim)`
          );
        });
      }

      // 4. Clear old bowl series
      patternSeriesRefs.current.forEach((series, key) => {
        if (!bowls.has(Number(key))) {
          series.setData([]);
        }
      });

      // 5. Color palette for bowls
      const bowlColors = [
        "#2962FF",
        "#FF6D00",
        "#00BFA5",
        "#D500F9",
        "#FFD600",
        "#00E676",
        "#FF1744",
        "#FFFFFF",
        "#9C27B0",
        "#00BCD4",
      ];

      // 6. Draw U-shaped curves for each bowl pattern
      bowls.forEach((patternMarkers, patternId) => {
        patternMarkers.sort(
          (a, b) =>
            Number((a as any).time) - Number((b as any).time)
        );

        const numericPatternId = Number(patternId);
        const colorIndex = Math.abs(numericPatternId) % bowlColors.length;
        const color = bowlColors[colorIndex];

        const seriesKey = String(numericPatternId);
        let patternSeries = patternSeriesRefs.current.get(seriesKey);

        if (!patternSeries) {
          patternSeries = chart.addSeries(LineSeries, {
            color: color,
            lineWidth: 3,
            lineStyle: 0,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
          });
          patternSeriesRefs.current.set(seriesKey, patternSeries);
        }

        patternSeries.applyOptions({
          color: color,
          lineWidth: 3,
          lineStyle: 0,
        });

        const firstTime = Number((patternMarkers[0] as any).time);
        const lastTime = Number(
          (patternMarkers[patternMarkers.length - 1] as any).time
        );

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

        const minLow = Math.min(...spanCandles.map((c) => c.low));
        const minLowIndex = spanCandles.findIndex((c) => c.low === minLow);

        const startLow = spanCandles[0].low;
        const endLow = spanCandles[spanCandles.length - 1].low;
        const bottomPosition =
          minLowIndex / Math.max(1, spanCandles.length - 1);

        const lineData = spanCandles.map((c, idx) => {
          const t = idx / Math.max(1, spanCandles.length - 1);

          const distanceFromBottom = t - bottomPosition;
          const parabola = distanceFromBottom * distanceFromBottom;

          const maxDistance = Math.max(bottomPosition, 1 - bottomPosition);
          const maxParabola = maxDistance * maxDistance;

          const normalizedParabola =
            maxParabola > 0 ? parabola / maxParabola : 0;
          const bowlDepth = 1 - normalizedParabola;

          const edgeInterpolation = startLow * (1 - t) + endLow * t;
          const curvedValue =
            edgeInterpolation + (minLow - edgeInterpolation) * bowlDepth * 0.8;

          return {
            time: c.time,
            value: 0.65 * curvedValue + 0.35 * c.low,
          };
        });

        patternSeries.setData(lineData);
        patternSeries.applyOptions({ color: color });
      });

      // 6.5 Draw horizontal lines for NRB narrow ranges
      const nrbMarkersWithRange = markers.filter((m: any) => {
        const isBowlMarker =
          (isBowlPattern && m.pattern_id != null) ||
          m.text?.toUpperCase().includes("BOWL");
        const hasRange =
          m.range_low != null &&
          m.range_high != null &&
          m.range_start_time != null &&
          m.range_end_time != null;
        return !isBowlMarker && hasRange;
      });

      console.log(
        `[NRB Ranges] Found ${nrbMarkersWithRange.length} markers with range info`
      );

      // Clear old NRB range series
      nrbRangeSeriesRefs.current.forEach((series) => {
        series.setData([]);
      });

      nrbMarkersWithRange.forEach((marker: any) => {
        const id = marker.nrb_id != null ? String(marker.nrb_id) : String(marker.time);

        // High line
        const highKey = `${id}-high`;
        let highSeries = nrbRangeSeriesRefs.current.get(highKey);
        if (!highSeries) {
          highSeries = chart.addSeries(LineSeries, {
            color: "#888888",
            lineWidth: 1,
            lineStyle: 1, // dashed
            crosshairMarkerVisible: false,
            priceLineVisible: false,
          });
          nrbRangeSeriesRefs.current.set(highKey, highSeries);
        }
        highSeries.setData([
          {
            time: marker.range_start_time as Time,
            value: marker.range_high as number,
          },
          {
            time: marker.range_end_time as Time,
            value: marker.range_high as number,
          },
        ]);

        // Low line
        const lowKey = `${id}-low`;
        let lowSeries = nrbRangeSeriesRefs.current.get(lowKey);
        if (!lowSeries) {
          lowSeries = chart.addSeries(LineSeries, {
            color: "#888888",
            lineWidth: 1,
            lineStyle: 1, // dashed
            crosshairMarkerVisible: false,
            priceLineVisible: false,
          });
          nrbRangeSeriesRefs.current.set(lowKey, lowSeries);
        }
        lowSeries.setData([
          {
            time: marker.range_start_time as Time,
            value: marker.range_low as number,
          },
          {
            time: marker.range_end_time as Time,
            value: marker.range_low as number,
          },
        ]);
      });

      // 7. Handle other patterns (NRB dots, etc.) – using exact breakout time from backend
      const otherMarkers: SeriesMarker<Time>[] = markers
        .filter((m: any) => {
          const isBowlMarker =
            (isBowlPattern && m.pattern_id != null) ||
            m.text?.toUpperCase().includes("BOWL");
          return !isBowlMarker;
        })
        .map((marker: any) => {
          // Default values
          let color = marker.color || "#2196F3";
          let shape = marker.shape || "circle";
      
          // 🔥 Apply neon colors for NRB breakouts
          if (marker.direction === "Bullish Break") {
            color = "#00E5FF";     // Neon Blue
            shape = "arrowUp";
          } else if (marker.direction === "Bearish Break") {
            color = "#FFD600";     // Neon Yellow
            shape = "arrowDown";
          }
      
          return {
            time: marker.time as Time,
            position: (marker.position || "belowBar") as
              | "aboveBar"
              | "belowBar"
              | "inBar",
            color,
            shape,
            text: "",
          };
      });
      

      if (seriesMarkers) {
        seriesMarkers.setMarkers(otherMarkers);
      }

      if (otherMarkers.length > 0) {
        console.log(
          `[Other Patterns] Displaying ${otherMarkers.length} markers for non-bowl patterns`
        );
      }

      chart.timeScale().fitContent();
    } else {
      candlestickSeries.setData([]);
      if (seriesMarkers) seriesMarkers.setMarkers([]);
      patternSeriesRefs.current.forEach((series) => series.setData([]));
      nrbRangeSeriesRefs.current.forEach((series) => series.setData([]));
    }

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [priceData, markers, chartTitle]);

  return (
    <div style={{ position: "relative" }}>
      <h2 style={{ color: "#d1d4dc", textAlign: "center" }}>{chartTitle}</h2>
      <div ref={chartContainerRef} style={{ width: "100%", height: "500px" }} />
    </div>
  );
};

export default TradingViewChart;
