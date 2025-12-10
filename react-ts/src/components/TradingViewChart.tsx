// src/components/TradingViewChart.tsx
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
import type { PriceData, Marker, SeriesPoint } from "../api";

interface TradingViewChartProps {
  priceData: PriceData[];
  markers: Marker[];
  chartTitle: string;
  parameterSeriesName?: string | null;
  parameterSeriesData?: SeriesPoint[];
}

const TradingViewChart: React.FC<TradingViewChartProps> = ({
  priceData,
  markers,
  chartTitle,
  parameterSeriesName,
  parameterSeriesData,
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const parameterLineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Bowl curves: one line series per bowl pattern
  const bowlSeriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  // NRB range lines: high/low per regime
  const nrbRangeSeriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  // Markers plugin instances - one for each series type
  const candlestickMarkersRef = useRef<ReturnType<
    typeof createSeriesMarkers<Time>
  > | null>(null);
  const parameterLineMarkersRef = useRef<ReturnType<
    typeof createSeriesMarkers<Time>
  > | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // === 1. Create chart + base candlestick series once ===
    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 500,
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

      chartRef.current = chart;

      // functional API: add candlestick series (will be hidden if parameter series is used)
      candlestickSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      });

      // Create parameter line series (will be used when parameter is not "close")
      // Color will be updated based on parameter type
      parameterLineSeriesRef.current = chart.addSeries(LineSeries, {
        color: "#2962FF", // Default blue, will be updated
        lineWidth: 2,
        lineStyle: 0,
        crosshairMarkerVisible: true,
        priceLineVisible: false,
      });

      // Create markers plugins for both series
      if (candlestickSeriesRef.current && !candlestickMarkersRef.current) {
        candlestickMarkersRef.current = createSeriesMarkers(
          candlestickSeriesRef.current,
          []
        );
      }
      if (parameterLineSeriesRef.current && !parameterLineMarkersRef.current) {
        parameterLineMarkersRef.current = createSeriesMarkers(
          parameterLineSeriesRef.current,
          []
        );
      }
    }

    const chart = chartRef.current;
    const candlestickSeries = candlestickSeriesRef.current;
    const parameterLineSeries = parameterLineSeriesRef.current;

    if (!chart || !candlestickSeries || !parameterLineSeries) return;

    // Determine if we should show line graph or candles
    const showParameterLine =
      parameterSeriesName &&
      parameterSeriesData &&
      parameterSeriesData.length > 0;

    // === 2. Update price data ===
    if (priceData.length > 0 || (showParameterLine && parameterSeriesData)) {
      // Show/hide series based on parameter selection
      if (showParameterLine) {
        // Hide candlesticks, show parameter line
        candlestickSeries.applyOptions({ visible: false });

        // Set line color based on parameter type
        const lineColors: Record<string, string> = {
          ema21: "#00E5FF",
          ema50: "#2962FF",
          ema200: "#7C4DFF",
          rsc30: "#00E676",
          rsc500: "#FFD600",
        };
        const lineColor = lineColors[parameterSeriesName || ""] || "#2962FF";

        parameterLineSeries.applyOptions({
          visible: true,
          color: lineColor,
        });

        // Update parameter line data
        if (parameterSeriesData && parameterSeriesData.length > 0) {
          const formattedLineData = parameterSeriesData.map((item) => ({
            time: item.time as Time,
            value: item.value,
          }));
          parameterLineSeries.setData(formattedLineData);
        }
      } else {
        // Show candlesticks, hide parameter line
        candlestickSeries.applyOptions({ visible: true });
        parameterLineSeries.applyOptions({ visible: false });

        // Update candlestick data
        const formattedPriceData = priceData.map((item) => ({
          time: item.time as Time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        }));
        candlestickSeries.setData(formattedPriceData);
      }

      // Use the appropriate series for bowl calculations (use price data for candles, line data for parameter)
      const dataForCalculations =
        showParameterLine && parameterSeriesData
          ? parameterSeriesData.map((item) => ({
              time: item.time as Time,
              open: item.value,
              high: item.value,
              low: item.value,
              close: item.value,
            }))
          : priceData.map((item) => ({
              time: item.time as Time,
              open: item.open,
              high: item.high,
              low: item.low,
              close: item.close,
            }));

      // === 3. Pattern logic: Bowl vs NRB ===
      const isBowlPattern = chartTitle.toLowerCase().includes("bowl");

      // --- Bowl markers detection ---
      const bowlMarkers = markers.filter((m) => {
        const mm: any = m;
        if (isBowlPattern && mm.pattern_id != null) return true;
        const hasBowlText = mm.text?.toUpperCase().includes("BOWL");
        return hasBowlText === true;
      });

      // Group bowl markers by pattern_id
      const bowls = new Map<number, Marker[]>();
      bowlMarkers.forEach((marker) => {
        const mm: any = marker;
        const id = mm.pattern_id != null ? Number(mm.pattern_id) : -1;
        if (!bowls.has(id)) bowls.set(id, []);
        bowls.get(id)!.push(marker);
      });

      // Fallback grouping if pattern_id missing
      if (bowls.size === 1 && bowls.has(-1) && bowlMarkers.length > 0) {
        bowls.clear();
        const sortedMarkers = [...bowlMarkers].sort(
          (a, b) => Number((a as any).time) - Number((b as any).time)
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

      // --- Clear old bowl series that no longer exist ---
      bowlSeriesRefs.current.forEach((series, key) => {
        const id = Number(key);
        if (!bowls.has(id)) {
          series.setData([]);
        }
      });

      // --- Draw bowl curves (U-shaped parabolas) ---
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

      bowls.forEach((patternMarkers, patternId) => {
        if (patternMarkers.length === 0) return;

        patternMarkers.sort(
          (a, b) => Number((a as any).time) - Number((b as any).time)
        );

        const numericPatternId = Number(patternId);
        const colorIndex = Math.abs(numericPatternId) % bowlColors.length;
        const color = bowlColors[colorIndex];

        const seriesKey = String(numericPatternId);
        let bowlSeries = bowlSeriesRefs.current.get(seriesKey);

        if (!bowlSeries) {
          bowlSeries = chart.addSeries(LineSeries, {
            color,
            lineWidth: 3,
            lineStyle: 0,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
          });
          bowlSeriesRefs.current.set(seriesKey, bowlSeries);
        } else {
          bowlSeries.applyOptions({
            color,
            lineWidth: 3,
            lineStyle: 0,
          });
        }

        // Extend bowl span a bit on both sides
        const firstTime = Number((patternMarkers[0] as any).time);
        const lastTime = Number(
          (patternMarkers[patternMarkers.length - 1] as any).time
        );
        const EXTEND_DAYS = 30;
        const extendedFirstTime = firstTime - EXTEND_DAYS * 24 * 60 * 60;
        const extendedLastTime = lastTime + EXTEND_DAYS * 24 * 60 * 60;

        const spanCandles = dataForCalculations
          .filter(
            (c) =>
              Number(c.time) >= extendedFirstTime &&
              Number(c.time) <= extendedLastTime
          )
          .sort((a, b) => Number(a.time) - Number(b.time));

        if (spanCandles.length === 0) {
          bowlSeries.setData([]);
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

        bowlSeries.setData(lineData);
      });

      // === 4. NRB range lines (horizontal high/low per regime) ===
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

      // Clear old NRB range series
      nrbRangeSeriesRefs.current.forEach((series) => {
        series.setData([]);
      });

      nrbMarkersWithRange.forEach((marker: any) => {
        const id =
          marker.nrb_id != null ? String(marker.nrb_id) : String(marker.time);

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

      // === 5. NRB / other markers as dots/arrows ===
      const otherMarkers: SeriesMarker<Time>[] = markers
        .filter((m: any) => {
          const isBowlMarker =
            (isBowlPattern && m.pattern_id != null) ||
            m.text?.toUpperCase().includes("BOWL");
          return !isBowlMarker;
        })
        .map((marker: any) => {
          let color = marker.color || "#2196F3";
          let shape: SeriesMarker<Time>["shape"] =
            (marker.shape as any) || "circle";

          // Neon arrows for NRB
          const isNRBMarker =
            marker.direction === "Bullish Break" ||
            marker.direction === "Bearish Break";

          if (marker.direction === "Bullish Break") {
            color = "#00E5FF";
            shape = "arrowUp";
          } else if (marker.direction === "Bearish Break") {
            color = "#FFD600";
            shape = "arrowDown";
          }

          return {
            time: marker.time as Time,
            position: (marker.position || "aboveBar") as
              | "aboveBar"
              | "belowBar"
              | "inBar",
            color,
            shape,
            // Remove text for NRB markers - only show arrows
            text: isNRBMarker ? "" : marker.text || "",
          };
        });

      // Attach markers to the visible series
      if (showParameterLine && parameterLineMarkersRef.current) {
        parameterLineMarkersRef.current.setMarkers(otherMarkers);
      } else if (!showParameterLine && candlestickMarkersRef.current) {
        candlestickMarkersRef.current.setMarkers(otherMarkers);
      }

      chart.timeScale().fitContent();
    } else {
      // No price data: clear everything
      candlestickSeries.setData([]);
      if (parameterLineSeries) {
        parameterLineSeries.setData([]);
      }
      candlestickMarkersRef.current?.setMarkers([]);
      parameterLineMarkersRef.current?.setMarkers([]);
      bowlSeriesRefs.current.forEach((series) => series.setData([]));
      nrbRangeSeriesRefs.current.forEach((series) => series.setData([]));
    }

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [
    priceData,
    markers,
    chartTitle,
    parameterSeriesName,
    parameterSeriesData,
  ]);

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header row above the chart */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">{chartTitle}</h2>
          <p className="text-xs text-slate-400">
            {parameterSeriesName &&
            parameterSeriesData &&
            parameterSeriesData.length > 0
              ? `${parameterSeriesName.toUpperCase()} line · Pattern scanner`
              : "Daily candles · Pattern scanner"}
          </p>
        </div>

        <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-300">
          NRB / Bowl
        </span>
      </div>

      {/* Chart container */}
      <div
        ref={chartContainerRef}
        className="h-[500px] w-full rounded-2xl border border-slate-700 bg-slate-900/80 shadow-xl shadow-slate-950/60"
      />
    </div>
  );
};

export default TradingViewChart;
