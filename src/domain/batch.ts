// Заготовки: состав на 100 г готового, тара, коэффициенты выхода (спецификация batch-cooking).
import { PERSONAL_YIELD_WINDOW } from './constants'
import { divideComposition } from './nutrients'
import { itemsSnapshot, type FoodsById } from './library'
import type { BatchIngredient, Composition, Food, NutrientKey, PersonalYield, Tare } from './types'

/** Переводит бытовую меру продукта в граммы. */
export function measureToGrams(food: Food, measureName: string, count: number): number {
  const m = food.measures.find((x) => x.name === measureName)
  if (!m) throw new Error(`У продукта «${food.name}» нет меры «${measureName}»`)
  return m.grams * count
}

/** Вес нетто: вес на весах минус тара. */
export function netWeight(grossG: number, tare?: Tare): number {
  return Math.max(0, grossG - (tare?.weightG ?? 0))
}

/** Коэффициент выхода продукта: личный (среднее последних 5) или стандартный. */
export function yieldFor(food: Food, personal?: PersonalYield): number | undefined {
  const s = personal?.samples.slice(-PERSONAL_YIELD_WINDOW) ?? []
  if (s.length) return s.reduce((a, b) => a + b, 0) / s.length
  return food.yieldFactor
}

/**
 * Оценка веса готового: ингредиенты с коэффициентом выхода умножаются на него,
 * остальные (масло, специи, маринад) учитываются как есть.
 */
export function estimateCookedWeight(
  ingredients: BatchIngredient[], foods: FoodsById, personal: Map<number, PersonalYield> = new Map(),
): number {
  return ingredients.reduce((sum, i) => {
    const f = foods.get(i.foodId)
    const y = f ? yieldFor(f, personal.get(i.foodId)) : undefined
    return sum + i.grams * (y ?? 1)
  }, 0)
}

export interface BatchComputation {
  per100: Composition
  unknownFrom: Partial<Record<NutrientKey, string[]>>
  totalKcal: number
}

/** Состав заготовки на 100 г готового = суммарный состав ингредиентов / вес готового × 100. */
export function computeBatch(ingredients: BatchIngredient[], cookedWeightG: number, foods: FoodsById): BatchComputation {
  if (cookedWeightG <= 0) throw new Error('Вес готового должен быть больше нуля')
  const snap = itemsSnapshot(ingredients, foods)
  return {
    per100: divideComposition(snap.comp, cookedWeightG / 100),
    unknownFrom: snap.unknownFrom,
    totalKcal: snap.comp.kcal?.v ?? 0,
  }
}

/** Основной ингредиент: единственный с коэффициентом выхода (специи и маринад не считаются). */
export function mainIngredient(ingredients: BatchIngredient[], foods: FoodsById): BatchIngredient | undefined {
  const main = ingredients.filter((i) => foods.get(i.foodId)?.yieldFactor !== undefined)
  return main.length === 1 ? main[0] : undefined
}

/**
 * После взвешивания заготовки из одного основного продукта обновляет его личный коэффициент
 * (вес готового / вес основного продукта). Возвращает обновлённую запись или undefined.
 */
export function learnYield(
  ingredients: BatchIngredient[], cookedWeightG: number, foods: FoodsById, prev?: PersonalYield,
): PersonalYield | undefined {
  const main = mainIngredient(ingredients, foods)
  if (!main || main.grams <= 0) return undefined
  const factor = Math.round((cookedWeightG / main.grams) * 1000) / 1000
  return { foodId: main.foodId, samples: [...(prev?.samples ?? []), factor].slice(-PERSONAL_YIELD_WINDOW) }
}
