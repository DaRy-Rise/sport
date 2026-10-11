import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, dateRange, formatDate, today, weekStart, weekdayShort } from '../../domain/dates'
import { activePhase } from '../../domain/phases'
import { sleepHours } from '../../domain/sleep'
import {
  GAME_LABEL, PATTERN_LABEL, deloadDay, deloadWeight, lastPerformance, lightDay, missingPatterns, needsLightSession,
  progressionAdvice, sessionsOf, strengthHistory,
} from '../../domain/training'
import type { Exercise, GameType, MovementPattern, Program, ProgramDay, ProgramExercise, Workout, WorkoutSet } from '../../domain/types'
import { Card, ConfirmButton, Field, NumberInput, fmt } from '../components'
import { deloadActive } from '../actions'
import { db, useDateParam } from '../data'

function useTrainingData() {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const programs = useLiveQuery(() => db.programs.toArray(), [])
  const phases = useLiveQuery(() => db.phases.toArray(), [])
  const exMap = new Map((exercises ?? []).map((e) => [e.id!, e]))
  const phase = phases ? activePhase(phases) : undefined
  const programPhase = phase?.kind === 'strength' ? 'strength' : 'weight'
  const program = programs?.find((p) => p.phase === programPhase)
  return { exercises, exMap, programs, program, ready: !!(exercises && programs && phases) }
}

// ---------- Неделя ----------

function GameForm({ w }: { w: Workout }) {
  return (
    <div className="stack small">
      <select value={w.gameType ?? 'volleyball'} onChange={(e) => db.workouts.update(w.id!, { gameType: e.target.value as GameType })}>
        {(Object.keys(GAME_LABEL) as GameType[]).map((g) => <option key={g} value={g}>{GAME_LABEL[g]}</option>)}
      </select>
      <div className="row">
        <NumberInput className="short" value={w.durationMin} placeholder="мин" onChange={(v) => db.workouts.update(w.id!, { durationMin: v })} />
        <NumberInput className="short" value={w.rpe} placeholder="1-10" onChange={(v) => db.workouts.update(w.id!, { rpe: v })} />
      </div>
      <span className="muted">минуты · нагрузка 1-10</span>
    </div>
  )
}

