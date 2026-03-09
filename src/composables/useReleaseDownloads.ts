import { ref } from "vue";
import type { ReleaseEntry } from "@/types/content";

type DownloadFormat = "flac" | "mp3" | "ogg" | "wav";

function parseDownloadFileName(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) return fallbackName;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const simpleMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (simpleMatch?.[1]) return simpleMatch[1];

  return fallbackName;
}

function getApiError(payload: { error?: string; message?: string } | null, fallback: string): string {
  if (payload?.error && payload.error.trim().length > 0) return payload.error;
  if (payload?.message && payload.message.trim().length > 0) return payload.message;
  return fallback;
}

function isLikelyIOSDevice(): boolean {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function submitHiddenPost(action: string, payload: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";

  for (const [key, value] of Object.entries(payload)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

async function downloadViaFetch(action: string, payload: Record<string, string>, fallbackName: string) {
  const response = await fetch(action, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(getApiError(body, "Download failed"));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = parseDownloadFileName(response.headers.get("content-disposition"), fallbackName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export function useReleaseDownloads(release: ReleaseEntry) {
  const isDownloading = ref(false);
  const isTrackDownloading = ref(false);
  const downloadError = ref<string | null>(null);

  async function downloadRelease(format: DownloadFormat) {
    if (isDownloading.value) return;
    isDownloading.value = true;
    downloadError.value = null;

    try {
      const payload = { slug: release.slug, format };
      if (isLikelyIOSDevice()) {
        submitHiddenPost("/api/releases/download", payload);
        return;
      }

      await downloadViaFetch("/api/releases/download", payload, `${release.slug}-${format}.zip`);
    } catch (error) {
      downloadError.value = error instanceof Error ? error.message : "Unexpected download error";
    } finally {
      isDownloading.value = false;
    }
  }

  async function downloadTrack(trackIndex: number, format: DownloadFormat) {
    if (isTrackDownloading.value) return;
    isTrackDownloading.value = true;
    downloadError.value = null;

    try {
      const payload = { slug: release.slug, track: String(trackIndex), format };
      if (isLikelyIOSDevice()) {
        submitHiddenPost("/api/releases/track", payload);
        return;
      }

      await downloadViaFetch("/api/releases/track", payload, `${release.slug}-${trackIndex}.${format}`);
    } catch (error) {
      downloadError.value = error instanceof Error ? error.message : "Unexpected track download error";
    } finally {
      isTrackDownloading.value = false;
    }
  }

  function setDownloadError(message: string) {
    downloadError.value = message;
  }

  return {
    isDownloading,
    isTrackDownloading,
    downloadError,
    setDownloadError,
    downloadRelease,
    downloadTrack
  };
}
