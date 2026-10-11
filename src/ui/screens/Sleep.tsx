import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getAdaptation, saveNight, setAdaptation } from '../../db/days'
import { kitchenCloseTarget } from '../../domain/checkin'
import { addDays, fromMinutes, formatDate, toMinutes, today } from '../../domain/dates'
import {
  adaptationDone, adaptationOffered, adaptationTips, bedtimeSpread, formatDuration, gradualSchedule, sleepMinutes, targetBedtime,
  tonightBedWindow, wakeStability, wakeTargetOn, weekendWarning,
} from '../../domain/sleep'
import { reviseProfile } from '../../domain/phases'
import type { AdaptationState, Profile, SleepNight } from '../../domain/types'
import { Card, ConfirmButton, Field, NumberInput, Segmented, fmt } from '../components'
import { db, useCore } from '../data'

/** Минуты для графика: время до полудня считается следующими сутками (отбой после полуночи). */
const chartMin = (t: string, isBed: boolean) => { const m = toMinutes(t); return isBed && m < 720 ? m + 1440 : m }

export function AdaptationTipsCard({ adaptation, targetWake, durationH }: { adaptation: AdaptationState; targetWake: string; durationH: number }) {
  const bed = targetBedtime(wakeTargetOn(today(), targetWake, adaptation), durationH)
  return (
    <div className="note accent">
      <b>Адаптация режима ({adaptation.method === 'now' ? 'сразу' : 'постепенно'}).</b> Подъём сегодня: {wakeTargetOn(today(), targetWake, adaptation)}.
      <ul style={{ margin: '0.4rem 0 0 1.1rem', padding: 0 }}>
        {adaptationTips(bed).map((t) => <li key={t} className="small">{t}</li>)}
      </ul>
    </div>
  )
}

/** Правка целевого подъёма и длительности сна прямо на экране «Сон» (действует с сегодняшнего дня). */
function SleepTargetEditor({ profile }: { profile: Profile }) {
  const [wake, setWake] = useState(profile.targetWake)
  const [hours, setHours] = useState<number | undefined>(profile.sleepDurationH)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setWake(profile.targetWake); setHours(profile.sleepDurationH) }, [profile])
  const valid = /^\d\d:\d\d$/.test(wake) && !!hours && hours >= 5 && hours <= 11
  const changed = wake !== profile.targetWake || hours !== profile.sleepDurationH

  async function save() {
    await db.profiles.put(reviseProfile(profile, { targetWake: wake, sleepDurationH: hours! }, today()))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="stack" style={{ marginBottom: '0.6rem' }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Целевой подъём"><input type="time" aria-label="Целевой подъём" value={wake} onChange={(e) => setWake(e.target.value)} /></Field>
        <Field label="Сон, ч"><NumberInput value={hours} onChange={setHours} /></Field>
        <button className="btn primary" disabled={!changed || !valid} onClick={save}>Сохранить режим</button>
      </div>
      {valid && changed && (
        <p className="small muted">Будет: отбой {targetBedtime(wake, hours!)}, «кухня закрыта» {kitchenCloseTarget({ ...profile, targetWake: wake, sleepDurationH: hours! })}.</p>
      )}
      {!valid && <p className="note warn small">Длительность сна — от 5 до 11 ч.</p>}
      {saved && <p className="small">Сохранено, новый режим действует с сегодняшнего дня.</p>}
    </div>
  )
}

