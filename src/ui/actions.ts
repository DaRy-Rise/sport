// Действия, меняющие этапы и нормы (вызываются из экранов).
import type { AppDB } from '../db/schema'
import { addDays, today } from '../domain/dates'
import { activePhase, switchPhase, transitionKcal } from '../domain/phases'
import type { Phase, PhaseKind, Suggestion } from '../domain/types'
import { ADJUST_KCAL } from '../domain/constants'

async function replacePhases(db: AppDB, phases: Phase[]): Promise<void> {
  await db.transaction('rw', db.phases, async () => {
    await db.phases.clear()
    await db.phases.bulkAdd(phases.map((p) => { const c = { ...p }; delete c.id; return c }))
  })
}

export async function changePhase(db: AppDB, kind: PhaseKind, targetKcal?: number, from = today()): Promise<void> {
  const phases = await db.phases.toArray()
  await replacePhases(db, switchPhase(phases, kind, from, targetKcal))
}

/** Текущая средняя калорийность активного этапа (для перехода и поддержки). */
export function currentPhaseKcal(phase: Phase | undefined, weightPhaseAvg: number, date = today()): number {
  if (!phase) return weightPhaseAvg
  if (phase.kind === 'transition' && phase.targetKcal !== undefined) return transitionKcal(phase.targetKcal, phase.startDate, date)
  return phase.targetKcal ?? weightPhaseAvg
}

export async function adjustWeightKcal(db: AppDB, delta: number): Promise<void> {
  const p = activePhase(await db.phases.toArray())
  if (p?.kind !== 'weight' || p.id === undefined) return
  await db.phases.update(p.id, { kcalAdjust: (p.kcalAdjust ?? 0) + delta })
}

export interface AcceptContext {
  /** Средняя калорийность сегодня по текущему этапу. */
  avgKcal: number
  /** Расход (формула или по данным). */
  tdee: number
}

/** Принимает предложение: применяет действие и закрывает его. */
export async function acceptSuggestion(db: AppDB, s: Suggestion, ctx: AcceptContext): Promise<void> {
  switch (s.kind) {
    case 'finish-weight-phase':
      await changePhase(db, 'transition', Math.round(ctx.avgKcal))
      break
    case 'diet-break':
      await changePhase(db, 'break', Math.round(ctx.tdee))
      break
    case 'finish-transition':
      await changePhase(db, 'strength', Number(s.payload?.maintenanceKcal ?? ctx.avgKcal))
      break
    case 'kcal-down':
      await adjustWeightKcal(db, -Math.round((ADJUST_KCAL[0] + ADJUST_KCAL[1]) / 2))
      break
    case 'kcal-up':
      await adjustWeightKcal(db, Math.round((ADJUST_KCAL[0] + ADJUST_KCAL[1]) / 2))
      break
    case 'deload':
      await db.settings.put({ key: 'deloadFrom', value: today() })
      break
    case 'transition-step':
      break
  }
  if (s.id !== undefined) await db.suggestions.update(s.id, { status: 'accepted' })
}

export async function postponeSuggestion(db: AppDB, s: Suggestion): Promise<void> {
  if (s.id !== undefined) await db.suggestions.update(s.id, { status: 'postponed', createdAt: today() })
}

/** Идёт ли разгрузочная неделя (7 дней с даты принятия). */
export async function deloadActive(db: AppDB, date: string): Promise<boolean> {
  const from = (await db.settings.get('deloadFrom'))?.value as string | undefined
  return !!from && date >= from && date < addDays(from, 7)
}