function WeekView() {
  const [date, setDate] = useDateParam()
  const { program, ready } = useTrainingData()
  const start = weekStart(date)
  const days = dateRange(start, addDays(start, 6))
  const workouts = useLiveQuery(() => db.workouts.where('date').between(start, addDays(start, 6), true, true).toArray(), [start])
  const navigate = useNavigate()
  if (!ready || !workouts) return <p className="muted">Загрузка…</p>

  async function addStrength(d: string, key: string) {
    const id = await db.workouts.add({ date: d, kind: 'strength', planned: d >= today(), done: d < today(), programId: program?.id, programDayKey: key })
    if (d <= today()) navigate(`/training/w/${id}`)
  }
  async function addGame(d: string) {
    await db.workouts.add({ date: d, kind: 'game', planned: d >= today(), done: d < today(), gameType: 'volleyball' })
  }

  return (
    <div>
      <div className="row spread">
        <h1>Тренировки</h1>
        <div className="row">
          <button className="btn small" onClick={() => setDate(addDays(start, -7))}>← неделя</button>
          <span>{formatDate(start)} — {formatDate(addDays(start, 6))}</span>
          <button className="btn small" onClick={() => setDate(addDays(start, 7))}>неделя →</button>
          <Link className="btn small" to="/training/programs">Программы и упражнения</Link>
        </div>
      </div>
      <p className="muted small">Дни с силовой или игрой автоматически становятся днями нагрузки — нормы питания пересчитываются.</p>
      <div className="week">
        {days.map((d) => {
          const ws = workouts.filter((w) => w.date === d)
          const load = ws.some((w) => w.kind !== 'rest')
          return (
            <div key={d} className={`day ${d === today() ? 'today' : ''} ${load ? 'load' : ''}`}>
              <div className="row spread"><b>{weekdayShort(d)}</b><span className="muted small">{formatDate(d)}</span></div>
              <div className="small muted">{load ? 'нагрузка' : 'отдых'}</div>
              <div className="stack" style={{ marginTop: '0.4rem' }}>
                {ws.map((w) => (
                  <div key={w.id} className="card" style={{ padding: '0.45rem', marginBottom: 0 }}>
                    <div className="row spread">
                      {w.kind === 'strength' ? (
                        <Link to={`/training/w/${w.id}`}>Силовая {w.programDayKey ?? ''}</Link>
                      ) : <span>{GAME_LABEL[w.gameType ?? 'other']}</span>}
                      <ConfirmButton label="✕" confirmLabel="удалить?" onConfirm={async () => { await db.sets.where('workoutId').equals(w.id!).delete(); await db.workouts.delete(w.id!) }} />
                    </div>
                    <label className="row small"><input type="checkbox" checked={w.done} onChange={(e) => db.workouts.update(w.id!, { done: e.target.checked })} /> {w.done ? 'сделано' : w.planned ? 'план' : 'не сделано'}</label>
                    {w.kind === 'game' && <GameForm w={w} />}
                  </div>
                ))}
                <div className="row" style={{ gap: '0.25rem' }}>
                  {(program?.days ?? []).map((pd) => <button key={pd.key} className="btn small" onClick={() => addStrength(d, pd.key)}>+ {pd.key}</button>)}
                  <button className="btn small" onClick={() => addGame(d)}>+ игра</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Журнал тренировки ----------

function ExerciseLog({ w, pe, ex, allSets, sets, deload }: {
  w: Workout; pe: ProgramExercise; ex: Exercise; allSets: WorkoutSet[]; sets: WorkoutSet[]; deload: boolean
}) {
  const prev = lastPerformance(allSets, ex.id!, w.date)
  const history = sessionsOf(allSets.filter((s) => s.date < w.date), ex.id!)
  const advice = progressionAdvice(history, pe, ex)
  const suggested = advice.kind === 'none' ? undefined : deload ? deloadWeight(advice.weightKg) : advice.weightKg
  const [weight, setWeight] = useState<number | undefined>(suggested)
  const [reps, setReps] = useState<number | undefined>(pe.repMax)
  const [rir, setRir] = useState<number | undefined>(pe.targetRir)
  useEffect(() => setWeight((cur) => cur ?? suggested), [suggested])

  async function addSet() {
    if (weight === undefined || !reps) return
    await db.sets.add({ workoutId: w.id!, date: w.date, exerciseId: ex.id!, setIndex: sets.length, weightKg: weight, reps, rir: rir ?? 0 })
  }

  return (
    <div className="item">
      <div className="row spread">
        <span><b>{ex.name}</b> <span className="muted small">{pe.sets} × {pe.repMin === pe.repMax ? pe.repMin : `${pe.repMin}-${pe.repMax}`}, запас {pe.targetRir}</span></span>
        <Link className="small" to={`/training/ex/${ex.id}`}>график</Link>
      </div>
      <div className="small muted">
        Прошлый раз: {prev.length ? prev.map((s) => `${fmt(s.weightKg, 1)}×${s.reps}`).join(', ') + ` (${formatDate(prev[0].date)})` : 'нет данных'}
      </div>
      {advice.kind === 'increase' && <div className="small"><span className="badge accent">добавить вес → {fmt(deload ? deloadWeight(advice.weightKg) : advice.weightKg, 2)} кг</span> <span className="muted">{advice.reason}</span></div>}
      {advice.kind === 'decrease' && <div className="small"><span className="badge warn">снизить → {fmt(advice.weightKg, 1)} кг</span> <span className="muted">{advice.reason}</span></div>}
      {deload && <div className="small"><span className="badge">разгрузка: −35% веса, подходов на треть меньше</span></div>}
      <div className="list" style={{ margin: '0.3rem 0' }}>
        {sets.map((s, i) => (
          <div key={s.id} className="row small">
            <span className="muted">#{i + 1}</span>
            <NumberInput className="short" value={s.weightKg} onChange={(v) => v !== undefined && db.sets.update(s.id!, { weightKg: v })} /> кг ×
            <NumberInput className="short" value={s.reps} onChange={(v) => v !== undefined && db.sets.update(s.id!, { reps: v })} /> повт., запас
            <NumberInput className="short" value={s.rir} onChange={(v) => v !== undefined && db.sets.update(s.id!, { rir: v })} />
            <button className="btn small" onClick={() => db.sets.delete(s.id!)}>✕</button>
          </div>
        ))}
      </div>
      <div className="row small">
        <NumberInput className="short" value={weight} placeholder="кг" onChange={setWeight} /> кг ×
        <NumberInput className="short" value={reps} placeholder="повт." onChange={setReps} /> повт., запас
        <NumberInput className="short" value={rir} placeholder="0-5" onChange={setRir} />
        <button className="btn small primary" onClick={addSet}>+ подход</button>
      </div>
    </div>
  )
}

function WorkoutLog() {
  const { id } = useParams()
  const wid = Number(id)
  const w = useLiveQuery(() => db.workouts.get(wid), [wid])
  const { exMap, programs, ready } = useTrainingData()
  const allSets = useLiveQuery(() => db.sets.toArray(), [])
  const night = useLiveQuery(async () => (w ? db.sleep.get(w.date) : undefined), [w?.date])
  const [deload, setDeload] = useState(false)
  const [extra, setExtra] = useState<number[]>([])
  useEffect(() => {
    if (w) deloadActive(db, w.date).then(setDeload)
  }, [w])
  if (!ready || !w || !allSets) return <p className="muted">Загрузка…</p>
  if (w.kind !== 'strength') return <p>Это не силовая тренировка. <Link to="/training">К неделе</Link></p>

  const program = programs?.find((p) => p.id === w.programId) ?? programs?.[0]
  const baseDay: ProgramDay = program?.days.find((d) => d.key === w.programDayKey) ?? { key: '?', name: 'Своя', exercises: [] }
  const hours = night ? sleepHours(night) : null
  const isDeload = deload || !!w.deload
  let day = w.light ? lightDay(baseDay) : baseDay
  if (isDeload) day = deloadDay(day)
  const mySets = allSets.filter((s) => s.workoutId === w.id)
  const loggedOther = [...new Set(mySets.map((s) => s.exerciseId))].filter((eid) => !day.exercises.some((e) => e.exerciseId === eid))
  const extraIds = [...new Set([...extra, ...loggedOther])]

  return (
    <div>
      <div className="row spread">
        <h1>{day.name} · {formatDate(w.date, true)}</h1>
        <Link className="btn small" to={`/training?d=${w.date}`}>← неделя</Link>
      </div>
      {needsLightSession(hours) && w.light === undefined && (
        <div className="note warn row spread">
          <span>Прошлой ночью {fmt(hours, 1)} ч сна. Облегчить тренировку: на подход меньше, запас не меньше 3 повторов?</span>
          <span className="row">
            <button className="btn small primary" onClick={() => db.workouts.update(w.id!, { light: true })}>Облегчить</button>
            <button className="btn small" onClick={() => db.workouts.update(w.id!, { light: false })}>Нет, как обычно</button>
          </span>
        </div>
      )}
      {w.light && <div className="note">Облегчённый вариант после короткого сна. <button className="btn small link" onClick={() => db.workouts.update(w.id!, { light: false })}>вернуть обычный</button></div>}
      {deload && !w.deload && (
        <div className="note accent row spread">
          <span>Идёт разгрузочная неделя.</span>
          <button className="btn small" onClick={() => db.workouts.update(w.id!, { deload: true })}>Отметить как разгрузку</button>
        </div>
      )}
      <Card>
        <div className="list">
          {day.exercises.map((pe) => {
            const ex = exMap.get(pe.exerciseId)
            return ex ? <ExerciseLog key={pe.exerciseId} w={w} pe={pe} ex={ex} allSets={allSets} sets={mySets.filter((s) => s.exerciseId === ex.id)} deload={isDeload} /> : null
          })}
          {extraIds.map((eid) => {
            const ex = exMap.get(eid)
            return ex ? <ExerciseLog key={eid} w={w} pe={{ exerciseId: eid, sets: 3, repMin: 6, repMax: 10, targetRir: 2 }} ex={ex} allSets={allSets} sets={mySets.filter((s) => s.exerciseId === eid)} deload={isDeload} /> : null
          })}
        </div>
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <select value="" onChange={(e) => e.target.value && setExtra([...extra, Number(e.target.value)])}>
            <option value="">+ упражнение вне программы…</option>
            {[...exMap.values()].filter((e) => !e.hidden).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <label className="row"><input type="checkbox" checked={w.done} onChange={(e) => db.workouts.update(w.id!, { done: e.target.checked })} /> тренировка сделана</label>
        </div>
      </Card>
    </div>
  )
}

// ---------- График упражнения ----------

function ExerciseChart() {
  const { id } = useParams()
  const exId = Number(id)
  const ex = useLiveQuery(() => db.exercises.get(exId), [exId])
  const sets = useLiveQuery(() => db.sets.where('exerciseId').equals(exId).toArray(), [exId])
  if (!ex || !sets) return <p className="muted">Загрузка…</p>
  const data = strengthHistory(sets, exId)
  return (
    <div>
      <div className="row spread"><h1>{ex.name}</h1><Link className="btn small" to="/training">← тренировки</Link></div>
      <Card title="Расчётный максимум на 1 повтор">
        <p className="muted small">По лучшему подходу каждой тренировки (формула Эпли). Нужен, чтобы видеть силу при разных весах и повторах.</p>
        {data.length ? (
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={data.map((d) => ({ ...d, label: formatDate(d.date) }))}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                <YAxis stroke="var(--muted)" fontSize={12} domain={['auto', 'auto']} unit=" кг" />
                <Tooltip />
                <Line type="monotone" dataKey="e1rm" name="1ПМ, кг" stroke="var(--accent)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="muted">Пока нет подходов.</p>}
      </Card>
    </div>
  )
}

// ---------- Программы и упражнения ----------

function ProgramEditor({ program, exMap }: { program: Program; exMap: Map<number, Exercise> }) {
  const [p, setP] = useState(program)
  useEffect(() => setP(program), [program])
  const changed = JSON.stringify(p) !== JSON.stringify(program)
  const setDay = (i: number, d: ProgramDay) => setP({ ...p, days: p.days.map((x, j) => (j === i ? d : x)) })
  return (
    <Card title={p.name} actions={<button className="btn primary" disabled={!changed} onClick={() => db.programs.put(p)}>Сохранить</button>}>
      {p.days.map((d, i) => {
        const missing = missingPatterns(d, exMap)
        return (
          <div key={d.key} style={{ marginBottom: '1rem' }}>
            <h3>{d.name}</h3>
            {missing.length > 0 && <div className="note warn small">В тренировке нет движения: {missing.map((m) => PATTERN_LABEL[m]).join(', ')}. Изменение можно сохранить.</div>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Упражнение</th><th>Подходы</th><th>Повторы</th><th>Запас</th><th></th></tr></thead>
                <tbody>
                  {d.exercises.map((e, k) => {
                    const upd = (patch: Partial<ProgramExercise>) => setDay(i, { ...d, exercises: d.exercises.map((x, j) => (j === k ? { ...x, ...patch } : x)) })
                    return (
                      <tr key={k}>
                        <td>{exMap.get(e.exerciseId)?.name} <span className="muted small">{PATTERN_LABEL[exMap.get(e.exerciseId)?.pattern ?? 'isolation']}</span></td>
                        <td><NumberInput className="short" value={e.sets} onChange={(v) => v && upd({ sets: v })} /></td>
                        <td className="nowrap"><NumberInput className="short" value={e.repMin} onChange={(v) => v && upd({ repMin: v })} /> – <NumberInput className="short" value={e.repMax} onChange={(v) => v && upd({ repMax: v })} /></td>
                        <td><NumberInput className="short" value={e.targetRir} onChange={(v) => v !== undefined && upd({ targetRir: v })} /></td>
                        <td><button className="btn small" onClick={() => setDay(i, { ...d, exercises: d.exercises.filter((_, j) => j !== k) })}>✕</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <select value="" onChange={(e) => e.target.value && setDay(i, { ...d, exercises: [...d.exercises, { exerciseId: Number(e.target.value), sets: 3, repMin: 6, repMax: 10, targetRir: 2 }] })}>
              <option value="">+ упражнение…</option>
              {[...exMap.values()].filter((e) => !e.hidden).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )
      })}
    </Card>
  )
}

function NewExercise() {
  const [name, setName] = useState('')
  const [muscles, setMuscles] = useState('')
  const [pattern, setPattern] = useState<MovementPattern>('legs')
  const [equipment, setEquipment] = useState<Exercise['equipment']>('machine')
  const [bigStep, setBigStep] = useState(false)
  return (
    <Card title="Своё упражнение">
      <div className="row">
        <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Мышцы"><input value={muscles} onChange={(e) => setMuscles(e.target.value)} /></Field>
        <Field label="Тип движения">
          <select value={pattern} onChange={(e) => setPattern(e.target.value as MovementPattern)}>
            {(Object.keys(PATTERN_LABEL) as MovementPattern[]).map((k) => <option key={k} value={k}>{PATTERN_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Оборудование">
          <select value={equipment} onChange={(e) => setEquipment(e.target.value as Exercise['equipment'])}>
            <option value="machine">тренажёр</option><option value="free">свободный вес</option><option value="bodyweight">свой вес</option>
          </select>
        </Field>
        <label className="row small"><input type="checkbox" checked={bigStep} onChange={(e) => setBigStep(e.target.checked)} /> шаг +2.5 кг</label>
        <button className="btn primary" disabled={!name.trim()} onClick={async () => {
          await db.exercises.add({ name: name.trim(), muscles, pattern, equipment, bigStep })
          setName(''); setMuscles('')
        }}>Добавить</button>
      </div>
    </Card>
  )
}

function Programs() {
  const { programs, exMap, ready } = useTrainingData()
  if (!ready) return <p className="muted">Загрузка…</p>
  return (
    <div>
      <div className="row spread"><h1>Программы и упражнения</h1><Link className="btn small" to="/training">← неделя</Link></div>
      {(programs ?? []).map((p) => <ProgramEditor key={p.id} program={p} exMap={exMap} />)}
      <NewExercise />
    </div>
  )
}

export function TrainingScreen() {
  return (
    <Routes>
      <Route index element={<WeekView />} />
      <Route path="w/:id" element={<WorkoutLog />} />
      <Route path="ex/:id" element={<ExerciseChart />} />
      <Route path="programs" element={<Programs />} />
    </Routes>
  )
}
