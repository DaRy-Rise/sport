import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDB, TABLE_NAMES } from './schema'

let db: AppDB
afterEach(async () => {
  await db.delete()
})

describe('схема БД', () => {
  it('создаёт и читает запись в каждой таблице', async () => {
    db = new AppDB('test-schema')
    await db.profiles.add({
      effectiveFrom: '2026-10-11', sex: 'female', birthDate: '2001-01-01', heightCm: 166, weightKg: 60,
      targetWeightKg: 55, activityFactor: 1.5, startDate: '2026-10-11', calibrationDays: 14,
      targetWake: '07:00', sleepDurationH: 8, plannedLoadDays: 4,
    })
    await db.phases.add({ kind: 'weight', startDate: '2026-10-11' })
    const foodId = (await db.foods.add({ kind: 'generic', name: 'гречка', synonyms: [], per100: { kcal: { v: 343, acc: 'exact' } }, measures: [] })) as number
    await db.templates.add({ name: 'салат', items: [{ foodId, grams: 100 }], variants: [] })
    await db.batches.add({ name: 'курица', cookedDate: '2026-10-11', ingredients: [], cookedWeightG: 860, weightEstimated: false, per100: {} })
    await db.tares.add({ name: 'контейнер', weightG: 412 })
    await db.yields.add({ foodId, samples: [0.7] })
    await db.diary.add({ date: '2026-10-11', meal: 'lunch', label: 'гречка', source: { type: 'food', id: foodId }, grams: 100, comp: {} })
    await db.days.add({ date: '2026-10-11', weightKg: 60 })
    const exId = await db.exercises.add({ name: 'жим ногами', muscles: 'ноги', pattern: 'legs', equipment: 'machine', bigStep: true })
    await db.programs.add({ phase: 'weight', name: 'A/B', days: [] })
    const wId = await db.workouts.add({ date: '2026-10-11', kind: 'strength', planned: true, done: true })
    await db.sets.add({ workoutId: wId!, date: '2026-10-11', exerciseId: exId!, setIndex: 0, weightKg: 70, reps: 10, rir: 3 })
    await db.sleep.add({ date: '2026-10-12', bedtime: '00:10', wake: '07:00', quality: 3 })
    await db.suggestions.add({ kind: 'deload', createdAt: '2026-10-11', status: 'open', reason: 'тест' })
    await db.settings.add({ key: 'k', value: 1 })

    for (const name of TABLE_NAMES) {
      expect(await db.table(name).count(), name).toBe(1)
    }
    expect((await db.foods.get(foodId))?.name).toBe('гречка')
  })
})
