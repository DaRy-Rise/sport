// Отметки дня и сон в БД.
import type { AdaptationState, DayRecord, ISODate, SleepNight } from '../domain/types'
import type { AppDB } from './schema'

/** Обновляет поля дня; поле со значением undefined очищается («не заполнено»). */
export async function patchDay(db: AppDB, date: ISODate, patch: Partial<DayRecord>): Promise<DayRecord> {
  const cur = (await db.days.get(date)) ?? { date }
  const next: DayRecord = { ...cur, ...patch, date }
  for (const k of Object.keys(next) as (keyof DayRecord)[]) if (next[k] === undefined) delete next[k]
  await db.days.put(next)
  return next
}

/** Вес — одна запись в день, повторная заменяет предыдущую. Точность 0.1 кг. */
export async function setWeight(db: AppDB, date: ISODate, kg: number | undefined): Promise<void> {
  await patchDay(db, date, { weightKg: kg === undefined ? undefined : Math.round(kg * 10) / 10 })
}

export async function getAdaptation(db: AppDB): Promise<AdaptationState | undefined> {
  return (await db.settings.get('adaptation'))?.value as AdaptationState | undefined
}

export async function setAdaptation(db: AppDB, a: AdaptationState | undefined): Promise<void> {
  if (a) await db.settings.put({ key: 'adaptation', value: a })
  else await db.settings.delete('adaptation')
}

/** Сохраняет ночь; ночи во время активной адаптации помечаются. */
export async function saveNight(db: AppDB, night: SleepNight): Promise<void> {
  const a = await getAdaptation(db)
  const adaptation = !!a?.active && night.date > a.startDate
  await db.sleep.put({ ...night, adaptation })
}
