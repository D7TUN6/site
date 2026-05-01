export type YMapsBounds = [[number, number], [number, number]];

export type YMapsPlacemark = {
  events: {
    add: (eventName: string, cb: () => void) => void;
  };
};

export type YMapsMap = {
  geoObjects: {
    add: (obj: unknown) => void;
    remove: (obj: unknown) => void;
    getBounds: () => YMapsBounds | null;
  };
  setBounds: (bounds: YMapsBounds, options?: { checkZoomRange?: boolean; zoomMargin?: number }) => void;
  destroy?: () => void;
};

export type YMapsApi = {
  ready: (cb: () => void) => void;
  geocode?: (text: string, options?: { results?: number }) => unknown;
  Map: new (
    element: HTMLElement,
    options: { center: [number, number]; zoom: number; controls?: string[] }
  ) => YMapsMap;
  Placemark: new (
    coords: [number, number],
    properties: { balloonContent: string },
    options: { preset?: string }
  ) => YMapsPlacemark;
};

declare global {
  interface Window {
    ymaps?: YMapsApi;
  }
}

let loaderPromise: Promise<YMapsApi> | null = null;

export function loadYandexMaps(apiKey: string, lang: "ru_RU" | "en_US" = "ru_RU"): Promise<YMapsApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("No window"));
  }

  if (window.ymaps) {
    return new Promise((resolve) => window.ymaps?.ready(() => resolve(window.ymaps as YMapsApi)));
  }

  if (!loaderPromise) {
    loaderPromise = new Promise<YMapsApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=${encodeURIComponent(lang)}&csp=true`;
      script.onload = () => {
        const ymaps = window.ymaps;
        if (!ymaps) {
          reject(new Error("Yandex Maps failed to load"));
          return;
        }
        ymaps.ready(() => resolve(ymaps));
      };
      script.onerror = () => reject(new Error("Yandex Maps failed to load"));
      document.head.appendChild(script);
    });
  }

  return loaderPromise;
}
