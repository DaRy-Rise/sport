// Профиль, этапы и условия переходов (спецификация goal-phases).
import {
  CALIBRATION_DAYS_MAX, MAX_DEFICIT_WEEKS, POOR_SLEEP_SCORE, POOR_SLEEP_WINDOW_DAYS, STRENGTH_DROP_WEEKS,
  TRANSITION_STABLE_KG, TRANSITION_STABLE_WEEKS, TRANSITION_STEP_KCAL,
} from './constants'
import { addDays, diffDays, weekStart } from './dates'
import type { DayRecord, ISODate, Phase, PhaseKind, Profile, SleepNight, SuggestionKind } from './types'
import { trendOn, type WeightPoint } from './weight'

// ---------- Профиль ----------

/** Версия профиля, действующая на дату (последняя с effectiveFrom ≤ даты). */
export function profileOn(versions: Profile[], date: ISODate): Profile | undefined {
  return [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).filter((p) => p.effectiveFrom <= date).at(-1)
    ?? [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0]
}

/** Новая версия профиля, действующая с указанной даты. */
export function reviseProfile(current: Profile, changes: Partial<Profile>, from: ISODate): Profile {
  return { ...current, ...changes, effectiveFrom: from }
}

// ---------- Этапы ----------

export const PHASE_LABEL: Record<PhaseKind, string> = {
  weight: 'Вес',
  transition: 'Переход',
  strength: 'Сила',
  break: 'Перерыв на поддержке',
}

export function startProgram(p: Profile): Phase[] {
  return p.targetWeightKg < p.weightKg
    ? [{ kind: 'weight', startDate: p.startDate }]
    : [{ kind: 'strength', startDate: p.startDate }]
}

export function phaseOn(phases: Phase[], date: ISODate): Phase | undefined {
  return [...phases]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .filter((p) => p.startDate <= date && (!p.endDate || p.endDate >= date))
    .at(-1)
}

export function activePhase(phases: Phase[]): Phase | undefined {
  return phases.find((p) => !p.endDate)
}

/** Завершает активный этап вчерашним днём и начинает новый с даты. */
export function switchPhase(phases: Phase[], kind: PhaseKind, from: ISODate, targetKcal?: number): Phase[] {
  return [
    ...phases.map((p) => (!p.endDate ? { ...p, endDate: addDays(from, -1) } : p)),
    { kind, startDate: from, ...(targetKcal !== undefined ? { targetKcal } : {}) },
  ]
}

// ---------- Калибровка ----------

export function clampCalibrationDays(days: number): number {
  return Math.min(CALIBRATION_DAYS_MAX, Math.max(0, Math.round(days)))
}

/** Первый день после калибровки. */
export function calibrationEnd(p: Profile): ISODate {
  return addDays(p.startDate, clampCalibrationDays(p.calibrationDays))
}

export function inCalibration(p: Profile, date: ISODate): boolean {
  return date >= p.startDate && date < calibrationEnd(p)
}

export const CALIBRATION_NOTE = 'калибровка: уходит вода'

// ---------- Предложения этапа ----------

export interface PhaseSuggestion {
  kind: SuggestionKind
  reason: string
  payload?: Record<string, unknown>
}

export interface PhaseState {
  profile: Profile
  phases: Phase[]
  weights: WeightPoint[]
  days: DayRecord[]
  sleep: SleepNight[]
  /** Недельный индекс силы (по основным упражнениям), по возрастанию недель. */
  weeklyStrength: number[]
  /** Текущая средняя калорийность этапа. */
  currentKcal: number
  today: ISODate
}

/** Сила снижается STRENGTH_DROP_WEEKS недель подряд. */
export function strengthDeclining(weekly: number[]): boolean {
  const last = weekly.slice(-(STRENGTH_DROP_WEEKS + 1))
  if (last.length < STRENGTH_DROP_WEEKS + 1) return false
  return last.every((v, i) => i === 0 || v < last[i - 1])
}

