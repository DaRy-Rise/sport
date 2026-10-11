import { describe, expect, it } from 'vitest'
import { computeBatch, estimateCookedWeight, learnYield, measureToGrams, netWeight, yieldFor } from './batch'
import type { FoodsById } from './library'
import type { BatchIngredient, Food } from './types'

const chicken: Food = { id: 1, kind: 'generic', name: 'Куриное филе (сырое)', synonyms: [], yieldFactor: 0.72, measures: [],
  per100: { kcal: { v: 120, acc: 'exact' }, protein: { v: 22.5, acc: 'exact' }, iron: { v: 0.37, acc: 'exact' } } }
const oil: Food = { id: 2, kind: 'generic', name: 'Масло оливковое', synonyms: [], measures: [{ name: 'ст. л.', grams: 13.5 }],
  per100: { kcal: { v: 884, acc: 'exact' }, iron: { v: 0.56, acc: 'exact' } } }
const honey: Food = { id: 3, kind: 'generic', name: 'Мёд', synonyms: [], measures: [{ name: 'ст. л.', grams: 21 }],
  per100: { kcal: { v: 304, acc: 'exact' }, iron: { v: 0.42, acc: 'exact' } } }
const mustard: Food = { id: 4, kind: 'generic', name: 'Горчица', synonyms: [], measures: [{ name: 'ст. л.', grams: 15 }],
  per100: { kcal: { v: 60, acc: 'approx' } } }
const foods: FoodsById = new Map([chicken, oil, honey, mustard].map((f) => [f.id!, f]))

const ingredients: BatchIngredient[] = [
  { foodId: 1, grams: 1200 },
  { foodId: 2, grams: measureToGrams(oil, 'ст. л.', 1), measure: { name: 'ст. л.', count: 1 } },
  { foodId: 3, grams: measureToGrams(honey, 'ст. л.', 2), measure: { name: 'ст. л.', count: 2 } },
  { foodId: 4, grams: measureToGrams(mustard, 'ст. л.', 1), measure: { name: 'ст. л.', count: 1 } },
]

describe('заготовки', () => {
  it('Курица на неделю: мёд и горчица учтены в составе', () => {
    expect(ingredients[2].grams).toBe(42)
    const b = computeBatch(ingredients, 860, foods)
    expect(b.totalKcal).toBeCloseTo(1440 + 119.34 + 127.68 + 9, 1)
    expect(b.per100.kcal!.acc).toBe('approx')
    expect(b.unknownFrom.iron).toEqual(['Горчица'])
  })

  it('Расчёт состава: 1590 ккал / 860 г ≈ 185 ккал на 100 г', () => {
    const kcalOnly: FoodsById = new Map([[9, { id: 9, kind: 'generic', name: 'x', synonyms: [], measures: [], per100: { kcal: { v: 159, acc: 'exact' } } } as Food]])
    const b = computeBatch([{ foodId: 9, grams: 1000 }], 860, kcalOnly)
    expect(b.per100.kcal!.v).toBeCloseTo(184.9, 1)
  })

  it('Взвешивание в контейнере: 1272 − 412 = 860 г', () => {
    expect(netWeight(1272, { name: 'Синий контейнер', weightG: 412 })).toBe(860)
  })

  it('Забыли взвесить: 1000 г сырого филе → ~720 г', () => {
    expect(estimateCookedWeight([{ foodId: 1, grams: 1000 }], foods)).toBeCloseTo(720)
  })

  it('маринад без коэффициента учитывается как есть', () => {
    expect(estimateCookedWeight(ingredients, foods)).toBeCloseTo(864 + 13.5 + 42 + 15)
  })

  it('Уточнение по своему аэрогрилю: 0.68, 0.70, 0.69 → 0.69 и используется в оценке', () => {
    let p = learnYield([{ foodId: 1, grams: 1000 }], 680, foods)
    p = learnYield([{ foodId: 1, grams: 1000 }, { foodId: 3, grams: 42 }], 700, foods, p)
    p = learnYield([{ foodId: 1, grams: 1000 }], 690, foods, p)
    expect(p!.samples).toEqual([0.68, 0.7, 0.69])
    expect(yieldFor(chicken, p)).toBeCloseTo(0.69)
    expect(estimateCookedWeight([{ foodId: 1, grams: 1000 }], foods, new Map([[1, p!]]))).toBeCloseTo(690)
  })

  it('хранит не больше 5 последних взвешиваний', () => {
    let p = undefined
    for (const w of [600, 650, 700, 710, 720, 730]) p = learnYield([{ foodId: 1, grams: 1000 }], w, foods, p)
    expect(p!.samples).toEqual([0.65, 0.7, 0.71, 0.72, 0.73])
  })
})
