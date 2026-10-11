import { describe, expect, it } from 'vitest'
import { determineDayType } from './day'
import { SEED_EXERCISES, seedPrograms } from './seed'
import {
  deloadDue, deloadWeight, lastPerformance, lightDay, missingPatterns, needsLightSession, progressionAdvice, sessionsOf,
  strengthHistory, weeklyStrengthIndex,
} from './training'
import type { Exercise, Workout, WorkoutSet } from './types'

const exercises = new Map<number, Exercise>(SEED_EXERCISES.map((e, i) => [i + 1, { ...e, id: i + 1 }]))
const idOf = (name: string) => [...exercises.values()].find((e) => e.name === name)!.id!
const programs = seedPrograms(idOf)

describe('календарь', () => {
  const week: Workout[] = [
    { date: '2026-10-12', kind: 'strength', planned: true, done: false, programDayKey: 'A' },
    { date: '2026-10-14', kind: 'strength', planned: true, done: false, programDayKey: 'B' },
    { date: '2026-10-15', kind: 'game', planned: true, done: false, gameType: 'volleyball' },
  ]
  it('План недели: дни тренировок и игр — нагрузка, остальные — отдых', () => {
    expect(determineDayType('2026-10-12', week).type).toBe('load')
    expect(determineDayType('2026-10-15', week).type).toBe('load')
    expect(determineDayType('2026-10-13', week).type).toBe('rest')
  })

  it('День игры: суббота с волейболом — нагрузка', () => {
    expect(determineDayType('2026-10-17', [{ date: '2026-10-17', kind: 'game', planned: true, done: false, gameType: 'volleyball' }]).type).toBe('load')
  })

  it('Незапланированная игра делает день днём нагрузки', () => {
    const w: Workout[] = [{ date: '2026-10-13', kind: 'game', planned: false, done: true, gameType: 'badminton', durationMin: 60, rpe: 6 }]
    expect(determineDayType('2026-10-13', w).type).toBe('load')
  })
})

describe('библиотека и программы', () => {
  it('Тренажёры пользователя есть в библиотеке с группами мышц', () => {
    for (const n of ['Жим ногами', 'Горизонтальная тяга блока', 'Бабочка']) {
      const e = exercises.get(idOf(n))!
      expect(e.equipment).toBe('machine')
      expect(e.muscles.length).toBeGreaterThan(0)
    }
  })

  it('Программа этапа «вес»: A содержит ноги, тягу, жим, заднюю поверхность и кор', () => {
    const p = programs.find((x) => x.phase === 'weight')!
    const a = p.days.find((d) => d.key === 'A')!
    expect(a.exercises.map((e) => exercises.get(e.exerciseId)!.name)).toEqual(
      ['Жим ногами', 'Горизонтальная тяга блока', 'Жим в тренажёре сидя', 'Румынская тяга с гантелями', 'Планка'])
    expect(missingPatterns(a, exercises)).toEqual([])
    expect(a.exercises[0]).toMatchObject({ sets: 3, repMin: 6, repMax: 10 })
    for (const d of p.days) expect(missingPatterns(d, exercises)).toEqual([])
  })

  it('программа этапа «сила» на 3-5 повторов в основных', () => {
    const p = programs.find((x) => x.phase === 'strength')!
    expect(p.days[0].exercises[0]).toMatchObject({ repMin: 3, repMax: 5 })
  })

  it('Предупреждение о пропущенном движении «жим»', () => {
    const a = programs[0].days[0]
    const noPush = { ...a, exercises: a.exercises.filter((e) => exercises.get(e.exerciseId)!.pattern !== 'push') }
    expect(missingPatterns(noPush, exercises)).toEqual(['push'])
  })
})

const s = (workoutId: number, date: string, exerciseId: number, weightKg: number, reps: number, rir: number, setIndex = 0): WorkoutSet =>
  ({ workoutId, date, exerciseId, weightKg, reps, rir, setIndex })

