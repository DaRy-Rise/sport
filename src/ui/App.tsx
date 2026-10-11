import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router'
import { folderStatus, manualBackupReminderDue, type FolderStatus } from '../db/backup'
import { db } from './data'
import { startup } from './setup'
import { SyncBadge } from './SyncCard'
import { startSyncRunner, useSyncStatus } from './sync'
import { Wizard } from './screens/Wizard'
import { TodayScreen } from './screens/Today'
import { DiaryScreen } from './screens/Diary'
import { FoodsScreen } from './screens/Foods'
import { TrainingScreen } from './screens/Training'
import { SleepScreen } from './screens/Sleep'
import { InsightsScreen } from './screens/Insights'
import { ProfileScreen } from './screens/Profile'

const NAV = [
  ['/', 'Сегодня'],
  ['/diary', 'Дневник'],
  ['/foods', 'Продукты'],
  ['/training', 'Тренировки'],
  ['/sleep', 'Сон'],
  ['/insights', 'Связи и обзор'],
  ['/profile', 'Профиль и этапы'],
] as const

function BackupBanner() {
  const [status, setStatus] = useState<FolderStatus | null>(null)
  const [remind, setRemind] = useState(false)
  // Перепроверяем при каждой новой копии или смене папки.
  const last = useLiveQuery(() => db.settings.get('lastBackupAt'), [])?.value
  const sync = useSyncStatus()
  useEffect(() => {
    folderStatus(db).then(setStatus)
    manualBackupReminderDue(db).then(setRemind)
  }, [last])
  if (status === 'ok' || status === null) return null
  // Синхронизация с GitHub сама служит копией (там хранится история).
  if (sync.configured && sync.state !== 'error') return null
  if (status === 'unsupported' && !remind) return null
  return (
    <div className="note warn row spread">
      <span>
        {status === 'needs-permission'
          ? 'Нужно заново разрешить доступ к папке резервных копий.'
          : status === 'unsupported'
            ? 'Резервной копии не было больше недели — скачайте копию.'
            : 'Резервная копия не настроена: данные хранятся только в браузере.'}
      </span>
      <NavLink className="btn small" to="/profile#backup">Настроить</NavLink>
    </div>
  )
}

export function App() {
  const [started, setStarted] = useState<'loading' | 'ok' | string>('loading')
  const profileCount = useLiveQuery(() => db.profiles.count(), [])
  const openSuggestions = useLiveQuery(() => db.suggestions.where('status').equals('open').count(), [])

  useEffect(() => {
    startup(db).then(() => { startSyncRunner(db); setStarted('ok') }).catch((e) => setStarted(String(e?.message ?? e)))
  }, [])

  if (started === 'loading' || profileCount === undefined) return <div className="main muted">Загрузка…</div>
  if (started !== 'ok') return <div className="main"><div className="note bad">Ошибка запуска: {started}</div></div>
  if (profileCount === 0) return <div className="main"><Wizard /></div>

  return (
    <HashRouter>
      <div className="app">
        <nav className="nav" aria-label="Разделы">
          <div className="brand">Мой режим</div>
          <SyncBadge />
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
              {to === '/insights' && !!openSuggestions && <span className="badge warn">{openSuggestions}</span>}
            </NavLink>
          ))}
        </nav>
        <main className="main">
          <BackupBanner />
          <Routes>
            <Route path="/" element={<TodayScreen />} />
            <Route path="/diary" element={<DiaryScreen />} />
            <Route path="/foods" element={<FoodsScreen />} />
            <Route path="/training/*" element={<TrainingScreen />} />
            <Route path="/sleep" element={<SleepScreen />} />
            <Route path="/insights" element={<InsightsScreen />} />
            <Route path="/profile" element={<ProfileScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
