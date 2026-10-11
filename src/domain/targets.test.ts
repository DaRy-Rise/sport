import { describe, expect, it } from 'vitest'
import { bmrMifflin, dailyNorms, dayTargets, formulaTdee, phaseTargetKcal } from './targets'
import type { Profile } from './types'

const profile: Profile = {
  effectiveFrom: '2026-10-11', sex: 'female', birthDate: '2001-03-01', heightCm: 166, weightKg: 60, targetWeightKg: 55,
  activityFactor: 1.5, startDate: '2026-10-11', calibrationDays: 14, targetWake: '07:00', sleepDurationH: 8, plannedLoadDays: 4,
}

describe('начальная оценка расхода', () => {
  it('Оценка для исходного профиля: ~1350 / ~2030, источник «формула»', () => {
    const e = formulaTdee(profile, '2026-10-11')
    expect(e.bmr).toBeCloseTo(1351.5, 0)
    expect(e.tdee).toBeCloseTo(2027, 0)
    expect(e.source).toBe('formula')
  })

  it('формула для мужчины даёт +166 ккал', () => {
    expect(bmrMifflin('male', 60, 166, 25) - bmrMifflin('female', 60, 166, 25)).toBe(166)
  })
})

describe('нормы по типу дня', () => {
  it('Нормы этапа «вес»: 1750/1450, белок ровный, неделя в среднем = цель', () => {
    const t = dayTargets({ avgKcal: 1620, weightKg: 60, loadDays: 4 })
    expect(t.load.kcal).toBe(1750)
    expect(t.rest.kcal).toBe(1450)
    expect(t.load.protein).toBe(t.rest.protein)
    expect(t.load.protein).toBeGreaterThanOrEqual(110)
    expect(t.load.fat).toBe(50)
    expect(t.rest.fat).toBe(55)
    expect(Math.abs(t.load.carbs - 210)).toBeLessThanOrEqual(10)
    expect(Math.abs(t.rest.carbs - 130)).toBeLessThanOrEqual(10)
    const weekly = (4 * t.load.kcal + 3 * t.rest.kcal) / 7
    expect(Math.abs(weekly - 1620)).toBeLessThanOrEqual(50)
  })

  it('Нижняя граница жиров: жиры поднимаются до 0.8 г/кг, углеводы уменьшаются', () => {
    const low = dayTargets({ avgKcal: 1620, weightKg: 60, loadDays: 4, fatPerKgLoad: 0.5 })
    const normal = dayTargets({ avgKcal: 1620, weightKg: 60, loadDays: 4, fatPerKgLoad: 0.8 })
    expect(low.load.fat).toBe(48)
    expect(low.load.carbs).toBe(normal.load.carbs)
  })

  it('цель этапа «вес» = расход − 400, на других этапах — зафиксированная', () => {
    expect(phaseTargetKcal('weight', 2027)).toBe(1627)
    expect(phaseTargetKcal('strength', 2027, 1900)).toBe(1900)
    expect(phaseTargetKcal('break', 2027)).toBe(2027)
  })
})

describe('нормы микронутриентов', () => {
  const macros = { kcal: 1750, protein: 110, fat: 50, carbs: 210 }
  it('Нормы для женщины 25 лет', () => {
    const n = dailyNorms('female', 25, macros)
    expect(n.iron.min).toBe(18)
    expect(n.calcium.min).toBe(1000)
    expect(n.fiber).toEqual({ kind: 'range', min: 25, max: 30 })
    expect(n.sodium.kind).toBe('limit')
    expect(n.sodium.max).toBe(2300)
  })

  it('ручное переопределение нормы', () => {
    const n = dailyNorms('female', 25, macros, { vitD: 50, sodium: 2000 })
    expect(n.vitD.min).toBe(50)
    expect(n.sodium).toEqual({ kind: 'limit', max: 2000 })
  })
})
