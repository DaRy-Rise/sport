// Хуки доступа к данным для экранов.
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { getDB } from '../db/schema'
import { dayPlan, type DayContext, type DayPlan } from '../domain/day'
import { isCompleteDay, entriesTotals } from '../domain/diary'
import { lastSunday, today } from '../domain/dates'
import { activePhase, calibrationEnd, profileOn } from '../domain/phases'
import { realTdee, type RealTdee } from '../domain/tdee'
import type { FoodsById } from '../domain/library'
import type { DayRecord, DiaryEntry, ISODate } from '../domain/types'
import type { WeightPoint } from '../domain/weight'

export const db = getDB()

// Доступ к БД из консоли разработчика (только в режиме разработки).
if (import.meta.env.DEV) (window as unknown as { __db: typeof db }).__db = db

export function useCore() {
  const profiles = useLiveQuery(() => db.profiles.toArray(), [])
  const phases = useLiveQuery(() => db.phases.toArray(), [])
  const workouts = useLiveQuery(() => db.workouts.toArray(), [])
  const days = useLiveQuery(() => db.days.toArray(), [])
  const diary = useLiveQuery(() => db.diary.toArray(), [])
  const ready = profiles && phases && workouts && days && diary
  return useMemo(() => {
    if (!ready) return undefined
    const dayMap = new Map<ISODate, DayRecord>(days.map((d) => [d.date, d]))
    const weights: WeightPoint[] = days.filter((d) => d.weightKg !== undefined).map((d) => ({ date: d.date, kg: d.weightKg! }))
    const byDate = new Map<ISODate, DiaryEntry[]>()
    for (const e of diary) {
      if (!byDate.has(e.date)) byDate.set(e.date, [])
      byDate.get(e.date)!.push(e)
    }
    const current = profileOn(profiles, today())
    let tdee: RealTdee | undefined
    if (current) {
      const intake = [...byDate].map(([date, es]) => ({ date, kcal: entriesTotals(es).kcal.v, complete: isCompleteDay(dayMap.get(date), es) }))
      tdee = realTdee({ intake, weights, calibrationEnd: calibrationEnd(current), endDate: lastSunday(today()) })
    }
    const ctx: DayContext = {
      profiles, phases, workouts, days: dayMap, realTdee: tdee?.source === 'data' ? tdee.tdee : undefined,
    }
    return { profiles, phases, workouts, days, dayMap, diary, byDate, weights, current, tdee, ctx, active: activePhase(phases) }
  }, [ready, profiles, phases, workouts, days, diary])
}

export type Core = NonNullable<ReturnType<typeof useCore>>

export function usePlan(core: Core | undefined, date: ISODate): DayPlan | undefined {
  return useMemo(() => (core ? dayPlan(core.ctx, date) : undefined), [core, date])
}

/** Выбранная дата экрана в параметре ?d=, по умолчанию — сегодня. */
export function useDateParam(): [ISODate, (d: ISODate) => void] {
  const [params, setParams] = useSearchParams()
  const d = params.get('d') ?? today()
  return [d, (next) => setParams((p) => { p.set('d', next); return p }, { replace: true })]
}

export function useFoodsMap(): FoodsById | undefined {
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  return useMemo(() => (foods ? new Map(foods.map((f) => [f.id!, f])) : undefined), [foods])
}
