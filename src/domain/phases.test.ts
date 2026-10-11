import { describe, expect, it } from 'vitest'
import { addDays, dateRange } from './dates'
import {
  CALIBRATION_NOTE, TRANSITION_WATER_NOTE, activePhase, calibrationEnd, clampCalibrationDays, deficitWeeks, evaluatePhase,
  inCalibration, phaseOn, profileOn, reviseProfile, startProgram, switchPhase, transitionKcal, type PhaseState,
} from './phases'
import { dailyNorms, dayTargets, formulaTdee, phaseTargetKcal } from './targets'
import type { Phase, Profile, SleepNight } from './types'
import type { WeightPoint } from './weight'

const base: Profile = {
  effectiveFrom: '2026-10-11', sex: 'female', birthDate: '2001-03-01', heightCm: 166, weightKg: 60, targetWeightKg: 55,
  activityFactor: 1.5, startDate: '2026-10-11', calibrationDays: 14, targetWake: '07:00', sleepDurationH: 8, plannedLoadDays: 4,
}

const flat = (from: string, n: number, kg: number): WeightPoint[] => dateRange(from, addDays(from, n - 1)).map((date) => ({ date, kg }))

function state(over: Partial<PhaseState>): PhaseState {
  return { profile: base, phases: startProgram(base), weights: [], days: [], sleep: [], weeklyStrength: [], currentKcal: 1620, today: '2026-11-20', ...over }
}

describe('профиль', () => {
  it('Создание профиля: рассчитаны базовый обмен и расход', () => {
    const e = formulaTdee(base, base.startDate)
    expect(Math.round(e.bmr)).toBe(1352)
    expect(Math.round(e.tdee)).toBe(2027)
  })

  it('Изменение цели не меняет нормы прошлых дней', () => {
    const v2 = reviseProfile(base, { weightKg: 58 }, '2026-11-01')
    const versions = [base, v2]
    const norms = (date: string) => {
      const p = profileOn(versions, date)!
      const kcal = phaseTargetKcal('weight', formulaTdee(p, date).tdee)
      return dayTargets({ avgKcal: kcal, weightKg: p.weightKg, loadDays: p.plannedLoadDays }).load
    }
    expect(profileOn(versions, '2026-10-20')!.weightKg).toBe(60)
    expect(profileOn(versions, '2026-11-02')!.weightKg).toBe(58)
    expect(norms('2026-10-20')).not.toEqual(norms('2026-11-02'))
    expect(dailyNorms('female', 25, norms('2026-10-20')).kcal.min).toBe(norms('2026-10-20').kcal)
  })
})

describe('этапы', () => {
  it('Старт программы: этап «вес» с даты старта', () => {
    expect(startProgram(base)).toEqual([{ kind: 'weight', startDate: '2026-10-11' }])
  })

  it('Старт программы задним числом: калибровка от даты старта', () => {
    const p = { ...base, startDate: '2026-10-11', effectiveFrom: '2026-10-20' }
    expect(startProgram(p)[0].startDate).toBe('2026-10-11')
    expect(calibrationEnd(p)).toBe('2026-10-25')
  })

  it('История этапов: у завершённого есть дата окончания', () => {
    const phases = switchPhase(startProgram(base), 'transition', '2027-01-10', 1650)
    expect(phases).toHaveLength(2)
    expect(phases[0].endDate).toBe('2027-01-09')
    expect(activePhase(phases)?.kind).toBe('transition')
    expect(phaseOn(phases, '2026-12-01')?.kind).toBe('weight')
  })
})

describe('калибровка', () => {
  it('Быстрый сход воды: в калибровке нет предупреждения «слишком быстро»', () => {
    expect(inCalibration(base, '2026-10-20')).toBe(true)
    expect(CALIBRATION_NOTE).toContain('уходит вода')
  })

  it('Калибровка окончена через 14 дней; длительность ограничена 0-21', () => {
    expect(inCalibration(base, '2026-10-25')).toBe(false)
    expect(clampCalibrationDays(30)).toBe(21)
    expect(clampCalibrationDays(-2)).toBe(0)
  })
})

describe('завершение и стоп-условия этапа «вес»', () => {
  it('Цель достигнута: средний вес за 7 дней ≤ 55', () => {
    const s = evaluatePhase(state({ weights: flat('2026-11-10', 11, 54.9) }))
    expect(s.map((x) => x.kind)).toContain('finish-weight-phase')
  })

  it('Однодневное значение не считается', () => {
    const w = flat('2026-11-14', 7, 55.73)
    w[6] = { date: '2026-11-20', kg: 54.8 }
    const s = evaluatePhase(state({ weights: w }))
    expect(s.map((x) => x.kind)).not.toContain('finish-weight-phase')
  })

  it('Падение силы 2 недели → перерыв с причиной', () => {
    const s = evaluatePhase(state({ weeklyStrength: [100, 98, 96] }))
    const b = s.find((x) => x.kind === 'diet-break')
    expect(b?.reason).toContain('сила снижается 2 недели')
  })

  it('Нарушение цикла → перерыв с этой причиной', () => {
    const s = evaluatePhase(state({ days: [{ date: '2026-11-15', cycleIssue: true }] }))
    expect(s.find((x) => x.kind === 'diet-break')?.reason).toContain('сбой цикла')
  })

  it('плохой сон учитывается без ночей адаптации', () => {
    const nights = (adaptation: boolean): SleepNight[] =>
      dateRange('2026-11-07', '2026-11-20').map((date) => ({ date, bedtime: '23:00', wake: '07:00', quality: 2, adaptation }))
    expect(evaluatePhase(state({ sleep: nights(false) })).some((x) => x.kind === 'diet-break')).toBe(true)
    expect(evaluatePhase(state({ sleep: nights(true) })).some((x) => x.kind === 'diet-break')).toBe(false)
  })
})

describe('перерыв после долгого дефицита', () => {
  it('16 недель дефицита → предложение перерыва', () => {
    const today = addDays('2026-10-11', 16 * 7 - 1)
    const s = evaluatePhase(state({ today }))
    expect(s.find((x) => x.kind === 'diet-break')?.reason).toContain('16 недель')
  })

  it('Возврат после перерыва: счёт недель начинается заново, цель прежняя', () => {
    let phases: Phase[] = startProgram(base)
    phases = switchPhase(phases, 'break', '2027-01-01', 2000)
    phases = switchPhase(phases, 'weight', '2027-01-15')
    expect(deficitWeeks(phases, '2027-01-21')).toBe(1)
    expect(activePhase(phases)?.kind).toBe('weight')
  })
})

describe('этап перехода', () => {
  it('Предупреждение о воде', () => {
    expect(TRANSITION_WATER_NOTE).toMatch(/0\.5-1 кг/)
  })

  it('калорийность растёт на 125 ккал в неделю', () => {
    expect(transitionKcal(1620, '2027-01-04', '2027-01-04')).toBe(1620)
    expect(transitionKcal(1620, '2027-01-04', '2027-01-18')).toBe(1870)
  })

  it('Найдена поддержка: две недели вес стабилен → предложение этапа «сила»', () => {
    const phases = switchPhase(startProgram(base), 'transition', '2027-01-04', 1650)
    const w = flat('2027-01-04', 28, 55.2)
    const s = evaluatePhase(state({ phases, weights: w, currentKcal: 1900, today: '2027-02-01' }))
    const f = s.find((x) => x.kind === 'finish-transition')
    expect(f?.payload?.maintenanceKcal).toBe(1900)
  })
})
