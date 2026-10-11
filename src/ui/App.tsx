import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { Icons } from './icons'
import { folderStatus, manualBackupReminderDue, type FolderStatus } from '../db/backup'
import { db } from './data'
import { startup } from './setup'
import { SyncButton } from './SyncCard'
import { startSyncRunner, useSyncStatus } from './sync'
import { Wizard } from './screens/Wizard'
import { TodayScreen } from './screens/Today'
import { DiaryScreen } from './screens/Diary'
import { FoodsScreen } from './screens/Foods'
import { TrainingScreen } from './screens/Training'
import { SleepScreen } from './screens/Sleep'
import { InsightsScreen } from './screens/Insights'
import { ProfileScreen } from './screens/Profile'

// Пять вкладок (по HIG — не больше пяти и без вкладки «Ещё»). Продукты открываются из Дневника,
// профиль — круглой кнопкой справа вверху, как в «Здоровье».
const TABS = [
  { to: '/', label: 'Сегодня', icon: Icons.today, also: [] as string[] },
  { to: '/diary', label: 'Дневник', icon: Icons.diary, also: ['/foods'] },
  { to: '/training', label: 'Тренировки', icon: Icons.training, also: [] },
  { to: '/sleep', label: 'Сон', icon: Icons.sleep, also: [] },
  { to: '/insights', label: 'Обзор', icon: Icons.insights, also: [] },
]

function TabBar({ openSuggestions }: { openSuggestions?: number }) {
  const { pathname } = useLocation()
  return (
    <nav className="tabbar glass" aria-label="Разделы">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'}
          className={({ isActive }) => (isActive || t.also.some((p) => pathname.startsWith(p)) ? 'tab active' : 'tab')}>
          <t.icon />
          <span className="label">{t.label}</span>
          {t.to === '/insights' && !!openSuggestions && <span className="count">{openSuggestions}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

/** Верхняя панель: на широком экране — название, вкладки по центру, действия справа; на телефоне — только действия. */
function Toolbar({ openSuggestions }: { openSuggestions?: number }) {
  return (
    <header className="toolbar">
      <div className="toolbar-inner">
        <span className="brand"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="26" height="26" />Мой режим</span>
        <TabBar openSuggestions={openSuggestions} />
        <div className="toolbar-actions">
          <SyncButton />
          <NavLink to="/profile" className="glass circle" aria-label="Профиль и этапы" title="Профиль и этапы"><Icons.profile /></NavLink>
        </div>
      </div>
    </header>
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
  if (profileCount === 0) return <div className="main narrow"><Wizard /></div>

  return (
    <HashRouter>
      <div className="app">
        <Toolbar openSuggestions={openSuggestions} />
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
