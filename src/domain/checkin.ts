// Отметки дня: цикл и привычки (спецификация daily-checkin).
import { KITCHEN_CLOSE_BEFORE_BED_MIN, SALTY_EVENING_SODIUM_MG } from './constants'
import { diffDays, fromMinutes, toMinutes } from './dates'
import { targetBedtime } from './sleep'
import type { DayRecord, DiaryEntry, HHMM, ISODate, Profile } from './types'

// ---------- Цикл ----------

export type CyclePhase = 'menstruation' | 'follicular' | 'luteal'
export const CYCLE_PHASE_LABEL: Record<CyclePhase, string> = {
  menstruation: 'Менструация', follicular: 'Фолликулярная фаза', luteal: 'Лютеиновая фаза',
}
const DEFAULT_CYCLE = 28
const MENSTRUATION_DAYS = 5
/** Лютеиновая фаза ~14 дней до следующей менструации. */
const LUTEAL_DAYS = 14

export interface CycleInfo {
  day: number
  avgLength: number
  phase: CyclePhase
  /** Длина посчитана по истории (≥2 начала цикла). */
  measured: boolean
}

export function cycleInfo(records: DayRecord[], date: ISODate): CycleInfo | null {
  const starts = records.filter((r) => r.periodStart && r.date <= date).map((r) => r.date).sort()
  if (!starts.length) return null
  const lengths = starts.slice(1).map((d, i) => diffDays(starts[i], d)).filter((l) => l >= 18 && l <= 45).slice(-6)
  const avgLength = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : DEFAULT_CYCLE
  const day = diffDays(starts.at(-1)!, date) + 1
  const phase: CyclePhase = day <= MENSTRUATION_DAYS ? 'menstruation' : day > avgLength - LUTEAL_DAYS ? 'luteal' : 'follicular'
  return { day, avgLength, phase, measured: lengths.length > 0 }
}

export const LUTEAL_WATER_NOTE = 'Лютеиновая фаза: задержка воды на 1-2 кг в эти дни нормальна и не означает набор жира'

// ---------- Привычки ----------

/** Цель «кухня закрыта»: задана в профиле или целевой отбой − 2.5 ч. */
export function kitchenCloseTarget(p: Profile): HHMM {
  return p.kitchenCloseTarget ?? fromMinutes(toMinutes(targetBedtime(p.targetWake, p.sleepDurationH)) - KITCHEN_CLOSE_BEFORE_BED_MIN)
}

export function kitchenClosedOnTime(closedAt: HHMM, target: HHMM): boolean {
  // Время после полуночи (до 05:00) считаем поздним вечером.
  const m = (t: HHMM) => { const x = toMinutes(t); return x < 300 ? x + 1440 : x }
  return m(closedAt) <= m(target)
}

/** Предложить отметку «солёный вечер», если натрий вечернего перекуса высокий. */
export function suggestSaltyEvening(entries: DiaryEntry[], record?: DayRecord): boolean {
  if (record?.saltyEvening !== undefined) return false
  const sodium = entries.filter((e) => e.meal === 'evening').reduce((s, e) => s + (e.comp.sodium?.v ?? 0), 0)
  return sodium >= SALTY_EVENING_SODIUM_MG
}

/** Поле не заполнено (отличается от «нет»). */
export function filled<T>(v: T | undefined): v is T {
  return v !== undefined
}
