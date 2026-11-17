import { useMemo, useState } from 'react'
import type { ClosedTrade, Portfolio, Position } from '../lib/engine'
import { fmtCompact, fmtDate, fmtDays, fmtINR, fmtNum, fmtPct, fmtPrice, fmtSigned } from '../lib/format'
import { Card, DataTable, Delta, Empty, Stat, type Column } from './ui'

const SOURCE_TAG: Record<Position['priceSource'], string | undefined> = {
  live: undefined,
  manual: 'manual',
  file: undefined,
  'last-trade': 'last trade',
  cost: 'cost',
}

function PriceCell({ pos, onSet }: { pos: Position; onSet: (symbol: string, price: number | undefined) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input
        className="price-input"
        type="number"
        min="0"
        step="any"
        autoFocus
        defaultValue={pos.price}
        aria-label={`Price for ${pos.symbol}`}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim()
          setEditing(false)
          if (v === '') onSet(pos.symbol, undefined)
          else if (+v > 0 && +v !== pos.price) onSet(pos.symbol, +v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <>
      <button type="button" className="price-btn" title="Click to set a price manually (clear to reset)" onClick={() => setEditing(true)}>
        {fmtPrice(pos.price)}
      </button>
      {SOURCE_TAG[pos.priceSource] && <span className="tag">{SOURCE_TAG[pos.priceSource]}</span>}
    </>
  )
}

export function HoldingsTable({ p, onSetPrice }: { p: Portfolio; onSetPrice: (symbol: string, price: number | undefined) => void }) {
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? p.positions.filter((x) => x.symbol.toLowerCase().includes(needle) || x.sector?.toLowerCase().includes(needle)) : p.positions
  }, [p.positions, q])
  const hasDay = p.positions.some((x) => x.dayPct !== undefined)
  const hasHeld = p.positions.some((x) => x.heldDays !== undefined)
  const maxWeight = Math.max(...p.positions.map((x) => x.weight), 0.0001)

  const columns: Column<Position>[] = [
    { key: 'symbol', label: 'Stock', sort: (x) => x.symbol, render: (x) => (<><span className="sym">{x.symbol}</span>{x.sector && <small>{x.sector}</small>}</>) },
    { key: 'qty', label: 'Qty', sort: (x) => x.qty, render: (x) => fmtNum(x.qty) },
    { key: 'avg', label: 'Avg cost', sort: (x) => x.avgPrice, render: (x) => fmtPrice(x.avgPrice) },
    { key: 'price', label: 'Price', sort: (x) => x.price, render: (x) => <PriceCell pos={x} onSet={onSetPrice} /> },
    { key: 'invested', label: 'Invested', sort: (x) => x.invested, render: (x) => fmtINR(x.invested) },
    { key: 'value', label: 'Value', sort: (x) => x.value, render: (x) => fmtINR(x.value) },
    { key: 'pnl', label: 'P&L', sort: (x) => x.pnl, render: (x) => <Delta value={x.pnl}>{fmtSigned(x.pnl)}</Delta> },
    { key: 'pct', label: 'Return', sort: (x) => x.pct, render: (x) => fmtPct(x.pct) },
    ...(hasDay ? [{ key: 'day', label: 'Day', sort: (x: Position) => x.dayPct, render: (x: Position) => (x.dayPct === undefined ? '—' : <Delta value={x.dayPct}>{fmtPct(x.dayPct)}</Delta>) }] : []),
    { key: 'weight', label: 'Weight', sort: (x) => x.weight, render: (x) => (<span className="weight"><i><b style={{ width: `${(x.weight / maxWeight) * 100}%` }} /></i>{(x.weight * 100).toFixed(1)}%</span>) },
    ...(hasHeld ? [{ key: 'held', label: 'Held', sort: (x: Position) => x.heldDays, render: (x: Position) => (x.heldDays === undefined ? '—' : fmtDays(x.heldDays)) }] : []),
  ]

  return (
    <Card title="Holdings" sub={`${rows.length} of ${p.positions.length}`} right={<input className="search" type="search" placeholder="Search stock or sector" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search holdings" />}>
      {rows.length ? <DataTable rows={rows} columns={columns} rowKey={(x) => x.symbol} initialSort={{ key: 'value', dir: -1 }} /> : <Empty title="No matching holdings" />}
    </Card>
  )
}

