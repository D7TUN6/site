export function applyBgVersion(version: string): void {
  const v = encodeURIComponent(version);
  const jpg = `url("/media/background/bg.jpg?v=${v}")`;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos15 = /\b(iPhone|iPad|iPod)\b/i.test(ua) && /\bOS 15[_\\d]*\\b/i.test(ua);
  const supportsImageSet =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("background-image", `image-set(${jpg} 1x)`);

  if (isIos15 || !supportsImageSet) {
    document.documentElement.style.setProperty("--bg-image", jpg);
    return;
  }

  const val = [
    `image-set(`,
    `url("/media/background/bg-960.avif?v=${v}") 1x type("image/avif"),`,
    `url("/media/background/bg-1440.avif?v=${v}") 2x type("image/avif"),`,
    `url("/media/background/bg-960.webp?v=${v}") 1x type("image/webp"),`,
    `url("/media/background/bg-1440.webp?v=${v}") 2x type("image/webp"),`,
    `url("/media/background/bg.jpg?v=${v}") 1x type("image/jpeg")`,
    `)`
  ].join(" ");
  document.documentElement.style.setProperty("--bg-image", val);
}

export async function fetchAndApplyBg(): Promise<void> {
  try {
    const r = await fetch("/api/background/version", { cache: "no-store" });
    const data = await r.json() as { version?: string };
    if (data.version) applyBgVersion(data.version);
  } catch (error) {
    void error;
  }
}
