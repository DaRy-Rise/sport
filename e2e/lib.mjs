// Общие функции для проверок в безголовом Edge/Chrome.
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]

export async function launch() {
  const executablePath = process.env.BROWSER ?? CANDIDATES.find((p) => existsSync(p))
  if (!executablePath) throw new Error('Не найден Edge или Chrome; укажите путь в переменной BROWSER')
  const browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  return { browser, context, page, errors }
}

export function shots(dir) {
  mkdirSync(dir, { recursive: true })
  let n = 0
  return (page, name) => page.screenshot({ path: `${dir}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true })
}

export const checklist = []
export function check(name, ok, detail = '') {
  checklist.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
