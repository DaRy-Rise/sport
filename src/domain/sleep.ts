// Сон: длительность, целевой режим, стабильность, адаптация (спецификация sleep-tracking).
import {
  ADAPTATION_DONE_NIGHTS, ADAPTATION_GRADUAL_STEP_MIN, ADAPTATION_TRIGGER_MIN, CAFFEINE_CUTOFF, NAP_LATEST, NAP_MAX_MIN,
  SLEEP_LATENCY_MIN, TRAINING_END_BEFORE_BED_MIN, WAKE_TOLERANCE_MIN, WEEKEND_WAKE_TOLERANCE_MIN,
} from './constants'
import { addDays, fromMinutes, isWeekend, toMinutes } from './dates'
import type { AdaptationState, HHMM, ISODate, SleepNight } from './types'

/** Длительность сна в минутах (отбой может быть до или после полуночи). */
export function sleepMinutes(bedtime: HHMM, wake: HHMM): number {
  const d = toMinutes(wake) - toMinutes(bedtime)
  return d <= 0 ? d + 1440 : d
}

export function sleepHours(n: SleepNight): number {
  return sleepMinutes(n.bedtime, n.wake) / 60
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

/** Целевой отбой = подъём − длительность − 15 минут на засыпание. */
export function targetBedtime(targetWake: HHMM, durationH: number): HHMM {
  return fromMinutes(toMinutes(targetWake) - durationH * 60 - SLEEP_LATENCY_MIN)
}

/** Отклонение подъёма от цели в минутах (со знаком, в пределах ±12 ч). */
export function wakeDeviation(wake: HHMM, target: HHMM): number {
  let d = toMinutes(wake) - toMinutes(target)
  if (d > 720) d -= 1440
  if (d < -720) d += 1440
  return d
}

export interface Stability {
  nights: number
  withinTolerance: number
  meanAbsDeviationMin: number
  outliers: ISODate[]
}

/** Стабильность подъёма за последние `days` ночей до даты включительно. */
export function wakeStability(nights: SleepNight[], target: HHMM, today: ISODate, days: number): Stability {
  const from = addDays(today, -(days - 1))
  const win = nights.filter((n) => n.date >= from && n.date <= today)
  const dev = win.map((n) => ({ date: n.date, d: wakeDeviation(n.wake, target) }))
  const outliers = dev.filter((x) => Math.abs(x.d) > WAKE_TOLERANCE_MIN).map((x) => x.date)
  return {
    nights: win.length,
    withinTolerance: win.length - outliers.length,
    meanAbsDeviationMin: dev.length ? dev.reduce((s, x) => s + Math.abs(x.d), 0) / dev.length : 0,
    outliers,
  }
}

/** Разброс времени отбоя (второстепенный показатель), минуты. */
export function bedtimeSpread(nights: SleepNight[]): number {
  if (nights.length < 2) return 0
  // Отбой после полуночи считаем как 24:xx, чтобы не «прыгать» через сутки.
  const mins = nights.map((n) => { const m = toMinutes(n.bedtime); return m < 720 ? m + 1440 : m })
  const avg = mins.reduce((a, b) => a + b, 0) / mins.length
  return Math.sqrt(mins.reduce((s, m) => s + (m - avg) ** 2, 0) / mins.length)
}

export function weekendWarning(n: SleepNight, target: HHMM): string | null {
  if (!isWeekend(n.date)) return null
  return wakeDeviation(n.wake, target) > WEEKEND_WAKE_TOLERANCE_MIN
    ? `Подъём в ${n.wake} при цели ${target}: больше чем на час позже — это сдвинет режим на следующую неделю`
    : null
}

// ---------- Адаптация ----------

export function adaptationOffered(lastWake: HHMM, target: HHMM): boolean {
  return Math.abs(wakeDeviation(lastWake, target)) > ADAPTATION_TRIGGER_MIN
}

/** Ориентир отбоя сегодня при резком сдвиге: ложиться, когда появится сонливость. */
export function tonightBedWindow(todayWake: HHMM, targetBed: HHMM): { from: HHMM; to: HHMM } {
  const awake = (m: number) => toMinutes(todayWake) + m
  let from = awake(12.5 * 60)
  const to = awake(13.5 * 60)
  const bed = toMinutes(targetBed) < 720 ? toMinutes(targetBed) + 1440 : toMinutes(targetBed)
  if (from < bed) from = bed
  return { from: fromMinutes(from), to: fromMinutes(Math.max(from, to)) }
}

/** Расписание подъёма при постепенном сдвиге: шаг 30 минут в день до цели. */
export function gradualSchedule(fromWake: HHMM, target: HHMM, startDate: ISODate, stepMin = ADAPTATION_GRADUAL_STEP_MIN): { date: ISODate; wake: HHMM }[] {
  const total = wakeDeviation(fromWake, target)
  const steps = Math.ceil(Math.abs(total) / stepMin)
  const out: { date: ISODate; wake: HHMM }[] = []
  for (let i = 1; i <= steps; i++) {
    const shift = Math.min(Math.abs(total), i * stepMin) * Math.sign(total)
    out.push({ date: addDays(startDate, i), wake: fromMinutes(toMinutes(fromWake) - shift) })
  }
  return out
}

/** Целевой подъём на дату с учётом адаптации. */
export function wakeTargetOn(date: ISODate, target: HHMM, a?: AdaptationState): HHMM {
  if (!a?.active || a.method === 'now') return target
  const s = gradualSchedule(a.fromWake, target, a.startDate)
  return s.find((x) => x.date === date)?.wake ?? (date > (s.at(-1)?.date ?? date) ? target : a.fromWake)
}

/** Адаптация завершена: 5 ночей подряд подъём в пределах ±30 минут от цели. */
export function adaptationDone(nights: SleepNight[], target: HHMM, today: ISODate): boolean {
  for (let i = 0; i < ADAPTATION_DONE_NIGHTS; i++) {
    const n = nights.find((x) => x.date === addDays(today, -i))
    if (!n || Math.abs(wakeDeviation(n.wake, target)) > WAKE_TOLERANCE_MIN) return false
  }
  return true
}

export function adaptationTips(targetBed: HHMM): string[] {
  return [
    'Сразу после подъёма — яркий свет или 10-15 минут на улице',
    `Кофеин — не позже ${CAFFEINE_CUTOFF}`,
    `Дневной сон — не больше ${NAP_MAX_MIN} минут и не позже ${NAP_LATEST}`,
    `За час до отбоя (с ${fromMinutes(toMinutes(targetBed) - 60)}) — приглушённый свет, экран потемнее`,
    `Тренировку закончить не позже ${fromMinutes(toMinutes(targetBed) - TRAINING_END_BEFORE_BED_MIN)}`,
  ]
}
