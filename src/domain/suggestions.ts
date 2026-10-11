// Сбор предложений из разных частей системы для обзора недели.
import { addDays } from './dates'
import type { PhaseSuggestion } from './phases'
import type { Adjustment } from './tdee'
import type { ISODate, Suggestion } from './types'

/** Отложенное предложение возвращается через столько дней. */
export const POSTPONE_DAYS = 7

export function collectSuggestions(input: {
  phase: PhaseSuggestion[]
  adjustment: Adjustment
  deload?: { due: boolean; reason?: string }
}): PhaseSuggestion[] {
  const out = [...input.phase]
  const a = input.adjustment
  if (a.kind === 'plateau') out.push({ kind: 'kcal-down', reason: a.reason, payload: { delta: a.deltaKcal, askCompleteness: true } })
  if (a.kind === 'fast-loss') out.push({ kind: 'kcal-up', reason: a.reason, payload: { delta: a.deltaKcal } })
  if (input.deload?.due) out.push({ kind: 'deload', reason: input.deload.reason ?? 'пора разгрузиться' })
  return out
}

/**
 * Какие предложения добавить: открытого предложения того же вида нет,
 * а отложенное — отложено больше недели назад.
 */
export function reconcile(existing: Suggestion[], fresh: PhaseSuggestion[], today: ISODate): Suggestion[] {
  return fresh
    .filter((f) => !existing.some((e) =>
      e.kind === f.kind && (e.status === 'open' || (e.status === 'postponed' && addDays(e.createdAt, POSTPONE_DAYS) > today))))
    .map((f) => ({ kind: f.kind, reason: f.reason, payload: f.payload, createdAt: today, status: 'open' as const }))
}

export const SUGGESTION_TITLE: Record<Suggestion['kind'], string> = {
  'finish-weight-phase': 'Завершить этап «вес» и перейти к переходу',
  'diet-break': 'Перерыв на поддержке 1-2 недели',
  'finish-transition': 'Завершить переход и начать этап «сила»',
  'transition-step': 'Поднять калории на этапе перехода',
  'kcal-down': 'Снизить калории на 100-150 ккал (или добавить шагов)',
  'kcal-up': 'Добавить 100-150 ккал, чтобы сохранить мышцы',
  deload: 'Разгрузочная неделя',
}
