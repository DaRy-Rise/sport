import { describe, expect, it } from 'vitest'
import { dayPlan, determineDayType, type DayContext } from './day'
import { averageTotals, coverage, deficitSuggestions, entriesTotals, eveningBudget, isCompleteDay } from './diary'
import type { FoodsById } from './library'
import { startProgram } from './phases'
import { dailyNorms } from './targets'
import type { DiaryEntry, Food, Profile } from './types'

const e = (meal: DiaryEntry['meal'], kcal: number, extra: Partial<DiaryEntry> = {}): DiaryEntry => ({
  date: '2026-10-11', meal, label: meal, source: { type: 'food', id: 1 }, grams: 100, comp: { kcal: { v: kcal, acc: 'exact' } }, ...extra,
})

const profile: Profile = {
  effectiveFrom: '2026-10-11', sex: 'female', birthDate: '2001-03-01', heightCm: 166, weightKg: 60, targetWeightKg: 55,
  activityFactor: 1.5, startDate: '2026-10-11', calibrationDays: 14, targetWake: '07:00', sleepDurationH: 8, plannedLoadDays: 4,
}

describe('приёмы пищи', () => {
  it('Запись обеда: обе записи в итогах дня', () => {
    const t = entriesTotals([e('lunch', 280), e('lunch', 230)])
    expect(t.kcal.v).toBe(510)
  })

  it('Изменение и удаление записи пересчитывают итоги', () => {
    const entries = [e('lunch', 280), e('dinner', 400)]
    expect(entriesTotals(entries.slice(1)).kcal.v).toBe(400)
  })
})

describe('бюджет вечернего перекуса', () => {
  it('Перекус в бюджете: 100 из 200 в день нагрузки', () => {
    const b = eveningBudget('load', [e('evening', 100)])
    expect(b).toMatchObject({ budget: 200, remaining: 100, over: 0 })
  })

  it('Превышение бюджета: 300 при 150', () => {
    expect(eveningBudget('rest', [e('evening', 300)]).over).toBe(150)
  })
})

describe('записи задним числом и полнота дня', () => {
  it('Перенос заметок: нормы 11.10 — день нагрузки этапа «вес»', () => {
    const ctx: DayContext = {
      profiles: [profile], phases: startProgram(profile),
      workouts: [{ date: '2026-10-11', kind: 'strength', planned: false, done: true }], days: new Map(),
    }
    const plan = dayPlan(ctx, '2026-10-11')!
    expect(plan.dayType).toBe('load')
    expect(plan.phase?.kind).toBe('weight')
    expect(plan.calibration).toBe(true)
    expect(plan.macros.kcal).toBeGreaterThan(dayPlan(ctx, '2026-10-12')!.macros.kcal)
  })

  it('Пропущенный ужин в записях: отметка «записано не всё» → неполный день', () => {
    const entries = [e('breakfast', 300), e('lunch', 500), e('snack', 100)]
    expect(isCompleteDay(undefined, entries)).toBe(true)
    expect(isCompleteDay({ date: '2026-10-11', completeness: 'incomplete' }, entries)).toBe(false)
    expect(isCompleteDay(undefined, entries.slice(0, 2))).toBe(false)
  })

  it('ручное переопределение типа дня', () => {
    expect(determineDayType('2026-10-12', [], { date: '2026-10-12', dayTypeOverride: 'load' })).toEqual({ type: 'load', manual: true })
  })
})

describe('отчёт о покрытии норм', () => {
  const norms = dailyNorms('female', 25, { kcal: 1750, protein: 110, fat: 50, carbs: 210 })
  it('Отчёт за день: клетчатка 16 из 25-30, железо 53%, натрий выше предела', () => {
    const t = entriesTotals([e('lunch', 1600, { comp: {
      kcal: { v: 1600, acc: 'exact' }, fiber: { v: 16, acc: 'exact' }, iron: { v: 9.5, acc: 'exact' }, sodium: { v: 2900, acc: 'exact' },
    } })])
    const rows = coverage(t, norms)
    const fiber = rows.find((r) => r.key === 'fiber')!
    expect(fiber).toMatchObject({ value: 16, norm: 25, normMax: 30, status: 'low' })
    expect(rows.find((r) => r.key === 'iron')!.pct).toBeCloseTo(0.53, 2)
    expect(rows.find((r) => r.key === 'sodium')!.status).toBe('limit-exceeded')
  })

  it('Неполные данные: магний помечен и названы продукты без данных', () => {
    const t = entriesTotals([
      e('lunch', 300, { comp: { magnesium: { v: 100, acc: 'exact' } } }),
      e('dinner', 200, { label: 'Карпаччо', comp: { kcal: { v: 200, acc: 'exact' } } }),
    ])
    const mg = coverage(t, norms).find((r) => r.key === 'magnesium')!
    expect(mg.incomplete).toBe(true)
    expect(mg.missingFrom).toEqual(['Карпаччо'])
  })

  it('среднее за 7 дней', () => {
    const a = entriesTotals([e('lunch', 1000)])
    const b = entriesTotals([e('lunch', 2000)])
    expect(averageTotals([a, b]).kcal.v).toBe(1500)
  })
})

