// Все пороги и коэффициенты из спецификаций в одном месте (design.md, решение 4 и риски).

/** Калорийность 1 кг изменения массы тела, ккал. */
export const KCAL_PER_KG = 7700

// --- goal-phases ---
export const CALIBRATION_DAYS_DEFAULT = 14
export const CALIBRATION_DAYS_MAX = 21
/** Непрерывная длительность этапа «вес», после которой предлагается перерыв, недель. */
export const MAX_DEFICIT_WEEKS = 16
/** Длительность перерыва на поддержке, недель (мин, макс). */
export const DIET_BREAK_WEEKS = [1, 2] as const
/** Стоп-условие: сила снижается столько недель подряд. */
export const STRENGTH_DROP_WEEKS = 2
/** Стоп-условие: средняя оценка сна за окно не выше порога. */
export const POOR_SLEEP_WINDOW_DAYS = 14
export const POOR_SLEEP_SCORE = 2
/** Переход: шаг повышения калорий раз в неделю, ккал. */
export const TRANSITION_STEP_KCAL = 125
/** Переход: вес стабилен, если недельный средний меняется не больше, кг. */
export const TRANSITION_STABLE_KG = 0.5
export const TRANSITION_STABLE_WEEKS = 2

// --- nutrition-targets ---
export const ACTIVITY_FACTOR_DEFAULT = 1.5
/** Минимум жиров, г на кг текущего веса. */
export const MIN_FAT_G_PER_KG = 0.8
/** Белок по умолчанию, г на кг текущего веса. */
export const PROTEIN_G_PER_KG = 1.85
export const FIBER_TARGET_G = [25, 30] as const
/** Допуск совпадения средней недельной калорийности с целью этапа, ккал. */
export const WEEKLY_AVG_TOLERANCE_KCAL = 50
/** Разница калорий дня нагрузки и дня отдыха, ккал. */
export const LOAD_REST_KCAL_SPLIT = 300
/** Дефицит этапа «вес» по умолчанию, ккал. */
export const WEIGHT_PHASE_DEFICIT_KCAL = 400
/** Минимум полных дней вне калибровки для расчёта реального расхода. */
export const MIN_DAYS_FOR_REAL_TDEE = 21
/** Плато: тренд не снижается столько дней. */
export const PLATEAU_DAYS = 14
/** Слишком быстрая потеря: доля веса в неделю. */
export const FAST_LOSS_FRACTION_PER_WEEK = 0.01
/** Шаг корректировки калорий, ккал (мин, макс). */
export const ADJUST_KCAL = [100, 150] as const
/** Порог «плато»: изменение тренда за PLATEAU_DAYS меньше, кг. */
export const PLATEAU_TREND_KG = 0.1

// --- food-diary ---
export const EVENING_SNACK_BUDGET_KCAL = { rest: 150, load: 200 } as const
/** День без отметки считается полным при таком числе приёмов пищи. */
export const MIN_MEALS_FOR_COMPLETE_DAY = 3
/** Нутриент считается недостающим ниже этой доли нормы (среднее за 7 дней). */
export const DEFICIT_SUGGESTION_THRESHOLD = 0.7
export const MAX_SUGGESTIONS = 3

// --- batch-cooking ---
export const PERSONAL_YIELD_WINDOW = 5

// --- training-log ---
/** Шаг добавления веса, кг: ноги и тяги в тренажёре / остальное. */
export const PROGRESSION_STEP_KG = { big: 2.5, small: 1.25 } as const
export const STALL_SESSIONS = 3
export const STALL_DROP_FRACTION = 0.1
export const DELOAD_EVERY_WEEKS = 5
export const DELOAD_WEIGHT_FRACTION = 0.65
export const SHORT_SLEEP_HOURS = 6
export const LIGHT_SESSION_MIN_RIR = 3

// --- sleep-tracking ---
export const SLEEP_DURATION_DEFAULT_H = 8
export const SLEEP_LATENCY_MIN = 15
export const WAKE_TOLERANCE_MIN = 30
export const WEEKEND_WAKE_TOLERANCE_MIN = 60
/** Режим адаптации предлагается при отклонении подъёма больше, мин. */
export const ADAPTATION_TRIGGER_MIN = 60
export const ADAPTATION_DONE_NIGHTS = 5
export const ADAPTATION_GRADUAL_STEP_MIN = 30
export const CAFFEINE_CUTOFF = '14:00'
export const NAP_MAX_MIN = 20
export const NAP_LATEST = '15:00'
export const TRAINING_END_BEFORE_BED_MIN = 150

// --- daily-checkin ---
export const TREND_WINDOW_DAYS = 7
export const TREND_MIN_POINTS = 4
/** «Кухня закрыта» по умолчанию: целевой отбой минус столько минут. */
export const KITCHEN_CLOSE_BEFORE_BED_MIN = 150
/** Натрий в вечернем перекусе, при котором предлагается отметка «солёный вечер», мг. */
export const SALTY_EVENING_SODIUM_MG = 600

// --- insights ---
export const INSIGHT_MIN_OBS_PER_GROUP = 8
export const INSIGHT_MIN_SPAN_DAYS = 21
/** «Явной связи не видно», если |разница| < множитель × SE разницы. */
export const INSIGHT_SE_MULTIPLIER = 2
