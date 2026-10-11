import { useState } from 'react'
import { ageOn, today } from '../../domain/dates'
import { formulaTdee } from '../../domain/targets'
import { targetBedtime } from '../../domain/sleep'
import type { Profile, Sex } from '../../domain/types'
import { Card, Field, NumberInput, Segmented, fmt } from '../components'
import { db } from '../data'
import { createProfile } from '../setup'
import { SyncCard } from '../SyncCard'

export const ACTIVITY_OPTIONS = [
  { value: 1.375, label: '1.375 — 1-2 тренировки в неделю' },
  { value: 1.5, label: '1.5 — 2-3 зала + 1-2 игры (рекомендуется)' },
  { value: 1.55, label: '1.55 — 4-5 тренировок' },
  { value: 1.725, label: '1.725 — тренировки почти каждый день' },
]

export function Wizard() {
  const [sex, setSex] = useState<Sex>('female')
  const [birthDate, setBirthDate] = useState('')
  const [height, setHeight] = useState<number | undefined>()
  const [weight, setWeight] = useState<number | undefined>()
  const [target, setTarget] = useState<number | undefined>()
  const [activity, setActivity] = useState(1.5)
  const [startDate, setStartDate] = useState(today())
  const [wake, setWake] = useState('07:40')
  const [sleepH, setSleepH] = useState<number | undefined>(8)
  const [loadDays, setLoadDays] = useState<number | undefined>(4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const missing = [
    !birthDate && 'дата рождения (день, месяц и год полностью)',
    !height && 'рост',
    !weight && 'текущий вес',
    !target && 'целевой вес',
    loadDays === undefined && 'дней нагрузки в неделю',
    !startDate && 'дата старта программы',
    !wake && 'целевой подъём',
    !sleepH && 'длительность сна',
  ].filter(Boolean) as string[]
  const valid = missing.length === 0
  const preview: Profile | null = valid
    ? {
        effectiveFrom: startDate, sex, birthDate, heightCm: height!, weightKg: weight!, targetWeightKg: target!, activityFactor: activity,
        startDate, calibrationDays: 14, targetWake: wake, sleepDurationH: sleepH!, plannedLoadDays: loadDays!,
      }
    : null
  const est = preview ? formulaTdee(preview, startDate) : null

  async function submit() {
    if (!preview) return
    setBusy(true)
    setError('')
    try {
      await createProfile(db, preview)
    } catch (e) {
      setError(String((e as Error).message ?? e))
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1>Настройка</h1>
      <p className="muted">Один раз заполните профиль. Всё можно поменять позже в разделе «Профиль и этапы».</p>
      <details className="card">
        <summary><b>Уже пользуетесь приложением на другом устройстве?</b> Подключите GitHub — данные загрузятся, заполнять профиль не нужно.</summary>
        <SyncCard compact />
      </details>
      <Card title="Профиль">
        <div className="grid three">
          <Field label="Пол">
            <Segmented value={sex} onChange={setSex} options={[{ value: 'female', label: 'женский' }, { value: 'male', label: 'мужской' }]} />
          </Field>
          <Field label="Дата рождения" hint={birthDate ? `возраст: ${ageOn(birthDate, today())}` : 'возраст считается автоматически'}>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
          <Field label="Рост, см"><NumberInput value={height} onChange={setHeight} /></Field>
          <Field label="Текущий вес, кг"><NumberInput value={weight} onChange={setWeight} /></Field>
          <Field label="Целевой вес, кг"><NumberInput value={target} onChange={setTarget} /></Field>
          <Field label="Дней нагрузки в неделю" hint="зал + игры"><NumberInput value={loadDays} onChange={setLoadDays} /></Field>
        </div>
        <div style={{ marginTop: '0.8rem' }}>
          <Field label="Активность">
            <select value={activity} onChange={(e) => setActivity(Number(e.target.value))}>
              {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Программа и режим">
        <div className="grid three">
          <Field label="Дата старта программы" hint="можно в прошлом — записи внесёте задним числом">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Целевой подъём"><input type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></Field>
          <Field label="Длительность сна, ч" hint={sleepH ? `целевой отбой ${targetBedtime(wake, sleepH)}` : undefined}>
            <NumberInput value={sleepH} onChange={setSleepH} />
          </Field>
        </div>
      </Card>
      {est && (
        <div className="note accent">
          Базовый обмен ≈ {fmt(est.bmr)} ккал, расход ≈ {fmt(est.tdee)} ккал (по формуле). Первые 14 дней — калибровка:
          уходит вода, расход по вашим данным появится через 3-4 недели записей.
        </div>
      )}
      {error && <div className="note bad">{error}</div>}
      {!valid && <div className="note warn small">Чтобы начать, заполните: {missing.join(', ')}.</div>}
      <button className="btn primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Создаю…' : 'Начать'}</button>
      <p className="muted small" style={{ marginTop: '1rem' }}>
        Приложение даёт общие рекомендации и не заменяет врача. Добавки — по результатам анализов.
      </p>
    </div>
  )
}
