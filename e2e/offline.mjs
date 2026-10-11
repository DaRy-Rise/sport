// Проверка собранной версии (PWA): работа без сети и поиск по справочнику (задачи 3.3, 13.2).
// Запуск: `npm run build && npx vite preview --port 4199 --strictPort`, затем `node e2e/offline.mjs`.
import { check, checklist, launch } from './lib.mjs'

const BASE = process.env.BASE ?? 'http://localhost:4199/'
const { browser, context, page, errors } = await launch()
await page.goto(BASE)
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]')
  return link ? (await fetch(link.href)).json() : null
})
check('манифест PWA подключён', manifest?.name === 'Мой режим' && manifest?.display === 'standalone')
await page.getByLabel('Дата рождения').fill('2001-03-01')
await page.getByRole('button', { name: 'Начать' }).click()
await page.getByRole('navigation').getByText('Сегодня').waitFor()
await page.evaluate(() => navigator.serviceWorker.ready)
await page.reload()
await page.waitForFunction(() => !!navigator.serviceWorker.controller)
check('сервис-воркер установлен и управляет страницей', true)

await context.setOffline(true)
await page.reload()
await page.getByRole('navigation').getByText('Продукты').waitFor()
check('приложение открывается без сети', true)
await page.getByRole('navigation').getByText('Продукты').click()
await page.getByPlaceholder('Поиск по названию…').fill('гречка')
await page.getByText('Гречка (сухая)').waitFor()
check('поиск «гречка» работает без сети', true)
check('нет ошибок в консоли', errors.length === 0, errors.join(' | '))
const offlineFetch = await page.evaluate(async () => { try { await fetch('https://fdc.nal.usda.gov/'); return 'online' } catch { return 'offline' } })
check('сеть действительно отключена', offlineFetch === 'offline')
await browser.close()
const failed = checklist.filter((c) => !c.ok)
console.log(`\nИтог: ${checklist.length - failed.length} из ${checklist.length}`)
process.exit(failed.length ? 1 : 0)
