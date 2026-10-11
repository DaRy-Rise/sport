import type { NutrientTotal, Totals } from '../domain/nutrients'
import { NUTRIENT_INFO } from '../domain/nutrients'
import type { NutrientKey } from '../domain/types'
import { fmt } from './components'

export function valueText(k: NutrientKey, t: NutrientTotal): string {
  if (!t.known) return '?'
  const s = `${t.acc === 'approx' ? '≈' : ''}${fmt(t.v, NUTRIENT_INFO[k].digits)}`
  return t.incomplete ? `${s}+?` : s
}

/** Короткая строка: ккал, Б/Ж/У, клетчатка, натрий. */
export function Summary({ t }: { t: Totals }) {
  const item = (k: NutrientKey, short: string) => (
    <span key={k} title={t[k].incomplete ? `нет данных: ${[...new Set(t[k].missingFrom)].join(', ')}` : NUTRIENT_INFO[k].label}>
      {short} <b>{valueText(k, t[k])}</b>{k === 'kcal' ? '' : ` ${NUTRIENT_INFO[k].unit}`}
    </span>
  )
  return (
    <span className="row small" style={{ gap: '0.9rem' }}>
      {item('kcal', 'ккал')}
      {item('protein', 'Б')}
      {item('fat', 'Ж')}
      {item('carbs', 'У')}
      {item('fiber', 'клетч.')}
      {item('sodium', 'натрий')}
    </span>
  )
}
