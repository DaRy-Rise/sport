import { useEffect, useState, type ReactNode } from 'react'

export function parseNum(s: string): number | undefined {
  const v = Number(s.replace(',', '.').trim())
  return s.trim() === '' || Number.isNaN(v) ? undefined : v
}

export function fmt(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toFixed(digits).replace('.', ',')
}

/** Числовое поле: принимает запятую, пустое значение = undefined. */
export function NumberInput(props: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  className?: string
  placeholder?: string
  step?: number
  ariaLabel?: string
}) {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value).replace('.', ','))
  useEffect(() => {
    const parsed = parseNum(text)
    if (parsed !== props.value) setText(props.value === undefined ? '' : String(props.value).replace('.', ','))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value])
  return (
    <input
      className={props.className ?? 'num'}
      inputMode="decimal"
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        props.onChange(parseNum(e.target.value))
      }}
    />
  )
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
      {props.hint && <small className="muted">{props.hint}</small>}
    </label>
  )
}

export function Card(props: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(props.title || props.actions) && (
        <div className="row spread" style={{ marginBottom: '0.6rem' }}>
          {props.title && <h2 style={{ margin: 0 }}>{props.title}</h2>}
          {props.actions && <div className="row">{props.actions}</div>}
        </div>
      )}
      {props.children}
    </section>
  )
}

/** Выбор «не заполнено / да / нет». */
export function TriState(props: { value: boolean | undefined; onChange: (v: boolean | undefined) => void; yes?: string; no?: string }) {
  return (
    <span className="tri" role="group">
      <button type="button" className={`unset ${props.value === undefined ? 'on' : ''}`} onClick={() => props.onChange(undefined)}>не заполнено</button>
      <button type="button" className={props.value === true ? 'on' : ''} onClick={() => props.onChange(true)}>{props.yes ?? 'да'}</button>
      <button type="button" className={props.value === false ? 'on' : ''} onClick={() => props.onChange(false)}>{props.no ?? 'нет'}</button>
    </span>
  )
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="seg" role="group">
      {props.options.map((o) => (
        <button key={o.value} type="button" className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>{o.label}</button>
      ))}
    </span>
  )
}

export function Tabs<T extends string>(props: { value: T; tabs: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {props.tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={props.value === t.value} className={props.value === t.value ? 'on' : ''} onClick={() => props.onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  )
}

export function Bar(props: { pct: number; status?: 'ok' | 'low' | 'over' }) {
  return (
    <div className={`bar ${props.status === 'low' ? 'low' : props.status === 'over' ? 'over' : ''}`}>
      <div style={{ width: `${Math.min(100, Math.max(0, props.pct * 100))}%` }} />
    </div>
  )
}

export function Dialog(props: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [props])
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog" role="dialog" aria-label={props.title}>
        <div className="row spread" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>{props.title}</h2>
          <button className="btn link" onClick={props.onClose} aria-label="Закрыть">✕</button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

/** Кнопка с подтверждением вторым нажатием (без системных диалогов). */
export function ConfirmButton(props: { label: string; confirmLabel?: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button className={props.className ?? 'btn small danger'} onClick={() => (armed ? (setArmed(false), props.onConfirm()) : setArmed(true))}>
      {armed ? props.confirmLabel ?? 'Точно?' : props.label}
    </button>
  )
}

export function DateNav(props: { date: string; onChange: (d: string) => void; addDays: (d: string, n: number) => string; label: string }) {
  return (
    <div className="row datenav">
      <button className="btn small" onClick={() => props.onChange(props.addDays(props.date, -1))} aria-label="Предыдущий день"><svg width="9" height="15" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1 1 7l6 6" /></svg></button>
      <input type="date" value={props.date} onChange={(e) => e.target.value && props.onChange(e.target.value)} />
      <button className="btn small" onClick={() => props.onChange(props.addDays(props.date, 1))} aria-label="Следующий день"><svg width="9" height="15" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m1 1 6 6-6 6" /></svg></button>
      <span className="muted">{props.label}</span>
    </div>
  )
}
