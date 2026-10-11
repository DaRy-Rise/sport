import { useMemo, useState } from 'react'
import { patchDay } from '../../db/days'
import { addBatchEntry, addFoodEntry, addTemplateEntry, updateEntryGrams } from '../../db/repo'
import { suggestSaltyEvening } from '../../domain/checkin'
import { DAY_TYPE_LABEL } from '../../domain/day'
import { addDays, dateRange, formatDate } from '../../domain/dates'
import {
  MEAL_LABEL, MEAL_ORDER, averageTotals, coverage, deficitSuggestions, entriesTotals, eveningBudget, isCompleteDay, type CoverageRow,
} from '../../domain/diary'
import { applyEdits, effectivePer100, foodLabel, itemsTotals, templateItems, type FoodsById } from '../../domain/library'
import { NUTRIENT_INFO, scale, sumParts } from '../../domain/nutrients'
import type { MealSlot, PortionItem } from '../../domain/types'
import { Bar, Card, ConfirmButton, DateNav, Dialog, Field, NumberInput, Segmented, fmt } from '../components'
import { db, useCore, useDateParam, useFoodsMap, usePlan } from '../data'
import { FoodPicker, type Picked } from '../FoodPicker'
import { Summary } from '../Summary'

function AddEntryDialog({ date, meal, foods, onClose }: { date: string; meal: MealSlot; foods: FoodsById; onClose: () => void }) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const [grams, setGrams] = useState<number | undefined>(100)
  const [count, setCount] = useState<number | undefined>()
  const [measure, setMeasure] = useState<string>('')
  const [variant, setVariant] = useState<string>('')
  const [items, setItems] = useState<PortionItem[]>([])
  const [adding, setAdding] = useState(false)

  function pick(p: Picked) {
    setPicked(p)
    if (p.type === 'template') {
      setVariant('')
      setItems(templateItems(p.template))
    }
    if (p.type === 'food') {
      setMeasure(p.food.measures[0]?.name ?? '')
      setCount(undefined)
      setGrams(100)
    }
    if (p.type === 'batch') setGrams(150)
  }

  const preview = useMemo(() => {
    if (!picked) return null
    if (picked.type === 'food' && grams) return sumParts([{ label: foodLabel(picked.food), comp: scale(effectivePer100(picked.food, foods), grams) }])
    if (picked.type === 'batch' && grams) return sumParts([{ label: picked.batch.name, comp: scale(picked.batch.per100, grams), unknownFrom: picked.batch.unknownFrom }])
    if (picked.type === 'template') return itemsTotals(items, foods)
    return null
  }, [picked, grams, items, foods])

  async function add() {
    if (!picked) return
    const base = { date, meal }
    if (picked.type === 'food' && grams) await addFoodEntry(db, base, picked.food.id!, grams)
    if (picked.type === 'batch' && grams) await addBatchEntry(db, base, picked.batch, grams)
    if (picked.type === 'template' && items.length) await addTemplateEntry(db, base, picked.template, items, variant || undefined)
    onClose()
  }

  return (
    <Dialog title={`${MEAL_LABEL[meal]} · ${formatDate(date)}`} onClose={onClose}>
      {!picked ? (
        <FoodPicker autoFocus include={{ templates: true, batches: true }} onPick={pick} placeholder="Продукт, шаблон или заготовка…" />
      ) : (
        <div className="stack">
          <div className="row spread">
            <b>{picked.type === 'food' ? foodLabel(picked.food) : picked.type === 'batch' ? picked.batch.name : picked.template.name}</b>
            <button className="btn small" onClick={() => setPicked(null)}>Выбрать другое</button>
          </div>
          {picked.type === 'food' && (
            <div className="row">
              <Field label="Граммы"><NumberInput value={grams} onChange={(v) => { setGrams(v); setCount(undefined) }} /></Field>
              {picked.food.measures.length > 0 && (
                <>
                  <span className="muted" style={{ alignSelf: 'end', paddingBottom: '0.5rem' }}>или</span>
                  <Field label="Количество"><NumberInput className="short" value={count} onChange={(v) => {
                    setCount(v)
                    const m = picked.food.measures.find((x) => x.name === measure)
                    if (v && m) setGrams(Math.round(v * m.grams * 10) / 10)
                  }} /></Field>
                  <Field label="Мера">
                    <select value={measure} onChange={(e) => {
                      setMeasure(e.target.value)
                      const m = picked.food.measures.find((x) => x.name === e.target.value)
                      if (count && m) setGrams(Math.round(count * m.grams * 10) / 10)
                    }}>
                      {picked.food.measures.map((m) => <option key={m.name} value={m.name}>{m.name} ({m.grams} г)</option>)}
                    </select>
                  </Field>
                </>
              )}
            </div>
          )}
          {picked.type === 'batch' && (
            <Field label="Граммы готового" hint={`приготовлено ${formatDate(picked.batch.cookedDate)}, всего ${picked.batch.cookedWeightG} г`}>
              <NumberInput value={grams} onChange={setGrams} />
            </Field>
          )}
          {picked.type === 'template' && (
            <>
              {picked.template.variants.length > 0 && (
                <Field label="Вариант">
                  <select value={variant} onChange={(e) => { setVariant(e.target.value); setItems(templateItems(picked.template, e.target.value || undefined)) }}>
                    <option value="">основной</option>
                    {picked.template.variants.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                  </select>
                </Field>
              )}
              <p className="muted small">Порции можно поменять только для этой записи — шаблон не изменится.</p>
              {items.map((it, i) => (
                <div className="row" key={i}>
                  <span style={{ flex: 1 }}>{foods.get(it.foodId)?.name ?? '?'}</span>
                  <NumberInput className="short" value={it.grams} onChange={(v) => setItems(applyEdits(items, { grams: { [i]: v ?? 0 } }))} />
                  <span className="muted">г</span>
                  <button className="btn small" onClick={() => setItems(applyEdits(items, { removed: [i] }))} aria-label="Убрать">✕</button>
                </div>
              ))}
              {adding ? (
                <div className="card"><FoodPicker autoFocus onPick={(p) => { if (p.type === 'food') setItems(applyEdits(items, { added: [{ foodId: p.food.id!, grams: 50 }] })); setAdding(false) }} /></div>
              ) : <div><button className="btn small" onClick={() => setAdding(true)}>+ продукт</button></div>}
            </>
          )}
          {preview && <div className="note"><Summary t={preview} /></div>}
          <div className="row">
            <button className="btn primary" onClick={add}>Добавить</button>
            <button className="btn" onClick={onClose}>Отмена</button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

const STATUS_LABEL: Record<CoverageRow['status'], string> = { ok: 'в норме', low: 'мало', over: 'больше цели', 'limit-exceeded': 'выше предела' }

export function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Нутриент</th><th className="num">Факт</th><th className="num">Норма</th><th style={{ width: '30%' }}></th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const info = NUTRIENT_INFO[r.key]
            const normText = r.key === 'sodium' ? `≤ ${fmt(r.norm)}` : r.normMax ? `${fmt(r.norm)}-${fmt(r.normMax)}` : fmt(r.norm, info.digits)
            return (
              <tr key={r.key}>
                <td>{info.label}</td>
                <td className="num">{r.approx ? '≈ ' : ''}{fmt(r.value, info.digits)} {info.unit}</td>
                <td className="num muted">{normText}</td>
                <td><Bar pct={r.pct} status={r.status === 'low' ? 'low' : r.status === 'limit-exceeded' ? 'over' : 'ok'} /></td>
                <td className="small nowrap">
                  <span className="muted">{Math.round(r.pct * 100)}%</span>{' '}
                  {r.status !== 'ok' && <span className={`badge ${r.status === 'low' ? 'warn' : 'bad'}`}>{STATUS_LABEL[r.status]}</span>}{' '}
                  {r.incomplete && <span className="badge" title={`нет данных: ${r.missingFrom.join(', ')}`}>неполные данные</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function DiaryScreen() {
  const [date, setDate] = useDateParam()
  const core = useCore()
  const plan = usePlan(core, date)
  const foods = useFoodsMap()
  const [adding, setAdding] = useState<MealSlot | null>(null)
  const [scope, setScope] = useState<'day' | 'week'>('day')

  const data = useMemo(() => {
    if (!core) return null
    const entries = core.byDate.get(date) ?? []
    const totals = entriesTotals(entries)
    const weekDays = dateRange(addDays(date, -6), date).map((d) => core.byDate.get(d) ?? []).filter((es) => es.length)
    const weekTotals = averageTotals(weekDays.map(entriesTotals))
    const eaten = new Set(core.diary.filter((e) => e.date >= addDays(date, -30)).flatMap((e) => [
      ...(e.source.type === 'food' ? [e.source.id] : []), ...(e.items ?? []).map((i) => i.foodId)]))
    return { entries, totals, weekTotals, weekDaysCount: weekDays.length, eaten }
  }, [core, date])

  if (!core || !plan || !foods || !data) return <p className="muted">Загрузка…</p>
  const record = core.dayMap.get(date)
  const budget = eveningBudget(plan.dayType, data.entries)
  const rows = coverage(scope === 'day' ? data.totals : data.weekTotals, plan.norms)
  const weekRows = coverage(data.weekTotals, plan.norms)
  const suggestions = data.weekDaysCount ? deficitSuggestions(weekRows, foods, data.eaten).filter((s) => s.items.length) : []
  const complete = isCompleteDay(record, data.entries)

  return (
    <div>
      <div className="row spread">
        <h1>Дневник</h1>
        <DateNav date={date} onChange={setDate} addDays={addDays} label={`${formatDate(date, true)} · ${DAY_TYPE_LABEL[plan.dayType]}`} />
      </div>
      <div className="grid two">
        <div>
          {MEAL_ORDER.map((meal) => {
            const es = data.entries.filter((e) => e.meal === meal)
            const t = entriesTotals(es)
            return (
              <Card key={meal} title={<>{MEAL_LABEL[meal]} <span className="muted small">{es.length ? `${fmt(t.kcal.v)} ккал` : ''}</span></>}
                actions={<button className="btn small" onClick={() => setAdding(meal)}>+ добавить</button>}>
                {meal === 'evening' && (
                  <p className="small">
                    Бюджет {budget.budget} ккал ({DAY_TYPE_LABEL[plan.dayType].toLowerCase()}):{' '}
                    {budget.over ? <span className="badge warn">сверх бюджета {fmt(budget.over)} ккал</span> : <span className="badge accent">осталось {fmt(budget.remaining)} ккал</span>}
                  </p>
                )}
                <div className="list">
                  {es.map((e) => (
                    <div key={e.id} className="item row spread">
                      <span style={{ flex: 1 }}>{e.label}</span>
                      <NumberInput className="short" value={Math.round(e.grams)} ariaLabel="граммы" onChange={(v) => v && v > 0 && updateEntryGrams(db, e.id!, v)} />
                      <span className="muted small">г</span>
                      <span className="small nowrap" style={{ width: '4.5rem', textAlign: 'right' }}>{fmt(e.comp.kcal?.v)} ккал</span>
                      <ConfirmButton label="✕" confirmLabel="удалить?" onConfirm={() => db.diary.delete(e.id!)} />
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
        <div>
          <Card title="Итоги дня">
            <Summary t={data.totals} />
            <p className="small muted" style={{ marginTop: '0.4rem' }}>
              Цель: {plan.macros.kcal} ккал · Б {plan.macros.protein} · Ж ≥{plan.macros.fat} · У {plan.macros.carbs} · клетчатка 25-30 г
            </p>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <span className="small">Записи за день:</span>
              <select value={record?.completeness ?? ''} onChange={(e) => patchDay(db, date, { completeness: (e.target.value || undefined) as 'complete' | 'incomplete' | undefined })}>
                <option value="">авто ({complete ? 'полный' : 'неполный'})</option>
                <option value="complete">записано всё</option>
                <option value="incomplete">записано не всё</option>
              </select>
            </div>
            {suggestSaltyEvening(data.entries, record) && (
              <div className="note warn row spread" style={{ marginTop: '0.6rem' }}>
                <span>Вечером много натрия. Отметить «солёный вечер»?</span>
                <button className="btn small" onClick={() => patchDay(db, date, { saltyEvening: true })}>Отметить</button>
              </div>
            )}
          </Card>
          <Card title="Покрытие норм" actions={<Segmented value={scope} onChange={setScope} options={[{ value: 'day', label: 'день' }, { value: 'week', label: '7 дней' }]} />}>
            {scope === 'week' && <p className="muted small">Среднее по {data.weekDaysCount} дн. с записями.</p>}
            <CoverageTable rows={rows} />
            <p className="muted small" style={{ marginTop: '0.5rem' }}>≈ — часть значений примерная (по аналогу). «Неполные данные» — у части продуктов нет данных по нутриенту.</p>
          </Card>
          {suggestions.length > 0 && (
            <Card title="Чем закрыть недостающее (среднее за 7 дней)">
              {suggestions.map((s) => (
                <div key={s.key} style={{ marginBottom: '0.7rem' }}>
                  <b>{NUTRIENT_INFO[s.key].label}</b> <span className="muted small">— {Math.round(s.pct * 100)}% нормы</span>
                  <ul style={{ margin: '0.3rem 0 0 1.1rem', padding: 0 }}>
                    {s.items.map((i) => (
                      <li key={i.food.id} className="small">
                        {i.label} {i.grams} г: +{fmt(i.amount, NUTRIENT_INFO[s.key].digits)} {NUTRIENT_INFO[s.key].unit} ({Math.round(i.pctOfNorm * 100)}% нормы)
                        {i.eatenBefore && <span className="badge accent" style={{ marginLeft: 4 }}>уже ели</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
      {adding && <AddEntryDialog date={date} meal={adding} foods={foods} onClose={() => setAdding(null)} />}
    </div>
  )
}
