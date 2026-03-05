import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useGlobalPlayer, type GlobalPlayerQueue } from "@/player/GlobalPlayerContext";

type ReleaseTrack = {
  title: string;
  url: string;
};

type ReleasePlayerProps = {
  albumSlug: string;
  artist: string;
  albumTitle: string;
  coverUrl: string;
  releaseDate: string;
  genre: string;
  tracks: ReleaseTrack[];
};

type DownloadFormat = "flac" | "mp3" | "ogg" | "wav";
type DownloadJobStatus = "queued" | "running" | "done" | "failed";

type DownloadJobPayload = {
  jobId: string;
  status: DownloadJobStatus;
  progress: number;
  message: string;
  error: string | null;
};

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function ReleasePlayer({
  albumSlug,
  artist,
  albumTitle,
  coverUrl,
  releaseDate,
  genre,
  tracks
}: ReleasePlayerProps) {
  const {
    queue,
    currentIndex,
    playing,
    currentTime,
    duration,
    setQueue,
    togglePlayPause,
    playTrack,
    seekByRatio
  } = useGlobalPlayer();

  const queuePayload = useMemo<GlobalPlayerQueue>(
    () => ({
      queueKey: albumSlug,
      albumSlug,
      albumTitle,
      artist,
      coverUrl,
      releaseDate,
      genre,
      tracks
    }),
    [albumSlug, albumTitle, artist, coverUrl, releaseDate, genre, tracks]
  );

  useEffect(() => {
    setQueue(queuePayload);
  }, [queuePayload, setQueue]);

  const isActiveQueue = queue?.queueKey === albumSlug;
  const activeIndex = isActiveQueue ? currentIndex : 0;
  const activePosition = isActiveQueue ? currentTime : 0;
  const activeDuration = isActiveQueue ? duration : 0;

  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("flac");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadAbortRef = useRef(false);
  const mountedRef = useRef(true);

  const progress = useMemo(() => {
    if (!activeDuration) return 0;
    return Math.max(0, Math.min(100, (activePosition / activeDuration) * 100));
  }, [activePosition, activeDuration]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      downloadAbortRef.current = true;
    };
  }, []);

  function toggleMainPlayPause() {
    if (tracks.length === 0) return;

    if (!isActiveQueue) {
      setQueue(queuePayload);
      playTrack(0);
      return;
    }

    togglePlayPause();
  }

  function playTrackFromList(index: number) {
    const track = tracks[index];
    if (!track) return;

    if (!isActiveQueue) {
      setQueue(queuePayload);
      playTrack(index);
      return;
    }

    if (index === currentIndex) {
      togglePlayPause();
      return;
    }

    playTrack(index);
  }

  function seekByClick(event: MouseEvent<HTMLDivElement>) {
    if (!isActiveQueue || !activeDuration) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seekByRatio(ratio);
  }

  async function handleDownload() {
    if (isDownloading) return;

    downloadAbortRef.current = false;
    setDownloadError(null);
    setDownloadProgress(0);
    setDownloadMessage("Queued");
    setIsDownloading(true);

    try {
      const response = await fetch("/api/releases/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          slug: albumSlug,
          format: downloadFormat
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | (Partial<DownloadJobPayload> & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Download failed");
      }
      if (!payload?.jobId) {
        throw new Error("Queue response is invalid");
      }

      const jobId = payload.jobId;

      if (mountedRef.current) {
        setDownloadProgress(Math.max(0, Math.min(100, Number(payload.progress) || 0)));
        setDownloadMessage(payload.message || "Preparing conversion");
      }

      while (!downloadAbortRef.current) {
        const jobRes = await fetch(`/api/releases/download?jobId=${encodeURIComponent(jobId)}`, {
          method: "GET",
          cache: "no-store"
        });
        const jobPayload = (await jobRes.json().catch(() => null)) as
          | (Partial<DownloadJobPayload> & { error?: string })
          | null;

        if (!jobRes.ok) {
          throw new Error(jobPayload?.error || "Queue polling failed");
        }

        const status = jobPayload?.status;
        const nextProgress = Math.max(0, Math.min(100, Number(jobPayload?.progress) || 0));
        const nextMessage = jobPayload?.message || "Converting";

        if (mountedRef.current) {
          setDownloadProgress(nextProgress);
          setDownloadMessage(nextMessage);
        }

        if (status === "failed") {
          throw new Error(jobPayload?.error || "Conversion failed");
        }

        if (status === "done") {
          break;
        }

        await wait(1200);
      }

      if (downloadAbortRef.current) {
        return;
      }

      if (mountedRef.current) {
        setDownloadProgress(100);
        setDownloadMessage("Downloading ZIP");
      }

      const downloadRes = await fetch(
        `/api/releases/download?jobId=${encodeURIComponent(jobId)}&download=1`,
        {
          method: "GET",
          cache: "no-store"
        }
      );
      if (!downloadRes.ok) {
        const failPayload = (await downloadRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failPayload?.error || "Unable to download archive");
      }

      const blob = await downloadRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = parseDownloadFileName(
        downloadRes.headers.get("content-disposition"),
        `${albumSlug}-${downloadFormat}.zip`
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected download error";
      if (!downloadAbortRef.current && mountedRef.current) {
        setDownloadError(message);
      }
    } finally {
      downloadAbortRef.current = true;
      if (mountedRef.current) {
        setIsDownloading(false);
        setDownloadProgress(0);
        setDownloadMessage("");
      }
    }
  }

  return (
    <section className="release-player" aria-label={`${albumTitle} player`}>
      {isDownloading ? (
        <div className="release-download-modal" role="status" aria-live="polite">
          <div className="release-download-modal-card">
            <div className="release-download-spinner" />
            <p>{downloadMessage || "Preparing download"}</p>
            <div className="release-download-modal-progress">
              <span style={{ width: `${downloadProgress}%` }} />
            </div>
            <small>{downloadProgress}%</small>
          </div>
        </div>
      ) : null}

      <div className="release-player-top">
        <img
          src={coverUrl}
          alt={`${albumTitle} cover`}
          className="release-player-cover-large"
          width={154}
          height={154}
          loading="eager"
        />

        <div className="release-player-main">
          <header className="release-player-head">
            <button
              type="button"
              className="release-player-main-btn"
              onClick={toggleMainPlayPause}
              aria-label={playing && isActiveQueue ? "Pause" : "Play"}
            >
              {playing && isActiveQueue ? "❚❚" : "▶"}
            </button>

            <div className="release-player-meta">
              <div className="release-player-artist">{artist}</div>
              <div className="release-player-album">{albumTitle}</div>
            </div>

            <div className="release-player-side">
              <div className="release-player-date">{releaseDate}</div>
              <div className="release-player-genre">#{genre}</div>
            </div>
          </header>

          <div className="release-player-timeline-wrap">
            <div className="release-player-time">{fmtTime(activePosition)}</div>
            <div
              className="release-player-timeline"
              role="slider"
              aria-valuemin={0}
              aria-valuemax={Math.max(activeDuration, 1)}
              aria-valuenow={activePosition}
              onClick={seekByClick}
            >
              <div className="release-player-timeline-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="release-player-time">{fmtTime(activeDuration)}</div>
          </div>

          <div className="release-player-content">
            <ul className="release-player-list">
              {tracks.map((track, index) => {
                const active = isActiveQueue && index === activeIndex;
                return (
                  <li key={`${track.url}-${index}`} className={active ? "is-active" : undefined}>
                    <button type="button" className="release-player-track" onClick={() => playTrackFromList(index)}>
                      <span className="release-player-thumb-wrap">
                        <img
                          src={coverUrl}
                          alt=""
                          className="release-player-thumb"
                          width={28}
                          height={28}
                          loading="lazy"
                        />
                        <span className="release-player-thumb-overlay" title={active && playing ? "Pause" : "Play"}>
                          <span className={active && playing ? "release-player-icon-pause" : "release-player-icon-play"} />
                        </span>
                      </span>
                      <span className="release-player-track-name">
                        {index + 1}. {track.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <aside className="release-download-panel" aria-label="Release download">
              <h4>Download Release</h4>
              <p>Choose format:</p>
              <select
                value={downloadFormat}
                onChange={(event) => setDownloadFormat(event.target.value as DownloadFormat)}
              >
                <option value="flac">FLAC 16-bit / 44.1kHz</option>
                <option value="mp3">MP3 320 kbps / 44.1kHz</option>
                <option value="ogg">Ogg Opus VBR / 48kHz</option>
                <option value="wav">WAV PCM 16-bit / 44.1kHz</option>
              </select>
              <button type="button" className="release-download-btn" onClick={handleDownload} disabled={isDownloading}>
                Download ZIP
              </button>
              {downloadError ? <small>{downloadError}</small> : null}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
