import { useMemo, useState, type ReactNode } from 'react'

export function Delta({ value, children }: { value: number | undefined; children: ReactNode }) {
  const dir = value === undefined || Math.abs(value) < 1e-9 ? 'flat' : value > 0 ? 'up' : 'down'
  return (
    <span className={`delta ${dir}`}>
      <span className="arrow" aria-hidden>
        {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●'}
      </span>
      {children}
    </span>
  )
}

export function Stat({ label, value, foot, hero }: { label: string; value: ReactNode; foot?: ReactNode; hero?: boolean }) {
  return (
    <div className={`card stat${hero ? ' hero' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  )
}

export function Card({ title, sub, right, children, className = '' }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="card-head">
        <h2>{title}</h2>
        {sub && <span className="sub">{sub}</span>}
        {right && <div className="right">{right}</div>}
      </div>
      {children}
    </section>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface Column<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
  /** omit to make the column unsortable */
  sort?: (row: T) => number | string | undefined
}

export function DataTable<T>({ rows, columns, rowKey, initialSort, pageSize = 100 }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; initialSort: { key: string; dir: 1 | -1 }; pageSize?: number }) {
  const [sort, setSort] = useState(initialSort)
  const [limit, setLimit] = useState(pageSize)
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sort) return rows
    const get = col.sort
    return [...rows].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      if (x === undefined) return 1
      if (y === undefined) return -1
      return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * sort.dir
    })
  }, [rows, columns, sort])

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : typeof c.sort!(rows[0]) === 'string' ? 1 : -1 }))}>
                      {c.label}
                      {sort.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button type="button" className="btn more" onClick={() => setLimit((l) => l + pageSize)}>
          Show more ({sorted.length - limit} remaining)
        </button>
      )}
    </>
  )
}

export interface BarItem {
  key: string
  name: string
  value: number
  label: ReactNode
  sub?: ReactNode
}

/** Horizontal bars sharing one scale; negative values extend left of a zero line. */
export function BarList({ items, neutral, scale }: { items: BarItem[]; neutral?: boolean; scale?: { min: number; max: number } }) {
  const min = Math.min(0, scale?.min ?? Math.min(...items.map((i) => i.value)))
  const max = Math.max(0, scale?.max ?? Math.max(...items.map((i) => i.value)))
  const span = max - min || 1
  const zero = (-min / span) * 100
  return (
    <div className="bars">
      {items.map((i) => {
        const w = (Math.abs(i.value) / span) * 100
        return (
          <div className="bar-row" key={i.key}>
            <span className="name" title={i.name}>
              {i.name}
            </span>
            <div className="track">
              <span className={`fill ${neutral ? 'neutral' : i.value >= 0 ? 'pos' : 'neg'}`} style={i.value >= 0 ? { left: `${zero}%`, width: `${w}%` } : { left: `${zero - w}%`, width: `${w}%` }} />
              {min < 0 && <span className="zero" style={{ left: `${zero}%` }} />}
            </div>
            <span className="val">
              {i.label}
              {i.sub && <small>{i.sub}</small>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  )
}
