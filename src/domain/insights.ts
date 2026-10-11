// Раздел «Связи» и недельный обзор (спецификация insights).
import { INSIGHT_MIN_OBS_PER_GROUP, INSIGHT_MIN_SPAN_DAYS, INSIGHT_SE_MULTIPLIER } from './constants'
import { cycleInfo, kitchenClosedOnTime } from './checkin'
import { addDays, diffDays } from './dates'
import { sleepHours } from './sleep'
import { bestE1rm } from './training'
import type { DayRecord, DiaryEntry, HHMM, ISODate, SleepNight, Workout, WorkoutSet } from './types'
import { trendOn, type WeightPoint } from './weight'

// ---------- Сравнение групп ----------

export interface Observation {
  date: ISODate
  value: number
}

export type Comparison =
  | { status: 'insufficient'; needA: number; needB: number; needDays: number; nA: number; nB: number }
  | { status: 'clear' | 'unclear'; meanA: number; meanB: number; diff: number; se: number; nA: number; nB: number }

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const variance = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
}

/**
 * Сравнивает группу A с группой B. Нужно ≥8 наблюдений в каждой и охват ≥21 дня.
 * «Явной связи не видно», если |разница| < 2 × стандартная ошибка разницы.
 */
export function compareGroups(a: Observation[], b: Observation[]): Comparison {
  const dates = [...a, ...b].map((o) => o.date).sort()
  const span = dates.length ? diffDays(dates[0], dates.at(-1)!) + 1 : 0
  const needA = Math.max(0, INSIGHT_MIN_OBS_PER_GROUP - a.length)
  const needB = Math.max(0, INSIGHT_MIN_OBS_PER_GROUP - b.length)
  const needDays = Math.max(0, INSIGHT_MIN_SPAN_DAYS - span)
  if (needA || needB || needDays) return { status: 'insufficient', needA, needB, needDays, nA: a.length, nB: b.length }
  const va = a.map((o) => o.value)
  const vb = b.map((o) => o.value)
  const diff = mean(va) - mean(vb)
  const se = Math.sqrt(variance(va) / va.length + variance(vb) / vb.length)
  return {
    status: Math.abs(diff) >= INSIGHT_SE_MULTIPLIER * se && diff !== 0 ? 'clear' : 'unclear',
    meanA: mean(va), meanB: mean(vb), diff, se, nA: a.length, nB: b.length,
  }
}

/** Деление по медиане для числовых пар: A — значения ≥ медианы, B — ниже. */
export function splitByMedian<T>(items: T[], key: (t: T) => number): { high: T[]; low: T[]; median: number } {
  const sorted = [...items].map(key).sort((x, y) => x - y)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  return { high: items.filter((t) => key(t) >= median), low: items.filter((t) => key(t) < median), median }
}

// ---------- Пять связей ----------

export interface InsightData {
  days: DayRecord[]
  diary: DiaryEntry[]
  sleep: SleepNight[]
  workouts: Workout[]
  sets: WorkoutSet[]
  kitchenTarget: HHMM
}

export interface InsightResult {
  id: 'salt-weight' | 'sleep-snack' | 'cycle' | 'carbs-strength' | 'kitchen-sleep'
  title: string
  groupA: string
  groupB: string
  unit: string
  /** Для «цикла» — несколько сравнений. */
  parts: { metric: string; comparison: Comparison; a: Observation[]; b: Observation[]; digits: number }[]
}

function weightsOf(days: DayRecord[]): WeightPoint[] {
  return days.filter((d) => d.weightKg !== undefined).map((d) => ({ date: d.date, kg: d.weightKg! }))
}

function sumByDate(diary: DiaryEntry[], pick: (e: DiaryEntry) => number, filter: (e: DiaryEntry) => boolean = () => true) {
  const m = new Map<ISODate, number>()
  for (const e of diary.filter(filter)) m.set(e.date, (m.get(e.date) ?? 0) + pick(e))
  return m
}

/** Индекс силы тренировки: среднее отношений e1RM к медиане этого упражнения. */
function workoutStrength(sets: WorkoutSet[]): Map<number, { date: ISODate; value: number }> {
  const byEx = new Map<number, number[]>()
  const perWorkoutEx = new Map<string, number>()
  for (const s of sets) {
    const k = `${s.workoutId}:${s.exerciseId}`
    perWorkoutEx.set(k, Math.max(perWorkoutEx.get(k) ?? 0, bestE1rm([s])))
  }
  for (const [k, v] of perWorkoutEx) {
    const ex = Number(k.split(':')[1])
    if (!byEx.has(ex)) byEx.set(ex, [])
    byEx.get(ex)!.push(v)
  }
  const median = new Map([...byEx].map(([ex, vs]) => [ex, [...vs].sort((a, b) => a - b)[Math.floor(vs.length / 2)]]))
  const out = new Map<number, { date: ISODate; ratios: number[] }>()
  for (const [k, v] of perWorkoutEx) {
    const [w, ex] = k.split(':').map(Number)
    const date = sets.find((s) => s.workoutId === w)!.date
    if (!out.has(w)) out.set(w, { date, ratios: [] })
    out.get(w)!.ratios.push(v / median.get(ex)!)
  }
  return new Map([...out].map(([w, x]) => [w, { date: x.date, value: mean(x.ratios) }]))
}

