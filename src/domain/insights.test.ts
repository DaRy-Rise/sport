import { describe, expect, it } from 'vitest'
import { addDays, dateRange } from './dates'
import { compareGroups, computeInsights, describeComparison, reviewSummary, weeklyReview, type Observation } from './insights'
import type { DayRecord, DiaryEntry, SleepNight, Workout, WorkoutSet } from './types'

const obs = (start: string, values: number[], step = 2): Observation[] => values.map((value, i) => ({ date: addDays(start, i * step), value }))

describe('сравнение групп', () => {
  it('Мало солёных вечеров: 4 из 8 → «нужно ещё 4»', () => {
    const c = compareGroups(obs('2026-10-01', [0.5, 0.4, 0.6, 0.5], 5), obs('2026-10-02', Array(12).fill(0), 2))
    expect(c.status).toBe('insufficient')
    if (c.status === 'insufficient') expect(c.needA).toBe(4)
  })

  it('Найдена разница: +0.5 после солёных, +0.0 после обычных', () => {
    const a = obs('2026-10-01', [0.5, 0.6, 0.4, 0.5, 0.55, 0.45, 0.5, 0.6, 0.4, 0.5], 3)
    const b = obs('2026-10-02', Array.from({ length: 20 }, (_, i) => (i % 2 ? 0.1 : -0.1)), 1)
    const c = compareGroups(a, b)
    expect(c.status).toBe('clear')
    if (c.status === 'clear') expect(c.diff).toBeCloseTo(0.5, 1)
  })

  it('Нет разницы: средние ближе, чем разброс', () => {
    const a = obs('2026-10-01', [1, -1, 2, -2, 1, -1, 2, -2], 3)
    const b = obs('2026-10-02', [1.1, -1, 2, -2.1, 1, -1, 2, -2], 3)
    expect(compareGroups(a, b).status).toBe('unclear')
  })
})

/** 30 дней синтетических данных со всеми видами отметок. */
function synthetic() {
  const dates = dateRange('2026-10-01', '2026-10-30')
  const days: DayRecord[] = []
  const diary: DiaryEntry[] = []
  const sleep: SleepNight[] = []
  const workouts: Workout[] = []
  const sets: WorkoutSet[] = []
  let w = 60
  dates.forEach((date, i) => {
    const salty = i % 3 === 0
    days.push({ date, weightKg: Math.round(w * 10) / 10, saltyEvening: salty, kitchenClosedAt: i % 2 ? '20:00' : '21:30', periodStart: i === 0 || i === 28 })
    w += salty ? 0.5 : -0.3
    const short = i % 2 === 0
    sleep.push({ date, bedtime: short ? '01:00' : '23:00', wake: '07:00', quality: i % 2 ? 4 : 2 })
    diary.push({ date, meal: 'lunch', label: 'обед', source: { type: 'food', id: 1 }, grams: 300, comp: { kcal: { v: 1400, acc: 'exact' }, carbs: { v: i % 4 < 2 ? 220 : 120, acc: 'exact' } } })
    diary.push({ date, meal: 'evening', label: 'перекус', source: { type: 'food', id: 2 }, grams: 50, comp: { kcal: { v: short ? 300 : 100, acc: 'exact' } } })
    if (i % 2 === 1) {
      workouts.push({ id: i, date, kind: 'strength', planned: true, done: true })
      sets.push({ workoutId: i, date, exerciseId: 1, setIndex: 0, weightKg: i % 4 === 1 ? 70 : 75, reps: 10, rir: 2 })
    }
  })
  return { days, diary, sleep, workouts, sets, kitchenTarget: '20:15' }
}

describe('пять связей', () => {
  it('на сгенерированных данных за 30 дней возвращает результат по каждой связи', () => {
    const r = computeInsights(synthetic())
    expect(r.map((x) => x.id)).toEqual(['salt-weight', 'sleep-snack', 'cycle', 'carbs-strength', 'kitchen-sleep'])
    for (const x of r) for (const p of x.parts) expect(p.comparison.status).toBeDefined()
    const salt = r[0].parts[0].comparison
    expect(salt.status).toBe('clear')
    if (salt.status === 'clear') expect(salt.diff).toBeCloseTo(0.8, 1)
    expect(describeComparison(r[0], r[0].parts[0])).toMatch(/^После солёных вечеров: изменение веса за ночь в среднем на 0,8\d кг выше/)
    expect(r[1].parts[0].comparison.status).toBe('clear')
    expect(r[4].parts[0].comparison.status).toBe('clear')
  })
})

describe('недельный обзор', () => {
  it('Обзор недели: тренд, белок, клетчатка, тренировки, подъём', () => {
    const weights = dateRange('2026-10-05', '2026-10-25').map((date, i) => ({ date, kg: 59 - i * 0.043 }))
    const r = weeklyReview({
      weekStart: '2026-10-19',
      weights,
      intake: dateRange('2026-10-19', '2026-10-25').map((date) => ({ date, kcal: 1620, protein: 112, fiber: 19 })),
      targets: { kcal: 1620, protein: 110, fiberMin: 25, fiberMax: 30 },
      workouts: ['2026-10-19', '2026-10-21', '2026-10-23'].map((date) => ({ date, kind: 'strength', planned: true, done: true })),
      strengthChange: [], wakeInTolerance: 6, nights: 7, kitchenOnTime: 5, kitchenDays: 7,
    })
    expect(reviewSummary(r)).toBe('тренд −0,3 кг; белок 112 г из 110; клетчатка 19 г из 25-30; тренировки 3 из 3; подъём в режиме 6 из 7')
  })
})