export function Trades({ p }: { p: Portfolio }) {
  const [q, setQ] = useState('')
  const s = p.stats
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? p.closedTrades.filter((x) => x.symbol.toLowerCase().includes(needle)) : p.closedTrades
  }, [p.closedTrades, q])
  if (!p.hasTrades) {
    return <Empty title="Trade statistics need a tradebook">Import your tradebook files to see win rate, holding periods and every closed trade.</Empty>
  }
  const columns: Column<ClosedTrade>[] = [
    { key: 'symbol', label: 'Stock', sort: (x) => x.symbol, render: (x) => <span className="sym">{x.symbol}</span> },
    { key: 'date', label: 'Sold on', sort: (x) => x.sellDate, render: (x) => fmtDate(x.sellDate) },
    { key: 'qty', label: 'Qty', sort: (x) => x.qty, render: (x) => fmtNum(x.qty) },
    { key: 'buy', label: 'Avg buy', sort: (x) => x.cost / x.qty, render: (x) => fmtPrice(x.cost / x.qty) },
    { key: 'sell', label: 'Avg sell', sort: (x) => x.proceeds / x.qty, render: (x) => fmtPrice(x.proceeds / x.qty) },
    { key: 'pnl', label: 'P&L', sort: (x) => x.pnl, render: (x) => <Delta value={x.pnl}>{fmtSigned(x.pnl)}</Delta> },
    { key: 'pct', label: 'Return', sort: (x) => x.pct, render: (x) => fmtPct(x.pct) },
    { key: 'days', label: 'Held', sort: (x) => x.days, render: (x) => fmtDays(x.days) },
  ]
  return (
    <>
      <div className="grid kpis">
        <Stat label="Win rate" value={s.winRate === undefined ? '—' : `${(s.winRate * 100).toFixed(0)}%`} foot={`${s.wins} won, ${s.losses} lost of ${s.closedTrades}`} />
        <Stat label="Profit factor" value={s.profitFactor === undefined ? '—' : s.profitFactor.toFixed(2)} foot="Gross profit ÷ gross loss" />
        <Stat label="Average win" value={s.avgWin === undefined ? '—' : <Delta value={s.avgWin}>{fmtSigned(s.avgWin)}</Delta>} foot={s.best ? `Best: ${s.best.symbol} ${fmtSigned(s.best.pnl)}` : undefined} />
        <Stat label="Average loss" value={s.avgLoss === undefined ? '—' : <Delta value={s.avgLoss}>{fmtSigned(s.avgLoss)}</Delta>} foot={s.worst ? `Worst: ${s.worst.symbol} ${fmtSigned(s.worst.pnl)}` : undefined} />
        <Stat label="Average holding period" value={s.avgHoldDays === undefined ? '—' : fmtDays(s.avgHoldDays)} foot="Quantity-weighted, sold shares" />
        <Stat label="Short-term gains" value={<Delta value={s.shortTerm}>{fmtSigned(s.shortTerm)}</Delta>} foot="Held 12 months or less" />
        <Stat label="Long-term gains" value={<Delta value={s.longTerm}>{fmtSigned(s.longTerm)}</Delta>} foot="Held more than 12 months" />
        <Stat label="Turnover" value={fmtCompact(s.buyTurnover + s.sellTurnover)} foot={`${s.tradeCount} fills${s.firstTrade ? ` since ${fmtDate(s.firstTrade)}` : ''}`} />
      </div>
      <Card title="Closed trades" sub={`${rows.length} sells, matched to buys first-in first-out`} right={<input className="search" type="search" placeholder="Search stock" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search closed trades" />}>
        {rows.length ? <DataTable rows={rows} columns={columns} rowKey={(x) => `${x.symbol}|${x.sellDate}`} initialSort={{ key: 'date', dir: -1 }} pageSize={50} /> : <Empty title="No closed trades yet" />}
      </Card>
    </>
  )
}
