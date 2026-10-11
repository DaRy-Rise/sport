// Тренд веса: скользящее среднее за 7 дней (спецификация daily-checkin).
import { TREND_MIN_POINTS, TREND_WINDOW_DAYS } from './constants'
import { addDays } from './dates'
import type { ISODate } from './types'

export interface WeightPoint {
  date: ISODate
  kg: number
}

/** Тренд на дату или null, если за 7 дней меньше 4 записей. */
export function trendOn(points: WeightPoint[], date: ISODate): number | null {
  const from = addDays(date, -(TREND_WINDOW_DAYS - 1))
  const win = points.filter((p) => p.date >= from && p.date <= date)
  if (win.length < TREND_MIN_POINTS) return null
  return win.reduce((s, p) => s + p.kg, 0) / win.length
}

/** Тренд на каждую дату диапазона. */
export function trendSeries(points: WeightPoint[], dates: ISODate[]): Map<ISODate, number | null> {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return new Map(dates.map((d) => [d, trendOn(sorted, d)]))
}
