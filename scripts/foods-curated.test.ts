import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Curated {
  fdcId: number
  name: string
  synonyms: string[]
  measures: { name: string; grams: number }[]
  yieldFactor?: number
}

const curated: Curated[] = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'foods-curated.json'), 'utf8'))

describe('отобранный список продуктов', () => {
  it('у каждого продукта есть FDC id и русское название', () => {
    for (const f of curated) {
      expect(Number.isInteger(f.fdcId), f.name).toBe(true)
      expect(f.name, String(f.fdcId)).toMatch(/[а-яё]/i)
      expect(Array.isArray(f.synonyms)).toBe(true)
      for (const m of f.measures) expect(m.grams, f.name).toBeGreaterThan(0)
    }
  })

  it('FDC id не повторяются', () => {
    const ids = curated.map((f) => f.fdcId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('содержит продукты пользователя', () => {
    const names = curated.map((f) => f.name.toLowerCase())
    for (const want of ['гречка', 'куриное филе', 'яйцо', 'овсяные', 'помидор', 'огурец', 'перец', 'фета', 'маслины', 'нут', 'мидии', 'творог', 'сливочный сыр']) {
      expect(names.some((n) => n.includes(want)), want).toBe(true)
    }
  })
})
