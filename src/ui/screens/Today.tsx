import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getAdaptation, patchDay, setWeight } from '../../db/days'
import { CYCLE_PHASE_LABEL, LUTEAL_WATER_NOTE, cycleInfo, kitchenCloseTarget, kitchenClosedOnTime } from '../../domain/checkin'
import { DAY_TYPE_LABEL } from '../../domain/day'
import { addDays, formatDate, today } from '../../domain/dates'
import { entriesTotals, eveningBudget } from '../../domain/diary'
import { CALIBRATION_NOTE, PHASE_LABEL, TRANSITION_WATER_NOTE, calibrationEnd } from '../../domain/phases'
import { formatDuration, sleepHours, sleepMinutes } from '../../domain/sleep'
import { GAME_LABEL, needsLightSession } from '../../domain/training'
import type { AdaptationState, DayType } from '../../domain/types'
import { trendOn } from '../../domain/weight'
import { Bar, Card, DateNav, Field, NumberInput, Segmented, TriState, fmt } from '../components'
import { db, useCore, useDateParam, usePlan } from '../data'
import { refreshSuggestions } from '../suggest'
import { AdaptationTipsCard } from './Sleep'

function MacroRow({ label, value, target, unit, min }: { label: string; value: number; target: number; unit: string; min?: boolean }) {
  const pct = target ? value / target : 0
  return (
    <div className="row" style={{ gap: '0.6rem' }}>
      <span style={{ width: 90 }}>{label}</span>
      <div style={{ flex: 1 }}><Bar pct={pct} status={pct > 1.1 && !min ? 'over' : 'ok'} /></div>
      <span className="small nowrap" style={{ width: 130, textAlign: 'right' }}>{fmt(value)} / {min ? '≥' : ''}{target} {unit}</span>
    </div>
  )
}

