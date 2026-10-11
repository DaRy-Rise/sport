// Синхронизация «компьютер ↔ телефон» в безголовом браузере с подставным GitHub API.
// Запуск: `npm run build && npm run start` в отдельном окне, затем `npm run e2e:sync`.
import { check, checklist, launch } from './lib.mjs'

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const REPO = '/repos/me/sport-data'

// Состояние «GitHub»: один файл и счётчик коммитов.
let file = null
let commits = 0
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
}
async function github(route) {
  const req = route.request()
  const url = new URL(req.url())
  const reply = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
  if (req.headers().authorization !== 'Bearer test-token') return reply(401, { message: 'Bad credentials' })
  if (url.pathname === REPO) return reply(200, { name: 'sport-data', private: true })
  if (url.pathname !== `${REPO}/contents/sport-data.json`) return reply(404, {})
  if (req.method() === 'GET') return file ? reply(200, { sha: file.sha, encoding: 'base64', content: file.content }) : reply(404, {})
  const body = JSON.parse(req.postData())
  if ((body.sha ?? null) !== (file?.sha ?? null)) return reply(409, { message: 'sha mismatch' })
  file = { sha: `sha${++commits}`, content: body.content }
  return reply(201, { content: { sha: file.sha } })
}
const remoteDoc = () => JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))

async function fillSync(page, token = 'test-token') {
  await page.getByLabel('Ваш логин GitHub').fill('me')
  await page.getByLabel('Приватный репозиторий').fill('sport-data')
  await page.getByLabel('Токен').fill(token)
  await page.getByRole('button', { name: 'Подключить' }).click()
}

const { browser, context: pcCtx, page: pc, errors } = await launch()
await pcCtx.route('https://api.github.com/**', github)

// Компьютер: профиль, вес, подключение.
await pc.goto(BASE)
await pc.getByLabel('Дата рождения').fill('2001-03-01')
  await pc.getByLabel('Рост, см').fill('166')
  await pc.getByLabel('Текущий вес, кг').fill('60')
  await pc.getByLabel('Целевой вес, кг').fill('55')
await pc.getByRole('button', { name: 'Начать' }).click()
await pc.getByRole('link', { name: 'Сегодня' }).waitFor()
await pc.getByLabel('Вес утром, кг').fill('60')
await pc.waitForTimeout(300)
await pc.getByRole('link', { name: 'Профиль и этапы' }).click()
await fillSync(pc, 'wrong')
await pc.getByText('GitHub не принял токен').waitFor()
check('неверный токен — понятная ошибка', true)
await fillSync(pc)
await pc.getByText('данные этого устройства сохранены в GitHub').waitFor()
const doc1 = remoteDoc()
check('в GitHub ушли профиль и вес', doc1.tables.profiles.length === 1 && doc1.tables.days.some((d) => d.weightKg === 60))
check('токен не попал в файл данных', !Buffer.from(file.content, 'base64').toString('utf8').includes('test-token'))

// Телефон: чистое устройство, подключение из мастера.
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', isMobile: true, hasTouch: true })
await phoneCtx.route('https://api.github.com/**', github)
const phone = await phoneCtx.newPage()
phone.on('pageerror', (e) => errors.push(`phone pageerror: ${e.message}`))
phone.on('console', (m) => { if (m.type() === 'error') errors.push(`phone console: ${m.text()}`) })
await phone.goto(BASE)
await phone.getByText('Уже пользуетесь приложением на другом устройстве?').click()
await fillSync(phone)
await phone.getByRole('link', { name: 'Сегодня' }).waitFor()
check('телефон загрузил данные без мастера', (await phone.getByLabel('Вес утром, кг').inputValue()) === '60')

// Телефон записывает сон и отправляет.
await phone.getByRole('link', { name: 'Сон' }).click()
await phone.getByLabel('Отбой').fill('23:20')
await phone.getByLabel('Подъём', { exact: true }).fill('07:40')
await phone.getByRole('button', { name: 'Сохранить', exact: true }).click()
await phone.waitForTimeout(300)
await phone.getByRole('link', { name: 'Профиль и этапы' }).click()
await phone.getByRole('button', { name: 'Синхронизировать сейчас' }).click()
await phone.waitForTimeout(800)
check('сон с телефона в GitHub', remoteDoc().tables.sleep.some((n) => n.bedtime === '23:20'))

// Компьютер: при открытии забирает сон; правка веса уходит обратно.
await pc.reload()
await pc.getByRole('link', { name: 'Сегодня' }).click()
await pc.getByText('23:20 → 07:40').waitFor({ timeout: 10000 })
check('компьютер получил сон с телефона', true)
await pc.getByLabel('Вес утром, кг').fill('59,8')
await pc.waitForTimeout(300)
await pc.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await pc.getByRole('link', { name: 'Профиль и этапы' }).click()
await pc.getByRole('button', { name: 'Синхронизировать сейчас' }).click()
await pc.waitForTimeout(800)
await phone.reload()
await phone.getByRole('link', { name: 'Сегодня' }).click()
await phone.waitForTimeout(1500)
check('телефон получил новый вес', (await phone.getByLabel('Вес утром, кг').inputValue()) === '59,8' || (await phone.getByLabel('Вес утром, кг').inputValue()) === '59.8',
  await phone.getByLabel('Вес утром, кг').inputValue())
const before = commits
await phone.getByRole('link', { name: 'Профиль и этапы' }).click()
await phone.getByRole('button', { name: 'Синхронизировать сейчас' }).click()
await phone.waitForTimeout(800)
check('без изменений новый коммит не создаётся', commits === before, `коммитов: ${commits}`)
const syncBtn = phone.getByRole('button', { name: /^Синхронизировано/ })
await syncBtn.waitFor({ timeout: 5000 }).catch(() => {})
const badge = (await syncBtn.getAttribute('aria-label').catch(() => null)) ?? ''
check('кнопка с облаком показывает состояние синхронизации', badge.startsWith('Синхронизировано'), badge)
// Без таймера: правка помечается «неотправленной» и уходит только по кнопке или при сворачивании
await phone.getByRole('link', { name: 'Сегодня' }).click()
await phone.getByLabel('Вес утром, кг').fill('59,5')
await phone.waitForTimeout(400)
const commitsBefore = commits
await phone.waitForTimeout(1500)
check('правка не отправляется сама по таймеру', commits === commitsBefore)
check('кнопка показывает «есть неотправленное»', !!(await phone.getByRole('button', { name: /ещё не отправленные/ }).count()))
await phone.getByRole('button', { name: /ещё не отправленные/ }).click()
await phone.waitForTimeout(800)
check('по кнопке с облаком правка ушла в GitHub', remoteDoc().tables.days.some((d) => d.weightKg === 59.5))
await phone.screenshot({ path: 'e2e/out/sync-phone.png', fullPage: true })

// 401 — ответ на неверный токен, 404 — «файла ещё нет» при первом подключении: так отвечает и настоящий GitHub.
const real = errors.filter((e) => !/status of (401|404)/.test(e))
check('нет ошибок в консоли', real.length === 0, real.join(' | '))
await browser.close()
const failed = checklist.filter((c) => !c.ok)
console.log(`\n${checklist.length - failed.length}/${checklist.length} проверок пройдено`)
process.exit(failed.length ? 1 : 0)
