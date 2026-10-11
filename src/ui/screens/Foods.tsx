import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { deleteFood, deleteTemplate } from '../../db/repo'
import { computeBatch, estimateCookedWeight, learnYield, measureToGrams, netWeight, yieldFor } from '../../domain/batch'
import { formatDate, today } from '../../domain/dates'
import { effectivePer100, foodLabel, itemsTotals, labelComposition, type FoodsById } from '../../domain/library'
import { NUTRIENT_INFO, sumParts } from '../../domain/nutrients'
import { searchItems } from '../../domain/search'
import { NUTRIENT_KEYS, type Batch, type BatchIngredient, type Food, type MealTemplate, type Measure, type PortionItem, type TemplateVariant } from '../../domain/types'
import { BackLink, Card, ConfirmButton, Dialog, Field, NumberInput, Tabs, fmt } from '../components'
import { db, useFoodsMap } from '../data'
import { FoodPicker } from '../FoodPicker'
import { Summary } from '../Summary'

type Tab = 'foods' | 'templates' | 'batches' | 'tares'


// ---------- Продукты ----------

interface LabelForm {
  name: string
  brand: string
  kcal?: number
  protein?: number
  fat?: number
  carbs?: number
  fiber?: number
  salt?: number
  analogId?: number
  measures: Measure[]
}

function emptyLabel(): LabelForm {
  return { name: '', brand: '', measures: [] }
}

function fromFood(f: Food): LabelForm {
  return {
    name: f.name, brand: f.brand ?? '', kcal: f.per100.kcal?.v, protein: f.per100.protein?.v, fat: f.per100.fat?.v,
    carbs: f.per100.carbs?.v, fiber: f.per100.fiber?.v, salt: f.per100.sodium ? Math.round((f.per100.sodium.v / 400) * 100) / 100 : undefined,
    analogId: f.analogId, measures: f.measures,
  }
}

