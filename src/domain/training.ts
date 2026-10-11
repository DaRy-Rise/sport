// Тренировки: программы, журнал, прогрессия, разгрузка (спецификация training-log).
import {
  DELOAD_EVERY_WEEKS, DELOAD_WEIGHT_FRACTION, LIGHT_SESSION_MIN_RIR, PROGRESSION_STEP_KG, SHORT_SLEEP_HOURS,
  STALL_DROP_FRACTION, STALL_SESSIONS,
} from './constants'
import { addDays, diffDays, weekStart } from './dates'
import type { Exercise, GameType, ISODate, MovementPattern, ProgramDay, ProgramExercise, Workout, WorkoutSet } from './types'

export const PATTERN_LABEL: Record<MovementPattern, string> = {
  legs: 'Ноги', pull: 'Тяга', push: 'Жим', hinge: 'Задняя поверхность бедра', core: 'Кор', isolation: 'Изоляция',
}
export const GAME_LABEL: Record<GameType, string> = {
  volleyball: 'Волейбол', badminton: 'Бадминтон', tennis: 'Теннис', other: 'Другое',
}

/** Обязательные типы движения тренировки этапа «вес». */
export const REQUIRED_PATTERNS: MovementPattern[] = ['legs', 'pull', 'push', 'hinge', 'core']

/** Предупреждения о пропущенных движениях (изменение всё равно сохраняется). */
export function missingPatterns(day: ProgramDay, exercises: Map<number, Exercise>): MovementPattern[] {
  const present = new Set(day.exercises.map((e) => exercises.get(e.exerciseId)?.pattern))
  return REQUIRED_PATTERNS.filter((p) => !present.has(p))
}

// ---------- Журнал ----------

/** Подходы упражнения в последней тренировке до даты. */
export function lastPerformance(sets: WorkoutSet[], exerciseId: number, beforeDate: ISODate): WorkoutSet[] {
  const prev = sets.filter((s) => s.exerciseId === exerciseId && s.date < beforeDate)
  if (!prev.length) return []
  const lastWorkout = prev.reduce((a, s) => (s.date > a.date || (s.date === a.date && s.workoutId > a.workoutId) ? s : a))
  return prev.filter((s) => s.workoutId === lastWorkout.workoutId).sort((a, b) => a.setIndex - b.setIndex)
}

/** Тренировки упражнения по порядку: подходы каждой. */
export function sessionsOf(sets: WorkoutSet[], exerciseId: number): WorkoutSet[][] {
  const by = new Map<number, WorkoutSet[]>()
  for (const s of sets.filter((x) => x.exerciseId === exerciseId)) {
    if (!by.has(s.workoutId)) by.set(s.workoutId, [])
    by.get(s.workoutId)!.push(s)
  }
  return [...by.values()].sort((a, b) => a[0].date.localeCompare(b[0].date) || a[0].workoutId - b[0].workoutId)
}

// ---------- Прогрессия ----------

export type ProgressionAdvice =
  | { kind: 'increase'; weightKg: number; reason: string }
  | { kind: 'decrease'; weightKg: number; reason: string }
  | { kind: 'keep'; weightKg: number }
  | { kind: 'none' }

const roundTo = (v: number, step: number) => Math.round(v / step) * step

export function progressionAdvice(sessions: WorkoutSet[][], pe: ProgramExercise, ex: Exercise): ProgressionAdvice {
  const last = sessions.at(-1)
  if (!last?.length) return { kind: 'none' }
  const working = Math.max(...last.map((s) => s.weightKg))
  const workSets = last.filter((s) => s.weightKg === working)

  const recent = sessions.slice(-STALL_SESSIONS)
  if (recent.length === STALL_SESSIONS && recent.every((sess) => sess.some((s) => s.reps < pe.repMin))) {
    const w = roundTo(working * (1 - STALL_DROP_FRACTION), 0.5)
    return { kind: 'decrease', weightKg: w, reason: `${STALL_SESSIONS} тренировки подряд не выполнена нижняя граница ${pe.repMin} повторов` }
  }

  const allTop = workSets.length >= pe.sets && workSets.every((s) => s.reps >= pe.repMax && s.rir >= 1)
  if (allTop) {
    const step = ex.bigStep ? PROGRESSION_STEP_KG.big : PROGRESSION_STEP_KG.small
    return { kind: 'increase', weightKg: working + step, reason: `все подходы ${pe.repMax} повторов с запасом` }
  }
  return { kind: 'keep', weightKg: working }
}

