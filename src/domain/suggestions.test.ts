import { describe, expect, it } from 'vitest'
import { collectSuggestions, reconcile, SUGGESTION_TITLE } from './suggestions'
import type { Suggestion } from './types'

describe('предложения в обзоре', () => {
  it('Предложение в обзоре: плато → «снизить калории» с причиной, статус открыт', () => {
    const fresh = collectSuggestions({
      phase: [],
      adjustment: { kind: 'plateau', askCompleteness: true, deltaKcal: [-150, -100], reason: 'тренд стоит 14 дней' },
    })
    const added = reconcile([], fresh, '2026-11-15')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ kind: 'kcal-down', reason: 'тренд стоит 14 дней', status: 'open' })
    expect(SUGGESTION_TITLE[added[0].kind]).toContain('Снизить')
  })

  it('не дублирует открытое; отложенное возвращается через неделю', () => {
    const fresh = collectSuggestions({ phase: [], adjustment: { kind: 'none' }, deload: { due: true, reason: '5 недель' } })
    const open: Suggestion = { kind: 'deload', createdAt: '2026-11-01', status: 'open', reason: 'x' }
    expect(reconcile([open], fresh, '2026-11-15')).toHaveLength(0)
    const postponed: Suggestion = { ...open, status: 'postponed', createdAt: '2026-11-10' }
    expect(reconcile([postponed], fresh, '2026-11-15')).toHaveLength(0)
    expect(reconcile([postponed], fresh, '2026-11-17')).toHaveLength(1)
  })
})
