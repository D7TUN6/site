export {
  readPersistedPlayerState,
  writePersistedPlayerState,
  clearPersistedPlayerState,
} from './storage/PlayerStorage.js'

export type { PersistedPlayerState } from './types.js'

export const PLAYER_STORAGE_KEY = 'site-player-state'