export function SleepScreen() {
  const core = useCore()
  const nights = useLiveQuery(() => db.sleep.toArray(), [])
  const [adaptation, setA] = useState<AdaptationState | undefined>()
  const [date, setDate] = useState(today())
  const [bed, setBed] = useState('23:00')
  const [wake, setWake] = useState('07:40')
  const [quality, setQuality] = useState('3')
  const [method, setMethod] = useState<'now' | 'gradual'>('now')
  const [msg, setMsg] = useState('')

  useEffect(() => { getAdaptation(db).then(setA) }, [])
  useEffect(() => {
    const n = nights?.find((x) => x.date === date)
    if (n) { setBed(n.bedtime); setWake(n.wake); setQuality(String(n.quality)) }
  }, [date, nights])

  if (!core?.current || !nights) return <p className="muted">Загрузка…</p>
  const p = core.current
  const targetBed = targetBedtime(p.targetWake, p.sleepDurationH)
  const st7 = wakeStability(nights, p.targetWake, today(), 7)
  const st14 = wakeStability(nights, p.targetWake, today(), 14)
  const sorted = [...nights].sort((a, b) => a.date.localeCompare(b.date))
  const last = sorted.at(-1)
  const recent = sorted.filter((n) => n.date >= addDays(today(), -20))
  const night: SleepNight = { date, bedtime: bed, wake, quality: Number(quality) }
  const warn = weekendWarning(night, p.targetWake)

  async function save() {
    await saveNight(db, night)
    const a = await getAdaptation(db)
    const all = await db.sleep.toArray()
    if (a?.active && adaptationDone(all, p.targetWake, date)) {
      await setAdaptation(db, undefined)
      setA(undefined)
      setMsg('Режим установлен: 5 ночей подряд подъём в пределах ±30 минут от цели. Адаптация выключена.')
    } else setMsg('Сохранено')
  }

  async function startAdaptation() {
    const a: AdaptationState = { active: true, method, fromWake: last?.wake ?? wake, startDate: today() }
    await setAdaptation(db, a)
    setA(a)
  }

  const tonight = adaptation?.active && adaptation.method === 'now' && adaptation.startDate === today()
    ? tonightBedWindow(adaptation.fromWake, targetBed) : null

  return (
    <div>
      <h1>Сон</h1>
      <div className="grid two">
        <Card title="Записать ночь">
          <div className="row">
            <Field label="Дата подъёма"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Отбой"><input type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></Field>
            <Field label="Подъём"><input type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></Field>
            <Field label="Качество">
              <Segmented value={quality} onChange={setQuality} options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))} />
            </Field>
          </div>
          <p className="small" style={{ marginTop: '0.5rem' }}>Сон: <b>{formatDuration(sleepMinutes(bed, wake))}</b> · ночь относится к {formatDate(date)}</p>
          {warn && <div className="note warn small">{warn}</div>}
          <button className="btn primary" onClick={save}>Сохранить</button>
          {msg && <p className="small" style={{ marginTop: '0.5rem' }}>{msg}</p>}
        </Card>
        <Card title="Режим">
          <SleepTargetEditor profile={p} />
          <p>Цель: подъём <b>{p.targetWake}</b> (в выходные до {fromMinutes(toMinutes(p.targetWake) + 60)}), отбой <b>{targetBed}</b> ({p.sleepDurationH} ч + 15 мин на засыпание), «кухня закрыта» в {kitchenCloseTarget(p)}.</p>
          <p className="small">
            Подъём в пределах ±30 минут: <b>{st7.withinTolerance} из {st7.nights}</b> за 7 ночей, {st14.withinTolerance} из {st14.nights} за 14 ·
            средний разброс {fmt(st7.meanAbsDeviationMin)} мин · разброс отбоя {fmt(bedtimeSpread(recent.slice(-7)))} мин
          </p>
          {st7.outliers.length > 0 && <p className="small muted">Вне режима: {st7.outliers.map((d) => formatDate(d)).join(', ')}</p>}
          {adaptation?.active ? (
            <>
              <AdaptationTipsCard adaptation={adaptation} targetWake={p.targetWake} durationH={p.sleepDurationH} />
              {tonight && <div className="note">Сегодня ложитесь, когда появится сонливость — ориентир {tonight.from}-{tonight.to}, а не в {targetBed}. Завтра подъём в {p.targetWake} по будильнику.</div>}
              {adaptation.method === 'gradual' && (
                <p className="small">Расписание подъёма: {gradualSchedule(adaptation.fromWake, p.targetWake, adaptation.startDate).map((s) => `${formatDate(s.date)} — ${s.wake}`).join(' · ')}</p>
              )}
              <p className="small muted">Ночи адаптации помечаются и не считаются «плохим сном» для этапа. Адаптация закончится сама после 5 ночей подряд в режиме.</p>
              <ConfirmButton className="btn small" label="Выключить адаптацию" onConfirm={async () => { await setAdaptation(db, undefined); setA(undefined) }} />
            </>
          ) : (
            (last && adaptationOffered(last.wake, p.targetWake)) || !last ? (
              <div className="note warn">
                <p>{last ? `Последний подъём в ${last.wake} — больше часа от цели ${p.targetWake}.` : 'Если режим сейчас сбит, включите адаптацию.'} Включить режим адаптации?</p>
                <div className="row">
                  <Segmented value={method} onChange={setMethod} options={[{ value: 'now', label: 'сразу (с завтра)' }, { value: 'gradual', label: 'постепенно (по 30 мин)' }]} />
                  <button className="btn primary" onClick={startAdaptation}>Включить</button>
                </div>
              </div>
            ) : null
          )}
        </Card>
      </div>
      <Card title="Подъём и отбой за 3 недели">
        {recent.length ? (
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={recent.map((n) => ({ label: formatDate(n.date), wake: chartMin(n.wake, false), bed: chartMin(n.bedtime, true) - 1440, adaptation: n.adaptation }))}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                <YAxis stroke="var(--muted)" fontSize={12} domain={['auto', 'auto']} tickFormatter={(m: number) => fromMinutes(m)} />
                <Tooltip formatter={(v) => fromMinutes(Number(v))} />
                <Legend />
                <ReferenceLine y={toMinutes(p.targetWake)} stroke="var(--accent)" strokeDasharray="4 4" />
                <ReferenceLine y={chartMin(targetBed, true) - 1440} stroke="var(--warn)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="wake" name="подъём" stroke="var(--accent)" strokeWidth={2} />
                <Line type="monotone" dataKey="bed" name="отбой" stroke="var(--warn)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="muted">Пока нет записей сна.</p>}
        <p className="muted small">Пунктир — целевые подъём и отбой. Отбой после полуночи показан как продолжение вечера.</p>
      </Card>
      <Card title="Последние ночи">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Дата подъёма</th><th>Отбой</th><th>Подъём</th><th className="num">Сон</th><th className="num">Качество</th><th></th></tr></thead>
            <tbody>
              {[...recent].reverse().map((n) => (
                <tr key={n.date}>
                  <td>{formatDate(n.date, true)}</td><td>{n.bedtime}</td><td>{n.wake}</td>
                  <td className="num">{formatDuration(sleepMinutes(n.bedtime, n.wake))}</td><td className="num">{n.quality}</td>
                  <td>{n.adaptation && <span className="badge">адаптация</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
