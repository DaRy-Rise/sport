// Состав с точностью exact / approx / unknown и его суммирование.
import { NUTRIENT_KEYS, type Accuracy, type Composition, type NutrientKey } from './types'

export interface NutrientTotal {
  v: number
  acc: Accuracy
  /** Есть части без данных по этому нутриенту. */
  incomplete: boolean
  /** Названия частей без данных. */
  missingFrom: string[]
  /** Хотя бы одна часть содержит значение. */
  known: boolean
}
export type Totals = Record<NutrientKey, NutrientTotal>

export interface Part {
  label: string
  comp: Composition
  /** Части, которые уже внутри помечены как неизвестные (например, компоненты шаблона). */
  unknownFrom?: Partial<Record<NutrientKey, string[]>>
}

/** Состав порции: состав на 100 г × граммы / 100. */
export function scale(per100: Composition, grams: number): Composition {
  const out: Composition = {}
  for (const k of NUTRIENT_KEYS) {
    const n = per100[k]
    if (n) out[k] = { v: (n.v * grams) / 100, acc: n.acc }
  }
  return out
}

export function emptyTotals(): Totals {
  const t = {} as Totals
  for (const k of NUTRIENT_KEYS) t[k] = { v: 0, acc: 'exact', incomplete: false, missingFrom: [], known: false }
  return t
}

/** Суммирует части. «Неизвестно» не превращается в 0: итог помечается неполным. */
export function sumParts(parts: Part[]): Totals {
  const t = emptyTotals()
  for (const p of parts) {
    for (const k of NUTRIENT_KEYS) {
      const n = p.comp[k]
      const inner = p.unknownFrom?.[k] ?? []
      if (n) {
        t[k].v += n.v
        t[k].known = true
        if (n.acc === 'approx') t[k].acc = 'approx'
      }
      if (!n && inner.length === 0) {
        t[k].incomplete = true
        t[k].missingFrom.push(p.label)
      }
      if (inner.length) {
        t[k].incomplete = true
        t[k].missingFrom.push(...inner)
      }
    }
  }
  return t
}

/** Сворачивает итоги в состав и список неизвестных — для снимка в записи дневника. */
export function totalsToSnapshot(t: Totals): { comp: Composition; unknownFrom: Partial<Record<NutrientKey, string[]>> } {
  const comp: Composition = {}
  const unknownFrom: Partial<Record<NutrientKey, string[]>> = {}
  for (const k of NUTRIENT_KEYS) {
    const n = t[k]
    if (n.known) comp[k] = { v: n.v, acc: n.acc }
    if (n.missingFrom.length) unknownFrom[k] = [...new Set(n.missingFrom)]
  }
  return { comp, unknownFrom }
}

/** Делит итоги на число (например, на вес готового блюда). */
export function divideComposition(c: Composition, by: number): Composition {
  const out: Composition = {}
  for (const k of NUTRIENT_KEYS) {
    const n = c[k]
    if (n) out[k] = { v: n.v / by, acc: n.acc }
  }
  return out
}

export const NUTRIENT_INFO: Record<NutrientKey, { label: string; unit: string; digits: number }> = {
  kcal: { label: 'Калории', unit: 'ккал', digits: 0 },
  protein: { label: 'Белок', unit: 'г', digits: 0 },
  fat: { label: 'Жиры', unit: 'г', digits: 0 },
  carbs: { label: 'Углеводы', unit: 'г', digits: 0 },
  fiber: { label: 'Клетчатка', unit: 'г', digits: 1 },
  sodium: { label: 'Натрий', unit: 'мг', digits: 0 },
  potassium: { label: 'Калий', unit: 'мг', digits: 0 },
  calcium: { label: 'Кальций', unit: 'мг', digits: 0 },
  iron: { label: 'Железо', unit: 'мг', digits: 1 },
  magnesium: { label: 'Магний', unit: 'мг', digits: 0 },
  zinc: { label: 'Цинк', unit: 'мг', digits: 1 },
  iodine: { label: 'Йод', unit: 'мкг', digits: 0 },
  vitD: { label: 'Витамин D', unit: 'мкг', digits: 1 },
  b12: { label: 'Витамин B12', unit: 'мкг', digits: 1 },
  folate: { label: 'Фолаты', unit: 'мкг', digits: 0 },
  vitC: { label: 'Витамин C', unit: 'мг', digits: 0 },
  vitA: { label: 'Витамин A', unit: 'мкг', digits: 0 },
  omega3: { label: 'Омега-3', unit: 'г', digits: 2 },
}

export function formatNutrient(k: NutrientKey, v: number): string {
  const { unit, digits } = NUTRIENT_INFO[k]
  return `${v.toFixed(digits).replace('.', ',')} ${unit}`
}
