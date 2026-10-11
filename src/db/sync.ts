// Синхронизация между устройствами через файл в приватном репозитории GitHub.
//
// Каждая запись получает отметку времени изменения `_u`, новые записи — случайный id
// (чтобы id с телефона и компьютера не совпадали). Удаления запоминаются в таблице
// tombstones. Слияние: по каждой записи побеждает более поздняя версия.
import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie'
import type { AppDB } from './schema'
import { TABLE_NAMES, type TableName } from './tables'

export type Row = Record<string, unknown> & { _u?: number }
export interface Tombstone { id: string; table: string; key: unknown; _u: number }

export interface SyncDoc {
  app: 'sport-tracker-sync'
  version: 1
  updatedAt: string
  tables: Record<TableName, Row[]>
  tombstones: Tombstone[]
}

/** Первичный ключ каждой таблицы. */
export const PRIMARY_KEY: Record<TableName, string> = {
  profiles: 'effectiveFrom', phases: 'id', foods: 'id', templates: 'id', batches: 'id', tares: 'id',
  yields: 'foodId', diary: 'id', days: 'date', exercises: 'id', programs: 'id', workouts: 'id',
  sets: 'id', sleep: 'date', suggestions: 'id', settings: 'key',
}
const AUTO_ID = new Set<string>(TABLE_NAMES.filter((t) => PRIMARY_KEY[t] === 'id'))
const SYNCED = new Set<string>(TABLE_NAMES)

/** Настройки, которые относятся только к этому устройству и не синхронизируются. */
export const DEVICE_SETTINGS = new Set(['backupDir', 'lastBackupAt', 'persist', 'foodsVersion'])

const APPLY_FLAG = '__sportSyncApply'

/** Случайный id: не пересекается с id другого устройства и со старыми маленькими id. */
export function newId(): number {
  return 1e12 + Math.floor(Math.random() * 8e15)
}

const tombId = (table: string, key: unknown) => `${table}|${JSON.stringify(key)}`

// ---------- Отметки изменений (middleware Dexie) ----------

let changeListener: (() => void) | null = null
/** Вызывается после каждого локального изменения синхронизируемых данных. */
export function onLocalChange(fn: (() => void) | null): void {
  changeListener = fn
}

export function syncMiddleware(db: AppDB): Middleware<DBCore> {
  let pending: Tombstone[] = []
  let flushing: Promise<void> | null = null
  const flush = () => {
    flushing ??= new Promise<void>((resolve) => setTimeout(async () => {
      const batch = pending
      pending = []
      flushing = null
      try { if (batch.length) await db.tombstones.bulkPut(batch) } catch (e) { console.warn('Не удалось записать удаление для синхронизации', e) } finally { resolve() }
    }, 0))
    return flushing
  }
  ;(db as unknown as { flushTombstones: () => Promise<void> }).flushTombstones = () => flushing ?? Promise.resolve()

  return {
    stack: 'dbcore',
    name: 'sport-sync',
    create(down) {
      return {
        ...down,
        table(name: string): DBCoreTable {
          const t = down.table(name)
          if (!SYNCED.has(name)) return t
          return {
            ...t,
            async mutate(req: DBCoreMutateRequest) {
              if ((req.trans as unknown as Record<string, unknown>)[APPLY_FLAG]) return t.mutate(req)
              let relevant = true
              if (req.type === 'add' || req.type === 'put') {
                const now = Date.now()
                const values = req.values.map((v: Row) => {
                  const o: Row = { ...v, _u: now }
                  if (AUTO_ID.has(name) && o.id === undefined) o.id = newId()
                  return o
                })
                if (name === 'settings') relevant = values.some((v) => !DEVICE_SETTINGS.has(v.key as string))
                const res = await t.mutate({ ...req, values })
                if (relevant) changeListener?.()
                return res
              }
              const res = await t.mutate(req)
              if (req.type === 'delete') {
                const now = Date.now()
                pending.push(...req.keys.map((key) => ({ id: tombId(name, key), table: name, key, _u: now })))
                void flush()
              }
              changeListener?.()
              return res
            },
          }
        },
      }
    },
  }
}

