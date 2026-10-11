// Первичная настройка: справочник, упражнения, программы, шаблоны блюд пользователя.
import { autoBackupIfDue, requestPersistence } from '../db/backup'
import { fetchFoodsFile, loadFoodsIfNeeded } from '../db/foods'
import type { AppDB } from '../db/schema'
import { startProgram } from '../domain/phases'
import { SEED_EXERCISES, seedPrograms } from '../domain/seed'
import type { MealTemplate, PortionItem, Profile } from '../domain/types'

/** Запускается при каждом открытии приложения. */
export async function startup(db: AppDB): Promise<void> {
  const persist = await requestPersistence()
  await db.settings.put({ key: 'persist', value: persist })
  await loadFoodsIfNeeded(db, fetchFoodsFile)
  try {
    await autoBackupIfDue(db)
  } catch (e) {
    console.warn('Автокопия не удалась', e)
  }
}

async function seedTemplates(db: AppDB): Promise<void> {
  if (await db.templates.count()) return
  const foods = await db.foods.where('kind').equals('generic').toArray()
  const id = (name: string) => {
    const f = foods.find((x) => x.name === name)
    if (!f) throw new Error(`Нет продукта «${name}» в справочнике`)
    return f.id!
  }
  const it = (name: string, grams: number): PortionItem => ({ foodId: id(name), grams })
  const templates: MealTemplate[] = [
    {
      name: 'Мой бутерброд',
      items: [it('Хлеб белый (тостовый)', 50), it('Сливочный сыр', 20), it('Нарезка из грудки индейки', 40), it('Сыр лёгкий (швейцарский 5%)', 20), it('Помидор', 50)],
      variants: [{
        name: 'цельнозерновой, домашняя грудка',
        items: [it('Хлеб цельнозерновой', 60), it('Сливочный сыр', 15), it('Филе индейки запечённое', 50), it('Сыр лёгкий (швейцарский 5%)', 20), it('Помидор', 50), it('Огурец', 40), it('Руккола', 10)],
      }],
    },
    {
      name: 'Мой греческий салат',
      items: [it('Помидор', 150), it('Огурец', 120), it('Перец сладкий красный', 75), it('Сыр фета', 50), it('Маслины', 40)],
      variants: [{
        name: 'с нутом',
        items: [it('Помидор', 150), it('Огурец', 120), it('Перец сладкий красный', 75), it('Сыр фета', 30), it('Маслины', 20), it('Нут консервированный (промытый)', 80), it('Руккола', 20)],
      }],
    },
    {
      name: 'Овсянка с яйцом',
      items: [it('Овсяные хлопья (сухие)', 50), it('Яйцо куриное', 55), it('Черника замороженная', 100)],
      variants: [{ name: 'с творогом', items: [it('Овсяные хлопья (сухие)', 50), it('Яйцо куриное', 55), it('Черника замороженная', 100), it('Творог 5% (зернёный)', 100)] }],
    },
  ]
  await db.templates.bulkAdd(templates)
}

async function seedTraining(db: AppDB): Promise<void> {
  if (!(await db.exercises.count())) await db.exercises.bulkAdd(SEED_EXERCISES)
  if (await db.programs.count()) return
  const all = await db.exercises.toArray()
  const idOf = (name: string) => all.find((e) => e.name === name)!.id!
  await db.programs.bulkAdd(seedPrograms(idOf))
}

/** Мастер первого запуска: профиль, этап, начальные данные. */
export async function createProfile(db: AppDB, profile: Profile): Promise<void> {
  await loadFoodsIfNeeded(db, fetchFoodsFile)
  await db.transaction('rw', [db.profiles, db.phases], async () => {
    await db.profiles.put(profile)
    if (!(await db.phases.count())) await db.phases.bulkAdd(startProgram(profile))
  })
  await seedTraining(db)
  await seedTemplates(db)
}
