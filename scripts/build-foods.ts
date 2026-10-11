// Сборка справочника обычных продуктов из USDA FoodData Central (SR Legacy).
// Запуск: npm run build:foods
// Скачивает архив в data/fdc-raw (если его нет), берёт продукты из data/foods-curated.json
// и записывает компактный public/foods.json с составом на 100 г.

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { unzipSync } from 'fflate'

const ROOT = join(import.meta.dirname, '..')
const RAW_DIR = join(ROOT, 'data', 'fdc-raw')
const ZIP_URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip'
const ZIP_PATH = join(RAW_DIR, 'sr.zip')
const CSV_DIR = join(RAW_DIR, 'sr-csv')
const OUT = join(ROOT, 'public', 'foods.json')
export const FOODS_VERSION = 1

/** Номер нутриента FDC → ключ приложения. */
const NUTRIENTS: Record<number, string> = {
  1008: 'kcal', 1003: 'protein', 1004: 'fat', 1005: 'carbs', 1079: 'fiber',
  1093: 'sodium', 1092: 'potassium', 1087: 'calcium', 1089: 'iron', 1090: 'magnesium', 1095: 'zinc', 1100: 'iodine',
  1114: 'vitD', 1178: 'b12', 1190: 'folate', 1162: 'vitC', 1106: 'vitA',
}
const ALA = 1404
const PUFA_18_3 = 1270
const EPA = 1278
const DHA = 1272

interface Curated {
  fdcId: number
  name: string
  synonyms: string[]
  measures: { name: string; grams: number }[]
  yieldFactor?: number
}

async function ensureCsv(): Promise<void> {
  if (existsSync(join(CSV_DIR, 'food_nutrient.csv'))) return
  mkdirSync(CSV_DIR, { recursive: true })
  if (!existsSync(ZIP_PATH)) {
    console.log('Скачиваю', ZIP_URL)
    const res = await fetch(ZIP_URL)
    if (!res.ok) throw new Error(`Не удалось скачать: ${res.status}`)
    writeFileSync(ZIP_PATH, Buffer.from(await res.arrayBuffer()))
  }
  const files = unzipSync(new Uint8Array(readFileSync(ZIP_PATH)), {
    filter: (f) => /(^|\/)(food|food_nutrient)\.csv$/.test(f.name),
  })
  for (const [name, data] of Object.entries(files)) writeFileSync(join(CSV_DIR, name.split('/').pop()!), data)
}

/** Разбор строки CSV с полями в кавычках. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

async function readNutrients(ids: Set<number>): Promise<Map<number, Map<number, number>>> {
  const result = new Map<number, Map<number, number>>()
  const wanted = new Set([...Object.keys(NUTRIENTS).map(Number), ALA, PUFA_18_3, EPA, DHA])
  const rl = createInterface({ input: createReadStream(join(CSV_DIR, 'food_nutrient.csv')) })
  let header = true
  for await (const line of rl) {
    if (header) { header = false; continue }
    const [, fdc, nut, amount] = parseCsvLine(line)
    const fdcId = Number(fdc)
    const nutId = Number(nut)
    if (!ids.has(fdcId) || !wanted.has(nutId) || amount === '') continue
    if (!result.has(fdcId)) result.set(fdcId, new Map())
    result.get(fdcId)!.set(nutId, Number(amount))
  }
  return result
}

function readDescriptions(): Map<number, string> {
  const m = new Map<number, string>()
  const lines = readFileSync(join(CSV_DIR, 'food.csv'), 'utf8').split('\n').slice(1)
  for (const l of lines) {
    if (!l.trim()) continue
    const [id, , desc] = parseCsvLine(l)
    m.set(Number(id), desc)
  }
  return m
}

const round = (v: number) => Math.round(v * 1000) / 1000

async function main(): Promise<void> {
  await ensureCsv()
  const curated: Curated[] = JSON.parse(readFileSync(join(ROOT, 'data', 'foods-curated.json'), 'utf8'))
  const ids = new Set(curated.map((c) => c.fdcId))
  const desc = readDescriptions()
  const missing = curated.filter((c) => !desc.has(c.fdcId))
  if (missing.length) throw new Error('Нет в USDA: ' + missing.map((m) => `${m.fdcId} ${m.name}`).join(', '))
  const nutrients = await readNutrients(ids)

  const foods = curated.map((c) => {
    const n = nutrients.get(c.fdcId) ?? new Map<number, number>()
    const per100: Record<string, number> = {}
    for (const [id, key] of Object.entries(NUTRIENTS)) {
      const v = n.get(Number(id))
      if (v !== undefined) per100[key] = round(v)
    }
    const ala = n.get(ALA) ?? n.get(PUFA_18_3)
    if (ala !== undefined || n.has(EPA) || n.has(DHA)) {
      per100.omega3 = round((ala ?? 0) + (n.get(EPA) ?? 0) + (n.get(DHA) ?? 0))
    }
    return { ...c, usdaName: desc.get(c.fdcId), per100 }
  })

  writeFileSync(OUT, JSON.stringify({ version: FOODS_VERSION, source: 'USDA FoodData Central, SR Legacy (2018-04)', foods }))
  const noFiber = foods.filter((f) => f.per100.fiber === undefined).map((f) => f.name)
  console.log(`Готово: ${foods.length} продуктов → public/foods.json`)
  if (noFiber.length) console.log('Без данных о клетчатке:', noFiber.join(', '))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
