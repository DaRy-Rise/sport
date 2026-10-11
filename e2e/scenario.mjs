// Сквозная проверка в безголовом браузере (задача 13.1).
// Запуск: сначала `npx vite --port 5199`, затем `node e2e/scenario.mjs [папка-для-скриншотов]`.
// Каждый прогон использует чистый профиль браузера — данные приложения не затрагиваются.
import { writeFileSync } from 'node:fs'
import { check, checklist, launch, shots } from './lib.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5199/'
const shot = shots(process.argv[2] ?? 'e2e/out')

async function wizard(page, startDate) {
  await page.goto(BASE)
  await page.getByLabel('Дата рождения').fill('2001-03-01')
  await page.getByLabel('Рост, см').fill('166')
  await page.getByLabel('Текущий вес, кг').fill('60')
  await page.getByLabel('Целевой вес, кг').fill('55')
  await page.getByLabel('Дата старта программы').fill(startDate)
  await page.getByRole('button', { name: 'Начать' }).click()
  await page.getByRole('navigation').getByText('Сегодня').waitFor()
}

const text = (page) => page.locator('main').innerText()

// ---------- Часть 1: действия на экранах ----------
{
  const { browser, page, errors } = await launch()
  // Подмена выбора папки: папка из приватной файловой системы браузера (OPFS).
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const dir = await navigator.storage.getDirectory()
      dir.queryPermission = async () => 'granted'
      dir.requestPermission = async () => 'granted'
      return dir
    }
  })
  await wizard(page, '2026-10-11')
  let t = await text(page)
  check('мастер создаёт этап «вес» и калибровку', t.includes('Этап: Вес') && t.includes('калибровка: уходит вода (до 25 октября)'))
  await shot(page, 'today')

  await page.getByLabel('Вес утром, кг').fill('60')
  await page.waitForTimeout(300)
  check('вес сохраняется за дату', (await page.evaluate(() => window.__db.days.get('2026-10-11')))?.weightKg === 60)

  // Профиль: хранилище и автокопия
  await page.getByRole('link', { name: 'Профиль и этапы' }).click()
  await page.getByText('Хранилище и резервные копии').waitFor()
  t = await text(page)
  check('профиль показывает статус хранилища', /хранилище (не )?постоянное|не сообщает/.test(t), t.match(/хранилище[^\n]*/)?.[0])
  check('этап «вес», источник расхода — формула', t.includes('Этап: Вес') && t.includes('формула'))
  await page.getByRole('button', { name: 'Выбрать папку для копий' }).click()
  await page.getByText('Автокопия включена').waitFor()
  const files = await page.evaluate(async () => {
    const out = []
    for await (const n of (await navigator.storage.getDirectory()).keys()) out.push(n)
    return out
  })
  await page.waitForTimeout(300)
  check('баннер «копия не настроена» исчезает', !(await page.getByText('Резервная копия не настроена').isVisible()))
  check('после выбора папки в ней появляется файл копии с датой', files.includes('sport-backup-2026-10-11.json'), files.join(', '))
  await shot(page, 'profile')

  // Продукты: упаковка с аналогом
  // Продукты открываются из Дневника
  await page.getByRole('navigation').getByText('Дневник').click()
  await page.getByRole('link', { name: 'Продукты', exact: true }).click()
  await page.getByRole('button', { name: '+ Продукт в упаковке' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Название').fill('Карпаччо из индейки')
  await dlg.getByLabel('Производитель').fill('Дзержинка')
  await dlg.getByLabel('ккал').fill('100')
  await dlg.getByLabel('Белки, г').fill('20')
  await dlg.getByLabel('Жиры, г').fill('2')
  await dlg.getByLabel('Углеводы, г').fill('0,5')
  await dlg.getByRole('button', { name: 'Выбрать аналог' }).click()
  await dlg.getByLabel('Поиск продукта').fill('нарезка индейки')
  await dlg.getByRole('button', { name: /Нарезка из грудки индейки/ }).first().click()
  await shot(page, 'packaged-dialog')
  check('аналог даёт микронутриенты «примерно»', (await dlg.innerText()).includes('≈'))
  await dlg.getByRole('button', { name: 'Сохранить' }).click()
  await page.getByText('Карпаччо из индейки, Дзержинка').waitFor()
  check('продукт в упаковке сохранён', true)

  // Шаблоны
  await page.getByRole('tab', { name: 'Шаблоны' }).click()
  await page.getByText('Мой греческий салат').waitFor()
  t = await text(page)
  check('есть шаблоны пользователя с вариантами', t.includes('Мой греческий салат') && t.includes('вариант: с нутом') && t.includes('Овсянка с яйцом'))
  await shot(page, 'templates')

  // Тара и заготовка
  await page.getByRole('tab', { name: 'Тара' }).click()
  await page.getByPlaceholder('Синий контейнер').fill('Синий контейнер')
  await page.getByPlaceholder('г', { exact: true }).fill('412')
  await page.getByRole('button', { name: 'Добавить' }).click()
  await page.getByText('Синий контейнер — 412 г').waitFor()
  await page.getByRole('tab', { name: 'Заготовки' }).click()
  await page.getByRole('button', { name: '+ Заготовка' }).click()
  const bd = page.getByRole('dialog')
  await bd.getByLabel('Название').fill('Курица в аэрогриле')
  await bd.getByLabel('Дата приготовления').fill('2026-10-11')
  await bd.getByRole('button', { name: '+ ингредиент' }).click()
  await bd.getByLabel('Поиск продукта').fill('куриное филе сырое')
  await bd.getByRole('button', { name: /^Куриное филе \(сырое\)/ }).click()
  await bd.locator('input.short').last().fill('1200')
  await bd.getByRole('button', { name: '+ ингредиент' }).click()
  await bd.getByLabel('Поиск продукта').fill('мёд')
  await bd.getByRole('button', { name: /^Мёд/ }).first().click()
  // Мёд: 2 ст. л. через бытовую меру
  const honeyRow = bd.locator('.row', { hasText: 'Мёд' }).last()
  await honeyRow.locator('select').selectOption({ label: 'ст. л. (21 г)' })
  await honeyRow.getByPlaceholder('кол-во').fill('2')
  t = await bd.innerText()
  check('без веса — оценка по коэффициенту выхода', t.includes('вес оценён'))
  await bd.getByLabel('На весах, г').fill('1272')
  await bd.getByLabel('Тара').selectOption({ label: 'Синий контейнер (412 г)' })
  t = await bd.innerText()
  check('тара вычитается: 1272 − 412 = 860 г', t.includes('Вес готового (нетто): 860 г'))
  await shot(page, 'batch-dialog')
  await bd.getByRole('button', { name: 'Сохранить' }).click()
  await page.getByText('готового 860 г').waitFor()
  const y = await page.evaluate(() => window.__db.yields.toArray())
  check('личный коэффициент выхода запомнен', y.length === 1 && Math.abs(y[0].samples[0] - 0.717) < 0.01, JSON.stringify(y))

  // Тренировка 11.10
  await page.getByRole('navigation').getByText('Тренировки').click()
  await page.getByRole('link', { name: 'Программы', exact: true }).waitFor()
  await page.locator('.week .day').nth(6).getByRole('button', { name: '+ A' }).click()
  await page.getByText('Тренировка A · вс, 11 октября').waitFor()
  const legPress = page.locator('.item', { hasText: 'Жим ногами' })
  await legPress.getByPlaceholder('кг').fill('70')
  await legPress.getByPlaceholder('повт.').fill('10')
  await legPress.getByPlaceholder('0-5').fill('3')
  await legPress.getByRole('button', { name: '+ подход' }).click()
  await page.waitForTimeout(300)
  check('подход записан', (await page.evaluate(() => window.__db.sets.count())) === 1)
  await shot(page, 'workout')

  // Дневник 11.10 задним числом
  await page.goto(`${BASE}#/diary?d=2026-10-11`)
  await page.getByText('Итоги дня').waitFor()
  t = await text(page)
  check('11.10 — день нагрузки этапа «вес»', t.includes('Нагрузка') && /Цель: 17\d0 ккал/.test(t), t.match(/Цель:[^\n]*/)?.[0])
  const lunch = page.locator('.card', { hasText: 'Обед' }).first()
  await lunch.getByRole('button', { name: '+ добавить' }).click()
  const ad = page.getByRole('dialog')
  await ad.getByRole('button', { name: /Курица в аэрогриле/ }).click()
  await ad.getByLabel('Граммы готового').fill('150')
  await ad.getByRole('button', { name: 'Добавить' }).click()
  await lunch.getByRole('button', { name: '+ добавить' }).click()
  await ad.getByRole('button', { name: /Мой греческий салат/ }).click()
  await ad.getByLabel('Вариант').selectOption('с нутом')
  await ad.getByRole('button', { name: 'Добавить' }).click()
  const breakfast = page.locator('.card', { hasText: 'Завтрак' }).first()
  await breakfast.getByRole('button', { name: '+ добавить' }).click()
  await ad.getByLabel('Поиск продукта').fill('карпаччо')
  await ad.getByRole('button', { name: /Карпаччо из индейки, Дзержинка/ }).click()
  await ad.getByLabel('Граммы').fill('60')
  await ad.getByRole('button', { name: 'Добавить' }).click()
  await page.waitForTimeout(400)
  const entries = await page.evaluate(() => window.__db.diary.where('date').equals('2026-10-11').toArray())
  const batchEntry = entries.find((e) => e.source.type === 'batch')
  check('порция заготовки 150 г записана в граммах готового', !!batchEntry && batchEntry.grams === 150)
  check('шаблон с вариантом «с нутом» записан', entries.some((e) => e.label === 'Мой греческий салат (с нутом)'))
  t = await text(page)
  check('отчёт показывает неполные данные для продукта без данных', t.includes('неполные данные'))
  await shot(page, 'diary')

  // Сон: адаптация
  await page.getByRole('navigation').getByText('Сон').click()
  await page.getByRole('button', { name: 'Включить' }).click()
  await page.getByText('Адаптация режима').waitFor()
  t = await text(page)
  check('адаптация: подсказки дня (кофеин до 14:00)', t.includes('Кофеин — не позже 14:00'))
  await page.getByLabel('Дата подъёма').fill('2026-10-12')
  await page.getByLabel('Отбой').fill('00:10')
  await page.getByLabel('Подъём', { exact: true }).fill('07:00')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.waitForTimeout(300)
  check('ночь адаптации помечена', (await page.evaluate(() => window.__db.sleep.get('2026-10-12')))?.adaptation === true)
  const before = await text(page)
  check('по умолчанию цель: подъём 07:40, отбой 23:25', before.includes('подъём 07:40') && before.includes('отбой 23:25'))
  await page.getByLabel('Целевой подъём').fill('07:20')
  await page.getByRole('button', { name: 'Сохранить режим' }).click()
  await page.waitForTimeout(300)
  const prof = await page.evaluate(async () => (await window.__db.profiles.toArray()).at(-1))
  t = await text(page)
  check('целевой подъём меняется на экране «Сон»: 07:20 → отбой 23:05', prof?.targetWake === '07:20' && t.includes('отбой 23:05'))
  await shot(page, 'sleep')

  for (const [label, heading] of [['Обзор', 'Связи в ваших данных'], ['Сегодня', 'Отметки дня']]) {
    await page.getByRole('navigation').getByText(label).click()
    await page.getByText(heading).first().waitFor()
  }
  check('нет ошибок в консоли (часть 1)', errors.length === 0, errors.join(' | '))
  await browser.close()
}

// ---------- Часть 2: четыре недели тестовых данных ----------
{
  const { browser, page, errors } = await launch()
  await wizard(page, '2026-09-13')
  await page.evaluate(async () => {
    const db = window.__db
    const add = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
    const foods = await db.foods.toArray()
    const id = (n) => foods.find((f) => f.name === n).id
    const per = (n) => foods.find((f) => f.name === n).per100
    const comp = (n, g) => Object.fromEntries(Object.entries(per(n)).map(([k, v]) => [k, { v: (v.v * g) / 100, acc: v.acc }]))
    const exercises = await db.exercises.toArray()
    const ex = (n) => exercises.find((e) => e.name === n).id
    let w = 60
    for (let i = 0; i < 28; i++) {
      const date = add('2026-09-13', i)
      const salty = i % 3 === 0
      // Калибровка: сход воды; потом вес стоит (плато)
      if (i < 8) w -= 0.2
      const noise = ((i * 7) % 5) * 0.04 - 0.08
      await db.days.put({ date, weightKg: Math.round((w + noise + (i > 0 && (i - 1) % 3 === 0 ? 0.5 : 0)) * 10) / 10, saltyEvening: salty, kitchenClosedAt: i % 2 ? '20:00' : '21:40', periodStart: i === 2 })
      const meals = [['breakfast', 'Овсяные хлопья (сухие)', 60], ['lunch', 'Гречка (сухая)', 80], ['lunch', 'Куриное филе запечённое', 150], ['dinner', 'Творог 5% (зернёный)', 200], ['evening', i % 2 ? 'Яблоко' : 'Мармелад жевательный', i % 2 ? 180 : 60]]
      for (const [meal, name, g] of meals) await db.diary.add({ date, meal, label: name, source: { type: 'food', id: id(name) }, grams: g, comp: comp(name, g) })
      const short = i % 2 === 0
      await db.sleep.put({ date, bedtime: short ? '00:40' : '23:00', wake: i % 7 === 6 ? '09:30' : '07:00', quality: short ? 2 : 4, adaptation: false })
      if (i % 2 === 1) {
        const wid = await db.workouts.add({ date, kind: 'strength', planned: true, done: true, programDayKey: i % 4 === 1 ? 'A' : 'B' })
        await db.sets.bulkAdd([0, 1, 2].map((s) => ({ workoutId: wid, date, exerciseId: ex('Жим ногами'), setIndex: s, weightKg: 70 + Math.floor(i / 8) * 2.5, reps: 9, rir: 2 })))
      }
      if (i % 7 === 3) await db.workouts.add({ date, kind: 'game', planned: true, done: true, gameType: 'volleyball', durationMin: 90, rpe: 6 })
    }
  })
  await page.reload()
  await page.getByText('Отметки дня').waitFor()
  await page.waitForTimeout(800)
  const sugg = await page.evaluate(() => window.__db.suggestions.toArray())
  check('плато после калибровки → предложение снизить калории', sugg.some((s) => s.kind === 'kcal-down' && s.status === 'open'), sugg.map((s) => s.kind).join(', '))

  await page.getByRole('navigation').getByText('Обзор').click()
  await page.getByText('Связи в ваших данных').waitFor()
  let t = await text(page)
  check('обзор недели сформирован', /Обзор недели: \d+ \S+ — \d+ \S+/.test(t) && t.includes('тренировки'), t.match(/тренд[^\n]*/)?.[0])
  check('связь «солёный вечер → вес» найдена', /После солёных вечеров: изменение веса за ночь в среднем на [\d,]+ кг выше/.test(t))
  check('связь «сон → перекус» рассчитана', t.includes('Сон → вечерний перекус') && !/Сон → вечерний перекус\s+Недостаточно/.test(t))
  check('связь с циклом честно показывает недостаточно данных или результат', t.includes('Фаза цикла'))
  await shot(page, 'insights')
  await page.getByRole('button', { name: 'Принять' }).first().click()
  const q = page.getByText('Записи последние 2 недели велись полностью?')
  if (await q.isVisible()) await page.getByRole('button', { name: 'Да — снизить калории' }).click()
  await page.waitForTimeout(400)

  await page.getByRole('link', { name: 'Профиль и этапы' }).click()
  await page.getByText('История этапов').waitFor()
  t = await text(page)
  check('принятая корректировка видна в нормах', t.includes('поправка -125'), t.match(/Средняя цель[^\n]*/)?.[0])
  check('после калибровки 14 полных дней — формула и «ещё 7 дн.» до расчёта по данным', t.includes('формула') && t.includes('ещё 7 полных дн.'), t.match(/До расчёта[^\n]*/)?.[0])
  await shot(page, 'profile-after')

  await page.goto(`${BASE}#/?d=2026-10-09`)
  await page.getByText('Отметки дня').waitFor()
  t = await text(page)
  check('тип дня и нормы согласованы: 09.10 — тренировки нет → отдых', t.includes('Отдых'))
  await page.goto(`${BASE}#/diary?d=2026-10-08`)
  await page.getByText('Итоги дня').waitFor()
  t = await text(page)
  check('08.10 — силовая → день нагрузки в дневнике', t.includes('Нагрузка'))
  await page.getByRole('button', { name: '7 дней' }).click()
  check('покрытие за 7 дней и подсказки', (await text(page)).includes('Среднее по 7 дн.'))
  await shot(page, 'diary-week')

  await page.getByRole('navigation').getByText('Сон').click()
  await page.getByText('Подъём и отбой за 3 недели').waitFor()
  t = await text(page)
  check('стабильность подъёма за 7 ночей', /Подъём в пределах ±30 минут: \d из \d за 7 ночей/.test(t), t.match(/Подъём в пределах[^\n]*/)?.[0])
  await page.getByRole('navigation').getByText('Тренировки').click()
  const exId = await page.evaluate(async () => (await window.__db.exercises.orderBy('id').first()).id)
  await page.goto(`${BASE}#/training/ex/${exId}`)
  await page.getByText('Расчётный максимум на 1 повтор').waitFor()
  await shot(page, 'exercise-chart')
  check('нет ошибок в консоли (часть 2)', errors.length === 0, errors.join(' | '))
  await browser.close()
}

const failed = checklist.filter((c) => !c.ok)
writeFileSync(`${process.argv[2] ?? 'e2e/out'}/checklist.json`, JSON.stringify(checklist, null, 2))
console.log(`\nИтог: ${checklist.length - failed.length} из ${checklist.length}`)
process.exit(failed.length ? 1 : 0)
