import axios from "axios";

// const API_BASE_URL = "http://localhost:8000/api"; 
const API_BASE_URL = "https://trading.aiswaryasathyan.space/api";

// Define interfaces for data structure received from the backend
export interface PriceData {
  time: number; // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Marker {
  time: number; // Unix timestamp
  position?: "aboveBar" | "belowBar" | "overlay"; // Optional - backend may not send this
  color?: string; // Optional - backend may not send this
  shape?: "arrowUp" | "arrowDown" | "circle" | "square"; // Optional - backend may not send this
  text?: string;
  pattern_id?: number; // Used for grouping bowl patterns
  score?: number; // Success score from backend

  // 🆕 NRB RANGE-LINE FIELDS (OPTIONAL)
  range_low?: number | null;
  range_high?: number | null;
  range_start_time?: number | null;
  range_end_time?: number | null;
  nrb_id?: number | null;
}

export interface PatternScanResponse {
  scrip: string;
  pattern: string;
  price_data: PriceData[];
  markers: Marker[];
}

// Optional: raw price history response for "no filter" view
// Adjust this to match your backend's actual response shape if different.
export interface RawPriceHistoryResponse {
  price_data: PriceData[];
}

// Function to fetch pattern scan data from your backend
export const fetchPatternScanData = async (
  scrip: string,
  pattern: string,
  nrbLookback: number | null, // Can be null if not applicable to the pattern
  successRate: number,
  weeks?: number
): Promise<PatternScanResponse> => {
  try {
    const params: any = {
      scrip,
      pattern,
      success_rate: successRate,
    };

    if (nrbLookback !== null) {
      params.nrb_lookback = nrbLookback;
    }

    if (pattern === "Narrow Range Break" && weeks != null) {
      params.weeks = weeks;  // 👈 this will become ?weeks=20 in the URL
    }
    // Add other dynamic parameters here, e.g.:
    // if (parameterValue !== null) { params.parameter_value = parameterValue; }
    // if (successTimeframe !== null) { params.success_timeframe = successTimeframe; }

    const response = await axios.get<PatternScanResponse>(
      `${API_BASE_URL}/pattern-scan/`,
      { params }
    );

    // Debug: Log the raw response to see what backend is sending
    console.log("[API] Raw response data:", response.data);
    console.log("[API] Response keys:", Object.keys(response.data));

    // Check for markers in various possible locations
    let rawMarkers = response.data.markers;
    if (!rawMarkers && (response.data as any).triggers) {
      // Backend might return triggers instead of markers
      rawMarkers = (response.data as any).triggers;
      console.log("[API] Found markers in 'triggers' field");
    }
    if (!rawMarkers && Array.isArray(response.data)) {
      // Backend might return markers as root array
      rawMarkers = response.data;
      console.log("[API] Response is array, treating as markers");
    }

    console.log("[API] Markers found:", rawMarkers);
    console.log("[API] Number of markers:", rawMarkers?.length || 0);

    // Normalize markers - ensure they have the required structure
    const normalizedData: PatternScanResponse = {
      scrip: response.data.scrip || "",
      pattern: response.data.pattern || pattern,
      price_data: response.data.price_data || [],
      markers: (rawMarkers || []).map((marker: any) => ({
        time: marker.time,
        pattern_id: marker.pattern_id,
        score: marker.score,

        // Optional fields with defaults
        position: marker.position || "belowBar",
        color: marker.color || "#2196F3",
        shape: marker.shape || "circle",
        text: marker.text,

        // 🆕 PASS THROUGH NRB RANGE INFO (YOUR FRONTEND NEEDS THIS)
        range_low: marker.range_low ?? null,
        range_high: marker.range_high ?? null,
        range_start_time: marker.range_start_time ?? null,
        range_end_time: marker.range_end_time ?? null,
        nrb_id: marker.nrb_id ?? null,
        direction: marker.direction,

      })),
    };

    console.log(
      "[API] Normalized markers count:",
      normalizedData.markers.length
    );
    if (normalizedData.markers.length > 0) {
      console.log("[API] Sample normalized marker:", normalizedData.markers[0]);
    }

    return normalizedData;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Access the error response from the backend
      console.error("API Error:", error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error || "An unknown API error occurred"
      );
    }
    console.error("Network or other error:", error);
    throw new Error("Network or other error during API call");
  }
};

// Function to fetch raw (unfiltered) price history, e.g. last 10 years
// TODO: Make sure the URL and params match your backend implementation.
export const fetchRawPriceHistory = async (
  scrip: string,
  years: number = 10
): Promise<RawPriceHistoryResponse> => {
  try {
    const response = await axios.get<RawPriceHistoryResponse>(
      `${API_BASE_URL}/price-history/`,
      {
        params: { scrip, years },
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "API Error (raw history):",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.error ||
          "An unknown API error occurred while fetching raw history"
      );
    }
    console.error("Network or other error (raw history):", error);
    throw new Error("Network or other error during raw history API call");
  }
};
