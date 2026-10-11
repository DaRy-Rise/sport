// Фоновая синхронизация: при открытии, через 30 с после изменений, при сворачивании и возврате в приложение.
import { useSyncExternalStore } from 'react'
import type { AppDB } from '../db/schema'
import { connect, githubRemote, onLocalChange, syncOnce, SyncError, type ConnectResult, type SyncConfig } from '../db/sync'

const CONFIG_KEY = 'sport-sync'
const REPLACE_KEY = 'sport-sync-replace-remote'
const AFTER_CHANGE_MS = 30_000

// Настройки и токен хранятся только на этом устройстве: не в базе, не в копиях и не в GitHub.
export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as SyncConfig) : null
  } catch {
    return null
  }
}
function saveSyncConfig(cfg: SyncConfig | null): void {
  try {
    if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
    else localStorage.removeItem(CONFIG_KEY)
  } catch { /* приватный режим: синхронизация будет работать до закрытия вкладки */ }
}
function flag(key: string, value?: boolean): boolean {
  try {
    if (value === true) localStorage.setItem(key, '1')
    if (value === false) localStorage.removeItem(key)
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export interface SyncStatus {
  configured: boolean
  state: 'idle' | 'syncing' | 'error'
  lastAt?: string
  error?: string
  /** Есть изменения, ещё не отправленные в GitHub. */
  pending: boolean
}

let status: SyncStatus = { configured: !!loadSyncConfig(), state: 'idle', pending: false }
try { status.lastAt = localStorage.getItem('sport-sync-last') ?? undefined } catch { /* нет хранилища */ }
const listeners = new Set<() => void>()
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p }
  listeners.forEach((l) => l())
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => status)
}

let db: AppDB | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false

function schedule(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

export async function syncNow(): Promise<void> {
  const cfg = loadSyncConfig()
  if (!db || !cfg) return
  if (running) { again = true; return running }
  clearTimeout(timer)
  setStatus({ state: 'syncing' })
  running = (async () => {
    try {
      const replaceRemote = flag(REPLACE_KEY)
      setStatus({ pending: false })
      await syncOnce(db!, githubRemote(cfg), { replaceRemote })
      if (replaceRemote) flag(REPLACE_KEY, false)
      const lastAt = new Date().toISOString()
      try { localStorage.setItem('sport-sync-last', lastAt) } catch { /* нет хранилища */ }
      setStatus({ state: 'idle', lastAt, error: undefined })
    } catch (e) {
      setStatus({ state: 'error', pending: true, error: e instanceof SyncError ? e.message : `Ошибка синхронизации: ${(e as Error).message}` })
    } finally {
      running = null
      if (again) { again = false; schedule(1000) }
    }
  })()
  return running
}

/** Запускается один раз при старте приложения. */
export function startSyncRunner(database: AppDB): void {
  if (db) return
  db = database
  onLocalChange(() => {
    if (!loadSyncConfig()) return
    if (!status.pending) setStatus({ pending: true })
    schedule(AFTER_CHANGE_MS)
  })
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    // Свернули — отправляем несохранённое; вернулись — забираем правки с другого устройства.
    if (document.visibilityState === 'hidden' ? status.pending : true) void syncNow()
  })
  void syncNow()
}

/** Первое подключение устройства; конфиг сохраняется только при успехе. */
export async function connectSync(cfg: SyncConfig, choice?: 'take-remote' | 'replace-remote'): Promise<ConnectResult> {
  if (!db) throw new Error('Синхронизация не запущена')
  const result = await connect(db, githubRemote(cfg), choice)
  if (result !== 'needs-choice') {
    saveSyncConfig(cfg)
    const lastAt = new Date().toISOString()
    try { localStorage.setItem('sport-sync-last', lastAt) } catch { /* нет хранилища */ }
    setStatus({ configured: true, state: 'idle', error: undefined, lastAt, pending: false })
  }
  return result
}

export function disconnectSync(): void {
  saveSyncConfig(null)
  clearTimeout(timer)
  setStatus({ configured: false, state: 'idle', error: undefined, pending: false })
}

/** После восстановления из файла данные в GitHub должны быть заменены, а не слиты. */
export function replaceRemoteOnNextSync(): void {
  if (!loadSyncConfig()) return
  flag(REPLACE_KEY, true)
  void syncNow()
}
