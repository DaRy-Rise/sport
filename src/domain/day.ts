// Тип дня и нормы на конкретную дату (связывает профиль, этапы, тренировки).
import { ageOn } from './dates'
import { inCalibration, phaseOn, profileOn, transitionKcal } from './phases'
import { dailyNorms, dayTargets, formulaTdee, phaseTargetKcal, type DailyNorms, type MacroTargets } from './targets'
import type { DayRecord, DayType, ISODate, Phase, Profile, Workout } from './types'

/** День «нагрузка», если на него запланирована или записана силовая или игра. */
export function determineDayType(date: ISODate, workouts: Workout[], record?: DayRecord): { type: DayType; manual: boolean } {
  if (record?.dayTypeOverride) return { type: record.dayTypeOverride, manual: true }
  const load = workouts.some((w) => w.date === date && (w.kind === 'strength' || w.kind === 'game'))
  return { type: load ? 'load' : 'rest', manual: false }
}

export interface DayContext {
  profiles: Profile[]
  phases: Phase[]
  workouts: Workout[]
  days: Map<ISODate, DayRecord>
  /** Реальный расход по данным, если уже рассчитан. */
  realTdee?: number
}

export interface DayPlan {
  date: ISODate
  profile: Profile
  phase?: Phase
  dayType: DayType
  dayTypeManual: boolean
  calibration: boolean
  tdee: number
  tdeeSource: 'formula' | 'data'
  avgKcal: number
  macros: MacroTargets
  norms: DailyNorms
}

export function dayPlan(ctx: DayContext, date: ISODate): DayPlan | undefined {
  const profile = profileOn(ctx.profiles, date)
  if (!profile) return undefined
  const phase = phaseOn(ctx.phases, date)
  const formula = formulaTdee(profile, date)
  const tdee = ctx.realTdee ?? formula.tdee
  const kind = phase?.kind ?? 'weight'
  const phaseKcal = phase?.kind === 'transition' && phase.targetKcal !== undefined
    ? transitionKcal(phase.targetKcal, phase.startDate, date)
    : phase?.targetKcal
  const avgKcal = phaseTargetKcal(kind, tdee, phaseKcal) + (kind === 'weight' ? phase?.kcalAdjust ?? 0 : 0)
  const { type, manual } = determineDayType(date, ctx.workouts, ctx.days.get(date))
  const macros = dayTargets({ avgKcal, weightKg: profile.weightKg, loadDays: profile.plannedLoadDays })[type]
  return {
    date, profile, phase, dayType: type, dayTypeManual: manual,
    calibration: inCalibration(profile, date),
    tdee, tdeeSource: ctx.realTdee !== undefined ? 'data' : 'formula',
    avgKcal, macros,
    norms: dailyNorms(profile.sex, ageOn(profile.birthDate, date), macros, profile.nutrientOverrides),
  }
}

export const DAY_TYPE_LABEL: Record<DayType, string> = { load: 'Нагрузка', rest: 'Отдых' }
