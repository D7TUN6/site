import express from "express";
import { getOptionalEnv } from "../lib/config.mjs";

function normalizeProvider(raw) {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "cdek" || value === "russian_post" || value === "ozon" || value === "avito" || value === "custom") {
    return value;
  }
  return null;
}

function providerDefaultQuery(provider) {
  switch (provider) {
    case "cdek":
      return "СДЭК пункт выдачи";
    case "russian_post":
      return "Почта России отделение";
    case "ozon":
      return "Ozon пункт выдачи";
    case "avito":
      return "Avito доставка пункт выдачи";
    default:
      return "пункт выдачи";
  }
}

function safeText(raw, max = 120) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return value.length > max ? value.slice(0, max) : value;
}

export function createShippingRouter() {
  const router = express.Router();

  router.get("/providers", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      providers: [
        { id: "cdek", label: "CDEK" },
        { id: "russian_post", label: "Почта РФ" },
        { id: "ozon", label: "Ozon" },
        { id: "avito", label: "Avito" },
        { id: "custom", label: "Other" }
      ]
    });
  });

  router.get("/pickup-points", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const yandexKey = getOptionalEnv("YANDEX_MAPS_SEARCH_API_KEY", "");
    if (!yandexKey) {
      return res.status(501).json({ error: "YANDEX_MAPS_SEARCH_API_KEY is not configured" });
    }

    const provider = normalizeProvider(req.query.provider);
    if (!provider) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    const city = safeText(req.query.city, 80);
    const q = safeText(req.query.q, 120);
    const query = q || providerDefaultQuery(provider);

    const text = city ? `${query}, ${city}` : query;

    const params = new URLSearchParams({
      apikey: yandexKey,
      text,
      type: "biz",
      lang: "ru_RU",
      results: "40"
    });

    const url = `https://search-maps.yandex.ru/v1/?${params.toString()}`;

    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`pickup points: Yandex returned ${response.status}`, body.slice(0, 500));
        return res.status(502).json({ error: "Pickup points lookup failed", details: body.slice(0, 500) });
      }

      const payload = await response.json();
      const features = Array.isArray(payload?.features) ? payload.features : [];

      const points = features
        .map((feature) => {
          const props = feature?.properties ?? {};
          const geometry = feature?.geometry ?? {};
          const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : null;
          const lon = Number.isFinite(coordinates?.[0]) ? Number(coordinates[0]) : null;
          const lat = Number.isFinite(coordinates?.[1]) ? Number(coordinates[1]) : null;
          if (lat == null || lon == null) return null;

          const name = typeof props?.name === "string" ? props.name : "";
          const description = typeof props?.description === "string" ? props.description : "";
          const address = typeof props?.CompanyMetaData?.address === "string" ? props.CompanyMetaData.address : description;
          const id = typeof props?.CompanyMetaData?.id === "string" ? props.CompanyMetaData.id : cryptoId(`${name}:${address}:${lat}:${lon}`);

          return {
            id,
            provider,
            name: name || query,
            address: address || "",
            lat,
            lon
          };
        })
        .filter(Boolean);

      return res.status(200).json({ ok: true, provider, points });
    } catch (error) {
      console.error("pickup points lookup failed", error);
      return res.status(500).json({ error: "Unable to fetch pickup points" });
    }
  });

  return router;
}

function cryptoId(input) {
  // Lightweight stable ID for points when the provider API doesn't give one.
  const bytes = new TextEncoder().encode(String(input));
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `pt_${(hash >>> 0).toString(16)}`;
}