function PackagedEditor({ food, foods, onClose }: { food?: Food; foods: FoodsById; onClose: () => void }) {
  const [f, setF] = useState<LabelForm>(food ? fromFood(food) : emptyLabel())
  const [pickAnalog, setPickAnalog] = useState(false)
  const set = <K extends keyof LabelForm>(k: K, v: LabelForm[K]) => setF((x) => ({ ...x, [k]: v }))
  const valid = f.name.trim() && f.kcal !== undefined && f.protein !== undefined && f.fat !== undefined && f.carbs !== undefined
  const draft: Food = {
    ...(food?.id ? { id: food.id } : {}), kind: 'packaged', name: f.name.trim(), brand: f.brand.trim() || undefined, synonyms: food?.synonyms ?? [],
    per100: labelComposition({ kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs, fiber: f.fiber, salt: f.salt }),
    analogId: f.analogId, measures: f.measures.filter((m) => m.name && m.grams > 0),
  }
  const eff = effectivePer100(draft, foods)
  const analog = f.analogId !== undefined ? foods.get(f.analogId) : undefined

  async function save() {
    await db.foods.put(draft)
    onClose()
  }

  return (
    <Dialog title={food ? 'Продукт в упаковке' : 'Новый продукт в упаковке'} onClose={onClose}>
      <div className="grid two">
        <Field label="Название"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Карпаччо из индейки" /></Field>
        <Field label="Производитель"><input value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Дзержинка" /></Field>
      </div>
      <h3 style={{ marginTop: '1rem' }}>Этикетка, на 100 г</h3>
      <div className="row">
        <Field label="ккал"><NumberInput value={f.kcal} onChange={(v) => set('kcal', v)} /></Field>
        <Field label="Белки, г"><NumberInput value={f.protein} onChange={(v) => set('protein', v)} /></Field>
        <Field label="Жиры, г"><NumberInput value={f.fat} onChange={(v) => set('fat', v)} /></Field>
        <Field label="Углеводы, г"><NumberInput value={f.carbs} onChange={(v) => set('carbs', v)} /></Field>
        <Field label="Клетчатка, г" hint="пусто = не указано"><NumberInput value={f.fiber} onChange={(v) => set('fiber', v)} /></Field>
        <Field label="Соль, г" hint="пусто = не указано"><NumberInput value={f.salt} onChange={(v) => set('salt', v)} /></Field>
      </div>
      <h3 style={{ marginTop: '1rem' }}>Аналог для микронутриентов</h3>
      <p className="muted small">Витамины и минералы, которых нет на этикетке, возьмутся у похожего продукта из справочника с пометкой «примерно».</p>
      {analog ? (
        <div className="row"><span>{analog.name}</span><button className="btn small" onClick={() => set('analogId', undefined)}>Убрать</button><button className="btn small" onClick={() => setPickAnalog(true)}>Сменить</button></div>
      ) : (
        <button className="btn small" onClick={() => setPickAnalog(true)}>Выбрать аналог</button>
      )}
      {pickAnalog && (
        <div className="card" style={{ marginTop: '0.5rem' }}>
          <FoodPicker kind="generic" autoFocus placeholder="Например, «грудка индейки» или «сливочный сыр»" onPick={(p) => {
            if (p.type === 'food') set('analogId', p.food.id)
            setPickAnalog(false)
          }} />
        </div>
      )}
      <h3 style={{ marginTop: '1rem' }}>Бытовые меры</h3>
      <div className="stack">
        {f.measures.map((m, i) => (
          <div className="row" key={i}>
            <input value={m.name} placeholder="ломтик" onChange={(e) => set('measures', f.measures.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <NumberInput className="short" value={m.grams} onChange={(v) => set('measures', f.measures.map((x, j) => (j === i ? { ...x, grams: v ?? 0 } : x)))} />
            <span className="muted">г</span>
            <button className="btn small" onClick={() => set('measures', f.measures.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div><button className="btn small" onClick={() => set('measures', [...f.measures, { name: '', grams: 0 }])}>+ мера</button></div>
      </div>
      <div className="note" style={{ marginTop: '1rem' }}>
        <div className="small muted">Итог на 100 г (≈ — примерно, ? — нет данных):</div>
        <Summary t={sumParts([{ label: draft.name || 'продукт', comp: eff }])} />
        <div className="small muted" style={{ marginTop: '0.3rem' }}>
          {(['iron', 'calcium', 'magnesium', 'vitA'] as const).map((k) => `${NUTRIENT_INFO[k].label}: ${eff[k] ? `${eff[k]!.acc === 'approx' ? '≈' : ''}${fmt(eff[k]!.v, 1)}` : '?'}`).join(' · ')}
        </div>
      </div>
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn primary" disabled={!valid} onClick={save}>Сохранить</button>
        <button className="btn" onClick={onClose}>Отмена</button>
      </div>
    </Dialog>
  )
}

function FoodDetails({ food, foods, onClose, onEdit }: { food: Food; foods: FoodsById; onClose: () => void; onEdit: () => void }) {
  const eff = effectivePer100(food, foods)
  const [msg, setMsg] = useState('')
  return (
    <Dialog title={foodLabel(food)} onClose={onClose}>
      <p className="muted small">{food.kind === 'packaged' ? 'Продукт в упаковке (этикетка)' : 'Справочник USDA'}{food.yieldFactor ? ` · выход при готовке ×${food.yieldFactor}` : ''}</p>
      <div className="table-wrap">
        <table>
          <tbody>
            {NUTRIENT_KEYS.map((k) => (
              <tr key={k}>
                <td>{NUTRIENT_INFO[k].label}</td>
                <td className="num">{eff[k] ? `${eff[k]!.acc === 'approx' ? '≈ ' : ''}${fmt(eff[k]!.v, NUTRIENT_INFO[k].digits)} ${NUTRIENT_INFO[k].unit}` : <span className="muted">нет данных</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {food.measures.length > 0 && <p className="small" style={{ marginTop: '0.6rem' }}>Меры: {food.measures.map((m) => `${m.name} = ${m.grams} г`).join(', ')}</p>}
      <div className="row" style={{ marginTop: '1rem' }}>
        {food.kind === 'packaged' && <button className="btn" onClick={onEdit}>Изменить</button>}
        <ConfirmButton label={food.kind === 'packaged' ? 'Удалить' : 'Скрыть из поиска'} onConfirm={async () => {
          if (food.kind === 'packaged') {
            const r = await deleteFood(db, food.id!)
            setMsg(r === 'hidden' ? 'Продукт уже использовался — скрыт из поиска, записи сохранены.' : 'Удалено.')
          } else {
            await db.foods.update(food.id!, { hidden: true })
            setMsg('Скрыт из поиска.')
          }
          setTimeout(onClose, 900)
        }} />
      </div>
      {msg && <p className="small">{msg}</p>}
    </Dialog>
  )
}

function FoodsTab({ foods }: { foods: FoodsById }) {
  const [q, setQ] = useState('')
  const [onlyMine, setOnlyMine] = useState(true)
  const [edit, setEdit] = useState<Food | 'new' | null>(null)
  const [view, setView] = useState<Food | null>(null)
  const all = [...foods.values()].filter((f) => !f.hidden)
  const list = q.trim() ? searchItems(all, q, 50) : all.filter((f) => (onlyMine ? f.kind === 'packaged' : true)).slice(0, 200)
  return (
    <Card title="Продукты" actions={<button className="btn primary" onClick={() => setEdit('new')}>+ Продукт в упаковке</button>}>
      <div className="row" style={{ marginBottom: '0.6rem' }}>
        <input placeholder="Поиск по названию…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        {!q && <label className="row small"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> только мои (в упаковке)</label>}
      </div>
      <div className="list">
        {list.map((f) => (
          <button key={f.id} className="item btn link" style={{ textAlign: 'left', color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }} onClick={() => setView(f)}>
            <span>{foodLabel(f)} {f.kind === 'packaged' && <span className="badge">упаковка</span>} {f.analogId !== undefined && <span className="badge">аналог: {foods.get(f.analogId)?.name}</span>}</span>
            <span className="muted small">{f.per100.kcal ? `${Math.round(f.per100.kcal.v)} ккал` : ''}</span>
          </button>
        ))}
        {!list.length && <p className="muted">{onlyMine && !q ? 'Своих продуктов пока нет. Добавьте продукт с этикетки.' : 'Ничего не найдено.'}</p>}
      </div>
      {view && <FoodDetails food={view} foods={foods} onClose={() => setView(null)} onEdit={() => { setEdit(view); setView(null) }} />}
      {edit && <PackagedEditor food={edit === 'new' ? undefined : edit} foods={foods} onClose={() => setEdit(null)} />}
    </Card>
  )
}

// ---------- Шаблоны ----------

function ItemsEditor({ items, onChange, foods }: { items: PortionItem[]; onChange: (i: PortionItem[]) => void; foods: FoodsById }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="stack">
      {items.map((it, i) => (
        <div className="row" key={i}>
          <span style={{ flex: 1 }}>{foods.get(it.foodId) ? foodLabel(foods.get(it.foodId)!) : '?'}</span>
          <NumberInput className="short" value={it.grams} onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, grams: v ?? 0 } : x)))} />
          <span className="muted">г</span>
          <button className="btn small" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Убрать">✕</button>
        </div>
      ))}
      {adding ? (
        <div className="card"><FoodPicker autoFocus onPick={(p) => { if (p.type === 'food') onChange([...items, { foodId: p.food.id!, grams: 100 }]); setAdding(false) }} /></div>
      ) : <div><button className="btn small" onClick={() => setAdding(true)}>+ продукт</button></div>}
      <Summary t={itemsTotals(items, foods)} />
    </div>
  )
}

function TemplateEditor({ tpl, foods, onClose }: { tpl?: MealTemplate; foods: FoodsById; onClose: () => void }) {
  const [name, setName] = useState(tpl?.name ?? '')
  const [items, setItems] = useState<PortionItem[]>(tpl?.items ?? [])
  const [variants, setVariants] = useState<TemplateVariant[]>(tpl?.variants ?? [])
  async function save() {
    await db.templates.put({ ...(tpl?.id ? { id: tpl.id } : {}), name: name.trim(), items, variants: variants.filter((v) => v.name.trim()) })
    onClose()
  }
  return (
    <Dialog title={tpl ? 'Шаблон' : 'Новый шаблон'} onClose={onClose}>
      <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Мой бутерброд" /></Field>
      <h3 style={{ marginTop: '1rem' }}>Основной вариант</h3>
      <ItemsEditor items={items} onChange={setItems} foods={foods} />
      {variants.map((v, i) => (
        <div key={i} className="card" style={{ marginTop: '1rem' }}>
          <div className="row spread">
            <input value={v.name} placeholder="Название варианта, например «с нутом»" onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <button className="btn small danger" onClick={() => setVariants(variants.filter((_, j) => j !== i))}>Удалить вариант</button>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <ItemsEditor items={v.items} onChange={(it) => setVariants(variants.map((x, j) => (j === i ? { ...x, items: it } : x)))} foods={foods} />
          </div>
        </div>
      ))}
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn small" onClick={() => setVariants([...variants, { name: '', items: items.map((i) => ({ ...i })) }])}>+ вариант (копия основного)</button>
      </div>
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn primary" disabled={!name.trim() || !items.length} onClick={save}>Сохранить</button>
        <button className="btn" onClick={onClose}>Отмена</button>
        {tpl?.id && <ConfirmButton label="Удалить шаблон" onConfirm={async () => { await deleteTemplate(db, tpl.id!); onClose() }} />}
      </div>
    </Dialog>
  )
}

function TemplatesTab({ foods }: { foods: FoodsById }) {
  const templates = useLiveQuery(() => db.templates.filter((t) => !t.hidden).toArray(), [])
  const [edit, setEdit] = useState<MealTemplate | 'new' | null>(null)
  return (
    <Card title="Шаблоны приёмов пищи" actions={<button className="btn primary" onClick={() => setEdit('new')}>+ Шаблон</button>}>
      <div className="list">
        {(templates ?? []).map((t) => (
          <div key={t.id} className="item">
            <div className="row spread">
              <b>{t.name}</b>
              <button className="btn small" onClick={() => setEdit(t)}>Изменить</button>
            </div>
            <div className="muted small">{t.items.map((i) => `${foods.get(i.foodId)?.name ?? '?'} ${i.grams} г`).join(', ')}</div>
            <Summary t={itemsTotals(t.items, foods)} />
            {t.variants.map((v) => (
              <div key={v.name} className="small" style={{ marginTop: '0.3rem' }}>
                <span className="badge">вариант: {v.name}</span> <Summary t={itemsTotals(v.items, foods)} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {edit && <TemplateEditor tpl={edit === 'new' ? undefined : edit} foods={foods} onClose={() => setEdit(null)} />}
    </Card>
  )
}

// ---------- Заготовки ----------

function BatchEditor({ foods, onClose, batch }: { foods: FoodsById; onClose: () => void; batch?: Batch }) {
  const tares = useLiveQuery(() => db.tares.toArray(), [])
  const yields = useLiveQuery(() => db.yields.toArray(), [])
  const [name, setName] = useState(batch?.name ?? '')
  const [date, setDate] = useState(batch?.cookedDate ?? today())
  const [ings, setIngs] = useState<BatchIngredient[]>(batch?.ingredients ?? [])
  const [gross, setGross] = useState<number | undefined>(batch?.grossWeightG ?? (batch && !batch.weightEstimated ? batch.cookedWeightG : undefined))
  const [tareId, setTareId] = useState<number | undefined>(batch?.tareId)
  const [adding, setAdding] = useState(false)
  const personal = new Map((yields ?? []).map((y) => [y.foodId, y]))
  const tare = tares?.find((t) => t.id === tareId)
  const weighed = gross !== undefined && gross > 0
  const cooked = weighed ? netWeight(gross!, tare) : estimateCookedWeight(ings, foods, personal)
  const calc = ings.length && cooked > 0 ? computeBatch(ings, cooked, foods) : null

  const setIng = (i: number, patch: Partial<BatchIngredient>) => setIngs(ings.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  async function save() {
    if (!calc) return
    const b: Batch = {
      ...(batch?.id ? { id: batch.id } : {}), name: batch ? name.trim() : `${name.trim()}, ${formatDate(date)}`,
      cookedDate: date, ingredients: ings, cookedWeightG: Math.round(cooked), weightEstimated: !weighed, tareId, grossWeightG: weighed ? gross : undefined,
      per100: calc.per100, unknownFrom: calc.unknownFrom, finished: batch?.finished,
    }
    await db.batches.put(b)
    if (weighed) {
      const main = ings.find((i) => foods.get(i.foodId)?.yieldFactor !== undefined)
      const learned = learnYield(ings, cooked, foods, main ? personal.get(main.foodId) : undefined)
      if (learned) await db.yields.put(learned)
    }
    onClose()
  }

  return (
    <Dialog title={batch ? 'Заготовка' : 'Новая заготовка'} onClose={onClose}>
      <div className="grid two">
        <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Курица в аэрогриле" /></Field>
        <Field label="Дата приготовления"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <h3 style={{ marginTop: '1rem' }}>Сырые ингредиенты (включая масло и маринад)</h3>
      <div className="stack">
        {ings.map((it, i) => {
          const f = foods.get(it.foodId)
          return (
            <div className="row" key={i}>
              <span style={{ flex: 1 }}>{f ? foodLabel(f) : '?'}</span>
              {f && f.measures.length > 0 && (
                <>
                  <NumberInput className="short" value={it.measure?.count} placeholder="кол-во" onChange={(v) => {
                    const m = it.measure?.name ?? f.measures[0].name
                    setIng(i, v === undefined ? { measure: undefined } : { measure: { name: m, count: v }, grams: measureToGrams(f, m, v) })
                  }} />
                  <select value={it.measure?.name ?? f.measures[0].name} onChange={(e) => {
                    const c = it.measure?.count ?? 1
                    setIng(i, { measure: { name: e.target.value, count: c }, grams: measureToGrams(f, e.target.value, c) })
                  }}>
                    {f.measures.map((m) => <option key={m.name} value={m.name}>{m.name} ({m.grams} г)</option>)}
                  </select>
                  <span className="muted">или</span>
                </>
              )}
              <NumberInput className="short" value={Math.round(it.grams * 10) / 10} onChange={(v) => setIng(i, { grams: v ?? 0, measure: undefined })} />
              <span className="muted">г</span>
              <button className="btn small" onClick={() => setIngs(ings.filter((_, j) => j !== i))}>✕</button>
            </div>
          )
        })}
        {adding ? (
          <div className="card"><FoodPicker autoFocus onPick={(p) => { if (p.type === 'food') setIngs([...ings, { foodId: p.food.id!, grams: 100 }]); setAdding(false) }} /></div>
        ) : <div><button className="btn small" onClick={() => setAdding(true)}>+ ингредиент</button></div>}
      </div>
      <h3 style={{ marginTop: '1rem' }}>Вес готового</h3>
      <div className="row">
        <Field label="На весах, г"><NumberInput value={gross} onChange={setGross} /></Field>
        <Field label="Тара">
          <select value={tareId ?? ''} onChange={(e) => setTareId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">без тары</option>
            {(tares ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.weightG} г)</option>)}
          </select>
        </Field>
      </div>
      <p className="small" style={{ marginTop: '0.4rem' }}>
        {weighed ? <>Вес готового (нетто): <b>{fmt(cooked)} г</b></> : (
          <>Не взвешено — оценка по коэффициентам выхода: <b>≈ {fmt(cooked)} г</b> <span className="badge warn">вес оценён</span>
            {ings.filter((i) => foods.get(i.foodId)?.yieldFactor).map((i) => {
              const f = foods.get(i.foodId)!
              const y = yieldFor(f, personal.get(f.id!))
              return <span key={i.foodId} className="muted"> · {f.name} ×{fmt(y, 2)}{personal.has(f.id!) ? ' (ваш)' : ''}</span>
            })}
          </>
        )}
      </p>
      {calc && (
        <div className="note">
          <div className="small muted">Всего {fmt(calc.totalKcal)} ккал. На 100 г готового:</div>
          <Summary t={sumParts([{ label: name || 'заготовка', comp: calc.per100, unknownFrom: calc.unknownFrom }])} />
        </div>
      )}
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn primary" disabled={!name.trim() || !calc} onClick={save}>Сохранить</button>
        <button className="btn" onClick={onClose}>Отмена</button>
      </div>
    </Dialog>
  )
}

function BatchesTab({ foods }: { foods: FoodsById }) {
  const [showFinished, setShowFinished] = useState(false)
  const batches = useLiveQuery(() => db.batches.orderBy('cookedDate').reverse().toArray(), [])
  const [edit, setEdit] = useState<Batch | 'new' | null>(null)
  const list = (batches ?? []).filter((b) => showFinished || !b.finished)
  return (
    <Card title="Заготовки" actions={<button className="btn primary" onClick={() => setEdit('new')}>+ Заготовка</button>}>
      <p className="muted small">Готовите на несколько дней или на двоих? Введите сырые ингредиенты и вес готового — дальше записывайте свою порцию в граммах готового.</p>
      <label className="row small"><input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} /> показывать закончившиеся</label>
      <div className="list">
        {list.map((b) => (
          <div key={b.id} className="item">
            <div className="row spread">
              <span><b>{b.name}</b> {b.weightEstimated && <span className="badge warn">вес оценён</span>} {b.finished && <span className="badge">закончилась</span>}</span>
              <span className="row">
                <button className="btn small" onClick={() => setEdit(b)}>Изменить</button>
                <button className="btn small" onClick={() => db.batches.update(b.id!, { finished: !b.finished })}>{b.finished ? 'Вернуть' : 'Закончилась'}</button>
              </span>
            </div>
            <div className="muted small">{formatDate(b.cookedDate)} · готового {b.cookedWeightG} г · на 100 г:</div>
            <Summary t={sumParts([{ label: b.name, comp: b.per100, unknownFrom: b.unknownFrom }])} />
          </div>
        ))}
        {!list.length && <p className="muted">Активных заготовок нет.</p>}
      </div>
      {edit && <BatchEditor foods={foods} batch={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </Card>
  )
}

function TaresTab() {
  const tares = useLiveQuery(() => db.tares.toArray(), [])
  const [name, setName] = useState('')
  const [w, setW] = useState<number | undefined>()
  return (
    <Card title="Тара">
      <p className="muted small">Взвесьте пустой контейнер или противень один раз — потом вес будет вычитаться сам.</p>
      <div className="list">
        {(tares ?? []).map((t) => (
          <div key={t.id} className="item row spread">
            <span>{t.name} — {t.weightG} г</span>
            <ConfirmButton label="Удалить" onConfirm={() => db.tares.delete(t.id!)} />
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: '0.8rem' }}>
        <input placeholder="Синий контейнер" value={name} onChange={(e) => setName(e.target.value)} />
        <NumberInput value={w} onChange={setW} placeholder="г" />
        <button className="btn primary" disabled={!name.trim() || !w} onClick={async () => { await db.tares.add({ name: name.trim(), weightG: w! }); setName(''); setW(undefined) }}>Добавить</button>
      </div>
    </Card>
  )
}

export function FoodsScreen() {
  const [tab, setTab] = useState<Tab>('foods')
  const foods = useFoodsMap()
  if (!foods) return <p className="muted">Загрузка…</p>
  return (
    <div>
      <BackLink to="/diary" label="Дневник" />
      <h1>Продукты</h1>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'foods', label: 'Продукты' }, { value: 'templates', label: 'Шаблоны' },
        { value: 'batches', label: 'Заготовки' }, { value: 'tares', label: 'Тара' },
      ]} />
      {tab === 'foods' && <FoodsTab foods={foods} />}
      {tab === 'templates' && <TemplatesTab foods={foods} />}
      {tab === 'batches' && <BatchesTab foods={foods} />}
      {tab === 'tares' && <TaresTab />}
    </div>
  )
}

