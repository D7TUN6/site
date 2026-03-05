import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SkipNextRoundedIcon from "@mui/icons-material/SkipNextRounded";
import SkipPreviousRoundedIcon from "@mui/icons-material/SkipPreviousRounded";
import ShuffleRoundedIcon from "@mui/icons-material/ShuffleRounded";
import RepeatRoundedIcon from "@mui/icons-material/RepeatRounded";
import RepeatOneRoundedIcon from "@mui/icons-material/RepeatOneRounded";
import PlaylistPlayRoundedIcon from "@mui/icons-material/PlaylistPlayRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useGlobalPlayer } from "@/player/GlobalPlayerContext";

type NowPlayingBarProps = {
  isMusicRoute: boolean;
};

function fmtTime(seconds: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function NowPlayingBar({ isMusicRoute }: NowPlayingBarProps) {
  const {
    queue,
    currentTrack,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    shuffleEnabled,
    repeatMode,
    hasStartedPlayback,
    upcomingTracks,
    togglePlayPause,
    nextTrack,
    prevTrack,
    seekByRatio,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeatMode,
    playTrack
  } = useGlobalPlayer();

  const [nextUpOpen, setNextUpOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nextUpButtonRef = useRef<HTMLButtonElement | null>(null);

  const shouldShow = Boolean(queue && currentTrack && (isMusicRoute || hasStartedPlayback));

  useEffect(() => {
    document.body.classList.toggle("has-now-playing-bar", shouldShow);
    return () => {
      document.body.classList.remove("has-now-playing-bar");
    };
  }, [shouldShow]);

  useEffect(() => {
    function onPointerDown(event: globalThis.MouseEvent) {
      if (!nextUpOpen) return;

      const node = event.target as Node | null;
      if (!node) return;

      if (panelRef.current?.contains(node)) return;
      if (nextUpButtonRef.current?.contains(node)) return;

      setNextUpOpen(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [nextUpOpen]);

  if (!shouldShow || !queue || !currentTrack) {
    return null;
  }

  const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  function seekFromClick(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = (event.clientX - rect.left) / rect.width;
    seekByRatio(ratio);
  }

  return (
    <>
      {nextUpOpen ? (
        <div className="now-playing-nextup" ref={panelRef} role="dialog" aria-label="Next up">
          <div className="now-playing-nextup-head">
            <h4>Next up</h4>
            <button type="button" onClick={() => setNextUpOpen(false)} aria-label="Close next up">
              <CloseRoundedIcon fontSize="inherit" />
            </button>
          </div>

          {upcomingTracks.length === 0 ? (
            <p className="now-playing-nextup-empty">Queue is empty.</p>
          ) : (
            <ul>
              {upcomingTracks.map((item) => (
                <li key={`${item.track.url}-${item.index}`}>
                  <button type="button" onClick={() => playTrack(item.index)}>
                    <img src={queue.coverUrl} alt="" width={36} height={36} />
                    <div>
                      <span>{queue.artist}</span>
                      <strong>{item.track.title}</strong>
                    </div>
                    <time>{fmtTime(item.duration)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="now-playing-bar" role="region" aria-label="Now playing">
        <div className="now-playing-controls">
          <button type="button" className="now-playing-btn" onClick={prevTrack} aria-label="Previous track">
            <SkipPreviousRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className="now-playing-btn now-playing-btn-main"
            onClick={togglePlayPause}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseRoundedIcon fontSize="inherit" /> : <PlayArrowRoundedIcon fontSize="inherit" />}
          </button>
          <button type="button" className="now-playing-btn" onClick={nextTrack} aria-label="Next track">
            <SkipNextRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className={`now-playing-btn now-playing-btn-small${shuffleEnabled ? " is-active" : ""}`}
            onClick={toggleShuffle}
            aria-label="Shuffle"
          >
            <ShuffleRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className={`now-playing-btn now-playing-btn-small${repeatMode !== "off" ? " is-active" : ""}`}
            onClick={cycleRepeatMode}
            aria-label="Repeat"
          >
            {repeatMode === "one" ? <RepeatOneRoundedIcon fontSize="inherit" /> : <RepeatRoundedIcon fontSize="inherit" />}
          </button>
        </div>

        <div className="now-playing-progress-wrap">
          <div className="now-playing-time">{fmtTime(currentTime)}</div>
          <div
            className="now-playing-progress"
            onClick={seekFromClick}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.max(duration, 1)}
            aria-valuenow={currentTime}
            aria-label="Playback position"
          >
            <span className="now-playing-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="now-playing-time">{fmtTime(duration)}</div>
        </div>

        <div className="now-playing-right">
          <div className="now-playing-volume-box">
            <button
              type="button"
              className={`now-playing-btn now-playing-btn-small${muted || volume <= 0 ? " is-muted" : ""}`}
              onClick={toggleMute}
              aria-label={muted || volume <= 0 ? "Unmute" : "Mute"}
            >
              {muted || volume <= 0 ? <VolumeOffRoundedIcon fontSize="inherit" /> : <VolumeUpRoundedIcon fontSize="inherit" />}
            </button>

            <div className="now-playing-volume-popup">
              <input
                className="now-playing-volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label="Volume"
              />
            </div>
          </div>

          <img src={queue.coverUrl} alt="" className="now-playing-cover" width={44} height={44} loading="lazy" />

          <div className="now-playing-meta">
            <div className="now-playing-artist">{queue.artist}</div>
            <div className="now-playing-title" title={currentTrack.title}>
              {currentTrack.title}
            </div>
          </div>

          <button
            ref={nextUpButtonRef}
            type="button"
            className={`now-playing-btn now-playing-btn-small${nextUpOpen ? " is-active" : ""}`}
            onClick={() => setNextUpOpen((prev) => !prev)}
            aria-label="Next up"
          >
            <PlaylistPlayRoundedIcon fontSize="inherit" />
          </button>
        </div>
      </div>
    </>
  );
}
