import { describe, expect, it } from 'vitest'
import { scale, sumParts, totalsToSnapshot } from './nutrients'

describe('суммирование состава', () => {
  it('складывает известные значения и масштабирует порцию', () => {
    const t = sumParts([
      { label: 'гречка', comp: scale({ kcal: { v: 346, acc: 'exact' }, iron: { v: 2.47, acc: 'exact' } }, 70) },
      { label: 'курица', comp: scale({ kcal: { v: 120, acc: 'exact' }, iron: { v: 0.4, acc: 'exact' } }, 150) },
    ])
    expect(t.kcal.v).toBeCloseTo(242.2 + 180)
    expect(t.iron.incomplete).toBe(false)
    expect(t.iron.acc).toBe('exact')
  })

  it('неизвестное не превращается в 0 и называет продукт без данных', () => {
    const t = sumParts([
      { label: 'гречка', comp: { magnesium: { v: 150, acc: 'exact' } } },
      { label: 'Карпаччо', comp: { kcal: { v: 50, acc: 'exact' } } },
    ])
    expect(t.magnesium.v).toBe(150)
    expect(t.magnesium.incomplete).toBe(true)
    expect(t.magnesium.missingFrom).toEqual(['Карпаччо'])
  })

  it('пометка «примерно» переходит в итог', () => {
    const t = sumParts([
      { label: 'a', comp: { calcium: { v: 100, acc: 'exact' } } },
      { label: 'b', comp: { calcium: { v: 50, acc: 'approx' } } },
    ])
    expect(t.calcium.acc).toBe('approx')
  })

  it('снимок сохраняет неизвестность компонентов шаблона', () => {
    const snap = totalsToSnapshot(sumParts([{ label: 'x', comp: { kcal: { v: 10, acc: 'exact' } } }]))
    expect(snap.comp.kcal?.v).toBe(10)
    expect(snap.comp.iron).toBeUndefined()
    expect(snap.unknownFrom.iron).toEqual(['x'])
    const t = sumParts([{ label: 'шаблон', comp: snap.comp, unknownFrom: snap.unknownFrom }])
    expect(t.iron.missingFrom).toEqual(['x'])
  })
})
