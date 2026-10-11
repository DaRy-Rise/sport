import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from './schema'
import { addFoodEntry, deleteFood, updateEntryGrams } from './repo'
import { labelComposition } from '../domain/library'

let db: AppDB
beforeEach(() => {
  db = new AppDB('test-repo')
})
afterEach(async () => {
  await db.delete()
})

describe('редактирование продуктов', () => {
  it('Изменился состав на этикетке: новые записи по-новому, прошлые не меняются', async () => {
    const id = (await db.foods.add({ kind: 'packaged', name: 'Хлеб', synonyms: [], measures: [], per100: labelComposition({ kcal: 250, protein: 8, fat: 3, carbs: 45 }) })) as number
    const old = await addFoodEntry(db, { date: '2026-10-11', meal: 'breakfast' }, id, 50)
    await db.foods.update(id, { per100: labelComposition({ kcal: 220, protein: 9, fat: 3, carbs: 40 }) })
    const fresh = await addFoodEntry(db, { date: '2026-10-12', meal: 'breakfast' }, id, 50)
    expect((await db.diary.get(old))!.comp.kcal!.v).toBe(125)
    expect((await db.diary.get(fresh))!.comp.kcal!.v).toBe(110)
  })

  it('использованный продукт скрывается, неиспользованный удаляется', async () => {
    const used = (await db.foods.add({ kind: 'packaged', name: 'A', synonyms: [], measures: [], per100: {} })) as number
    const unused = (await db.foods.add({ kind: 'packaged', name: 'B', synonyms: [], measures: [], per100: {} })) as number
    await addFoodEntry(db, { date: '2026-10-11', meal: 'lunch' }, used, 10)
    expect(await deleteFood(db, used)).toBe('hidden')
    expect((await db.foods.get(used))?.hidden).toBe(true)
    expect(await deleteFood(db, unused)).toBe('deleted')
    expect(await db.foods.get(unused)).toBeUndefined()
  })

  it('изменение граммов записи пересчитывает её снимок', async () => {
    const id = (await db.foods.add({ kind: 'generic', name: 'гречка', synonyms: [], measures: [], per100: { kcal: { v: 346, acc: 'exact' } } })) as number
    const e = await addFoodEntry(db, { date: '2026-10-11', meal: 'lunch' }, id, 50)
    await updateEntryGrams(db, e, 100)
    expect((await db.diary.get(e))!.comp.kcal!.v).toBeCloseTo(346)
  })
})
