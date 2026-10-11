import { describe, expect, it } from 'vitest'
import { applyEdits, effectivePer100, itemsTotals, labelComposition, templateItems, type FoodsById } from './library'
import type { Food, MealTemplate } from './types'

const creamCheese: Food = {
  id: 1, kind: 'generic', name: 'Сливочный сыр', synonyms: [], measures: [],
  per100: { kcal: { v: 350, acc: 'exact' }, protein: { v: 6, acc: 'exact' }, calcium: { v: 97, acc: 'exact' }, vitA: { v: 308, acc: 'exact' } },
}
const bonfesto: Food = {
  id: 2, kind: 'packaged', name: 'Cream cheese', brand: 'Bonfesto', synonyms: [], measures: [], analogId: 1,
  per100: labelComposition({ kcal: 230, protein: 7, fat: 21, carbs: 3 }),
}
const carpaccio: Food = {
  id: 3, kind: 'packaged', name: 'Карпаччо из индейки', brand: 'Дзержинка', synonyms: [], measures: [],
  per100: labelComposition({ kcal: 100, protein: 20, fat: 2, carbs: 0 }),
}
const feta: Food = { id: 4, kind: 'generic', name: 'Сыр фета', synonyms: [], measures: [], per100: { kcal: { v: 264, acc: 'exact' }, fiber: { v: 0, acc: 'exact' }, sodium: { v: 1116, acc: 'exact' } } }
const chickpeas: Food = { id: 5, kind: 'generic', name: 'Нут', synonyms: [], measures: [], per100: { kcal: { v: 139, acc: 'exact' }, fiber: { v: 7.6, acc: 'exact' }, sodium: { v: 7, acc: 'exact' } } }
const tomato: Food = { id: 6, kind: 'generic', name: 'Помидор', synonyms: [], measures: [], per100: { kcal: { v: 18, acc: 'exact' }, fiber: { v: 1.2, acc: 'exact' }, sodium: { v: 5, acc: 'exact' } } }
const foods: FoodsById = new Map([creamCheese, bonfesto, carpaccio, feta, chickpeas, tomato].map((f) => [f.id!, f]))

describe('продукты в упаковке', () => {
  it('Добавление продукта с этикетки: белок 20 г, жиры 2 г', () => {
    expect(carpaccio.per100.protein).toEqual({ v: 20, acc: 'exact' })
    expect(carpaccio.per100.fat).toEqual({ v: 2, acc: 'exact' })
  })

  it('Нет клетчатки на этикетке: поле пустое, а не нулевое', () => {
    expect(carpaccio.per100.fiber).toBeUndefined()
    expect(labelComposition({ kcal: 100, fiber: null }).fiber).toBeUndefined()
  })

  it('соль с этикетки переводится в натрий', () => {
    expect(labelComposition({ salt: 2 }).sodium?.v).toBe(800)
  })

  it('Сливочный сыр с аналогом: микро «примерно», калории с этикетки', () => {
    const c = effectivePer100(bonfesto, foods)
    expect(c.kcal).toEqual({ v: 230, acc: 'exact' })
    expect(c.protein).toEqual({ v: 7, acc: 'exact' })
    expect(c.calcium).toEqual({ v: 97, acc: 'approx' })
    expect(c.vitA?.acc).toBe('approx')
  })

  it('Продукт без аналога: микро неизвестны, отчёт неполный', () => {
    const c = effectivePer100(carpaccio, foods)
    expect(c.iron).toBeUndefined()
    const t = itemsTotals([{ foodId: 3, grams: 60 }, { foodId: 6, grams: 100 }], foods)
    expect(t.fiber.incomplete).toBe(true)
    expect(t.fiber.missingFrom).toEqual(['Карпаччо из индейки, Дзержинка'])
  })
})

describe('шаблоны', () => {
  const salad: MealTemplate = {
    id: 1, name: 'мой греческий салат',
    items: [{ foodId: 6, grams: 200 }, { foodId: 4, grams: 50 }],
    variants: [{ name: 'с нутом', items: [{ foodId: 6, grams: 200 }, { foodId: 4, grams: 30 }, { foodId: 5, grams: 80 }] }],
  }

  it('Использование шаблона с изменением: фета 30 г в записи, 50 г в шаблоне', () => {
    const items = applyEdits(templateItems(salad), { grams: { 1: 30 } })
    expect(items[1].grams).toBe(30)
    expect(salad.items[1].grams).toBe(50)
  })

  it('удаление и добавление компонента при записи', () => {
    const items = applyEdits(templateItems(salad), { removed: [1], added: [{ foodId: 5, grams: 40 }] })
    expect(items.map((i) => i.foodId)).toEqual([6, 5])
  })

  it('Состав шаблона: калории, клетчатка и соль целиком', () => {
    const t = itemsTotals(templateItems(salad), foods)
    expect(t.kcal.v).toBeCloseTo(36 + 132)
    expect(t.fiber.v).toBeCloseTo(2.4)
    expect(t.sodium.v).toBeCloseTo(10 + 558)
  })

  it('Выбор варианта «с нутом»: +80 г нута и больше клетчатки', () => {
    const items = templateItems(salad, 'с нутом')
    expect(items.find((i) => i.foodId === 5)?.grams).toBe(80)
    const t = itemsTotals(items, foods)
    expect(t.fiber.v).toBeCloseTo(2.4 + 6.08)
  })
})
