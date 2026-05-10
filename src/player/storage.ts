export type PersistedPlayerState = {
  queueKey: string;
  currentIndex: number;
  currentTime: number;
  volume: number;
  muted: boolean;
  shuffleEnabled: boolean;
  repeatMode: "off" | "all" | "one";
  hasStartedPlayback: boolean;
  playOrder: number[];
  orderPos: number;
  wasPlaying: boolean;
};

export const PLAYER_STORAGE_KEY = "site-player-state";

export function readPersistedPlayerState(): PersistedPlayerState | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PersistedPlayerState;
  } catch {
    return null;
  }
}

export function writePersistedPlayerState(state: PersistedPlayerState | null): void {
  if (typeof window === "undefined") return;

  if (!state) {
    window.localStorage.removeItem(PLAYER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(state));
}

export function clearPersistedPlayerState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAYER_STORAGE_KEY);
}
