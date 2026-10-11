import { AppDB, SCHEMA_VERSION, TABLE_NAMES, type TableName } from './schema'
import { keepStamps } from './sync'

export interface BackupFile {
  app: 'sport-tracker'
  schemaVersion: number
  createdAt: string
  tables: Record<TableName, unknown[]>
}

/** Ключи настроек, которые не переносятся в копию (дескрипторы файловой системы, служебное). */
const LOCAL_ONLY_SETTINGS = new Set(['backupDir', 'lastBackupAt'])

export async function exportAll(db: AppDB): Promise<BackupFile> {
  const tables = {} as Record<TableName, unknown[]>
  for (const name of TABLE_NAMES) {
    let rows = await db.table(name).toArray()
    if (name === 'settings') rows = rows.filter((r: { key: string }) => !LOCAL_ONLY_SETTINGS.has(r.key))
    tables[name] = rows
  }
  return { app: 'sport-tracker', schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), tables }
}

export class BackupFormatError extends Error {}

export function parseBackup(text: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupFormatError('Файл не является JSON')
  }
  const b = data as Partial<BackupFile>
  if (b.app !== 'sport-tracker' || typeof b.schemaVersion !== 'number' || !b.tables) {
    throw new BackupFormatError('Это не резервная копия приложения')
  }
  if (b.schemaVersion > SCHEMA_VERSION) {
    throw new BackupFormatError(`Копия сделана более новой версией приложения (схема ${b.schemaVersion})`)
  }
  return b as BackupFile
}

/** Полностью заменяет данные содержимым копии (локальные настройки сохраняются). */
export async function importAll(db: AppDB, backup: BackupFile): Promise<void> {
  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async (tx) => {
    keepStamps(tx)
    for (const name of TABLE_NAMES) {
      const table = db.table(name)
      const rows = backup.tables[name] ?? []
      if (name === 'settings') {
        const keep = (await table.toArray()).filter((r: { key: string }) => LOCAL_ONLY_SETTINGS.has(r.key))
        await table.clear()
        await table.bulkPut([...rows, ...keep])
      } else {
        await table.clear()
        await table.bulkAdd(rows)
      }
    }
  })
}

export function backupFileName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `sport-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`
}

// ---------- Постоянное хранилище ----------

export type PersistStatus = 'persistent' | 'not-persistent' | 'unsupported'

export async function requestPersistence(): Promise<PersistStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported'
  if (await navigator.storage.persisted()) return 'persistent'
  return (await navigator.storage.persist()) ? 'persistent' : 'not-persistent'
}

// ---------- Автокопия в папку (File System Access API) ----------

export const KEEP_BACKUPS = 14
const DAY_MS = 24 * 60 * 60 * 1000
const BACKUP_NAME_RE = /^sport-backup-\d{4}-\d{2}-\d{2}\.json$/

interface Writable {
  write(d: string): Promise<void>
  close(): Promise<void>
}
export interface DirHandle {
  name: string
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{ createWritable(): Promise<Writable> }>
  removeEntry(name: string): Promise<void>
  keys(): AsyncIterable<string>
}

export function folderBackupSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function chooseBackupFolder(db: AppDB): Promise<string> {
  const w = window as unknown as { showDirectoryPicker(o: { mode: string }): Promise<DirHandle> }
  const dir = await w.showDirectoryPicker({ mode: 'readwrite' })
  await db.settings.put({ key: 'backupDir', value: dir })
  await writeBackupToFolder(db, dir)
  return dir.name
}

export type FolderStatus = 'not-configured' | 'needs-permission' | 'ok' | 'unsupported'

async function getDir(db: AppDB): Promise<DirHandle | undefined> {
  return (await db.settings.get('backupDir'))?.value as DirHandle | undefined
}

export async function folderStatus(db: AppDB): Promise<FolderStatus> {
  if (!folderBackupSupported()) return 'unsupported'
  const dir = await getDir(db)
  if (!dir) return 'not-configured'
  return (await dir.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'needs-permission'
}

export async function regrantFolder(db: AppDB): Promise<boolean> {
  const dir = await getDir(db)
  if (!dir) return false
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export async function writeBackupToFolder(db: AppDB, dir: DirHandle, now = new Date()): Promise<void> {
  const file = await dir.getFileHandle(backupFileName(now), { create: true })
  const w = await file.createWritable()
  await w.write(JSON.stringify(await exportAll(db)))
  await w.close()
  const names: string[] = []
  for await (const n of dir.keys()) if (BACKUP_NAME_RE.test(n)) names.push(n)
  names.sort()
  for (const old of names.slice(0, Math.max(0, names.length - KEEP_BACKUPS))) await dir.removeEntry(old)
  await db.settings.put({ key: 'lastBackupAt', value: now.toISOString() })
}

/** Вызывается при открытии приложения: не чаще раза в день пишет копию в папку. */
export async function autoBackupIfDue(db: AppDB): Promise<'written' | 'not-due' | FolderStatus> {
  const status = await folderStatus(db)
  if (status !== 'ok') return status
  const last = (await db.settings.get('lastBackupAt'))?.value as string | undefined
  if (last && Date.now() - new Date(last).getTime() < DAY_MS) return 'not-due'
  await writeBackupToFolder(db, (await getDir(db))!)
  return 'written'
}

export async function lastBackupAt(db: AppDB): Promise<string | undefined> {
  return (await db.settings.get('lastBackupAt'))?.value as string | undefined
}

/** Нужна ли напоминалка о ручной копии (копии не было больше недели). */
export async function manualBackupReminderDue(db: AppDB): Promise<boolean> {
  const last = await lastBackupAt(db)
  return !last || Date.now() - new Date(last).getTime() > 7 * DAY_MS
}

/** Скачивание копии файлом (запасной вариант без доступа к папке). */
export async function downloadBackup(db: AppDB): Promise<void> {
  const blob = new Blob([JSON.stringify(await exportAll(db))], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = backupFileName(new Date())
  a.click()
  URL.revokeObjectURL(a.href)
  await db.settings.put({ key: 'lastBackupAt', value: new Date().toISOString() })
}
