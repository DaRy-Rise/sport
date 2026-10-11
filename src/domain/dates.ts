// Работа с локальными датами `YYYY-MM-DD` и временем `HH:MM` без часовых поясов.
import type { HHMM, ISODate } from './types'

const DAY_MS = 86_400_000

function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

function fromUTC(ms: number): ISODate {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY_MS)
}

/** b − a в днях. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS)
}

/** День недели: 0 — понедельник … 6 — воскресенье. */
export function weekday(d: ISODate): number {
  return (new Date(toUTC(d)).getUTCDay() + 6) % 7
}

export function isWeekend(d: ISODate): boolean {
  return weekday(d) >= 5
}

/** Понедельник недели, в которую входит дата. */
export function weekStart(d: ISODate): ISODate {
  return addDays(d, -weekday(d))
}

/** Последнее завершившееся воскресенье (сама дата, если это воскресенье). */
export function lastSunday(d: ISODate): ISODate {
  const wd = weekday(d)
  return wd === 6 ? d : addDays(d, -(wd + 1))
}

export function today(): ISODate {
  const n = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Полных лет на дату. */
export function ageOn(birth: ISODate, on: ISODate): number {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [y, m, d] = on.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

export function toMinutes(t: HHMM): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(min: number): HHMM {
  const x = ((Math.round(min) % 1440) + 1440) % 1440
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(x / 60))}:${p(x % 60)}`
}

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const RU_WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function formatDate(d: ISODate, withWeekday = false): string {
  const [, m, day] = d.split('-').map(Number)
  const s = `${day} ${RU_MONTHS[m - 1]}`
  return withWeekday ? `${RU_WEEKDAYS[weekday(d)]}, ${s}` : s
}

export function weekdayShort(d: ISODate): string {
  return RU_WEEKDAYS[weekday(d)]
}
