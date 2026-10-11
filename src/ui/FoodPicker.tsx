import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { foodLabel } from '../domain/library'
import { searchItems } from '../domain/search'
import type { Batch, Food, MealTemplate } from '../domain/types'
import { db } from './data'

export type Picked =
  | { type: 'food'; food: Food }
  | { type: 'template'; template: MealTemplate }
  | { type: 'batch'; batch: Batch }

interface Props {
  onPick: (p: Picked) => void
  /** Что показывать: по умолчанию только продукты. */
  include?: { templates?: boolean; batches?: boolean }
  /** Ограничение по типу продукта (например, только справочник для аналога). */
  kind?: Food['kind']
  placeholder?: string
  autoFocus?: boolean
}

export function FoodPicker(props: Props) {
  const [q, setQ] = useState('')
  const foods = useLiveQuery(() => db.foods.filter((f) => !f.hidden).toArray(), [])
  const templates = useLiveQuery(() => (props.include?.templates ? db.templates.filter((t) => !t.hidden).toArray() : []), [props.include?.templates])
  const batches = useLiveQuery(() => (props.include?.batches ? db.batches.filter((b) => !b.finished).toArray() : []), [props.include?.batches])

  const results = useMemo((): { key: string; label: string; tag: string; sub?: string; pick: Picked }[] => {
    if (!q.trim()) {
      // Без запроса: активные заготовки и шаблоны сверху для быстрого выбора.
      return [
        ...(batches ?? []).map((batch) => ({ key: `b${batch.id}`, label: batch.name, tag: 'заготовка', pick: { type: 'batch', batch } as Picked })),
        ...(templates ?? []).map((template) => ({ key: `t${template.id}`, label: template.name, tag: 'шаблон', pick: { type: 'template', template } as Picked })),
      ]
    }
    const fs = searchItems((foods ?? []).filter((f) => !props.kind || f.kind === props.kind), q, 25)
    const ts = searchItems(templates ?? [], q, 10)
    const bs = searchItems((batches ?? []).map((b) => ({ ...b, synonyms: [] })), q, 10)
    return [
      ...bs.map((batch) => ({ key: `b${batch.id}`, label: batch.name, tag: 'заготовка', pick: { type: 'batch', batch } as Picked })),
      ...ts.map((template) => ({ key: `t${template.id}`, label: template.name, tag: 'шаблон', pick: { type: 'template', template } as Picked })),
      ...fs.map((food) => ({
        key: `f${food.id}`, label: foodLabel(food), tag: food.kind === 'packaged' ? 'упаковка' : '',
        sub: food.per100.kcal ? `${Math.round(food.per100.kcal.v)} ккал/100 г` : '', pick: { type: 'food', food } as Picked,
      })),
    ]
  }, [q, foods, templates, batches, props.kind])

  return (
    <div className="stack">
      <input
        autoFocus={props.autoFocus}
        placeholder={props.placeholder ?? 'Найти продукт…'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Поиск продукта"
      />
      <div className="list" style={{ maxHeight: 280, overflowY: 'auto' }}>
        {results.map((r) => (
          <button key={r.key} type="button" className="item btn link" style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', color: 'var(--text)' }}
            onClick={() => props.onPick(r.pick)}>
            <span>{r.label} {r.tag && <span className="badge">{r.tag}</span>}</span>
            <span className="muted small nowrap">{r.sub ?? ''}</span>
          </button>
        ))}
        {q.trim() && !results.length && <p className="muted small">Ничего не найдено. Можно создать продукт в разделе «Продукты».</p>}
      </div>
    </div>
  )
}