export function computeInsights(d: InsightData): InsightResult[] {
  const weights = weightsOf(d.days)
  const wByDate = new Map(weights.map((w) => [w.date, w.kg]))
  const dayByDate = new Map(d.days.map((x) => [x.date, x]))

  // 1. Солёный вечер → изменение веса на следующее утро.
  const saltA: Observation[] = []
  const saltB: Observation[] = []
  for (const day of d.days) {
    if (day.saltyEvening === undefined) continue
    const w0 = wByDate.get(day.date)
    const w1 = wByDate.get(addDays(day.date, 1))
    if (w0 === undefined || w1 === undefined) continue
    ;(day.saltyEvening ? saltA : saltB).push({ date: day.date, value: w1 - w0 })
  }

  // 2. Длительность сна → калории вечернего перекуса в тот же день.
  const eveningKcal = sumByDate(d.diary, (e) => e.comp.kcal?.v ?? 0, (e) => e.meal === 'evening')
  const daysWithFood = new Set(d.diary.map((e) => e.date))
  const sleepObs = d.sleep.filter((n) => daysWithFood.has(n.date)).map((n) => ({ n, h: sleepHours(n) }))
  const { high: longSleep, low: shortSleep } = splitByMedian(sleepObs, (x) => x.h)
  const snackOf = (x: { n: SleepNight }) => ({ date: x.n.date, value: eveningKcal.get(x.n.date) ?? 0 })

  // 3. Фаза цикла → вес (отклонение от тренда), сила, калории.
  const kcalByDate = sumByDate(d.diary, (e) => e.comp.kcal?.v ?? 0)
  const isLuteal = (date: ISODate) => cycleInfo(d.days, date)?.phase === 'luteal'
  const hasCycle = (date: ISODate) => cycleInfo(d.days, date) !== null
  const resid: { date: ISODate; value: number }[] = weights
    .map((w) => ({ date: w.date, t: trendOn(weights, w.date), kg: w.kg }))
    .filter((x) => x.t !== null && hasCycle(x.date)).map((x) => ({ date: x.date, value: x.kg - x.t! }))
  const strength = [...workoutStrength(d.sets).values()]
  const cycleStrength = strength.filter((s) => hasCycle(s.date))
  const cycleKcal = [...kcalByDate].filter(([date]) => hasCycle(date)).map(([date, value]) => ({ date, value }))
  const byPhase = (xs: Observation[]) => ({ a: xs.filter((x) => isLuteal(x.date)), b: xs.filter((x) => !isLuteal(x.date)) })

  // 4. Углеводы накануне → сила на тренировке.
  const carbsByDate = sumByDate(d.diary, (e) => e.comp.carbs?.v ?? 0)
  const carbObs = strength.filter((s) => carbsByDate.has(addDays(s.date, -1)))
    .map((s) => ({ ...s, carbs: carbsByDate.get(addDays(s.date, -1))! }))
  const { high: highCarb, low: lowCarb } = splitByMedian(carbObs, (x) => x.carbs)

  // 5. «Кухня закрыта» вовремя → качество сна в ту же ночь (подъём на следующий день).
  const kitchenA: Observation[] = []
  const kitchenB: Observation[] = []
  for (const n of d.sleep) {
    const evening = dayByDate.get(addDays(n.date, -1))
    if (!evening?.kitchenClosedAt) continue
    ;(kitchenClosedOnTime(evening.kitchenClosedAt, d.kitchenTarget) ? kitchenA : kitchenB).push({ date: n.date, value: n.quality })
  }

  const part = (metric: string, a: Observation[], b: Observation[], digits: number) => ({ metric, a, b, digits, comparison: compareGroups(a, b) })
  const w3 = byPhase(resid)
  const s3 = byPhase(cycleStrength)
  const k3 = byPhase(cycleKcal)
  return [
    { id: 'salt-weight', title: 'Солёный вечер → вес утром', groupA: 'после солёных вечеров', groupB: 'после обычных', unit: 'кг',
      parts: [part('изменение веса за ночь', saltA, saltB, 2)] },
    { id: 'sleep-snack', title: 'Сон → вечерний перекус', groupA: 'короткий сон', groupB: 'долгий сон', unit: 'ккал',
      parts: [part('калории вечернего перекуса', shortSleep.map(snackOf), longSleep.map(snackOf), 0)] },
    { id: 'cycle', title: 'Фаза цикла → вес, сила, аппетит', groupA: 'лютеиновая фаза', groupB: 'остальные дни', unit: '',
      parts: [part('вес относительно тренда, кг', w3.a, w3.b, 2), part('индекс силы', s3.a, s3.b, 3), part('калории дня', k3.a, k3.b, 0)] },
    { id: 'carbs-strength', title: 'Углеводы накануне → сила', groupA: 'много углеводов накануне', groupB: 'мало углеводов накануне', unit: '',
      parts: [part('индекс силы', highCarb, lowCarb, 3)] },
    { id: 'kitchen-sleep', title: '«Кухня закрыта» → качество сна', groupA: 'кухня закрыта вовремя', groupB: 'поздняя еда', unit: 'из 5',
      parts: [part('качество сна', kitchenA, kitchenB, 1)] },
  ]
}

