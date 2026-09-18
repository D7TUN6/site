import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { buildHeadCycle, NEUTRAL } from './playhead-cycle'

type PlayheadShipProps = {
  progress: () => number
  active: () => boolean
}

export function PlayheadShip(props: PlayheadShipProps) {
  let rootRef: HTMLSpanElement | undefined
  let spriteRef: HTMLSpanElement | undefined
  const [trackWidth, setTrackWidth] = createSignal(0)
  const [spriteWidth, setSpriteWidth] = createSignal(48)
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let cycleTimer: number | null = null
  let idle: Animation | null = null

  function clearCycle() {
    if (cycleTimer === null) return
    window.clearTimeout(cycleTimer)
    cycleTimer = null
  }

  function stopIdle() {
    clearCycle()
    if (idle) {
      idle.cancel()
      idle = null
    }
  }

  function settle() {
    if (!spriteRef) return
    const current = getComputedStyle(spriteRef).transform
    stopIdle()
    if (reduceMotion) {
      spriteRef.style.transform = ''
      return
    }
    const from = current && current !== 'none' ? current : NEUTRAL
    idle = spriteRef.animate(
      [{ transform: from }, { transform: NEUTRAL }],
      { duration: 200, easing: 'ease-in-out', fill: 'forwards' },
    )
  }

  function runCycle() {
    if (!spriteRef || reduceMotion) return
    const cycle = buildHeadCycle()
    if (idle) {
      idle.cancel()
      idle = null
    }
    idle = spriteRef.animate(cycle.keyframes, { duration: cycle.duration, fill: 'forwards' })
    cycleTimer = window.setTimeout(runCycle, cycle.duration + cycle.pause)
  }

  createEffect(() => {
    if (props.active()) {
      if (cycleTimer === null) runCycle()
    } else {
      settle()
    }
  })

  onMount(() => {
    if (!rootRef || !spriteRef) return
    setSpriteWidth(spriteRef.offsetWidth || 48)
    const track = rootRef.parentElement
    if (!track) return
    const measure = () => setTrackWidth(track.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    onCleanup(() => observer.disconnect())
  })

  onCleanup(stopIdle)

  function offsetX(): number {
    const width = trackWidth()
    if (width <= 0) return 0
    const ratio = Math.max(0, Math.min(1, props.progress() / 100))
    return ratio * width - spriteWidth() / 2
  }

  return (
    <span
      ref={rootRef}
      class="now-playing-head"
      style={{ transform: `translateX(${offsetX()}px)` }}
      aria-hidden="true"
    >
      <span ref={spriteRef} class="now-playing-head-sprite">
        <img src="/media/image/logos/head.png" alt="" width="48" height="32" draggable={false} />
      </span>
    </span>
  )
}
