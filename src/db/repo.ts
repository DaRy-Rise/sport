// Операции с данными поверх Dexie: снимки состава, мягкое удаление, загрузка карт.
import { itemsSnapshot, type FoodsById } from '../domain/library'
import type { Batch, DiaryEntry, Food, ISODate, MealSlot, MealTemplate, PortionItem } from '../domain/types'
import { scale } from '../domain/nutrients'
import type { AppDB } from './schema'

export async function foodsById(db: AppDB): Promise<FoodsById> {
  const all = await db.foods.toArray()
  return new Map(all.map((f) => [f.id!, f]))
}

/** Используется ли продукт в записях, шаблонах или заготовках. */
export async function foodInUse(db: AppDB, foodId: number): Promise<boolean> {
  const inDiary = await db.diary.filter((e) =>
    (e.source.type === 'food' && e.source.id === foodId) || (e.items ?? []).some((i) => i.foodId === foodId)).count()
  if (inDiary) return true
  const inTpl = await db.templates.filter((t) =>
    t.items.some((i) => i.foodId === foodId) || t.variants.some((v) => v.items.some((i) => i.foodId === foodId))).count()
  if (inTpl) return true
  const inBatch = await db.batches.filter((b) => b.ingredients.some((i) => i.foodId === foodId)).count()
  if (inBatch) return true
  return (await db.foods.filter((f) => f.analogId === foodId).count()) > 0
}

/** Удаляет продукт; если он где-то использован — только скрывает из поиска. */
export async function deleteFood(db: AppDB, foodId: number): Promise<'deleted' | 'hidden'> {
  if (await foodInUse(db, foodId)) {
    await db.foods.update(foodId, { hidden: true })
    return 'hidden'
  }
  await db.foods.delete(foodId)
  return 'deleted'
}

export async function saveFood(db: AppDB, food: Food): Promise<number> {
  return (await db.foods.put(food)) as number
}

export async function deleteTemplate(db: AppDB, id: number): Promise<'deleted' | 'hidden'> {
  const used = await db.diary.filter((e) => e.source.type === 'template' && e.source.id === id).count()
  if (used) {
    await db.templates.update(id, { hidden: true })
    return 'hidden'
  }
  await db.templates.delete(id)
  return 'deleted'
}

// ---------- Записи дневника со снимком состава ----------

export interface NewEntry {
  date: ISODate
  meal: MealSlot
}

export async function addFoodEntry(db: AppDB, base: NewEntry, foodId: number, grams: number): Promise<number> {
  const foods = await foodsById(db)
  const f = foods.get(foodId)
  if (!f) throw new Error('Продукт не найден')
  const snap = itemsSnapshot([{ foodId, grams }], foods)
  const entry: DiaryEntry = {
    ...base, label: f.brand ? `${f.name}, ${f.brand}` : f.name, source: { type: 'food', id: foodId }, grams,
    comp: snap.comp, unknownFrom: snap.unknownFrom,
  }
  return (await db.diary.add(entry)) as number
}

export async function addTemplateEntry(
  db: AppDB, base: NewEntry, tpl: MealTemplate, items: PortionItem[], variant?: string,
): Promise<number> {
  const foods = await foodsById(db)
  const snap = itemsSnapshot(items, foods)
  const entry: DiaryEntry = {
    ...base, label: variant ? `${tpl.name} (${variant})` : tpl.name, source: { type: 'template', id: tpl.id!, variant },
    grams: items.reduce((s, i) => s + i.grams, 0), items, comp: snap.comp, unknownFrom: snap.unknownFrom,
  }
  return (await db.diary.add(entry)) as number
}

export async function addBatchEntry(db: AppDB, base: NewEntry, batch: Batch, grams: number): Promise<number> {
  const entry: DiaryEntry = {
    ...base, label: batch.name, source: { type: 'batch', id: batch.id! }, grams, comp: scale(batch.per100, grams), unknownFrom: batch.unknownFrom,
  }
  return (await db.diary.add(entry)) as number
}

/** Меняет граммы записи, пересчитывая снимок пропорционально (состав на момент записи сохраняется). */
export async function updateEntryGrams(db: AppDB, id: number, grams: number): Promise<void> {
  const e = await db.diary.get(id)
  if (!e || e.grams <= 0) return
  const k = grams / e.grams
  await db.diary.update(id, {
    grams,
    comp: scale(e.comp, k * 100),
    items: e.items?.map((i) => ({ ...i, grams: i.grams * k })),
  })
}