// ---------- Документ и слияние (чистые функции) ----------

const keyOf = (table: TableName, row: Row) => JSON.stringify(row[PRIMARY_KEY[table]])

export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  const tombs = new Map<string, Tombstone>()
  for (const t of [...a.tombstones, ...b.tombstones]) {
    const prev = tombs.get(t.id)
    if (!prev || t._u > prev._u) tombs.set(t.id, t)
  }
  const tables = {} as Record<TableName, Row[]>
  for (const name of TABLE_NAMES) {
    const rows = new Map<string, Row>()
    for (const r of [...(a.tables[name] ?? []), ...(b.tables[name] ?? [])]) {
      const k = keyOf(name, r)
      const prev = rows.get(k)
      if (!prev || (r._u ?? 0) > (prev._u ?? 0)) rows.set(k, r)
    }
    tables[name] = [...rows.values()].filter((r) => {
      const t = tombs.get(tombId(name, r[PRIMARY_KEY[name]]))
      return !t || (r._u ?? 0) > t._u
    })
  }
  return { app: 'sport-tracker-sync', version: 1, updatedAt: new Date().toISOString(), tables, tombstones: [...tombs.values()] }
}

/** Отличается ли содержимое документов (без учёта порядка строк). */
export function docsDiffer(a: SyncDoc, b: SyncDoc): boolean {
  const sig = (d: SyncDoc) => {
    const parts: string[] = []
    for (const name of TABLE_NAMES) for (const r of d.tables[name] ?? []) parts.push(`${name}|${keyOf(name, r)}|${r._u ?? 0}`)
    for (const t of d.tombstones) parts.push(`t|${t.id}|${t._u}`)
    return parts.sort().join('\n')
  }
  return sig(a) !== sig(b)
}

/** Текст файла: одна запись на строку — так история в git остаётся компактной и читаемой. */
export function serializeDoc(d: SyncDoc): string {
  const lines = [`{"app":"sport-tracker-sync","version":1,"updatedAt":${JSON.stringify(d.updatedAt)},"tables":{`]
  TABLE_NAMES.forEach((name, i) => {
    const rows = d.tables[name] ?? []
    lines.push(`${JSON.stringify(name)}:[`)
    rows.forEach((r, j) => lines.push(JSON.stringify(r) + (j < rows.length - 1 ? ',' : '')))
    lines.push(`]${i < TABLE_NAMES.length - 1 ? ',' : ''}`)
  })
  lines.push('},"tombstones":[')
  d.tombstones.forEach((t, j) => lines.push(JSON.stringify(t) + (j < d.tombstones.length - 1 ? ',' : '')))
  lines.push(']}')
  return lines.join('\n') + '\n'
}

export class SyncError extends Error {}

export function parseDoc(text: string): SyncDoc {
  let d: Partial<SyncDoc>
  try {
    d = JSON.parse(text)
  } catch {
    throw new SyncError('Файл данных в GitHub повреждён (не JSON)')
  }
  if (d.app !== 'sport-tracker-sync' || !d.tables) throw new SyncError('В репозитории лежит файл не от этого приложения')
  if ((d.version ?? 0) > 1) throw new SyncError('Данные в GitHub записаны более новой версией приложения — обновите приложение')
  return { ...d, tombstones: d.tombstones ?? [] } as SyncDoc
}

// ---------- Локальная база ----------

export async function readLocal(db: AppDB): Promise<SyncDoc> {
  await (db as unknown as { flushTombstones?: () => Promise<void> }).flushTombstones?.()
  const tables = {} as Record<TableName, Row[]>
  for (const name of TABLE_NAMES) {
    let rows = (await db.table(name).toArray()) as Row[]
    if (name === 'settings') rows = rows.filter((r) => !DEVICE_SETTINGS.has(r.key as string))
    tables[name] = rows
  }
  return { app: 'sport-tracker-sync', version: 1, updatedAt: new Date().toISOString(), tables, tombstones: await db.tombstones.toArray() }
}

