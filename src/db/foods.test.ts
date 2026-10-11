import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from './schema'
import { loadFoodsIfNeeded, searchFoods, type FoodsFile } from './foods'

const file: FoodsFile = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'foods.json'), 'utf8'))
let db: AppDB

beforeEach(async () => {
  db = new AppDB('test-foods')
  await loadFoodsIfNeeded(db, async () => file)
})
afterEach(async () => {
  await db.delete()
})

describe('справочник продуктов', () => {
  it('загружается один раз и не дублируется', async () => {
    const n = await db.foods.count()
    expect(n).toBe(file.foods.length)
    expect(await loadFoodsIfNeeded(db, async () => file)).toBe('up-to-date')
    expect(await loadFoodsIfNeeded(db, async () => ({ ...file, version: file.version + 1 }))).toBe('loaded')
    expect(await db.foods.count()).toBe(n)
  })

  it('находит «гречка» с клетчаткой, железом и магнием', async () => {
    const [first] = await searchFoods(db, 'гречка')
    expect(first.name).toBe('Гречка (сухая)')
    expect(first.per100.fiber?.v).toBeGreaterThan(5)
    expect(first.per100.iron?.acc).toBe('exact')
    expect(first.per100.magnesium).toBeDefined()
  })

  it('находит «курица» по синониму', async () => {
    const found = await searchFoods(db, 'курица')
    expect(found.some((f) => f.name === 'Куриное филе (сырое)')).toBe(true)
  })

  it('ищет без учёта ё и регистра и не показывает скрытые', async () => {
    expect((await searchFoods(db, 'СВЕКЛА')).some((f) => f.name === 'Свёкла')).toBe(true)
    const beet = (await searchFoods(db, 'свёкла'))[0]
    await db.foods.update(beet.id!, { hidden: true })
    expect((await searchFoods(db, 'свёкла')).some((f) => f.id === beet.id)).toBe(false)
  })
})
