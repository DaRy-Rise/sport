// Дневник питания: итоги, бюджет перекуса, полнота дня, покрытие норм, подсказки (food-diary).
import {
  DEFICIT_SUGGESTION_THRESHOLD, EVENING_SNACK_BUDGET_KCAL, MAX_SUGGESTIONS, MIN_MEALS_FOR_COMPLETE_DAY,
} from './constants'
import { effectivePer100, foodLabel, type FoodsById } from './library'
import { emptyTotals, sumParts, type Totals } from './nutrients'
import type { DailyNorms } from './targets'
import { NUTRIENT_KEYS, type DayRecord, type DayType, type DiaryEntry, type Food, type MealSlot, type NutrientKey } from './types'

export const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус', evening: 'Вечерний перекус',
}
export const MEAL_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner', 'evening']

export function entriesTotals(entries: DiaryEntry[]): Totals {
  return sumParts(entries.map((e) => ({ label: e.label, comp: e.comp, unknownFrom: e.unknownFrom })))
}

// ---------- Вечерний перекус ----------

export interface SnackBudget {
  budget: number
  used: number
  remaining: number
  over: number
}

export function eveningBudget(dayType: DayType, entries: DiaryEntry[]): SnackBudget {
  const budget = EVENING_SNACK_BUDGET_KCAL[dayType]
  const used = entries.filter((e) => e.meal === 'evening').reduce((s, e) => s + (e.comp.kcal?.v ?? 0), 0)
  return { budget, used, remaining: Math.max(0, budget - used), over: Math.max(0, used - budget) }
}

// ---------- Полнота дня ----------

/** Явная отметка или (без отметки) не меньше трёх приёмов пищи. */
export function isCompleteDay(record: DayRecord | undefined, entries: DiaryEntry[]): boolean {
  if (record?.completeness) return record.completeness === 'complete'
  return new Set(entries.map((e) => e.meal)).size >= MIN_MEALS_FOR_COMPLETE_DAY
}

// ---------- Покрытие норм ----------

export type CoverageStatus = 'ok' | 'low' | 'over' | 'limit-exceeded'

export interface CoverageRow {
  key: NutrientKey
  value: number
  /** Нижняя граница нормы (или предел для натрия). */
  norm: number
  normMax?: number
  /** Доля от нормы (для натрия — от предела). */
  pct: number
  status: CoverageStatus
  approx: boolean
  incomplete: boolean
  missingFrom: string[]
}

export function coverage(t: Totals, norms: DailyNorms): CoverageRow[] {
  return NUTRIENT_KEYS.map((key) => {
    const n = norms[key]
    const v = t[key]
    const ref = n.kind === 'limit' ? n.max! : n.min!
    const pct = ref > 0 ? v.v / ref : 0
    let status: CoverageStatus
    if (n.kind === 'limit') status = v.v > n.max! ? 'limit-exceeded' : 'ok'
    else if (n.kind === 'target') status = pct < 0.9 ? 'low' : pct > 1.1 ? 'over' : 'ok'
    else if (n.kind === 'range') status = v.v < n.min! ? 'low' : 'ok'
    else status = pct < 1 ? 'low' : 'ok'
    return {
      key, value: v.v, norm: ref, normMax: n.kind === 'range' ? n.max : undefined, pct, status,
      approx: v.acc === 'approx', incomplete: v.incomplete, missingFrom: [...new Set(v.missingFrom)],
    }
  })
}

/** Средние итоги по дням (учитываются дни, в которых есть записи). */
export function averageTotals(days: Totals[]): Totals {
  const t = emptyTotals()
  if (!days.length) return t
  for (const k of NUTRIENT_KEYS) {
    t[k].v = days.reduce((s, d) => s + d[k].v, 0) / days.length
    t[k].acc = days.some((d) => d[k].acc === 'approx') ? 'approx' : 'exact'
    t[k].incomplete = days.some((d) => d[k].incomplete)
    t[k].known = days.some((d) => d[k].known)
    t[k].missingFrom = [...new Set(days.flatMap((d) => d[k].missingFrom))]
  }
  return t
}

// ---------- Подсказки ----------

export interface FoodSuggestion {
  food: Food
  label: string
  grams: number
  amount: number
  pctOfNorm: number
  eatenBefore: boolean
}

const LEGUME_RE = /нут|фасол|чечевиц|горош/i

const PIECE_RE = /^(шт|ломтик|долька|стебель|лист|гроздь|зубчик|кубик|шарик|стакан|чашка|порция)/
const SPOON_RE = /^(ст. л|ч. л|щепотка)/

/** Типичная порция для подсказки. */
export function typicalPortion(food: Food): number {
  const kcal = food.per100.kcal?.v ?? 100
  if (LEGUME_RE.test(food.name)) return 80
  const handful = food.measures.find((m) => m.name === 'горсть')
  if (handful) return handful.grams
  // Специи, приправы, масла, мёд: меряются ложками — порция 1 ст. л. (или 1 ч. л.).
  if (food.measures.length && food.measures.every((m) => SPOON_RE.test(m.name))) {
    return (food.measures.find((m) => m.name.startsWith('ст. л')) ?? food.measures[0]).grams
  }
  if (kcal > 400) return 25
  if (kcal < 60) return 200
  const piece = food.measures.find((m) => PIECE_RE.test(m.name) && m.grams >= 50)
  if (piece) return piece.grams
  return 100
}

/** Натрий в порции, выше которого продукт не предлагается для других нутриентов, мг. */
const SALTY_PORTION_MG = 400

/**
 * Для нутриентов со средним ниже 70% нормы предлагает до трёх продуктов,
 * начиная с уже съеденных, с порцией и процентом нормы.
 */
export function deficitSuggestions(
  avgRows: CoverageRow[], foods: FoodsById, eatenFoodIds: Set<number>,
): { key: NutrientKey; pct: number; items: FoodSuggestion[] }[] {
  const keys = avgRows.filter((r) =>
    r.key !== 'sodium' && !['kcal', 'protein', 'fat', 'carbs'].includes(r.key) && r.pct < DEFICIT_SUGGESTION_THRESHOLD)
  const candidates = [...foods.values()].filter((f) => !f.hidden && f.kind === 'generic')
  return keys.map((row) => {
    const scored = candidates
      .map((food) => {
        const per100 = effectivePer100(food, foods)
        const n = per100[row.key]
        if (!n) return null
        const grams = typicalPortion(food)
        const sodium = ((per100.sodium?.v ?? 0) * grams) / 100
        if (sodium > SALTY_PORTION_MG) return null
        const amount = (n.v * grams) / 100
        return { food, label: foodLabel(food), grams, amount, pctOfNorm: amount / row.norm, eatenBefore: eatenFoodIds.has(food.id!) }
      })
      .filter((x): x is FoodSuggestion => x !== null && x.pctOfNorm >= 0.1)
    const eaten = scored.filter((s) => s.eatenBefore).sort((a, b) => b.pctOfNorm - a.pctOfNorm)
    const other = scored.filter((s) => !s.eatenBefore).sort((a, b) => b.pctOfNorm - a.pctOfNorm)
    // Сначала до двух уже съеденных, затем лучшие из остальных.
    const items = [...eaten.slice(0, 2), ...other].slice(0, MAX_SUGGESTIONS)
    return { key: row.key, pct: row.pct, items }
  })
}
