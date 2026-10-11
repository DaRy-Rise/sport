import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDB, TABLE_NAMES } from './schema'
import { BackupFormatError, KEEP_BACKUPS, exportAll, importAll, parseBackup, writeBackupToFolder, type DirHandle } from './backup'

let db: AppDB
afterEach(async () => {
  await db.delete()
})

function fakeDir(initial: string[] = []): DirHandle & { files: Map<string, string> } {
  const files = new Map<string, string>(initial.map((n) => [n, '{}']))
  return {
    name: 'backups',
    files,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async (name) => ({
      createWritable: async () => {
        let buf = ''
        return { write: async (d: string) => void (buf += d), close: async () => void files.set(name, buf) }
      },
    }),
    removeEntry: async (name) => void files.delete(name),
    keys: async function* () {
      yield* [...files.keys()]
    },
  }
}

describe('резервная копия', () => {
  it('экспорт → очистка → импорт восстанавливает идентичные данные', async () => {
    db = new AppDB('test-backup')
    await db.phases.add({ kind: 'weight', startDate: '2026-10-11' })
    await db.days.bulkAdd([{ date: '2026-10-11', weightKg: 60 }, { date: '2026-10-12', weightKg: 59.6, saltyEvening: true }])
    await db.foods.add({ kind: 'packaged', name: 'Карпаччо', brand: 'Дзержинка', synonyms: [], per100: { protein: { v: 20, acc: 'exact' } }, measures: [] })
    await db.settings.put({ key: 'foodsVersion', value: 3 })
    await db.settings.put({ key: 'backupDir', value: 'local-handle' })
    const before = await exportAll(db)
    const text = JSON.stringify(before)

    for (const n of TABLE_NAMES) await db.table(n).clear()
    await db.settings.put({ key: 'backupDir', value: 'local-handle' })
    await importAll(db, parseBackup(text))

    const after = await exportAll(db)
    expect(after.tables).toEqual(before.tables)
    expect((await db.settings.get('backupDir'))?.value).toBe('local-handle')
  })

  it('отклоняет чужой файл', () => {
    expect(() => parseBackup('{"a":1}')).toThrow(BackupFormatError)
    expect(() => parseBackup('не json')).toThrow(BackupFormatError)
  })

  it('пишет файл с датой в папку и хранит не больше 14 копий', async () => {
    db = new AppDB('test-backup-dir')
    const old = Array.from({ length: 15 }, (_, i) => `sport-backup-2026-09-${String(i + 1).padStart(2, '0')}.json`)
    const dir = fakeDir([...old, 'other.txt'])
    await writeBackupToFolder(db, dir, new Date(2026, 9, 11))
    expect(dir.files.has('sport-backup-2026-10-11.json')).toBe(true)
    expect([...dir.files.keys()].filter((n) => n.startsWith('sport-backup')).length).toBe(KEEP_BACKUPS)
    expect(dir.files.has('other.txt')).toBe(true)
    expect(JSON.parse(dir.files.get('sport-backup-2026-10-11.json')!).app).toBe('sport-tracker')
  })
})
