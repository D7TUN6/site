import { describe, it, expect } from 'bun:test'
import { RadioHeardClock, type RadioServerTrack } from '@/features/player/radioHeardClock'

function track(title: string, startTimestamp: number, duration: number, source: RadioServerTrack['source'] = 'live'): RadioServerTrack {
  return { title, artist: 'D7TUN6', album: 'music', coverUrl: null, startTimestamp, duration, source }
}

describe('RadioHeardClock', () => {
  it('anchors the first track on the air position at connect', () => {
    const clock = new RadioHeardClock()
    const snow = track('Snowgazer', 10_000, 162)
    clock.reorient(0, 50_000, snow) // air elapsed 40s, element 0
    const r = clock.observe(1, 51_000, snow)
    expect(r?.track.title).toBe('Snowgazer')
    expect(r?.elapsed).toBeCloseTo(41, 5)
    expect(r?.elementDriven).toBe(false)
  })

  it('does NOT switch the title when the server announces the next track early (core fix)', () => {
    const clock = new RadioHeardClock()
    const snow = track('Snowgazer', 10_000, 162)
    clock.reorient(0, 50_000, snow)
    // Air boundary of Snowgazer is at wall 172000; server observes "drain" at
    // 172100 (poll lag) while the ear is still B=2s inside Snowgazer.
    const drain = track('drain', 172_100, 299.52)
    const hearing = clock.observe(120.1, 172_100, drain)
    expect(hearing?.track.title).toBe('Snowgazer')
    expect(hearing?.elapsed).toBeCloseTo(160.1, 5) // still inside the old track
  })

  it('switches exactly when the ear finishes the track, then tracks the element clock', () => {
    const clock = new RadioHeardClock()
    const snow = track('Snowgazer', 10_000, 162)
    clock.reorient(0, 50_000, snow)
    const drain = track('drain', 172_100, 299.52)
    // Server poll shows drain but the ear has not crossed yet.
    let r = clock.observe(120.1, 172_100, drain)
    expect(r?.track.title).toBe('Snowgazer')

    // Ear crosses at wall 172000 + B*1000 = 174000 -> ct = 122.0
    r = clock.observe(122.0, 174_000, drain)
    expect(r?.track.title).toBe('drain')
    expect(r?.elapsed).toBe(0)
    expect(r?.elementDriven).toBe(true)
    expect(r?.boundaryCount).toBe(1)

    // 1s later the bar is 1.0s into drain, element-exact.
    r = clock.observe(123.0, 175_000, drain)
    expect(r?.track.title).toBe('drain')
    expect(r?.elapsed).toBeCloseTo(1, 5)

    // drain air boundary at 471620; ear crosses at 473620 (ct 421.62)
    const fallen = track('fallen_kingdom', 471_720, 101.142857)
    r = clock.observe(422.0, 474_000, fallen)
    expect(r?.track.title).toBe('fallen_kingdom')
    expect(r?.elapsed).toBe(0) // the sub-tick remainder folds into startCt at adopt
    expect(r?.boundaryCount).toBe(2)
  })

  it('treats same-title re-airings as distinct boundaries via startTimestamp', () => {
    const clock = new RadioHeardClock()
    const a = track('loop', 0, 20)
    clock.reorient(0, 50_000, a)
    // Air plays "loop" twice back to back; the announcement restamps.
    const a2 = track('loop', 20_000, 20)
    let r = clock.observe(19.9, 69_950, a2) // still hearing first loop
    expect(r?.track.title).toBe('loop')
    r = clock.observe(20.0, 70_000, a2) // ear crosses -> adopt the re-airing
    expect(r?.track.title).toBe('loop')
    expect(r?.boundaryCount).toBe(1)
    expect(r?.elapsed).toBe(0)
  })

  it('does not re-adopt the same announcement repeatedly', () => {
    const clock = new RadioHeardClock()
    const a = track('A', 0, 30)
    clock.reorient(0, 50_000, a)
    const b = track('B', 30_000, 30)
    const atCross = clock.observe(30, 80_000, b)
    expect(atCross?.track.title).toBe('B')
    // Next poll still reports the same boundary (same title+startTimestamp).
    const again = clock.observe(31, 81_000, b)
    expect(again?.track.title).toBe('B')
    expect(again?.elapsed).toBeCloseTo(1, 5)
    expect(again?.boundaryCount).toBe(1)
  })

  it('reorients on reconnect mid-track from the air position', () => {
    const clock = new RadioHeardClock()
    const fallen = track('fallen_kingdom', 550_000, 101.142857)
    clock.reorient(0.5, 600_000, fallen) // reload reset currentTime to ~0
    const r = clock.observe(3.5, 603_000, fallen)
    // air elapsed at connect 50s + heard since reorient (3.5 - 0.5)s = 53s
    expect(r?.elapsed).toBeCloseTo(53, 9)
    expect(r?.elementDriven).toBe(false)
  })

  it('adopts uncatalogued (duration 0) tracks immediately on announcement', () => {
    const clock = new RadioHeardClock()
    const a = track('A', 30_000, 30) // air-elapsed 30s at connect wall 60000
    clock.reorient(0, 60_000, a)
    // startCt = -30, so at ct=5 the ear has crossed out of A; the new air
    // announcement (unknown track) becomes the current one, bar from scratch.
    const ghost = track('Ghost upload', 60_000, 0)
    const r = clock.observe(5, 65_000, ghost)
    expect(r?.track.title).toBe('Ghost upload')
    expect(r?.elapsed).toBe(0)
  })
})