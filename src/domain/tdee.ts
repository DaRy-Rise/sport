// Реальный расход по данным и рекомендации по корректировке (nutrition-targets).
import {
  ADJUST_KCAL, FAST_LOSS_FRACTION_PER_WEEK, KCAL_PER_KG, MIN_DAYS_FOR_REAL_TDEE, PLATEAU_DAYS, PLATEAU_TREND_KG,
} from './constants'
import { addDays, dateRange, diffDays } from './dates'
import type { ISODate } from './types'
import { trendOn, type WeightPoint } from './weight'

export interface IntakeDay {
  date: ISODate
  kcal: number
  complete: boolean
}

export type RealTdee =
  | { source: 'data'; tdee: number; days: number; avgKcal: number; trendChangeKg: number }
  | { source: 'formula'; eligibleDays: number; remainingDays: number }

export interface RealTdeeInput {
  intake: IntakeDay[]
  weights: WeightPoint[]
  /** Первый день после калибровочного периода. */
  calibrationEnd: ISODate
  /** Последний день расчёта (обычно последнее завершившееся воскресенье). */
  endDate: ISODate
  /** Окно расчёта в днях. */
  windowDays?: number
}

/**
 * Реальный расход = средние калории полных дней + (изменение тренда × 7700) / число дней окна.
 * Учитываются только полные дни вне калибровки; нужно не меньше 21 такого дня.
 */
export function realTdee(input: RealTdeeInput): RealTdee {
  const windowDays = input.windowDays ?? 28
  const windowStart = [addDays(input.endDate, -(windowDays - 1)), input.calibrationEnd].sort().at(-1)!
  // Окно начинается с первого дня, на который уже есть тренд веса.
  const first = dateRange(windowStart, input.endDate).find((d) => trendOn(input.weights, d) !== null)
  const tEnd = trendOn(input.weights, input.endDate)
  const eligible = first
    ? input.intake.filter((d) => d.complete && d.date >= first && d.date <= input.endDate)
    : []
  if (!first || tEnd === null || eligible.length < MIN_DAYS_FOR_REAL_TDEE) {
    return {
      source: 'formula',
      eligibleDays: eligible.length,
      remainingDays: Math.max(1, MIN_DAYS_FOR_REAL_TDEE - eligible.length),
    }
  }
  const tStart = trendOn(input.weights, first)!
  const span = diffDays(first, input.endDate) + 1
  const avgKcal = eligible.reduce((s, d) => s + d.kcal, 0) / eligible.length
  const change = tEnd - tStart
  return { source: 'data', tdee: avgKcal - (change * KCAL_PER_KG) / span, days: eligible.length, avgKcal, trendChangeKg: change }
}

export type Adjustment =
  | { kind: 'none' }
  | { kind: 'plateau'; askCompleteness: true; deltaKcal: [number, number]; reason: string }
  | { kind: 'fast-loss'; deltaKcal: [number, number]; reason: string }

/**
 * Правила корректировки на этапе «вес». Предложения не применяются автоматически.
 * В калибровке ничего не предлагается.
 */
export function adjustmentFor(weights: WeightPoint[], calibrationEnd: ISODate, on: ISODate): Adjustment {
  if (on < calibrationEnd) return { kind: 'none' }
  const now = trendOn(weights, on)
  if (now === null) return { kind: 'none' }

  const weekAgo = addDays(on, -7)
  if (weekAgo >= calibrationEnd) {
    const prev = trendOn(weights, weekAgo)
    if (prev !== null && prev - now > FAST_LOSS_FRACTION_PER_WEEK * prev) {
      return {
        kind: 'fast-loss',
        deltaKcal: [ADJUST_KCAL[0], ADJUST_KCAL[1]],
        reason: `тренд снизился на ${(prev - now).toFixed(1)} кг за неделю — больше 1% веса`,
      }
    }
  }

  const plateauStart = addDays(on, -PLATEAU_DAYS)
  if (plateauStart >= calibrationEnd) {
    const before = trendOn(weights, plateauStart)
    if (before !== null && before - now < PLATEAU_TREND_KG) {
      return {
        kind: 'plateau',
        askCompleteness: true,
        deltaKcal: [-ADJUST_KCAL[1], -ADJUST_KCAL[0]],
        reason: `тренд стоит ${PLATEAU_DAYS} дней`,
      }
    }
  }
  return { kind: 'none' }
}

/** Даты, которые окно расчёта охватит (для подсказки «осталось дней»). */
export function windowDates(endDate: ISODate, windowDays = 28): ISODate[] {
  return dateRange(addDays(endDate, -(windowDays - 1)), endDate)
}