export function TodayScreen() {
  const [date, setDate] = useDateParam()
  const core = useCore()
  const plan = usePlan(core, date)
  const night = useLiveQuery(() => db.sleep.get(date), [date])
  const openSuggestions = useLiveQuery(() => db.suggestions.where('status').equals('open').count(), [])
  const [adaptation, setA] = useState<AdaptationState | undefined>()
  const todayPlan = usePlan(core, today())

  useEffect(() => { getAdaptation(db).then(setA) }, [])
  useEffect(() => {
    if (core && todayPlan) refreshSuggestions(db, core, todayPlan).catch((e) => console.warn(e))
  }, [core, todayPlan])

  if (!core || !plan) return <p className="muted">Загрузка…</p>
  const rec = core.dayMap.get(date)
  const entries = core.byDate.get(date) ?? []
  const totals = entriesTotals(entries)
  const budget = eveningBudget(plan.dayType, entries)
  const trend = trendOn(core.weights, date)
  const prevTrend = trendOn(core.weights, addDays(date, -7))
  const cycle = cycleInfo(core.days, date)
  const kitchenTarget = kitchenCloseTarget(plan.profile)
  const workouts = core.workouts.filter((w) => w.date === date)
  const hours = night ? sleepHours(night) : null
  const phase = plan.phase
  const patch = (p: Parameters<typeof patchDay>[2]) => patchDay(db, date, p)
  const overrideValue: 'auto' | DayType = rec?.dayTypeOverride ?? 'auto'

  return (
    <div>
      <div className="row spread">
        <h1>{date === today() ? 'Сегодня' : formatDate(date, true)}</h1>
        <DateNav date={date} onChange={setDate} addDays={addDays} label={formatDate(date, true)} />
      </div>
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        {phase && <span className="badge accent">Этап: {PHASE_LABEL[phase.kind]}</span>}
        <span className="badge">{DAY_TYPE_LABEL[plan.dayType]}{plan.dayTypeManual ? ' (вручную)' : ''}</span>
        {!!openSuggestions && <Link className="badge warn" to="/insights">Предложений: {openSuggestions}</Link>}
      </div>
      {plan.calibration && <div className="note accent">Идёт {CALIBRATION_NOTE} (до {formatDate(calibrationEnd(plan.profile))}). Быстрый спад веса в эти дни — нормально.</div>}
      {phase?.kind === 'transition' && date < addDays(phase.startDate, 7) && <div className="note accent">{TRANSITION_WATER_NOTE}</div>}
      {adaptation?.active && date === today() && <AdaptationTipsCard adaptation={adaptation} targetWake={plan.profile.targetWake} durationH={plan.profile.sleepDurationH} />}

      <div className="grid two">
        <Card title="Отметки дня">
          <div className="stack">
            <div className="row">
              <Field label="Вес утром, кг">
                <NumberInput value={rec?.weightKg} onChange={(v) => setWeight(db, date, v)} placeholder="не заполнено" />
              </Field>
              <div className="small">
                <div>Тренд (7 дней): <b>{trend !== null ? `${fmt(trend, 1)} кг` : 'мало данных'}</b></div>
                {trend !== null && prevTrend !== null && <div className="muted">за неделю {trend - prevTrend > 0 ? '+' : ''}{fmt(trend - prevTrend, 1)} кг</div>}
              </div>
            </div>
            {cycle?.phase === 'luteal' && <div className="note small">{LUTEAL_WATER_NOTE}</div>}
            <div className="row spread">
              <span>Сон прошлой ночью</span>
              {night ? (
                <span className="small">{night.bedtime} → {night.wake}, {formatDuration(sleepMinutes(night.bedtime, night.wake))}, качество {night.quality} {night.adaptation && <span className="badge">адаптация</span>}</span>
              ) : <Link className="small" to="/sleep">не заполнено — записать</Link>}
            </div>
            <div className="row spread">
              <span>Тип дня</span>
              <Segmented value={overrideValue} onChange={(v) => patch({ dayTypeOverride: v === 'auto' ? undefined : v })}
                options={[{ value: 'auto', label: 'авто' }, { value: 'load', label: 'нагрузка' }, { value: 'rest', label: 'отдых' }]} />
            </div>
            <div className="row spread"><span>Солёный день</span><TriState value={rec?.saltyDay} onChange={(v) => patch({ saltyDay: v })} /></div>
            <div className="row spread"><span>Солёный вечер</span><TriState value={rec?.saltyEvening} onChange={(v) => patch({ saltyEvening: v })} /></div>
            <div className="row spread">
              <span>Кухня закрыта в <span className="muted small">(цель {kitchenTarget})</span></span>
              <span className="row">
                <input type="time" value={rec?.kitchenClosedAt ?? ''} onChange={(e) => patch({ kitchenClosedAt: e.target.value || undefined })} />
                {rec?.kitchenClosedAt && (kitchenClosedOnTime(rec.kitchenClosedAt, kitchenTarget)
                  ? <span className="badge accent">вовремя</span> : <span className="badge warn">позже цели</span>)}
                {!rec?.kitchenClosedAt && <span className="muted small">не заполнено</span>}
              </span>
            </div>
            <div className="row spread"><span>Первый день менструации</span><TriState value={rec?.periodStart} onChange={(v) => patch({ periodStart: v })} /></div>
            <div className="row spread"><span>Сбой цикла (задержка, пропуск)</span><TriState value={rec?.cycleIssue} onChange={(v) => patch({ cycleIssue: v })} /></div>
            {cycle && <p className="small muted">День цикла {cycle.day} из ~{cycle.avgLength}{cycle.measured ? '' : ' (по умолчанию)'} · {CYCLE_PHASE_LABEL[cycle.phase]}</p>}
          </div>
        </Card>

        <div>
          <Card title="Питание" actions={<Link className="btn small" to={`/diary?d=${date}`}>Дневник</Link>}>
            <div className="stack">
              <MacroRow label="Калории" value={totals.kcal.v} target={plan.macros.kcal} unit="ккал" />
              <MacroRow label="Белок" value={totals.protein.v} target={plan.macros.protein} unit="г" />
              <MacroRow label="Жиры" value={totals.fat.v} target={plan.macros.fat} unit="г" min />
              <MacroRow label="Углеводы" value={totals.carbs.v} target={plan.macros.carbs} unit="г" />
              <MacroRow label="Клетчатка" value={totals.fiber.v} target={25} unit="г" min />
            </div>
            <p className="small" style={{ marginTop: '0.6rem' }}>
              Вечерний перекус: бюджет {budget.budget} ккал, {budget.over ? <span className="badge warn">сверх на {fmt(budget.over)}</span> : <>осталось {fmt(budget.remaining)}</>}
            </p>
            <p className="muted small">Расход {fmt(plan.tdee)} ккал ({plan.tdeeSource === 'data' ? 'по данным' : 'по формуле'}), средняя цель {fmt(plan.avgKcal)} ккал.</p>
          </Card>
          <Card title="Тренировка" actions={<Link className="btn small" to={`/training?d=${date}`}>Неделя</Link>}>
            {workouts.length ? (
              <div className="list">
                {workouts.map((w) => (
                  <div key={w.id} className="item row spread">
                    {w.kind === 'strength' ? <Link to={`/training/w/${w.id}`}>Силовая {w.programDayKey ?? ''}</Link> : <span>{GAME_LABEL[w.gameType ?? 'other']}</span>}
                    <span className="small muted">{w.done ? 'сделано' : 'план'}</span>
                  </div>
                ))}
              </div>
            ) : <p className="muted">Ничего не запланировано — день отдыха.</p>}
            {needsLightSession(hours) && workouts.some((w) => w.kind === 'strength') && (
              <div className="note warn small" style={{ marginTop: '0.6rem' }}>Сон был {fmt(hours, 1)} ч — тренировку стоит облегчить (предложу при открытии).</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
