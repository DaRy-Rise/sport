import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import {
  BackupFormatError, chooseBackupFolder, downloadBackup, folderBackupSupported, folderStatus, importAll, lastBackupAt,
  parseBackup, regrantFolder, writeBackupToFolder, type DirHandle, type FolderStatus, type PersistStatus,
} from '../../db/backup'
import { MAX_DEFICIT_WEEKS } from '../../domain/constants'
import { DAY_TYPE_LABEL } from '../../domain/day'
import { ageOn, formatDate, today } from '../../domain/dates'
import { NUTRIENT_INFO } from '../../domain/nutrients'
import { CALIBRATION_NOTE, PHASE_LABEL, calibrationEnd, clampCalibrationDays, deficitWeeks, inCalibration, reviseProfile } from '../../domain/phases'
import { NORMS_SOURCE, dayTargets } from '../../domain/targets'
import { MICRO_KEYS, type NutrientKey, type PhaseKind, type Profile } from '../../domain/types'
import { trendOn } from '../../domain/weight'
import { Card, ConfirmButton, Field, NumberInput, fmt } from '../components'
import { changePhase, currentPhaseKcal } from '../actions'
import { db, useCore, usePlan } from '../data'
import { ACTIVITY_OPTIONS } from './Wizard'
import { SyncCard } from '../SyncCard'
import { replaceRemoteOnNextSync } from '../sync'

const PERSIST_LABEL: Record<PersistStatus, string> = {
  persistent: 'хранилище постоянное — браузер не удалит данные при нехватке места',
  'not-persistent': 'хранилище не постоянное — браузер может очистить данные; установите приложение (PWA) и делайте копии',
  unsupported: 'браузер не сообщает статус хранилища',
}