/** Записи внутри этой транзакции сохраняют свои отметки времени (восстановление, данные с другого устройства). */
export function keepStamps(tx: { idbtrans: unknown }): void {
  ;(tx.idbtrans as Record<string, unknown>)[APPLY_FLAG] = true
}

async function inApplyTx(db: AppDB, fn: () => Promise<void>): Promise<void> {
  await db.transaction('rw', [...TABLE_NAMES.map((n) => db.table(n)), db.tombstones], async (tx) => {
    keepStamps(tx)
    await fn()
  })
}

/**
 * Записывает результат слияния в локальную базу. Запись, изменённая на устройстве
 * уже после чтения (её `_u` новее), не перезаписывается — она уйдёт со следующей синхронизацией.
 */
export async function applyMerged(db: AppDB, merged: SyncDoc): Promise<number> {
  let changed = 0
  await inApplyTx(db, async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name)
      const pk = PRIMARY_KEY[name]
      const current = new Map<string, Row>()
      for (const r of (await table.toArray()) as Row[]) {
        if (name === 'settings' && DEVICE_SETTINGS.has(r.key as string)) continue
        current.set(keyOf(name, r), r)
      }
      const puts: Row[] = []
      const keep = new Set<string>()
      for (const r of merged.tables[name] ?? []) {
        const k = keyOf(name, r)
        keep.add(k)
        const cur = current.get(k)
        if (!cur || (cur._u ?? 0) < (r._u ?? 0)) puts.push(r)
      }
      const tombs = new Map(merged.tombstones.filter((t) => t.table === name).map((t) => [JSON.stringify(t.key), t._u]))
      const dels = [...current].filter(([k, r]) => !keep.has(k) && tombs.has(k) && (r._u ?? 0) <= tombs.get(k)!).map(([, r]) => r[pk])
      if (puts.length) await table.bulkPut(puts)
      if (dels.length) await table.bulkDelete(dels as never[])
      changed += puts.length + dels.length
    }
    await db.tombstones.bulkPut(merged.tombstones)
  })
  return changed
}

/** Полностью заменяет синхронизируемые данные устройства документом (настройки устройства сохраняются). */
export async function replaceLocal(db: AppDB, doc: SyncDoc): Promise<void> {
  await inApplyTx(db, async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name)
      if (name === 'settings') {
        const keys = ((await table.toArray()) as Row[]).filter((r) => !DEVICE_SETTINGS.has(r.key as string)).map((r) => r.key)
        await table.bulkDelete(keys as never[])
        await table.bulkPut((doc.tables.settings ?? []).filter((r) => !DEVICE_SETTINGS.has(r.key as string)))
      } else {
        await table.clear()
        await table.bulkPut(doc.tables[name] ?? [])
      }
    }
    await db.tombstones.clear()
    await db.tombstones.bulkPut(doc.tombstones)
  })
}

// ---------- GitHub ----------

export interface SyncConfig { owner: string; repo: string; token: string; path: string }

export interface RemoteFile { doc: SyncDoc; sha: string }

export interface Remote {
  /** null — файла ещё нет. */
  get(): Promise<RemoteFile | null>
  /** Возвращает sha новой версии; 'conflict' — файл успели изменить с другого устройства. */
  put(doc: SyncDoc, sha: string | undefined): Promise<string | 'conflict'>
}

