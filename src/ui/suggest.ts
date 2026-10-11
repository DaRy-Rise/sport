// Пересчёт предложений системы и сохранение новых (без дублей).
import type { AppDB } from '../db/schema'
import type { DayPlan } from '../domain/day'
import { today } from '../domain/dates'
import { activePhase, calibrationEnd, evaluatePhase } from '../domain/phases'
import { reconcile, collectSuggestions } from '../domain/suggestions'
import { adjustmentFor, type Adjustment } from '../domain/tdee'
import { deloadDue, progressionAdvice, sessionsOf, weeklyStrengthIndex } from '../domain/training'
import type { Core } from './data'

export async function refreshSuggestions(db: AppDB, core: Core, plan: DayPlan): Promise<void> {
  const profile = core.current
  if (!profile) return
  const [sleep, sets, exercises, programs, existing] = await Promise.all([
    db.sleep.toArray(), db.sets.toArray(), db.exercises.toArray(), db.programs.toArray(), db.suggestions.toArray(),
  ])
  const exMap = new Map(exercises.map((e) => [e.id!, e]))
  const date = today()
  const phase = activePhase(core.phases)

  const phaseSuggestions = evaluatePhase({
    profile, phases: core.phases, weights: core.weights, days: core.days, sleep,
    weeklyStrength: weeklyStrengthIndex(sets, exMap, date), currentKcal: plan.avgKcal, today: date,
  })

  const adjustment: Adjustment = phase?.kind === 'weight'
    ? adjustmentFor(core.weights, calibrationEnd(profile), date)
    : { kind: 'none' }

  let stalled = 0
  const program = programs.find((p) => p.phase === 'strength')
  if (phase?.kind === 'strength' && program) {
    for (const pe of program.days.flatMap((d) => d.exercises)) {
      const ex = exMap.get(pe.exerciseId)
      if (ex && ex.pattern !== 'core' && ex.pattern !== 'isolation' && progressionAdvice(sessionsOf(sets, ex.id!), pe, ex).kind === 'decrease') stalled++
    }
  }
  const deload = phase ? deloadDue(phase.kind, core.workouts, phase.startDate, date, stalled) : { due: false }

  const added = reconcile(existing, collectSuggestions({ phase: phaseSuggestions, adjustment, deload }), date)
  if (added.length) await db.suggestions.bulkAdd(added)
}