function ProfileForm({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile)
  const [saved, setSaved] = useState(false)
  useEffect(() => setP(profile), [profile])
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }))
  const changed = JSON.stringify(p) !== JSON.stringify(profile)

  async function save() {
    const next = reviseProfile(profile, { ...p, calibrationDays: clampCalibrationDays(p.calibrationDays) }, today())
    await db.profiles.put(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card title="Профиль" actions={<button className="btn primary" disabled={!changed} onClick={save}>Сохранить</button>}>
      <p className="muted small">Изменения действуют с сегодняшнего дня; прошлые дни сохраняют прежние нормы.</p>
      <div className="grid three">
        <Field label="Дата рождения" hint={`возраст: ${ageOn(p.birthDate, today())}`}>
          <input type="date" value={p.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        </Field>
        <Field label="Рост, см"><NumberInput value={p.heightCm} onChange={(v) => v && set('heightCm', v)} /></Field>
        <Field label="Вес для расчёта норм, кг"><NumberInput value={p.weightKg} onChange={(v) => v && set('weightKg', v)} /></Field>
        <Field label="Целевой вес, кг"><NumberInput value={p.targetWeightKg} onChange={(v) => v && set('targetWeightKg', v)} /></Field>
        <Field label="Дней нагрузки в неделю"><NumberInput value={p.plannedLoadDays} onChange={(v) => v !== undefined && set('plannedLoadDays', v)} /></Field>
        <Field label="Калибровка, дней (0-21)"><NumberInput value={p.calibrationDays} onChange={(v) => v !== undefined && set('calibrationDays', v)} /></Field>
        <Field label="Целевой подъём"><input type="time" value={p.targetWake} onChange={(e) => set('targetWake', e.target.value)} /></Field>
        <Field label="Длительность сна, ч"><NumberInput value={p.sleepDurationH} onChange={(v) => v && set('sleepDurationH', v)} /></Field>
        <Field label="«Кухня закрыта» в" hint="пусто — отбой минус 2.5 ч">
          <input type="time" value={p.kitchenCloseTarget ?? ''} onChange={(e) => set('kitchenCloseTarget', e.target.value || undefined)} />
        </Field>
        <Field label="Дата старта программы">
          <input type="date" value={p.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: '0.8rem' }}>
        <Field label="Активность">
          <select value={p.activityFactor} onChange={(e) => set('activityFactor', Number(e.target.value))}>
            {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>
      {saved && <div className="note accent" style={{ marginTop: '0.8rem' }}>Сохранено, новые нормы действуют с сегодняшнего дня.</div>}
    </Card>
  )
}

function NormOverrides({ profile }: { profile: Profile }) {
  const [o, setO] = useState<Partial<Record<NutrientKey, number>>>(profile.nutrientOverrides ?? {})
  useEffect(() => setO(profile.nutrientOverrides ?? {}), [profile])
  async function save() {
    const clean = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
    await db.profiles.put(reviseProfile(profile, { nutrientOverrides: clean }, today()))
  }
  return (
    <Card title="Ручные нормы" actions={<button className="btn" onClick={save}>Сохранить</button>}>
      <p className="muted small">Например, витамин D по рекомендации врача. Пустое поле — стандартная норма. {NORMS_SOURCE}.</p>
      <div className="grid three">
        {MICRO_KEYS.map((k) => (
          <Field key={k} label={`${NUTRIENT_INFO[k].label}, ${NUTRIENT_INFO[k].unit}${k === 'sodium' ? ' (предел)' : ''}`}>
            <NumberInput value={o[k]} onChange={(v) => setO((x) => ({ ...x, [k]: v }))} />
          </Field>
        ))}
      </div>
    </Card>
  )
}

function BackupCard() {
  const persist = useLiveQuery(() => db.settings.get('persist'), [])?.value as PersistStatus | undefined
  const [status, setStatus] = useState<FolderStatus>('not-configured')
  const [last, setLast] = useState<string>()
  const [msg, setMsg] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = () => {
    folderStatus(db).then(setStatus)
    lastBackupAt(db).then(setLast)
  }
  useEffect(refresh, [])

  async function run(f: () => Promise<unknown>, ok: string) {
    try {
      await f()
      setMsg(ok)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg(`Ошибка: ${(e as Error).message}`)
    }
    refresh()
  }

  async function doImport() {
    if (!pending) return
    try {
      await importAll(db, parseBackup(pending))
      replaceRemoteOnNextSync()
      setMsg('Данные восстановлены из копии')
    } catch (e) {
      setMsg(e instanceof BackupFormatError ? e.message : `Ошибка: ${(e as Error).message}`)
    }
    setPending(null)
  }

  return (
    <section className="card" id="backup">
      <h2>Хранилище и резервные копии</h2>
      <p><span className={`badge ${persist === 'persistent' ? 'accent' : 'warn'}`}>{persist ? PERSIST_LABEL[persist] : 'проверяю…'}</span></p>
      <p className="muted small">Последняя копия: {last ? new Date(last).toLocaleString('ru-RU') : 'не было'}</p>
      {folderBackupSupported() ? (
        <div className="stack">
          {status === 'ok' && <div className="note accent">Автокопия включена: раз в день при открытии приложения, хранятся последние 14 файлов.</div>}
          {status === 'not-configured' && <div className="note warn">Выберите папку — копия будет сохраняться в неё автоматически раз в день.</div>}
          {status === 'needs-permission' && <div className="note warn">Браузер просит заново подтвердить доступ к папке.</div>}
          <div className="row">
            <button className="btn primary" onClick={() => run(() => chooseBackupFolder(db), 'Папка выбрана, первая копия сохранена')}>
              {status === 'not-configured' ? 'Выбрать папку для копий' : 'Сменить папку'}
            </button>
            {status === 'needs-permission' && <button className="btn" onClick={() => run(() => regrantFolder(db), 'Доступ подтверждён')}>Разрешить доступ</button>}
            {status === 'ok' && (
              <button className="btn" onClick={() => run(async () => {
                const dir = (await db.settings.get('backupDir'))!.value as DirHandle
                await writeBackupToFolder(db, dir)
              }, 'Копия сохранена')}>Сохранить копию сейчас</button>
            )}
          </div>
        </div>
      ) : (
        <div className="note">Этот браузер не умеет сохранять в папку — скачивайте копию вручную (напомню раз в неделю).</div>
      )}
      <div className="row" style={{ marginTop: '0.8rem' }}>
        <button className="btn" onClick={() => run(() => downloadBackup(db), 'Файл копии скачан')}>Скачать копию</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Восстановить из файла…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) setPending(await f.text())
          e.target.value = ''
        }} />
      </div>
      {pending && (
        <div className="note warn row spread" style={{ marginTop: '0.8rem' }}>
          <span>Все текущие данные будут заменены данными из файла.</span>
          <span className="row">
            <button className="btn danger" onClick={doImport}>Заменить</button>
            <button className="btn" onClick={() => setPending(null)}>Отмена</button>
          </span>
        </div>
      )}
      {msg && <p className="small" style={{ marginTop: '0.6rem' }}>{msg}</p>}
    </section>
  )
}

