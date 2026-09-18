export const NEUTRAL = 'translateY(0px) rotate(0deg)'

export type HeadKeyframe = { transform: string; easing?: string; offset: number }
export type HeadCycle = { keyframes: HeadKeyframe[]; duration: number; pause: number }

const MIN_ANGLE = 15
const ANGLE_SPREAD = 10
const MIN_LIFT = 10
const LIFT_SPREAD = 15
const PHASE_MS = 400

export function buildHeadCycle(random: () => number = Math.random): HeadCycle {
  const angle = MIN_ANGLE + random() * ANGLE_SPREAD
  const lift = MIN_LIFT + random() * LIFT_SPREAD
  const phase = () => PHASE_MS * (0.9 + random() * 0.2)
  const d1 = phase()
  const d2 = phase()
  const d3 = phase()
  const d4 = phase()
  const duration = d1 + d2 + d3 + d4
  return {
    keyframes: [
      { transform: NEUTRAL, easing: 'ease-out', offset: 0 },
      { transform: `translateY(${-lift}px) rotate(${angle}deg)`, easing: 'ease-in-out', offset: d1 / duration },
      { transform: NEUTRAL, easing: 'ease-out', offset: (d1 + d2) / duration },
      { transform: `translateY(${-lift}px) rotate(${-angle}deg)`, easing: 'ease-in-out', offset: (d1 + d2 + d3) / duration },
      { transform: NEUTRAL, offset: 1 },
    ],
    duration,
    pause: 100 + random() * 100,
  }
}
