import { getOptionalEnv } from "./config.mjs";

export async function trackGoLookup({ trackCode, language = "ru", couriers = "" } = {}) {
  const apiKey = getOptionalEnv("TRACKGO_API_KEY", "");
  if (!apiKey) {
    throw new Error("TRACKGO_API_KEY is not configured");
  }

  const code = String(trackCode || "").trim();
  if (!code) {
    throw new Error("Missing track code");
  }

  const params = new URLSearchParams({
    track_code: code,
    language: language === "en" ? "en" : "ru",
    apikey: apiKey,
    ...(couriers ? { couriers } : {})
  });

  const url = `https://tracking.trackgo.app/api/tracking/?${params.toString()}`;
  const response = await fetch(url, { method: "GET" });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error || payload?.detail || "TrackGo request failed";
    throw new Error(String(message));
  }

  return payload;
}

export function trackGoToStatus(payload) {
  const track = payload?.track ?? null;
  if (!track) return null;

  const unified = typeof track?.status === "string" ? track.status : "";
  const lastEventName = track?.last_event?.name?.original;
  const lastEventDate = track?.last_event?.date;

  const parts = [];
  if (unified) parts.push(unified);
  if (typeof lastEventName === "string" && lastEventName.trim()) parts.push(lastEventName.trim());
  if (typeof lastEventDate === "string" && lastEventDate.trim()) parts.push(lastEventDate.trim());

  return {
    unifiedStatus: unified || null,
    message: parts.join(" — ").slice(0, 240) || null
  };
}
