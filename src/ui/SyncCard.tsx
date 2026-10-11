import { useState } from 'react'
import { SyncError } from '../db/sync'
import { ConfirmButton, Field } from './components'
import { connectSync, disconnectSync, loadSyncConfig, syncNow, useSyncStatus } from './sync'

export function formatSyncTime(iso?: string): string {
  if (!iso) return 'ещё не было'
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay ? `сегодня в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

/** Строка состояния для меню. */
export function SyncBadge() {
  const s = useSyncStatus()
  if (!s.configured) return null
  const text = s.state === 'syncing' ? 'синхронизация…' : s.state === 'error' ? 'синхр.: ошибка' : s.pending ? 'есть неотправленное' : `синхр. ${formatSyncTime(s.lastAt)}`
  return <span className={`small ${s.state === 'error' ? 'badge warn' : 'muted'}`} title={s.error} style={{ padding: '0 0.6rem' }}>☁ {text}</span>
}

function Instructions() {
  return (
    <details>
      <summary className="small">Как подготовить GitHub (один раз)</summary>
      <ol className="small" style={{ paddingLeft: '1.2rem' }}>
        <li>На github.com создайте <b>приватный</b> репозиторий, например <code>sport-data</code> (New repository → Private). Он может быть пустым.</li>
        <li>Создайте токен: Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token.</li>
        <li>В токене: Repository access → <b>Only select repositories</b> → <code>sport-data</code>; Permissions → Repository permissions → <b>Contents: Read and write</b>. Срок — какой удобно; когда истечёт, приложение скажет, и вы вставите новый.</li>
        <li>Скопируйте токен и вставьте ниже. Он хранится только на этом устройстве (не попадает в копии и в GitHub). На телефоне вставьте тот же токен или создайте второй.</li>
      </ol>
    </details>
  )
}

export function SyncCard({ compact = false }: { compact?: boolean }) {
  const s = useSyncStatus()
  const saved = loadSyncConfig()
  const [owner, setOwner] = useState(saved?.owner ?? '')
  const [repo, setRepo] = useState(saved?.repo ?? 'sport-data')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [choice, setChoice] = useState(false)

  const cfg = { owner: owner.trim(), repo: repo.trim(), token: token.trim(), path: 'sport-data.json' }
  const valid = cfg.owner && cfg.repo && cfg.token

  async function run(c?: 'take-remote' | 'replace-remote') {
    setBusy(true)
    setMsg('')
    try {
      const r = await connectSync(cfg, c)
      setChoice(r === 'needs-choice')
      setMsg({
        pushed: 'Подключено: данные этого устройства сохранены в GitHub.',
        pulled: 'Подключено: данные загружены из GitHub.',
        empty: 'Подключено. В GitHub пока пусто — данные отправятся после настройки профиля.',
        'needs-choice': '',
      }[r])
      if (r !== 'needs-choice') setToken('')
    } catch (e) {
      setMsg(e instanceof SyncError ? e.message : `Ошибка: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const title = <h2>Синхронизация через GitHub</h2>
  if (saved && s.configured) {
    return (
      <section className="card" id="sync">
        {title}
        <p>Подключено к <b>{saved.owner}/{saved.repo}</b>. Последняя синхронизация: {formatSyncTime(s.lastAt)}{s.pending ? ' · есть неотправленные изменения' : ''}.</p>
        {msg && <div className="note accent small">{msg}</div>}
        {s.state === 'error' && <div className="note warn">{s.error}</div>}
        <p className="muted small">Данные отправляются через 30 секунд после изменений и при сворачивании приложения, а забираются при открытии. GitHub хранит историю, так что это и резервная копия.</p>
        <div className="row">
          <button className="btn primary" disabled={s.state === 'syncing'} onClick={() => void syncNow()}>{s.state === 'syncing' ? 'Синхронизирую…' : 'Синхронизировать сейчас'}</button>
          <ConfirmButton className="btn" label="Отключить на этом устройстве" confirmLabel="Точно отключить? Данные останутся" onConfirm={disconnectSync} />
        </div>
      </section>
    )
  }

  return (
    <section className="card" id="sync">
      {title}
      {!compact && <p className="muted small">Один приватный репозиторий GitHub хранит данные, а телефон и компьютер синхронизируются через него.</p>}
      <Instructions />
      <div className="grid three" style={{ marginTop: '0.6rem' }}>
        <Field label="Ваш логин GitHub"><input value={owner} onChange={(e) => setOwner(e.target.value)} autoCapitalize="off" spellCheck={false} /></Field>
        <Field label="Приватный репозиторий"><input value={repo} onChange={(e) => setRepo(e.target.value)} autoCapitalize="off" spellCheck={false} /></Field>
        <Field label="Токен"><input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder="github_pat_…" /></Field>
      </div>
      <button className="btn primary" style={{ marginTop: '0.6rem' }} disabled={!valid || busy} onClick={() => run()}>{busy ? 'Подключаю…' : 'Подключить'}</button>
      {choice && (
        <div className="note warn" style={{ marginTop: '0.8rem' }}>
          <p>И в GitHub, и на этом устройстве уже есть данные. Какие оставить?</p>
          <div className="row">
            <ConfirmButton className="btn" label="Взять данные из GitHub" confirmLabel="Данные этого устройства заменятся — точно?" onConfirm={() => run('take-remote')} />
            <ConfirmButton className="btn" label="Оставить данные этого устройства" confirmLabel="Данные в GitHub заменятся — точно?" onConfirm={() => run('replace-remote')} />
          </div>
        </div>
      )}
      {msg && <p className="small" style={{ marginTop: '0.6rem' }}>{msg}</p>}
    </section>
  )
}
