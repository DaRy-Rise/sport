// Общие типы предметной области. Не зависят от БД и интерфейса.

/** Локальная дата `YYYY-MM-DD`. */
export type ISODate = string
/** Время `HH:MM`. */
export type HHMM = string

export type Sex = 'female' | 'male'
export type DayType = 'load' | 'rest'

// ---------- Нутриенты ----------

export const NUTRIENT_KEYS = [
  'kcal', 'protein', 'fat', 'carbs', 'fiber',
  'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'iodine',
  'vitD', 'b12', 'folate', 'vitC', 'vitA', 'omega3',
] as const
export type NutrientKey = (typeof NUTRIENT_KEYS)[number]

export const MACRO_KEYS = ['kcal', 'protein', 'fat', 'carbs', 'fiber'] as const satisfies readonly NutrientKey[]
export const MICRO_KEYS = NUTRIENT_KEYS.filter((k) => !(MACRO_KEYS as readonly string[]).includes(k))

export type Accuracy = 'exact' | 'approx'
/** Значение нутриента. Отсутствие ключа в составе означает «неизвестно», а не 0. */
export interface NutrientValue {
  v: number
  acc: Accuracy
}
/** Состав (на 100 г или на порцию). */
export type Composition = Partial<Record<NutrientKey, NutrientValue>>

// ---------- Профиль и этапы ----------

export interface Profile {
  /** Дата, с которой действует эта версия профиля. */
  effectiveFrom: ISODate
  sex: Sex
  birthDate: ISODate
  heightCm: number
  weightKg: number
  targetWeightKg: number
  activityFactor: number
  /** Дата старта программы (может быть в прошлом). */
  startDate: ISODate
  calibrationDays: number
  targetWake: HHMM
  sleepDurationH: number
  /** Целевое время «кухня закрыта»; если не задано — отбой минус 2.5 ч. */
  kitchenCloseTarget?: HHMM
  /** Ручные нормы нутриентов (например, по рекомендации врача). */
  nutrientOverrides?: Partial<Record<NutrientKey, number>>
  /** Плановое число дней нагрузки в неделю. */
  plannedLoadDays: number
}

export type PhaseKind = 'weight' | 'transition' | 'strength' | 'break'

export interface Phase {
  id?: number
  kind: PhaseKind
  startDate: ISODate
  endDate?: ISODate
  /** Целевая средняя калорийность (переход/сила/перерыв); для «вес» вычисляется из расхода. */
  targetKcal?: number
  /** Принятые корректировки калорий этапа «вес» (сумма), ккал. */
  kcalAdjust?: number
}

// ---------- Продукты ----------

export type FoodKind = 'generic' | 'packaged'

export interface Measure {
  name: string
  grams: number
}

export interface Food {
  id?: number
  kind: FoodKind
  name: string
  brand?: string
  synonyms: string[]
  /** Состав на 100 г. Для упаковки — данные этикетки (exact). */
  per100: Composition
  /** Аналог из справочника для недостающих нутриентов (только упаковка). */
  analogId?: number
  measures: Measure[]
  /** Стандартный коэффициент выхода (готовое / сырое). */
  yieldFactor?: number
  /** Скрыт из поиска (мягкое удаление). */
  hidden?: boolean
  fdcId?: number
}

export interface PortionItem {
  foodId: number
  grams: number
}

export interface TemplateVariant {
  name: string
  items: PortionItem[]
}

export interface MealTemplate {
  id?: number
  name: string
  items: PortionItem[]
  variants: TemplateVariant[]
  hidden?: boolean
}

export interface Tare {
  id?: number
  name: string
  weightG: number
}

export interface BatchIngredient {
  foodId: number
  /** Количество в граммах (после перевода из бытовой меры). */
  grams: number
  /** Исходная бытовая мера, если вводилась так. */
  measure?: { name: string; count: number }
}

export interface Batch {
  id?: number
  name: string
  cookedDate: ISODate
  ingredients: BatchIngredient[]
  /** Вес готового (нетто). */
  cookedWeightG: number
  /** true — вес готового оценён по коэффициентам выхода. */
  weightEstimated: boolean
  tareId?: number
  grossWeightG?: number
  /** Рассчитанный состав на 100 г готового. */
  per100: Composition
  /** Ингредиенты без данных по нутриенту. */
  unknownFrom?: Partial<Record<NutrientKey, string[]>>
  finished?: boolean
}

export interface PersonalYield {
  foodId: number
  samples: number[]
}

// ---------- Дневник ----------

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'evening'

export interface DiaryEntry {
  id?: number
  date: ISODate
  meal: MealSlot
  label: string
  source: { type: 'food' | 'template' | 'batch'; id: number; variant?: string }
  grams: number
  /** Состав компонентов для шаблонов (после правок). */
  items?: PortionItem[]
  /** Снимок состава порции на момент записи. */
  comp: Composition
  /** Названия продуктов без данных по нутриенту (для пометки «неполные данные»). */
  unknownFrom?: Partial<Record<NutrientKey, string[]>>
}

// ---------- Отметки дня ----------

export interface DayRecord {
  date: ISODate
  dayTypeOverride?: DayType
  completeness?: 'complete' | 'incomplete'
  weightKg?: number
  saltyDay?: boolean
  saltyEvening?: boolean
  kitchenClosedAt?: HHMM
  periodStart?: boolean
  cycleIssue?: boolean
}

// ---------- Тренировки ----------

export type MovementPattern = 'legs' | 'pull' | 'push' | 'hinge' | 'core' | 'isolation'

export interface Exercise {
  id?: number
  name: string
  muscles: string
  pattern: MovementPattern
  equipment: 'machine' | 'free' | 'bodyweight'
  /** Крупный шаг прогрессии (ноги, тяги в тренажёре). */
  bigStep: boolean
  hidden?: boolean
}

export interface ProgramExercise {
  exerciseId: number
  sets: number
  repMin: number
  repMax: number
  targetRir: number
}

export interface ProgramDay {
  key: string
  name: string
  exercises: ProgramExercise[]
}

export interface Program {
  id?: number
  phase: 'weight' | 'strength'
  name: string
  days: ProgramDay[]
}

export type GameType = 'volleyball' | 'badminton' | 'tennis' | 'other'

export interface Workout {
  id?: number
  date: ISODate
  kind: 'strength' | 'game' | 'rest'
  planned: boolean
  done: boolean
  programId?: number
  programDayKey?: string
  gameType?: GameType
  durationMin?: number
  /** Субъективная нагрузка 1-10 (игры). */
  rpe?: number
  light?: boolean
  deload?: boolean
}

export interface WorkoutSet {
  id?: number
  workoutId: number
  date: ISODate
  exerciseId: number
  setIndex: number
  weightKg: number
  reps: number
  rir: number
}

// ---------- Сон ----------

export interface SleepNight {
  /** Дата подъёма. */
  date: ISODate
  bedtime: HHMM
  wake: HHMM
  quality: number
  adaptation?: boolean
}

export interface AdaptationState {
  active: boolean
  method: 'now' | 'gradual'
  fromWake: HHMM
  startDate: ISODate
}

// ---------- Предложения ----------

export type SuggestionKind =
  | 'finish-weight-phase'
  | 'diet-break'
  | 'finish-transition'
  | 'transition-step'
  | 'kcal-down'
  | 'kcal-up'
  | 'deload'

export interface Suggestion {
  id?: number
  kind: SuggestionKind
  createdAt: ISODate
  status: 'open' | 'accepted' | 'postponed'
  reason: string
  payload?: Record<string, unknown>
}
