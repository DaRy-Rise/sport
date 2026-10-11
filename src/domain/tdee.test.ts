import { describe, expect, it } from 'vitest'
import { addDays, dateRange } from './dates'
import { adjustmentFor, realTdee, type IntakeDay } from './tdee'
import type { WeightPoint } from './weight'

/** Линейное изменение веса: kg в день 0, шаг perDay. */
function weights(from: string, days: number, start: number, perDay: number): WeightPoint[] {
  return dateRange(from, addDays(from, days - 1)).map((date, i) => ({ date, kg: start + perDay * i }))
}
function intake(from: string, days: number, kcal: number, complete = true): IntakeDay[] {
  return dateRange(from, addDays(from, days - 1)).map((date) => ({ date, kcal, complete }))
}

describe('реальный расход', () => {
  it('Расход по данным: 28 дней, 1620 ккал, тренд −1.4 кг → ≈2005', () => {
    const start = '2026-10-25'
    const end = addDays(start, 27)
    // тренд падает на 1.4 кг за 27 дней между первым и последним днём
    const w = weights(addDays(start, -6), 34, 58, -1.4 / 27)
    const r = realTdee({ intake: intake(start, 28, 1620), weights: w, calibrationEnd: start, endDate: end })
    expect(r.source).toBe('data')
    if (r.source === 'data') {
      expect(r.trendChangeKg).toBeCloseTo(-1.4, 1)
      expect(r.tdee).toBeCloseTo(1620 + (1.4 * 7700) / 28, -1)
      expect(Math.abs(r.tdee - 2005)).toBeLessThan(5)
    }
  })

  it('Недостаточно данных: 12 полных дней → формула и сколько осталось', () => {
    const start = '2026-10-25'
    const r = realTdee({ intake: intake(start, 12, 1600), weights: weights(addDays(start, -6), 18, 58, 0), calibrationEnd: start, endDate: addDays(start, 11) })
    expect(r).toEqual({ source: 'formula', eligibleDays: 12, remainingDays: 9 })
  })

  it('Неполный день не участвует в расчёте', () => {
    const start = '2026-10-25'
    const days = intake(start, 22, 1600)
    days[3].complete = false
    days[3].kcal = 500
    const r = realTdee({ intake: days, weights: weights(addDays(start, -6), 28, 58, 0), calibrationEnd: start, endDate: addDays(start, 21) })
    expect(r.source).toBe('data')
    if (r.source === 'data') {
      expect(r.days).toBe(21)
      expect(r.avgKcal).toBe(1600)
    }
  })

  it('дни калибровки не учитываются', () => {
    const r = realTdee({
      intake: intake('2026-10-11', 30, 1600), weights: weights('2026-10-11', 30, 60, -0.05),
      calibrationEnd: '2026-10-25', endDate: '2026-11-09',
    })
    expect(r.source).toBe('formula')
  })
})

describe('корректировки', () => {
  const calEnd = '2026-10-25'
  it('Плато: тренд стоит 14 дней → вопрос о полноте и −100-150', () => {
    const w = weights(addDays(calEnd, -7), 30, 58, 0)
    const a = adjustmentFor(w, calEnd, addDays(calEnd, 20))
    expect(a.kind).toBe('plateau')
    if (a.kind === 'plateau') {
      expect(a.askCompleteness).toBe(true)
      expect(a.deltaKcal).toEqual([-150, -100])
    }
  })

  it('Слишком быстрая потеря: −0.7 кг за неделю при 58 кг → +100-150', () => {
    const w = weights(addDays(calEnd, -7), 30, 58, -0.1)
    const a = adjustmentFor(w, calEnd, addDays(calEnd, 14))
    expect(a.kind).toBe('fast-loss')
    if (a.kind === 'fast-loss') expect(a.deltaKcal).toEqual([100, 150])
  })

  it('нормальный темп — без предложений; в калибровке — без предложений', () => {
    expect(adjustmentFor(weights(addDays(calEnd, -7), 30, 58, -0.05), calEnd, addDays(calEnd, 20)).kind).toBe('none')
    expect(adjustmentFor(weights('2026-10-11', 14, 60, -0.15), calEnd, '2026-10-24').kind).toBe('none')
  })
})
