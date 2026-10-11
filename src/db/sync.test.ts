import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDB } from './schema'
import {
  connect, githubRemote, mergeDocs, parseDoc, readLocal, serializeDoc, syncOnce, type Remote, type SyncDoc,
} from './sync'
import type { Profile } from '../domain/types'

const profile: Profile = {
  effectiveFrom: '2026-10-11', sex: 'female', birthDate: '2001-05-01', heightCm: 166, weightKg: 60, targetWeightKg: 55,
  activityFactor: 1.5, startDate: '2026-10-11', calibrationDays: 14, targetWake: '07:40', sleepDurationH: 8, plannedLoadDays: 4,
}

/** «GitHub» в памяти: хранит текст файла и sha, как настоящий. */
function memoryRemote() {
  let file: { text: string; sha: string } | null = null
  let n = 0
  const remote: Remote & { commits: () => number } = {
    commits: () => n,
    async get() { return file ? { doc: parseDoc(file.text), sha: file.sha } : null },
    async put(doc, sha) {
      if ((file?.sha ?? undefined) !== sha) return 'conflict'
      file = { text: serializeDoc(doc), sha: `sha${++n}` }
      return file.sha
    },
  }
  return remote
}

const dbs: AppDB[] = []
const open = (name: string) => { const db = new AppDB(name); dbs.push(db); return db }
afterEach(async () => { for (const db of dbs.splice(0)) await db.delete() })
const tick = () => new Promise((r) => setTimeout(r, 5))

describe('отметки изменений', () => {
  it('новая запись получает случайный большой id и время изменения, удаление запоминается', async () => {
    const db = open('stamps')
    const id = await db.tares.add({ name: 'кастрюля', weightG: 800 })
    const row = (await db.tares.get(id)) as { _u?: number } | undefined
    expect(id).toBeGreaterThan(1e12)
    expect(row?._u).toBeTypeOf('number')
    await db.tares.delete(id)
    await tick()
    expect((await db.tombstones.toArray()).map((t) => t.id)).toEqual([`tares|${id}`])
  })
})

describe('два устройства', () => {
  it('телефон без профиля берёт данные компьютера; правки с обеих сторон сходятся', async () => {
    const remote = memoryRemote()
    const pc = open('pc')
    const phone = open('phone')
    await pc.profiles.put(profile)
    await pc.days.put({ date: '2026-10-11', weightKg: 60 })
    const foodId = await pc.foods.add({ kind: 'generic', name: 'Гречка', synonyms: [], measures: [], per100: {} })

    expect(await connect(pc, remote)).toBe('pushed')
    expect(await connect(phone, remote)).toBe('pulled')
    expect(await phone.profiles.count()).toBe(1)
    expect((await phone.foods.get(foodId))?.name).toBe('Гречка')

    // Телефон записывает сон, компьютер — дневник; компьютер удаляет продукт.
    await phone.sleep.put({ date: '2026-10-12', bedtime: '23:30', wake: '07:40', quality: 4 })
    await pc.diary.add({ date: '2026-10-12', meal: 'lunch', label: 'обед', source: { type: 'food', id: foodId! }, grams: 200, comp: {} })
    await pc.foods.delete(foodId)
    await tick()
    await syncOnce(phone, remote)
    await syncOnce(pc, remote)
    await syncOnce(phone, remote)

    for (const db of [pc, phone]) {
      expect(await db.sleep.get('2026-10-12')).toBeTruthy()
      expect(await db.diary.count()).toBe(1)
      expect(await db.foods.get(foodId)).toBeUndefined()
    }
    // Повторная синхронизация без изменений не создаёт новых коммитов.
    const before = remote.commits()
    await syncOnce(pc, remote)
    await syncOnce(phone, remote)
    expect(remote.commits()).toBe(before)
  })

  it('одна и та же запись изменена на двух устройствах — остаётся более поздняя правка', async () => {
    const remote = memoryRemote()
    const pc = open('pc2')
    const phone = open('phone2')
    await pc.profiles.put(profile)
    await connect(pc, remote)
    await connect(phone, remote)
    await pc.days.put({ date: '2026-10-13', weightKg: 59.8 })
    await tick()
    await phone.days.put({ date: '2026-10-13', weightKg: 59.6 })
    await syncOnce(pc, remote)
    await syncOnce(phone, remote)
    await syncOnce(pc, remote)
    expect((await pc.days.get('2026-10-13'))?.weightKg).toBe(59.6)
    expect((await phone.days.get('2026-10-13'))?.weightKg).toBe(59.6)
  })

  it('профиль есть на обоих устройствах — спрашиваем, какие данные оставить', async () => {
    const remote = memoryRemote()
    const pc = open('pc3')
    const phone = open('phone3')
    await pc.profiles.put(profile)
    await phone.profiles.put({ ...profile, targetWake: '07:00' })
    await connect(pc, remote)
    expect(await connect(phone, remote)).toBe('needs-choice')
    expect(await connect(phone, remote, 'take-remote')).toBe('pulled')
    expect((await phone.profiles.get('2026-10-11'))?.targetWake).toBe('07:40')
  })

  it('настройки устройства (папка копий, версия справочника) не синхронизируются', async () => {
    const db = open('local-only')
    await db.settings.bulkPut([{ key: 'lastBackupAt', value: 'x' }, { key: 'foodsVersion', value: 1 }, { key: 'adaptation', value: { active: false } }])
    const doc = await readLocal(db)
    expect(doc.tables.settings.map((r) => r.key)).toEqual(['adaptation'])
  })
})

