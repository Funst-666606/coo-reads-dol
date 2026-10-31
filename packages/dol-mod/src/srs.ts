/** 简易间隔复习：1 / 2 / 4 / 7 / 15 / 30 天。 */

export const INTERVALS_DAYS = [1, 2, 4, 7, 15, 30] as const

export type Grade = 'again' | 'hard' | 'good'

export interface SrsState {
  /** 0–5，对应 INTERVALS_DAYS 的下标。 */
  box: number
  dueAt: number
  reviews: number
  lapses: number
}

const MINUTE = 60_000
const DAY = 86_400_000

export function initialSrs(now = Date.now()): SrsState {
  return { box: 0, dueAt: now + DAY, reviews: 0, lapses: 0 }
}

export function review(state: SrsState, grade: Grade, now = Date.now()): SrsState {
  const box = clampBox(state.box)
  if (grade === 'good') {
    const interval = INTERVALS_DAYS[box] * DAY
    return {
      box: Math.min(box + 1, INTERVALS_DAYS.length - 1),
      dueAt: now + interval,
      reviews: state.reviews + 1,
      lapses: state.lapses,
    }
  }
  if (grade === 'hard') {
    return {
      box,
      dueAt: now + Math.max(1, Math.round(INTERVALS_DAYS[box] / 2)) * DAY,
      reviews: state.reviews + 1,
      lapses: state.lapses,
    }
  }
  return {
    box: Math.max(0, box - 1),
    dueAt: now + 10 * MINUTE,
    reviews: state.reviews + 1,
    lapses: state.lapses + 1,
  }
}

export function isDue(state: SrsState, now = Date.now()): boolean {
  return state.dueAt <= now
}

function clampBox(box: number): number {
  if (!Number.isFinite(box)) return 0
  return Math.min(Math.max(0, Math.trunc(box)), INTERVALS_DAYS.length - 1)
}