/** Описательная формулировка без утверждения причины. */
export function describeComparison(r: InsightResult, p: InsightResult['parts'][number]): string {
  const c = p.comparison
  if (c.status === 'insufficient') {
    const need: string[] = []
    if (c.needA) need.push(`ещё ${c.needA} наблюдений «${r.groupA}»`)
    if (c.needB) need.push(`ещё ${c.needB} наблюдений «${r.groupB}»`)
    if (c.needDays) need.push(`ещё ${c.needDays} дн. данных`)
    return `Недостаточно данных: нужно ${need.join(', ')}`
  }
  if (c.status === 'unclear') return 'Явной связи не видно'
  const fmt = (v: number) => Math.abs(v).toFixed(p.digits).replace('.', ',')
  const unit = r.unit ? ` ${r.unit}` : ''
  return `${r.groupA[0].toUpperCase()}${r.groupA.slice(1)}: ${p.metric} в среднем на ${fmt(c.diff)}${unit} ${c.diff > 0 ? 'выше' : 'ниже'}, чем ${r.groupB}`
}

// ---------- Недельный обзор ----------

export interface WeeklyReviewInput {
  weekStart: ISODate
  weights: WeightPoint[]
  intake: { date: ISODate; kcal: number; protein: number; fiber: number }[]
  targets: { kcal: number; protein: number; fiberMin: number; fiberMax: number }
  workouts: Workout[]
  strengthChange: { name: string; fromKg: number; toKg: number }[]
  wakeInTolerance: number
  nights: number
  kitchenOnTime: number
  kitchenDays: number
}

export interface WeeklyReview {
  weekStart: ISODate
  weekEnd: ISODate
  trendChangeKg: number | null
  avgKcal: number | null
  avgProtein: number | null
  avgFiber: number | null
  targets: WeeklyReviewInput['targets']
  strengthPlanned: number
  strengthDone: number
  gamesPlanned: number
  gamesDone: number
  strengthChange: WeeklyReviewInput['strengthChange']
  wakeInTolerance: number
  nights: number
  kitchenOnTime: number
  kitchenDays: number
}

export function weeklyReview(i: WeeklyReviewInput): WeeklyReview {
  const end = addDays(i.weekStart, 6)
  const t0 = trendOn(i.weights, addDays(i.weekStart, -1))
  const t1 = trendOn(i.weights, end)
  const days = i.intake.filter((x) => x.date >= i.weekStart && x.date <= end)
  const avg = (f: (x: (typeof days)[number]) => number) => (days.length ? mean(days.map(f)) : null)
  const inWeek = i.workouts.filter((w) => w.date >= i.weekStart && w.date <= end)
  const count = (kind: Workout['kind'], pred: (w: Workout) => boolean) => inWeek.filter((w) => w.kind === kind && pred(w)).length
  return {
    weekStart: i.weekStart, weekEnd: end,
    trendChangeKg: t0 !== null && t1 !== null ? t1 - t0 : null,
    avgKcal: avg((x) => x.kcal), avgProtein: avg((x) => x.protein), avgFiber: avg((x) => x.fiber),
    targets: i.targets,
    strengthPlanned: count('strength', (w) => w.planned), strengthDone: count('strength', (w) => w.done),
    gamesPlanned: count('game', (w) => w.planned), gamesDone: count('game', (w) => w.done),
    strengthChange: i.strengthChange,
    wakeInTolerance: i.wakeInTolerance, nights: i.nights, kitchenOnTime: i.kitchenOnTime, kitchenDays: i.kitchenDays,
  }
}

export function reviewSummary(r: WeeklyReview): string {
  const parts: string[] = []
  if (r.trendChangeKg !== null) parts.push(`тренд ${r.trendChangeKg > 0 ? '+' : r.trendChangeKg < 0 ? '−' : ''}${Math.abs(r.trendChangeKg).toFixed(1).replace('.', ',')} кг`)
  if (r.avgProtein !== null) parts.push(`белок ${Math.round(r.avgProtein)} г из ${r.targets.protein}`)
  if (r.avgFiber !== null) parts.push(`клетчатка ${Math.round(r.avgFiber)} г из ${r.targets.fiberMin}-${r.targets.fiberMax}`)
  parts.push(`тренировки ${r.strengthDone} из ${r.strengthPlanned}`)
  if (r.gamesPlanned || r.gamesDone) parts.push(`игры ${r.gamesDone} из ${r.gamesPlanned}`)
  if (r.nights) parts.push(`подъём в режиме ${r.wakeInTolerance} из ${r.nights}`)
  return parts.join('; ')
}