describe('документ', () => {
  it('сериализация читается обратно и устойчива к русским буквам', () => {
    const d: SyncDoc = mergeDocs(
      { app: 'sport-tracker-sync', version: 1, updatedAt: '2026-10-11T10:00:00Z', tables: { days: [{ date: '2026-10-11', note: 'солёный ужин', _u: 1 }] } as never, tombstones: [] },
      { app: 'sport-tracker-sync', version: 1, updatedAt: '2026-10-11T10:00:00Z', tables: {} as never, tombstones: [{ id: 'tares|5', table: 'tares', key: 5, _u: 2 }] },
    )
    const back = parseDoc(serializeDoc(d))
    expect(back.tables.days).toEqual([{ date: '2026-10-11', note: 'солёный ужин', _u: 1 }])
    expect(back.tombstones).toHaveLength(1)
  })

  it('удалённая запись не воскресает, если на другом устройстве её не меняли', () => {
    const a = { app: 'sport-tracker-sync', version: 1, updatedAt: '', tables: { tares: [{ id: 5, name: 'миска', _u: 1 }] } as never, tombstones: [] } as SyncDoc
    const b = { app: 'sport-tracker-sync', version: 1, updatedAt: '', tables: {} as never, tombstones: [{ id: 'tares|5', table: 'tares', key: 5, _u: 2 }] } as SyncDoc
    expect(mergeDocs(a, b).tables.tares).toEqual([])
  })
})

describe('GitHub API', () => {
  const cfg = { owner: 'me', repo: 'sport-data', token: 't', path: 'sport-data.json' }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('файла нет, репозиторий есть → null; запись возвращает sha; 409 → конфликт', async () => {
    const calls: { url: string; method: string; body?: string }[] = []
    let putStatus = 201
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string })
      if (init?.method === 'PUT') return putStatus === 201 ? json(201, { content: { sha: 'abc' } }) : json(409, {})
      if (url.endsWith('/contents/sport-data.json')) return json(404, {})
      return json(200, { name: 'sport-data' })
    }) as typeof fetch
    const r = githubRemote(cfg, fetchFn)
    expect(await r.get()).toBeNull()
    const doc = mergeDocs({ app: 'sport-tracker-sync', version: 1, updatedAt: '2026-10-11T10:00:00.000Z', tables: { days: [{ date: '2026-10-11', note: 'ёж', _u: 1 }] } as never, tombstones: [] },
      { app: 'sport-tracker-sync', version: 1, updatedAt: '', tables: {} as never, tombstones: [] })
    expect(await r.put(doc, undefined)).toBe('abc')
    const body = JSON.parse(calls.at(-1)!.body!)
    expect(parseDoc(new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)))).tables.days[0].note).toBe('ёж')
    putStatus = 409
    expect(await r.put(doc, 'old')).toBe('conflict')
  })

  it('понятные ошибки: неверный токен, нет репозитория', async () => {
    const r401 = githubRemote(cfg, (async () => json(401, {})) as unknown as typeof fetch)
    await expect(r401.get()).rejects.toThrow('токен')
    const r404 = githubRemote(cfg, (async () => json(404, {})) as unknown as typeof fetch)
    await expect(r404.get()).rejects.toThrow('не найден')
  })
})