export function ProfileScreen() {
  const core = useCore()
  const plan = usePlan(core, today())
  const [manualKind, setManualKind] = useState<PhaseKind>('weight')
  if (!core || !core.current || !plan) return <p className="muted">Загрузка…</p>
  const p = core.current
  const t = dayTargets({ avgKcal: plan.avgKcal, weightKg: p.weightKg, loadDays: p.plannedLoadDays })
  const trend = trendOn(core.weights, today())
  const phases = [...core.phases].sort((a, b) => b.startDate.localeCompare(a.startDate))
  const active = core.active

  return (
    <div>
      <h1>Профиль и этапы</h1>
      <div className="grid two">
        <Card title={`Этап: ${active ? PHASE_LABEL[active.kind] : '—'}`}>
          {active && <p>С {formatDate(active.startDate)}{active.kind === 'weight' && ` · недель дефицита без перерыва: ${fmt(deficitWeeks(core.phases, today()), 1)} из ${MAX_DEFICIT_WEEKS}`}</p>}
          {inCalibration(p, today()) && <div className="note accent">Идёт {CALIBRATION_NOTE} (до {formatDate(calibrationEnd(p))}).</div>}
          <p>
            Расход: <b>{fmt(plan.tdee)} ккал</b>{' '}
            <span className={`badge ${plan.tdeeSource === 'data' ? 'accent' : ''}`}>{plan.tdeeSource === 'data' ? 'по данным' : 'формула'}</span>
          </p>
          {core.tdee?.source === 'formula' && (
            <p className="muted small">До расчёта по вашим данным: ещё {core.tdee.remainingDays} полных дн. записей (вне калибровки).</p>
          )}
          <p>Средняя цель: <b>{fmt(plan.avgKcal)} ккал</b>{active?.kcalAdjust ? <span className="muted"> (поправка {active.kcalAdjust > 0 ? '+' : ''}{active.kcalAdjust})</span> : null}</p>
          <table>
            <thead><tr><th>Тип дня</th><th className="num">ккал</th><th className="num">Белок</th><th className="num">Жиры</th><th className="num">Углев.</th></tr></thead>
            <tbody>
              {(['load', 'rest'] as const).map((k) => (
                <tr key={k}><td>{DAY_TYPE_LABEL[k]}</td><td className="num">{t[k].kcal}</td><td className="num">{t[k].protein} г</td><td className="num">{t[k].fat} г</td><td className="num">{t[k].carbs} г</td></tr>
              ))}
            </tbody>
          </table>
          {trend !== null && Math.abs(trend - p.weightKg) >= 0.5 && (
            <div className="note" style={{ marginTop: '0.8rem' }}>
              Тренд веса {fmt(trend, 1)} кг, а нормы считаются от {fmt(p.weightKg, 1)} кг.{' '}
              <button className="btn small" onClick={() => db.profiles.put(reviseProfile(p, { weightKg: Math.round(trend * 10) / 10 }, today()))}>Обновить вес в профиле</button>
            </div>
          )}
          {active?.kind === 'break' && (
            <div className="note accent row spread" style={{ marginTop: '0.8rem' }}>
              <span>Перерыв на поддержке ({fmt(active.targetKcal)} ккал). После 1-2 недель вернитесь к этапу «вес».</span>
              <button className="btn primary" onClick={() => changePhase(db, 'weight')}>Вернуться к этапу «вес»</button>
            </div>
          )}
        </Card>
        <Card title="История этапов">
          <div className="list">
            {phases.map((ph, i) => (
              <div className="item row spread" key={i}>
                <span>{PHASE_LABEL[ph.kind]}{ph.targetKcal ? <span className="muted"> · {ph.targetKcal} ккал</span> : null}</span>
                <span className="muted small">{formatDate(ph.startDate)} — {ph.endDate ? formatDate(ph.endDate) : 'сейчас'}</span>
              </div>
            ))}
          </div>
          <details style={{ marginTop: '0.8rem' }}>
            <summary className="muted small">Сменить этап вручную</summary>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <select value={manualKind} onChange={(e) => setManualKind(e.target.value as PhaseKind)}>
                {(Object.keys(PHASE_LABEL) as PhaseKind[]).map((k) => <option key={k} value={k}>{PHASE_LABEL[k]}</option>)}
              </select>
              <ConfirmButton className="btn small" label="Начать с сегодня" confirmLabel="Подтвердить смену"
                onConfirm={() => changePhase(db, manualKind, manualKind === 'weight' ? undefined : Math.round(currentPhaseKcal(active, plan.avgKcal)))} />
            </div>
          </details>
        </Card>
      </div>
      <ProfileForm profile={p} />
      <SyncCard />
      <BackupCard />
      <NormOverrides profile={p} />
      <p className="muted small">Приложение даёт общие рекомендации и не заменяет врача. Добавки — по результатам анализов (ферритин, витамин D).</p>
    </div>
  )
}
