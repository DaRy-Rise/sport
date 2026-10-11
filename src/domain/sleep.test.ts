import { describe, expect, it } from 'vitest'
import { dateRange } from './dates'
import {
  adaptationDone, adaptationOffered, adaptationTips, gradualSchedule, sleepMinutes, targetBedtime, tonightBedWindow,
  wakeStability, wakeTargetOn, weekendWarning,
} from './sleep'
import type { SleepNight } from './types'

describe('запись и цель', () => {
  it('Отбой после полуночи: 00:10 → 07:00 = 6 ч 50 мин', () => {
    expect(sleepMinutes('00:10', '07:00')).toBe(410)
    expect(sleepMinutes('23:00', '07:00')).toBe(480)
  })

  it('Расчёт отбоя: 7:00 и 8 ч → 22:45', () => {
    expect(targetBedtime('07:00', 8)).toBe('22:45')
  })
})

describe('стабильность', () => {
  it('Неделя в режиме: 6 из 7, ночь с подъёмом 9:30 — выход за пределы', () => {
    const wakes = ['06:50', '07:05', '07:25', '07:00', '09:30', '06:55', '07:10']
    const nights: SleepNight[] = dateRange('2026-10-19', '2026-10-25').map((date, i) => ({ date, bedtime: '23:00', wake: wakes[i], quality: 3 }))
    const st = wakeStability(nights, '07:00', '2026-10-25', 7)
    expect(st.withinTolerance).toBe(6)
    expect(st.outliers).toEqual(['2026-10-23'])
  })

  it('Долгий сон в субботу: 10:00 при цели 7:00 → предупреждение', () => {
    expect(weekendWarning({ date: '2026-10-24', bedtime: '00:30', wake: '10:00', quality: 4 }, '07:00')).toContain('сдвинет режим')
    expect(weekendWarning({ date: '2026-10-24', bedtime: '23:30', wake: '07:50', quality: 4 }, '07:00')).toBeNull()
    expect(weekendWarning({ date: '2026-10-22', bedtime: '00:30', wake: '10:00', quality: 4 }, '07:00')).toBeNull()
  })
})

describe('адаптация', () => {
  it('Резкий сдвиг перед работой: подъём завтра 7:00, сегодня ориентир 00:00-01:00, а не 22:45', () => {
    expect(adaptationOffered('11:30', '07:00')).toBe(true)
    expect(wakeTargetOn('2026-10-12', '07:00', { active: true, method: 'now', fromWake: '11:30', startDate: '2026-10-11' })).toBe('07:00')
    expect(tonightBedWindow('11:30', targetBedtime('07:00', 8))).toEqual({ from: '00:00', to: '01:00' })
  })

  it('Постепенный сдвиг: по 30 минут от 11:30 до 7:00', () => {
    const s = gradualSchedule('11:30', '07:00', '2026-10-11')
    expect(s).toHaveLength(9)
    expect(s[0]).toEqual({ date: '2026-10-12', wake: '11:00' })
    expect(s.at(-1)).toEqual({ date: '2026-10-20', wake: '07:00' })
    const a = { active: true, method: 'gradual' as const, fromWake: '11:30', startDate: '2026-10-11' }
    expect(wakeTargetOn('2026-10-13', '07:00', a)).toBe('10:30')
    expect(wakeTargetOn('2026-11-01', '07:00', a)).toBe('07:00')
  })

  it('Окончание адаптации: 5 ночей подряд в пределах ±30 минут', () => {
    const nights: SleepNight[] = dateRange('2026-10-12', '2026-10-16').map((date) => ({ date, bedtime: '23:30', wake: '07:10', quality: 3 }))
    expect(adaptationDone(nights, '07:00', '2026-10-16')).toBe(true)
    expect(adaptationDone(nights, '07:00', '2026-10-17')).toBe(false)
    nights[2] = { ...nights[2], wake: '08:00' }
    expect(adaptationDone(nights, '07:00', '2026-10-16')).toBe(false)
  })

  it('Подсказки утром: свет и кофеин', () => {
    const tips = adaptationTips('22:45')
    expect(tips[0]).toContain('свет')
    expect(tips[1]).toContain('14:00')
    expect(tips[3]).toContain('21:45')
    expect(tips[4]).toContain('20:15')
  })
})