describe('журнал', () => {
  it('Запись подхода и показ прошлого результата', () => {
    const lp = idOf('Жим ногами')
    const sets = [s(1, '2026-10-11', lp, 70, 10, 3, 0), s(1, '2026-10-11', lp, 70, 10, 3, 1), s(2, '2026-10-14', lp, 72.5, 9, 2, 0)]
    expect(lastPerformance(sets, lp, '2026-10-14').map((x) => x.weightKg)).toEqual([70, 70])
    expect(lastPerformance(sets, lp, '2026-10-20')[0].weightKg).toBe(72.5)
  })
})

describe('прогрессия', () => {
  const row = idOf('Горизонтальная тяга блока')
  const pe = programs[0].days[0].exercises[1]

  it('Пора добавить: тяга 45 кг 3 × 10 с запасом 2 → 47.5', () => {
    const sets = [0, 1, 2].map((i) => s(1, '2026-10-11', row, 45, 10, 2, i))
    expect(progressionAdvice(sessionsOf(sets, row), pe, exercises.get(row)!)).toMatchObject({ kind: 'increase', weightKg: 47.5 })
  })

  it('мелкий шаг для жима', () => {
    const press = idOf('Жим в тренажёре сидя')
    const sets = [0, 1, 2].map((i) => s(1, '2026-10-11', press, 30, 10, 1, i))
    expect(progressionAdvice(sessionsOf(sets, press), pe, exercises.get(press)!)).toMatchObject({ kind: 'increase', weightKg: 31.25 })
  })

  it('Застой: три тренировки подряд меньше 6 повторов → −10%', () => {
    const press = idOf('Жим в тренажёре сидя')
    const sets = [1, 2, 3].map((w) => s(w, `2026-10-1${w}`, press, 40, 5, 0))
    expect(progressionAdvice(sessionsOf(sets, press), pe, exercises.get(press)!)).toMatchObject({ kind: 'decrease', weightKg: 36 })
  })

  it('Динамика силы: расчётный максимум по тренировкам', () => {
    const lp = idOf('Жим ногами')
    const h = strengthHistory([s(1, '2026-10-11', lp, 70, 10, 3), s(2, '2026-10-14', lp, 75, 8, 2)], lp)
    expect(h).toEqual([{ date: '2026-10-11', e1rm: 93.3 }, { date: '2026-10-14', e1rm: 95 }])
  })

  it('недельный индекс силы снижается при падении весов', () => {
    const lp = idOf('Жим ногами')
    const sets = [s(1, '2026-10-12', lp, 80, 8, 2), s(2, '2026-10-19', lp, 75, 8, 2), s(3, '2026-10-26', lp, 70, 8, 2)]
    const idx = weeklyStrengthIndex(sets, exercises, '2026-11-02')
    expect(idx).toHaveLength(3)
    expect(idx[0]).toBe(1)
    expect(idx[2]).toBeLessThan(idx[1])
  })
})

describe('разгрузка и облегчение', () => {
  it('Плановая разгрузка через 5 недель этапа «сила»', () => {
    expect(deloadDue('strength', [], '2027-02-01', '2027-03-08', 0)).toMatchObject({ due: true })
    expect(deloadDue('strength', [], '2027-02-01', '2027-02-20', 0).due).toBe(false)
    expect(deloadDue('weight', [], '2027-02-01', '2027-04-01', 0).due).toBe(false)
    expect(deloadDue('strength', [], '2027-02-01', '2027-02-20', 2).due).toBe(true)
    expect(deloadWeight(60)).toBe(39)
  })

  it('Короткая ночь: 5.5 ч → облегчённый вариант (−1 подход, запас ≥3)', () => {
    expect(needsLightSession(5.5)).toBe(true)
    expect(needsLightSession(7)).toBe(false)
    const light = lightDay(programs[0].days[0])
    expect(light.exercises[0]).toMatchObject({ sets: 2, targetRir: 3 })
  })
})