describe('подсказки', () => {
  it('порции специй и масел — ложкой, зелени — горстью', async () => {
    const { typicalPortion } = await import('./diary')
    const f = (name: string, kcal: number, measures: { name: string; grams: number }[]): Food =>
      ({ kind: 'generic', name, synonyms: [], measures, per100: { kcal: { v: kcal, acc: 'exact' } } })
    expect(typicalPortion(f('Корица', 247, [{ name: 'ч. л.', grams: 2.6 }]))).toBe(2.6)
    expect(typicalPortion(f('Масло льняное', 884, [{ name: 'ч. л.', grams: 4.5 }, { name: 'ст. л.', grams: 13.5 }]))).toBe(13.5)
    expect(typicalPortion(f('Руккола', 25, [{ name: 'горсть', grams: 20 }]))).toBe(20)
    expect(typicalPortion(f('Яблоко', 52, [{ name: 'шт.', grams: 180 }]))).toBe(200)
    expect(typicalPortion(f('Груша', 61, [{ name: 'шт.', grams: 180 }]))).toBe(180)
  })

  const food = (id: number, name: string, per100: Food['per100'], measures: Food['measures'] = []): Food =>
    ({ id, kind: 'generic', name, synonyms: [], measures, per100 })
  const foods: FoodsById = new Map([
    food(1, 'Нут варёный', { kcal: { v: 164, acc: 'exact' }, fiber: { v: 7.6, acc: 'exact' }, iron: { v: 2.9, acc: 'exact' }, sodium: { v: 7, acc: 'exact' } }),
    food(2, 'Брокколи', { kcal: { v: 34, acc: 'exact' }, fiber: { v: 2.6, acc: 'exact' }, iron: { v: 0.7, acc: 'exact' }, sodium: { v: 33, acc: 'exact' } }),
    food(3, 'Мидии варёные', { kcal: { v: 172, acc: 'exact' }, fiber: { v: 0, acc: 'exact' }, iron: { v: 6.7, acc: 'exact' }, sodium: { v: 369, acc: 'exact' } }),
    food(4, 'Говядина постная запечённая', { kcal: { v: 180, acc: 'exact' }, iron: { v: 2.6, acc: 'exact' }, sodium: { v: 60, acc: 'exact' } }),
    food(5, 'Огурцы солёные', { kcal: { v: 12, acc: 'exact' }, fiber: { v: 1, acc: 'exact' }, sodium: { v: 875, acc: 'exact' } }),
  ].map((f) => [f.id!, f]))
  const norms = dailyNorms('female', 25, { kcal: 1750, protein: 110, fat: 50, carbs: 210 })

  it('Мало клетчатки: нут 80 г +~6 г, брокколи 200 г +~5 г, солёное не предлагается', () => {
    const t = entriesTotals([e('lunch', 1500, { comp: { fiber: { v: 15, acc: 'exact' }, iron: { v: 15, acc: 'exact' } } })])
    const rows = coverage(t, norms)
    const [fiber] = deficitSuggestions(rows, foods, new Set())
    expect(fiber.key).toBe('fiber')
    const chick = fiber.items.find((i) => i.food.id === 1)!
    expect(chick.grams).toBe(80)
    expect(chick.amount).toBeCloseTo(6.08)
    expect(fiber.items.find((i) => i.food.id === 2)!.grams).toBe(200)
    expect(fiber.items.some((i) => i.food.id === 5)).toBe(false)
  })

  it('Мало железа: среди подсказок мидии или говядина, сначала уже съеденные', () => {
    const t = entriesTotals([e('lunch', 1500, { comp: { fiber: { v: 28, acc: 'exact' }, iron: { v: 9.9, acc: 'exact' } } })])
    const iron = deficitSuggestions(coverage(t, norms), foods, new Set([4])).find((s) => s.key === 'iron')!
    expect(iron.items[0].food.id).toBe(4)
    expect(iron.items.some((i) => i.food.id === 3)).toBe(true)
    expect(iron.items[0].pctOfNorm).toBeGreaterThan(0.1)
  })
})
