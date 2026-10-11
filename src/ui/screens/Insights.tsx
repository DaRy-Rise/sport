import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { kitchenCloseTarget, kitchenClosedOnTime } from '../../domain/checkin'
import { dayPlan } from '../../domain/day'
import { addDays, dateRange, formatDate, today, weekStart } from '../../domain/dates'
import { entriesTotals } from '../../domain/diary'
import { computeInsights, describeComparison, reviewSummary, weeklyReview, type InsightResult } from '../../domain/insights'
import { wakeStability } from '../../domain/sleep'
import { SUGGESTION_TITLE } from '../../domain/suggestions'
import type { Suggestion } from '../../domain/types'
import { Card, fmt } from '../components'
import { acceptSuggestion, postponeSuggestion } from '../actions'
import { db, useCore, usePlan } from '../data'

/** Две горизонтальные полосы средних; при отрицательных значениях — от общей нулевой линии. */
function GroupBars({ rows, digits }: { rows: { label: string; value: number; n: number }[]; digits: number }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9)
  const hasNeg = rows.some((r) => r.value < 0)
  return (
    <div className="stack" style={{ gap: '0.35rem', margin: '0.4rem 0' }} role="img" aria-label="Средние по группам">
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * (hasNeg ? 50 : 100)
        const left = hasNeg ? (r.value < 0 ? 50 - w : 50) : 0
        return (
          <div key={r.label} className="row" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
            <span className="small" style={{ width: '42%' }}>{r.label} <span className="muted">n={r.n}</span></span>
            <div style={{ position: 'relative', flex: 1, height: 14, background: 'var(--surface-2)', borderRadius: 4 }}>
              {hasNeg && <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--muted)' }} />}
              <div style={{ position: 'absolute', left: `${left}%`, width: `${Math.max(w, 0.8)}%`, top: 0, bottom: 0, background: 'var(--accent)', borderRadius: 4 }} />
            </div>
            <span className="small nowrap" style={{ width: '4.5rem', textAlign: 'right' }}>{fmt(r.value, digits)}</span>
          </div>
        )
      })}
    </div>
  )
}

function InsightCard({ r }: { r: InsightResult }) {
  return (
    <Card title={r.title}>
      {r.parts.map((p) => {
        const c = p.comparison
        return (
          <div key={p.metric} style={{ marginBottom: '0.8rem' }}>
            {r.parts.length > 1 && <h3>{p.metric}</h3>}
            <p className={c.status === 'clear' ? '' : 'muted'}>{describeComparison(r, p)}</p>
            {c.status !== 'insufficient' && (
              <>
                <p className="small muted">
                  {r.groupA}: {fmt(c.meanA, p.digits)} (n={c.nA}) · {r.groupB}: {fmt(c.meanB, p.digits)} (n={c.nB}) · разница {fmt(c.diff, p.digits)} ± {fmt(2 * c.se, p.digits)}
                </p>
                <GroupBars digits={p.digits} rows={[{ label: r.groupA, value: c.meanA, n: c.nA }, { label: r.groupB, value: c.meanB, n: c.nB }]} />
              </>
            )}
            {c.status === 'insufficient' && <p className="small muted">Сейчас: {r.groupA} — {c.nA}, {r.groupB} — {c.nB}.</p>}
          </div>
        )
      })}
    </Card>
  )
}

function SuggestionItem({ s, avgKcal, tdee }: { s: Suggestion; avgKcal: number; tdee: number }) {
  const [asking, setAsking] = useState(false)
  const [msg, setMsg] = useState('')
  const needsQuestion = s.kind === 'kcal-down' && !!s.payload?.askCompleteness
  return (
    <div className="item">
      <div className="row spread">
        <span><b>{SUGGESTION_TITLE[s.kind]}</b> {s.status === 'postponed' && <span className="badge">отложено</span>}</span>
        <span className="muted small">{formatDate(s.createdAt)}</span>
      </div>
      <p className="small muted">Причина: {s.reason}</p>
      {asking ? (
        <div className="note row spread">
          <span>Записи последние 2 недели велись полностью?</span>
          <span className="row">
            <button className="btn small primary" onClick={() => acceptSuggestion(db, s, { avgKcal, tdee })}>Да — снизить калории</button>
            <button className="btn small" onClick={async () => { await postponeSuggestion(db, s); setMsg('Сначала стоит записывать всё — проверим снова через неделю.') }}>Нет</button>
          </span>
        </div>
      ) : (
        <div className="row">
          <button className="btn small primary" onClick={() => (needsQuestion ? setAsking(true) : acceptSuggestion(db, s, { avgKcal, tdee }))}>Принять</button>
          <button className="btn small" onClick={() => postponeSuggestion(db, s)}>Отложить</button>
        </div>
      )}
      {msg && <p className="small">{msg}</p>}
    </div>
  )
}

