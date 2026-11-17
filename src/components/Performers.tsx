import { useState } from 'react'
import type { Portfolio } from '../lib/engine'
import { fmtPct, fmtSigned } from '../lib/format'
import { BarList, Card, Empty, Segmented, type BarItem } from './ui'

type Mode = 'pct' | 'abs' | 'all'

export function Performers({ p }: { p: Portfolio }) {
  const [mode, setMode] = useState<Mode>('pct')
  const options: { value: Mode; label: string }[] = [
    { value: 'pct', label: 'Return %' },
    { value: 'abs', label: 'P&L ₹' },
  ]
  if (p.hasTrades) options.push({ value: 'all', label: 'All-time ₹' })

  let items: BarItem[]
  if (mode === 'all') {
    items = p.symbolTotals.map((s) => ({
      key: s.symbol,
      name: s.symbol + (s.open ? '' : ' (sold)'),
      value: s.total,
      label: fmtSigned(s.total),
      sub: `${fmtSigned(s.realized)} realised`,
    }))
  } else {
    items = [...p.positions]
      .sort((a, b) => (mode === 'pct' ? b.pct - a.pct : b.pnl - a.pnl))
      .map((x) => ({
        key: x.symbol,
        name: x.symbol,
        value: mode === 'pct' ? x.pct : x.pnl,
        label: mode === 'pct' ? fmtPct(x.pct, 1) : fmtSigned(x.pnl),
        sub: mode === 'pct' ? fmtSigned(x.pnl) : fmtPct(x.pct, 1),
      }))
  }
  if (!items.length) return <Empty title="Nothing to rank yet">Import holdings or a tradebook to see performers.</Empty>

  const scale = { min: Math.min(0, ...items.map((i) => i.value)), max: Math.max(0, ...items.map((i) => i.value)) }
  const best = items.filter((i) => i.value > 0).slice(0, 5)
  const worst = items.filter((i) => i.value < 0).slice(-5).reverse()
  const what = mode === 'pct' ? 'return on cost' : mode === 'abs' ? 'unrealised P&L' : 'realised + unrealised P&L'
  const toggle = <Segmented label="Rank by" value={mode} options={options} onChange={setMode} />

  return (
    <>
      <div className="grid two">
        <Card title="Best performers" sub={`Top ${best.length || ''} by ${what}`} right={toggle}>
          {best.length ? <BarList items={best} scale={{ min: 0, max: scale.max }} /> : <p className="sub">Nothing is in profit.</p>}
        </Card>
        <Card title="Worst performers" sub={`Bottom ${worst.length || ''} by ${what}`}>
          {worst.length ? <BarList items={worst} scale={{ min: scale.min, max: 0 }} /> : <p className="sub">Nothing is at a loss.</p>}
        </Card>
      </div>
      <Card className="block" title={mode === 'all' ? 'Every stock you have traded' : 'All holdings'} sub={`Ranked by ${what}; ${items.filter((i) => i.value > 0).length} up, ${items.filter((i) => i.value < 0).length} down`}>
        <BarList items={items} scale={scale} />
      </Card>
    </>
  )
}
