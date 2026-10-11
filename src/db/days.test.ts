import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from './schema'
import { patchDay, saveNight, setAdaptation, setWeight } from './days'

let db: AppDB
beforeEach(() => {
  db = new AppDB('test-days')
})
afterEach(async () => {
  await db.delete()
})

describe('утренний вес', () => {
  it('Ввод веса: сохранён за дату', async () => {
    await setWeight(db, '2026-10-12', 59.4)
    expect((await db.days.get('2026-10-12'))?.weightKg).toBe(59.4)
  })

  it('Исправление: повторная запись заменяет', async () => {
    await setWeight(db, '2026-10-12', 59.4)
    await setWeight(db, '2026-10-12', 59.23)
    expect((await db.days.get('2026-10-12'))?.weightKg).toBe(59.2)
    expect(await db.days.count()).toBe(1)
  })

  it('очистка поля оставляет «не заполнено», а не «нет»', async () => {
    await patchDay(db, '2026-10-12', { saltyEvening: false, weightKg: 59 })
    await patchDay(db, '2026-10-12', { weightKg: undefined })
    const d = await db.days.get('2026-10-12')
    expect({ ...d, _u: undefined }).toEqual({ date: '2026-10-12', saltyEvening: false, _u: undefined })
  })
})

describe('сон', () => {
  it('Первая ночь сдвига помечена «адаптация»', async () => {
    await setAdaptation(db, { active: true, method: 'now', fromWake: '11:30', startDate: '2026-10-11' })
    await saveNight(db, { date: '2026-10-12', bedtime: '01:00', wake: '07:00', quality: 2 })
    expect((await db.sleep.get('2026-10-12'))?.adaptation).toBe(true)
    await setAdaptation(db, undefined)
    await saveNight(db, { date: '2026-10-20', bedtime: '23:00', wake: '07:00', quality: 4 })
    expect((await db.sleep.get('2026-10-20'))?.adaptation).toBe(false)
  })
})