// ---------- Показатель силы ----------

/** Расчётный максимум на 1 повтор (Эпли). */
export function e1rm(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30)
}

export function bestE1rm(sets: WorkoutSet[]): number {
  return sets.reduce((m, s) => Math.max(m, e1rm(s.weightKg, s.reps)), 0)
}

/** Точки графика: расчётный максимум по тренировкам. */
export function strengthHistory(sets: WorkoutSet[], exerciseId: number): { date: ISODate; e1rm: number }[] {
  return sessionsOf(sets, exerciseId).map((s) => ({ date: s[0].date, e1rm: Math.round(bestE1rm(s) * 10) / 10 }))
}

const MAIN_PATTERNS: MovementPattern[] = ['legs', 'push', 'pull', 'hinge']

/**
 * Недельный индекс силы по основным упражнениям за последние `weeks` недель:
 * среднее отношений лучшего e1RM недели к e1RM первой недели. Учитываются упражнения,
 * выполнявшиеся во все недели. Если таких нет — пустой массив.
 */
export function weeklyStrengthIndex(sets: WorkoutSet[], exercises: Map<number, Exercise>, today: ISODate, weeks = 3): number[] {
  const starts = Array.from({ length: weeks }, (_, i) => addDays(weekStart(today), -7 * (weeks - i)))
  const mainIds = [...exercises.values()].filter((e) => MAIN_PATTERNS.includes(e.pattern)).map((e) => e.id!)
  const table = mainIds.map((id) =>
    starts.map((from) => bestE1rm(sets.filter((s) => s.exerciseId === id && s.date >= from && s.date <= addDays(from, 6)))),
  ).filter((row) => row.every((v) => v > 0))
  if (!table.length) return []
  return starts.map((_, w) => table.reduce((s, row) => s + row[w] / row[0], 0) / table.length)
}

// ---------- Разгрузка ----------

export function deloadDue(
  phaseKind: string, workouts: Workout[], phaseStart: ISODate, today: ISODate, stalledMainExercises: number,
): { due: boolean; reason?: string } {
  if (phaseKind !== 'strength') return { due: false }
  const lastDeload = workouts.filter((w) => w.deload && w.date <= today).map((w) => w.date).sort().at(-1)
  const from = lastDeload && lastDeload > phaseStart ? lastDeload : phaseStart
  const weeks = diffDays(from, today) / 7
  if (weeks >= DELOAD_EVERY_WEEKS) return { due: true, reason: `${DELOAD_EVERY_WEEKS} недель тренировок с последней разгрузки` }
  if (stalledMainExercises >= 2) return { due: true, reason: 'застой в двух и более основных упражнениях' }
  return { due: false }
}

/** Вес на разгрузочной неделе. */
export function deloadWeight(workingKg: number): number {
  return roundTo(workingKg * DELOAD_WEIGHT_FRACTION, 0.5)
}

export function deloadDay(day: ProgramDay): ProgramDay {
  return { ...day, exercises: day.exercises.map((e) => ({ ...e, sets: Math.max(1, Math.round((e.sets * 2) / 3)) })) }
}

// ---------- Облегчение после недосыпа ----------

export function needsLightSession(lastNightHours: number | null): boolean {
  return lastNightHours !== null && lastNightHours < SHORT_SLEEP_HOURS
}

export function lightDay(day: ProgramDay): ProgramDay {
  return {
    ...day,
    exercises: day.exercises.map((e) => ({ ...e, sets: Math.max(1, e.sets - 1), targetRir: Math.max(LIGHT_SESSION_MIN_RIR, e.targetRir) })),
  }
}
