/**
 * Radio "heard clock".
 *
 * The listener hears the live Ogg stream behind what the server reports: the
 * browser decodes a buffered lead of ~1-4s, so air metadata (startTimestamp /
 * elapsed) is always ahead of the actual audio. Driving the radio UI from the
 * air clock therefore switches the title before the previous track has
 * finished and keeps the progress bar ahead of what is heard — the reported
 * symptom.
 *
 * This clock tracks the track the *ear* is actually in, using the shared
 * <audio> element's currentTime as a monotonic 1:1 real-time clock of the
 * decoded audio. The server poll only orients *which* track the air is on; a
 * title is never adopted until the element clock has finished the current
 * track, so switches happen exactly when the previous track is heard to end.
 *
 * First track after (re)connect: the element clock has no absolute anchor
 * mid-stream, so it reuses the server air position for the unfinished track.
 * It is off by at most the decoded buffer, once; every later boundary is
 * element-confirmed and therefore exact against what is heard.
 */
export type RadioServerTrack = {
  title: string
  artist: string
  album: string
  coverUrl: string | null
  /** Epoch ms (server clock) at which the on-air track began. */
  startTimestamp: number
  duration: number
  source: 'live' | 'estimated'
}

export type HeardReading = {
  track: RadioServerTrack
  /** Seconds into the heard track, element-clock driven. */
  elapsed: number
  /** Amount of element-confirmed boundaries since the last reorient. */
  boundaryCount: number
  /** False for the air-anchored first track, true once the ear leads. */
  elementDriven: boolean
}

function airElapsed(now: number, track: RadioServerTrack): number {
  if (track.startTimestamp > 0) return Math.max(0, (now - track.startTimestamp) / 1000)
  return 0
}

/**
 * Two on-air announcements belong to the same boundary when they carry the
 * same title *and* the same startTimestamp (titles legitimately repeat across
 * a round, but each boundary restamps the timestamp).
 */
function sameBoundary(a: RadioServerTrack, b: RadioServerTrack): boolean {
  return a.title === b.title && a.startTimestamp === b.startTimestamp
}

export class RadioHeardClock {
  #current: { t: RadioServerTrack; startCt: number } | null = null
  #pending: RadioServerTrack | null = null
  #boundaryCount = 0

  reset(): void {
    this.#current = null
    this.#pending = null
    this.#boundaryCount = 0
  }

  /**
   * Restart from an air anchor — radio start, or the shared element was
   * reloaded after a stall/reconnect, which zeroes currentTime.
   */
  reorient(ct: number, now: number, serverTrack: RadioServerTrack): void {
    this.#current = { t: serverTrack, startCt: ct - airElapsed(now, serverTrack) }
    this.#pending = serverTrack
    this.#boundaryCount = 0
  }

  /**
   * Feed a server poll (air metadata) and the element clock. Returns the track
   * to display, or null when there is no server info yet.
   */
  observe(ct: number, now: number, serverTrack: RadioServerTrack): HeardReading | null {
    this.#pending = serverTrack
    if (!this.#current) {
      this.reorient(ct, now, serverTrack)
      return this.read(ct)
    }
    const cur = this.#current
    if (cur.t.duration <= 0) {
      // Un-catalogued track (duration unknown): there is no element boundary to
      // wait for, so adopt the air announcement directly like before.
      if (!sameBoundary(cur.t, serverTrack)) {
        this.#current = { t: serverTrack, startCt: ct }
      }
      return this.read(ct)
    }
    const position = ct - cur.startCt
    if (position >= cur.t.duration) {
      // The ear reached the end of the current track. Adopt the newest air
      // announcement only if it is a different track — during the gap before
      // the next poll the announcement still describes the track just heard
      // out, and it is this element-confirmed boundary that triggers the
      // switch, never the announcement itself.
      if (this.#pending && !sameBoundary(cur.t, this.#pending)) {
        this.#current = { t: this.#pending, startCt: ct }
        this.#boundaryCount++
      }
    }
    return this.read(ct)
  }

  read(ct: number): HeardReading {
    const cur = this.#current
    if (!cur) {
      return { track: { title: '', artist: '', album: '', coverUrl: null, startTimestamp: 0, duration: 0, source: 'live' }, elapsed: 0, boundaryCount: 0, elementDriven: false }
    }
    const position = ct - cur.startCt
    const clamp = cur.t.duration > 0
    const elapsed = clamp ? Math.min(Math.max(position, 0), cur.t.duration) : Math.max(position, 0)
    return { track: cur.t, elapsed, boundaryCount: this.#boundaryCount, elementDriven: this.#boundaryCount > 0 }
  }
}