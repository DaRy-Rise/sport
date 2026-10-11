// Продукты, аналоги и шаблоны (спецификация food-library).
import { scale, sumParts, totalsToSnapshot, type Totals } from './nutrients'
import { NUTRIENT_KEYS, type Composition, type Food, type MealTemplate, type NutrientKey, type PortionItem } from './types'

export type FoodsById = Map<number, Food>

/**
 * Состав продукта на 100 г с учётом аналога: данные этикетки имеют приоритет,
 * недостающие нутриенты берутся у аналога с пометкой «примерно».
 * Без аналога недостающее остаётся неизвестным.
 */
export function effectivePer100(food: Food, foods: FoodsById): Composition {
  if (food.kind !== 'packaged' || food.analogId === undefined) return food.per100
  const analog = foods.get(food.analogId)
  if (!analog) return food.per100
  const out: Composition = { ...food.per100 }
  for (const k of NUTRIENT_KEYS) {
    if (out[k] === undefined && analog.per100[k] !== undefined) out[k] = { v: analog.per100[k]!.v, acc: 'approx' }
  }
  return out
}

export function foodLabel(f: Food): string {
  return f.brand ? `${f.name}, ${f.brand}` : f.name
}

/** Итоги набора порций (продукты не найдены — считаются неизвестными целиком). */
export function itemsTotals(items: PortionItem[], foods: FoodsById): Totals {
  return sumParts(
    items.map((it) => {
      const f = foods.get(it.foodId)
      return { label: f ? foodLabel(f) : `продукт #${it.foodId}`, comp: f ? scale(effectivePer100(f, foods), it.grams) : {} }
    }),
  )
}

export function itemsSnapshot(items: PortionItem[], foods: FoodsById) {
  return totalsToSnapshot(itemsTotals(items, foods))
}

export function itemsWeight(items: PortionItem[]): number {
  return items.reduce((s, i) => s + i.grams, 0)
}

/** Компоненты шаблона или его варианта. */
export function templateItems(t: MealTemplate, variant?: string): PortionItem[] {
  if (!variant) return t.items.map((i) => ({ ...i }))
  const v = t.variants.find((x) => x.name === variant)
  if (!v) throw new Error(`Нет варианта «${variant}» у шаблона «${t.name}»`)
  return v.items.map((i) => ({ ...i }))
}

export interface TemplateEdits {
  /** Новые граммы компонента (по индексу). */
  grams?: Record<number, number>
  /** Удалённые компоненты (по индексу). */
  removed?: number[]
  added?: PortionItem[]
}

/** Применяет правки к копии компонентов, сам шаблон не меняется. */
export function applyEdits(items: PortionItem[], edits: TemplateEdits = {}): PortionItem[] {
  const removed = new Set(edits.removed ?? [])
  return [
    ...items
      .map((it, i) => ({ ...it, grams: edits.grams?.[i] ?? it.grams }))
      .filter((_, i) => !removed.has(i)),
    ...(edits.added ?? []),
  ]
}

/** Поля, которые обязательны на этикетке. */
export const LABEL_REQUIRED: NutrientKey[] = ['kcal', 'protein', 'fat', 'carbs']
/** Поля этикетки, которые могут отсутствовать. */
export const LABEL_OPTIONAL: NutrientKey[] = ['fiber', 'sodium']

/**
 * Состав упаковки из полей формы. Пустое поле — неизвестно, а не 0.
 * Соль с этикетки (г) переводится в натрий (мг): натрий = соль × 400.
 */
export function labelComposition(fields: Partial<Record<NutrientKey | 'salt', number | null | undefined>>): Composition {
  const c: Composition = {}
  for (const k of [...LABEL_REQUIRED, ...LABEL_OPTIONAL]) {
    const v = fields[k]
    if (v !== undefined && v !== null && !Number.isNaN(v)) c[k] = { v, acc: 'exact' }
  }
  const salt = fields.salt
  if (c.sodium === undefined && salt !== undefined && salt !== null && !Number.isNaN(salt)) c.sodium = { v: salt * 400, acc: 'exact' }
  return c
}
