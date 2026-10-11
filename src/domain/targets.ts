// Расход энергии и дневные нормы (спецификация nutrition-targets).
import {
  FIBER_TARGET_G, LOAD_REST_KCAL_SPLIT, MIN_FAT_G_PER_KG, PROTEIN_G_PER_KG, WEIGHT_PHASE_DEFICIT_KCAL,
} from './constants'
import { ageOn } from './dates'
import type { DayType, ISODate, NutrientKey, PhaseKind, Profile, Sex } from './types'

// ---------- Обмен ----------

/** Базовый обмен по Миффлину — Сан Жеору, ккал. */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5)
}

export interface TdeeEstimate {
  bmr: number
  tdee: number
  source: 'formula' | 'data'
}

export function formulaTdee(p: Profile, on: ISODate): TdeeEstimate {
  const bmr = bmrMifflin(p.sex, p.weightKg, p.heightCm, ageOn(p.birthDate, on))
  return { bmr, tdee: bmr * p.activityFactor, source: 'formula' }
}

/** Средняя целевая калорийность этапа. */
export function phaseTargetKcal(kind: PhaseKind, tdee: number, phaseKcal?: number): number {
  if (kind === 'weight') return tdee - WEIGHT_PHASE_DEFICIT_KCAL
  return phaseKcal ?? tdee
}

// ---------- Макро по типу дня ----------

export interface MacroTargets {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export interface DayTargetsInput {
  avgKcal: number
  weightKg: number
  /** Плановое число дней нагрузки в неделю. */
  loadDays: number
  /** Жиры в день нагрузки, г/кг (по умолчанию 0.83). */
  fatPerKgLoad?: number
}

const round10 = (v: number) => Math.round(v / 10) * 10
const round5 = (v: number) => Math.round(v / 5) * 5

/**
 * Делит среднюю калорийность на день нагрузки и день отдыха так, чтобы неделя
 * в среднем совпадала с целью: разница идёт за счёт углеводов, белок одинаковый,
 * жиры не ниже 0.8 г/кг (в день отдыха на 5 г больше).
 */
export function dayTargets(input: DayTargetsInput): Record<DayType, MacroTargets> {
  const loadDays = Math.min(7, Math.max(0, input.loadDays))
  const kcalLoad = input.avgKcal + (LOAD_REST_KCAL_SPLIT * (7 - loadDays)) / 7
  const kcalRest = input.avgKcal - (LOAD_REST_KCAL_SPLIT * loadDays) / 7
  const protein = round5(PROTEIN_G_PER_KG * input.weightKg)
  const minFat = MIN_FAT_G_PER_KG * input.weightKg
  const fatLoad = Math.max(minFat, (input.fatPerKgLoad ?? 0.83) * input.weightKg)
  const fatRest = fatLoad + 5
  const make = (kcal: number, fat: number): MacroTargets => {
    const k = round10(kcal)
    const f = Math.round(fat)
    return { kcal: k, protein, fat: f, carbs: Math.max(0, round5((k - protein * 4 - f * 9) / 4)) }
  }
  return { load: make(kcalLoad, fatLoad), rest: make(kcalRest, fatRest) }
}

// ---------- Микронутриенты ----------

export type NormKind = 'target' | 'min' | 'range' | 'limit'
export interface Norm {
  kind: NormKind
  /** Для target/min/range — нижняя граница, для limit — не используется. */
  min?: number
  max?: number
}
export type DailyNorms = Record<NutrientKey, Norm>

type Micro = Exclude<NutrientKey, 'kcal' | 'protein' | 'fat' | 'carbs' | 'fiber'>

/** Нормы RDA/AI (NIH ODS / NASEM) по полу и возрасту; натрий — верхний предел CDRR 2300 мг. */
const MICRO_TABLE: Record<Sex, { maxAge: number; values: Record<Micro, number> }[]> = {
  female: [
    { maxAge: 30, values: { sodium: 2300, potassium: 2600, calcium: 1000, iron: 18, magnesium: 310, zinc: 8, iodine: 150, vitD: 15, b12: 2.4, folate: 400, vitC: 75, vitA: 700, omega3: 1.1 } },
    { maxAge: 50, values: { sodium: 2300, potassium: 2600, calcium: 1000, iron: 18, magnesium: 320, zinc: 8, iodine: 150, vitD: 15, b12: 2.4, folate: 400, vitC: 75, vitA: 700, omega3: 1.1 } },
    { maxAge: 70, values: { sodium: 2300, potassium: 2600, calcium: 1200, iron: 8, magnesium: 320, zinc: 8, iodine: 150, vitD: 15, b12: 2.4, folate: 400, vitC: 75, vitA: 700, omega3: 1.1 } },
    { maxAge: 200, values: { sodium: 2300, potassium: 2600, calcium: 1200, iron: 8, magnesium: 320, zinc: 8, iodine: 150, vitD: 20, b12: 2.4, folate: 400, vitC: 75, vitA: 700, omega3: 1.1 } },
  ],
  male: [
    { maxAge: 30, values: { sodium: 2300, potassium: 3400, calcium: 1000, iron: 8, magnesium: 400, zinc: 11, iodine: 150, vitD: 15, b12: 2.4, folate: 400, vitC: 90, vitA: 900, omega3: 1.6 } },
    { maxAge: 50, values: { sodium: 2300, potassium: 3400, calcium: 1000, iron: 8, magnesium: 420, zinc: 11, iodine: 150, vitD: 15, b12: 2.4, folate: 400, vitC: 90, vitA: 900, omega3: 1.6 } },
    { maxAge: 70, values: { sodium: 2300, potassium: 3400, calcium: 1000, iron: 8, magnesium: 420, zinc: 11, iodine: 150, vitD: 15, b12: 2.4, folate: 400, vitC: 90, vitA: 900, omega3: 1.6 } },
    { maxAge: 200, values: { sodium: 2300, potassium: 3400, calcium: 1200, iron: 8, magnesium: 420, zinc: 11, iodine: 150, vitD: 20, b12: 2.4, folate: 400, vitC: 90, vitA: 900, omega3: 1.6 } },
  ],
}

export const NORMS_SOURCE = 'Нормы: NIH Office of Dietary Supplements / NASEM (RDA, AI); натрий — верхний предел 2300 мг'

export function dailyNorms(
  sex: Sex,
  age: number,
  macros: MacroTargets,
  overrides: Partial<Record<NutrientKey, number>> = {},
): DailyNorms {
  const row = MICRO_TABLE[sex].find((r) => age <= r.maxAge)!.values
  const n = {} as DailyNorms
  n.kcal = { kind: 'target', min: macros.kcal }
  n.protein = { kind: 'target', min: macros.protein }
  n.fat = { kind: 'min', min: macros.fat }
  n.carbs = { kind: 'target', min: macros.carbs }
  n.fiber = { kind: 'range', min: FIBER_TARGET_G[0], max: FIBER_TARGET_G[1] }
  for (const [k, v] of Object.entries(row) as [Micro, number][]) {
    n[k] = k === 'sodium' ? { kind: 'limit', max: v } : { kind: 'min', min: v }
  }
  for (const [k, v] of Object.entries(overrides) as [NutrientKey, number][]) {
    const cur = n[k]
    n[k] = cur.kind === 'limit' ? { kind: 'limit', max: v } : { ...cur, min: v }
  }
  return n
}