/** Средняя оценка сна за 14 дней без ночей адаптации; null, если ночей меньше 7. */
export function avgSleepScore(sleep: SleepNight[], today: ISODate): number | null {
  const from = addDays(today, -(POOR_SLEEP_WINDOW_DAYS - 1))
  const nights = sleep.filter((n) => n.date >= from && n.date <= today && !n.adaptation)
  if (nights.length < 7) return null
  return nights.reduce((s, n) => s + n.quality, 0) / nights.length
}

/** Недели непрерывного дефицита: от начала этапов «вес» после последнего перерыва. */
export function deficitWeeks(phases: Phase[], today: ISODate): number {
  const sorted = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate))
  let days = 0
  for (const p of sorted) {
    if (p.startDate > today) break
    if (p.kind === 'weight') days += diffDays(p.startDate, p.endDate && p.endDate < today ? p.endDate : today) + 1
    else days = 0
  }
  return days / 7
}

/** Средний вес по последним завершённым неделям (пн-вс), по возрастанию. */
export function weeklyAverages(weights: WeightPoint[], today: ISODate, weeks: number): (number | null)[] {
  const end = weekStart(today)
  const out: (number | null)[] = []
  for (let i = weeks; i >= 1; i--) {
    const from = addDays(end, -7 * i)
    const to = addDays(from, 6)
    const w = weights.filter((p) => p.date >= from && p.date <= to)
    out.push(w.length ? w.reduce((s, p) => s + p.kg, 0) / w.length : null)
  }
  return out
}

/** Калорийность на этапе «переход»: +125 ккал за каждую прошедшую неделю. */
export function transitionKcal(startKcal: number, phaseStart: ISODate, today: ISODate): number {
  return startKcal + TRANSITION_STEP_KCAL * Math.floor(Math.max(0, diffDays(phaseStart, today)) / 7)
}

export const TRANSITION_WATER_NOTE =
  'В первую неделю перехода вес вырастет на 0.5-1 кг: возвращаются гликоген и вода. Это ожидаемо и не является жиром.'

export function evaluatePhase(s: PhaseState): PhaseSuggestion[] {
  const phase = activePhase(s.phases)
  if (!phase) return []
  const out: PhaseSuggestion[] = []

  if (phase.kind === 'weight') {
    const trend = trendOn(s.weights, s.today)
    if (trend !== null && trend <= s.profile.targetWeightKg) {
      out.push({ kind: 'finish-weight-phase', reason: `средний вес за 7 дней ${trend.toFixed(1)} кг — цель ${s.profile.targetWeightKg} кг достигнута` })
    }
    const reasons: string[] = []
    if (strengthDeclining(s.weeklyStrength)) reasons.push(`сила снижается ${STRENGTH_DROP_WEEKS} недели`)
    const cycleIssue = s.days.some((d) => d.cycleIssue && d.date >= phase.startDate && d.date >= addDays(s.today, -27))
    if (cycleIssue) reasons.push('отмечен сбой цикла')
    const sleepAvg = avgSleepScore(s.sleep, s.today)
    if (sleepAvg !== null && sleepAvg <= POOR_SLEEP_SCORE) reasons.push(`средняя оценка сна за 14 дней ${sleepAvg.toFixed(1)} из 5`)
    if (deficitWeeks(s.phases, s.today) >= MAX_DEFICIT_WEEKS) reasons.push(`${MAX_DEFICIT_WEEKS} недель дефицита без перерыва`)
    if (reasons.length) out.push({ kind: 'diet-break', reason: reasons.join('; '), payload: { weeks: [1, 2] } })
  }

  if (phase.kind === 'transition') {
    const avgs = weeklyAverages(s.weights, s.today, TRANSITION_STABLE_WEEKS + 1)
    const stable = avgs.every((v) => v !== null) &&
      avgs.every((v, i) => i === 0 || Math.abs(v! - avgs[i - 1]!) <= TRANSITION_STABLE_KG)
    if (stable && diffDays(phase.startDate, s.today) >= 7 * TRANSITION_STABLE_WEEKS) {
      out.push({
        kind: 'finish-transition',
        reason: `две недели вес стабилен (±${TRANSITION_STABLE_KG} кг) при ${Math.round(s.currentKcal)} ккал`,
        payload: { maintenanceKcal: Math.round(s.currentKcal) },
      })
    }
  }
  return out
}
