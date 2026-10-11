import type { Composition, Food, NutrientKey } from '../domain/types'
import { searchItems } from '../domain/search'
import type { AppDB } from './schema'

export interface FoodsFile {
  version: number
  source: string
  foods: {
    fdcId: number
    name: string
    synonyms: string[]
    measures: { name: string; grams: number }[]
    yieldFactor?: number
    per100: Partial<Record<NutrientKey, number>>
  }[]
}

export const REFERENCE_ID_BASE = 1e9

export function toComposition(per100: Partial<Record<NutrientKey, number>>): Composition {
  const c: Composition = {}
  for (const [k, v] of Object.entries(per100)) c[k as NutrientKey] = { v: v as number, acc: 'exact' }
  return c
}

/**
 * Загружает справочник при первом запуске и при смене версии.
 * Продукты обновляются по fdcId, их id сохраняются, поэтому ссылки из записей не ломаются.
 */
export async function loadFoodsIfNeeded(db: AppDB, fetchFile: () => Promise<FoodsFile>): Promise<'loaded' | 'up-to-date'> {
  const current = (await db.settings.get('foodsVersion'))?.value as number | undefined
  const file = await fetchFile()
  if (current === file.version) return 'up-to-date'
  await db.transaction('rw', db.foods, db.settings, async () => {
    const existing = await db.foods.where('kind').equals('generic').toArray()
    const byFdc = new Map(existing.filter((f) => f.fdcId).map((f) => [f.fdcId!, f]))
    for (const f of file.foods) {
      const prev = byFdc.get(f.fdcId)
      const food: Food = {
        // Новым продуктам справочника — id из fdcId: на всех устройствах он одинаковый.
        id: prev?.id ?? REFERENCE_ID_BASE + f.fdcId,
        kind: 'generic',
        name: f.name,
        synonyms: f.synonyms,
        per100: toComposition(f.per100),
        measures: f.measures,
        yieldFactor: f.yieldFactor,
        fdcId: f.fdcId,
        hidden: prev?.hidden,
      }
      await db.foods.put(food)
    }
    await db.settings.put({ key: 'foodsVersion', value: file.version })
  })
  return 'loaded'
}

export async function fetchFoodsFile(): Promise<FoodsFile> {
  const res = await fetch(`${import.meta.env.BASE_URL}foods.json`)
  if (!res.ok) throw new Error('Не удалось загрузить справочник продуктов')
  return res.json()
}

/** Поиск по продуктам (обычным и в упаковке), скрытые не показываются. */
export async function searchFoods(db: AppDB, query: string, limit = 30): Promise<Food[]> {
  const all = await db.foods.filter((f) => !f.hidden).toArray()
  return searchItems(all, query, limit)
}