export function InsightsScreen() {
  const core = useCore()
  const plan = usePlan(core, today())
  const sleep = useLiveQuery(() => db.sleep.toArray(), [])
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const suggestions = useLiveQuery(() => db.suggestions.filter((s) => s.status !== 'accepted').toArray(), [])
  const [weekOffset, setWeekOffset] = useState(1)

  const insights = useMemo(() => {
    if (!core?.current || !sleep || !sets) return null
    return computeInsights({
      days: core.days, diary: core.diary, sleep, workouts: core.workouts, sets, kitchenTarget: kitchenCloseTarget(core.current),
    })
  }, [core, sleep, sets])

  const review = useMemo(() => {
    if (!core?.current || !sleep || !sets || !exercises) return null
    const start = addDays(weekStart(today()), -7 * weekOffset)
    const end = addDays(start, 6)
    const dates = dateRange(start, end)
    const intake = dates.filter((d) => core.byDate.has(d)).map((d) => {
      const t = entriesTotals(core.byDate.get(d)!)
      return { date: d, kcal: t.kcal.v, protein: t.protein.v, fiber: t.fiber.v }
    })
    const plans = dates.map((d) => dayPlan(core.ctx, d)).filter((p) => p !== undefined)
    const avg = (f: (p: (typeof plans)[number]) => number) => Math.round(plans.reduce((s, p) => s + f(p), 0) / Math.max(1, plans.length))
    const exName = new Map(exercises.map((e) => [e.id!, e.name]))
    const maxIn = (from: string, to: string, ex: number) => Math.max(0, ...sets.filter((s) => s.exerciseId === ex && s.date >= from && s.date <= to).map((s) => s.weightKg))
    const exInWeek = [...new Set(sets.filter((s) => s.date >= start && s.date <= end).map((s) => s.exerciseId))]
    const strengthChange = exInWeek
      .map((ex) => ({ name: exName.get(ex) ?? '?', fromKg: maxIn(addDays(start, -7), addDays(start, -1), ex), toKg: maxIn(start, end, ex) }))
      .filter((x) => x.fromKg > 0)
    const st = wakeStability(sleep, core.current.targetWake, end, 7)
    const target = kitchenCloseTarget(core.current)
    const kitchenDays = core.days.filter((d) => d.date >= start && d.date <= end && d.kitchenClosedAt)
    return weeklyReview({
      weekStart: start, weights: core.weights, intake,
      targets: { kcal: avg((p) => p.macros.kcal), protein: avg((p) => p.macros.protein), fiberMin: 25, fiberMax: 30 },
      workouts: core.workouts, strengthChange,
      wakeInTolerance: st.withinTolerance, nights: st.nights,
      kitchenOnTime: kitchenDays.filter((d) => kitchenClosedOnTime(d.kitchenClosedAt!, target)).length, kitchenDays: kitchenDays.length,
    })
  }, [core, sleep, sets, exercises, weekOffset])

  if (!core || !plan || !insights || !review || !suggestions) return <p className="muted">Загрузка…</p>
  const visible = suggestions.filter((s) => s.status === 'open' || addDays(s.createdAt, 7) <= today())

  return (
    <div>
      <h1>Обзор</h1>
      <Card title="Предложения">
        {visible.length ? (
          <div className="list">{visible.map((s) => <SuggestionItem key={s.id} s={s} avgKcal={plan.avgKcal} tdee={plan.tdee} />)}</div>
        ) : <p className="muted">Сейчас предложений нет.</p>}
      </Card>
      <Card title={`Обзор недели: ${formatDate(review.weekStart)} — ${formatDate(review.weekEnd)}`} actions={
        <>
          <button className="btn small icon-only" onClick={() => setWeekOffset(weekOffset + 1)} aria-label="Раньше">‹</button>
          <button className="btn small icon-only" disabled={weekOffset <= 0} onClick={() => setWeekOffset(weekOffset - 1)} aria-label="Позже">›</button>
        </>
      }>
        <p><b>{reviewSummary(review)}</b></p>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><td>Тренд веса за неделю</td><td className="num">{review.trendChangeKg !== null ? `${review.trendChangeKg > 0 ? '+' : ''}${fmt(review.trendChangeKg, 1)} кг` : 'мало данных'}</td></tr>
              <tr><td>Калории (среднее)</td><td className="num">{fmt(review.avgKcal)} из {review.targets.kcal}</td></tr>
              <tr><td>Белок (среднее)</td><td className="num">{fmt(review.avgProtein)} г из {review.targets.protein}</td></tr>
              <tr><td>Клетчатка (среднее)</td><td className="num">{fmt(review.avgFiber)} г из 25-30</td></tr>
              <tr><td>Силовые: план / факт</td><td className="num">{review.strengthPlanned} / {review.strengthDone}</td></tr>
              <tr><td>Игры: план / факт</td><td className="num">{review.gamesPlanned} / {review.gamesDone}</td></tr>
              <tr><td>Подъём в режиме</td><td className="num">{review.wakeInTolerance} из {review.nights}</td></tr>
              <tr><td>«Кухня закрыта» вовремя</td><td className="num">{review.kitchenOnTime} из {review.kitchenDays}</td></tr>
            </tbody>
          </table>
        </div>
        {review.strengthChange.length > 0 && (
          <p className="small" style={{ marginTop: '0.5rem' }}>Сила: {review.strengthChange.map((s) => `${s.name} ${fmt(s.fromKg, 1)} → ${fmt(s.toKg, 1)} кг`).join(' · ')}</p>
        )}
      </Card>
      <h2>Связи в ваших данных</h2>
      <p className="muted small">Сравниваются средние двух групп дней. Связь показывается, только когда в каждой группе ≥8 наблюдений и данные охватывают ≥21 день. Это описание ваших данных, а не доказательство причины.</p>
      <div className="grid two">
        {insights.map((r) => <InsightCard key={r.id} r={r} />)}
      </div>
    </div>
  )
}
