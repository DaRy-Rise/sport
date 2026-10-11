import { describe, expect, it } from 'vitest'
import { cycleInfo, kitchenCloseTarget, kitchenClosedOnTime, suggestSaltyEvening } from './checkin'
import { addDays, dateRange } from './dates'
import type { DayRecord, DiaryEntry, Profile } from './types'
import { trendOn } from './weight'

const profile: Profile = {
  effectiveFrom: '2026-10-11', sex: 'female', birthDate: '2001-03-01', heightCm: 166, weightKg: 60, targetWeightKg: 55,
  activityFactor: 1.5, startDate: '2026-10-11', calibrationDays: 14, targetWake: '07:00', sleepDurationH: 8, plannedLoadDays: 4,
}

describe('тренд веса', () => {
  it('Скачок после солёного вечера: +0.6 кг утром почти не меняет тренд', () => {
    const w = dateRange('2026-11-01', '2026-11-07').map((date) => ({ date, kg: 58 }))
    const before = trendOn(w, '2026-11-07')!
    w.push({ date: '2026-11-08', kg: 58.6 })
    const after = trendOn(w, '2026-11-08')!
    expect(after - before).toBeCloseTo(0.6 / 7, 2)
  })

  it('Мало записей: 3 за 7 дней → тренд не рассчитывается', () => {
    const w = [{ date: '2026-11-01', kg: 58 }, { date: '2026-11-03', kg: 58 }, { date: '2026-11-06', kg: 58 }]
    expect(trendOn(w, '2026-11-07')).toBeNull()
    w.push({ date: '2026-11-07', kg: 57.8 })
    expect(trendOn(w, '2026-11-07')).toBeCloseTo(57.95)
  })
})

describe('цикл', () => {
  const recs: DayRecord[] = [
    { date: '2026-09-01', periodStart: true }, { date: '2026-09-30', periodStart: true }, { date: '2026-10-28', periodStart: true },
  ]
  it('день цикла, средняя длина и фаза', () => {
    const c = cycleInfo(recs, '2026-11-02')!
    expect(c.day).toBe(6)
    expect(c.avgLength).toBe(29)
    expect(c.phase).toBe('follicular')
    expect(cycleInfo(recs, '2026-10-29')!.phase).toBe('menstruation')
  })

  it('Пояснение в лютеиновой фазе: за ~14 дней до следующей менструации', () => {
    expect(cycleInfo(recs, addDays('2026-10-28', 20))!.phase).toBe('luteal')
  })

  it('без отметок — нет данных; одна отметка — длина по умолчанию 28', () => {
    expect(cycleInfo([], '2026-10-11')).toBeNull()
    expect(cycleInfo([{ date: '2026-10-01', periodStart: true }], '2026-10-11')).toMatchObject({ avgLength: 28, measured: false })
  })
})

describe('привычки', () => {
  it('Кухня закрыта вовремя: отбой 22:45 → цель 20:15, последний приём в 20:00', () => {
    expect(kitchenCloseTarget(profile)).toBe('20:15')
    expect(kitchenClosedOnTime('20:00', '20:15')).toBe(true)
    expect(kitchenClosedOnTime('21:30', '20:15')).toBe(false)
    expect(kitchenClosedOnTime('00:30', '20:15')).toBe(false)
  })

  it('Подсказка «солёный вечер» по натрию вечернего перекуса', () => {
    const chips: DiaryEntry = { date: '2026-10-11', meal: 'evening', label: 'Чипсы', source: { type: 'food', id: 1 }, grams: 30, comp: { sodium: { v: 700, acc: 'exact' } } }
    expect(suggestSaltyEvening([chips])).toBe(true)
    expect(suggestSaltyEvening([chips], { date: '2026-10-11', saltyEvening: false })).toBe(false)
    expect(suggestSaltyEvening([{ ...chips, comp: { sodium: { v: 50, acc: 'exact' } } }])).toBe(false)
  })
})
