import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { Icons } from './icons'
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

// primary — вкладки нижней панели на телефоне (по HIG не больше пяти, пятая — «Ещё»).
const NAV = [
  { to: '/', label: 'Сегодня', icon: Icons.today, primary: true },
  { to: '/diary', label: 'Дневник', icon: Icons.diary, primary: true },
  { to: '/training', label: 'Тренировки', icon: Icons.training, primary: true },
  { to: '/sleep', label: 'Сон', icon: Icons.sleep, primary: true },
  { to: '/foods', label: 'Продукты', icon: Icons.foods, primary: false },
  { to: '/insights', label: 'Связи и обзор', icon: Icons.insights, primary: false },
  { to: '/profile', label: 'Профиль и этапы', icon: Icons.profile, primary: false },
] as const
const SECONDARY = NAV.filter((n) => !n.primary)

function Nav({ openSuggestions }: { openSuggestions?: number }) {
  const { pathname } = useLocation()
  const inMore = pathname === '/more' || SECONDARY.some((n) => pathname.startsWith(n.to))
  return (
    <nav className="nav" aria-label="Разделы">
      <div className="brand">Мой режим</div>
      <SyncBadge />
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={n.primary ? 'primary' : 'secondary'}>
          <n.icon />
          <span className="label">{n.label}</span>
          {n.to === '/insights' && !!openSuggestions && <span className="count">{openSuggestions}</span>}
        </NavLink>
      ))}
      <NavLink to="/more" className={inMore ? 'more active' : 'more'}>
        <Icons.more />
        <span className="label">Ещё</span>
        {!!openSuggestions && <span className="count">{openSuggestions}</span>}
      </NavLink>
    </nav>
  )
}

/** «Ещё» на телефоне: остальные разделы списком, как в iOS. */
function MoreScreen({ openSuggestions }: { openSuggestions?: number }) {
  return (
    <div>
      <h1>Ещё</h1>
      <div className="group">
        {SECONDARY.map((n) => (
          <NavLink key={n.to} to={n.to} className="cell">
            <span className="cell-icon"><n.icon /></span>
            <span className="cell-label">{n.label}</span>
            {n.to === '/insights' && !!openSuggestions && <span className="count">{openSuggestions}</span>}
            <Icons.chevron />
          </NavLink>
        ))}
      </div>
      <p className="footnote"><SyncBadge /></p>
    </div>
  )
}

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
        <Nav openSuggestions={openSuggestions} />
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
            <Route path="/more" element={<MoreScreen openSuggestions={openSuggestions} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