const API = 'https://api.github.com'

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
function base64ToUtf8(b: string): string {
  const bin = atob(b.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function githubRemote(cfg: SyncConfig, fetchFn: typeof fetch = fetch.bind(globalThis)): Remote {
  const base = `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`
  const fileUrl = `${base}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`
  const headers = (accept = 'application/vnd.github+json') => ({
    Authorization: `Bearer ${cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28',
  })
  const call = async (url: string, init: RequestInit = {}, accept?: string) => {
    let res: Response
    try {
      res = await fetchFn(url, { ...init, cache: 'no-store', headers: { ...headers(accept), ...(init.headers ?? {}) } })
    } catch {
      throw new SyncError('Нет связи с GitHub')
    }
    if (res.status === 401) throw new SyncError('GitHub не принял токен: проверьте его или создайте новый')
    if (res.status === 403) throw new SyncError('У токена нет прав на этот репозиторий (нужно Contents: Read and write)')
    return res
  }
  return {
    async get() {
      const res = await call(fileUrl)
      if (res.status === 404) {
        const repo = await call(base)
        if (repo.status === 404) throw new SyncError(`Репозиторий ${cfg.owner}/${cfg.repo} не найден или у токена нет к нему доступа`)
        return null
      }
      if (!res.ok) throw new SyncError(`GitHub ответил ошибкой ${res.status}`)
      const meta = (await res.json()) as { sha: string; content?: string; encoding?: string }
      let text: string
      if (meta.encoding === 'base64' && meta.content) text = base64ToUtf8(meta.content)
      else {
        // Файлы больше 1 МБ API отдаёт только «сырыми».
        const raw = await call(fileUrl, {}, 'application/vnd.github.raw')
        if (!raw.ok) throw new SyncError(`GitHub ответил ошибкой ${raw.status}`)
        text = await raw.text()
      }
      return { doc: parseDoc(text), sha: meta.sha }
    },
    async put(doc, sha) {
      const res = await call(fileUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Данные ${doc.updatedAt.slice(0, 16).replace('T', ' ')}`, content: utf8ToBase64(serializeDoc(doc)), ...(sha ? { sha } : {}) }),
      })
      if (res.status === 409 || res.status === 422) return 'conflict'
      if (!res.ok) throw new SyncError(`GitHub не сохранил данные (ошибка ${res.status})`)
      return ((await res.json()) as { content: { sha: string } }).content.sha
    },
  }
}

// ---------- Синхронизация ----------

export interface SyncOutcome { pulled: number; pushed: boolean }

/** Один цикл: скачать, слить, записать у себя, отправить при отличиях. */
export async function syncOnce(db: AppDB, remote: Remote, opts: { replaceRemote?: boolean } = {}): Promise<SyncOutcome> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = await readLocal(db)
    const current = await remote.get()
    if (opts.replaceRemote || !current) {
      const sha = await remote.put(local, current?.sha)
      if (sha === 'conflict') continue
      return { pulled: 0, pushed: true }
    }
    const merged = mergeDocs(local, current.doc)
    const pulled = await applyMerged(db, merged)
    if (!docsDiffer(merged, current.doc)) return { pulled, pushed: false }
    const sha = await remote.put(merged, current.sha)
    if (sha !== 'conflict') return { pulled, pushed: true }
  }
  throw new SyncError('Данные одновременно меняются на другом устройстве — попробуйте ещё раз')
}

export type ConnectResult = 'pushed' | 'pulled' | 'empty' | 'needs-choice'

/**
 * Первое подключение устройства. Если в GitHub уже есть данные, а на устройстве тоже есть профиль,
 * слияние создало бы дубли стартовых данных (продукты, упражнения), поэтому спрашиваем, что оставить.
 */
export async function connect(db: AppDB, remote: Remote, choice?: 'take-remote' | 'replace-remote'): Promise<ConnectResult> {
  const current = await remote.get()
  const hasProfile = (await db.profiles.count()) > 0
  if (!current) {
    if (!hasProfile) return 'empty'
    await remote.put(await readLocal(db), undefined)
    return 'pushed'
  }
  if (!hasProfile || choice === 'take-remote') {
    await replaceLocal(db, current.doc)
    return 'pulled'
  }
  if (choice === 'replace-remote') {
    await syncOnce(db, remote, { replaceRemote: true })
    return 'pushed'
  }
  return 'needs-choice'
}
