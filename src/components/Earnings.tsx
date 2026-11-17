import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PeriodRow, Portfolio } from '../lib/engine'
import { fmtCompact, fmtINR, fmtMonth, fmtSigned, fmtSignedCompact, monthName } from '../lib/format'
import { Card, Delta, Empty, Segmented, Stat } from './ui'

function PnlBars({ rows, label, height = 260 }: { rows: PeriodRow[]; label: (key: string) => string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap={rows.length > 24 ? 2 : '18%'}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="key" tickFormatter={label} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={fmtCompact} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickLine={false} axisLine={false} width={62} />
          <ReferenceLine y={0} stroke="var(--text-3)" />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const r = payload[0].payload as PeriodRow
              return (
                <div className="tip">
                  <b>{label(r.key)}</b>
                  <div>
                    <span>Realised P&L</span>
                    <span>{fmtSigned(r.realized)}</span>
                  </div>
                  <div>
                    <span>Bought</span>
                    <span>{fmtINR(r.bought)}</span>
                  </div>
                  <div>
                    <span>Sold</span>
                    <span>{fmtINR(r.sold)}</span>
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="realized" maxBarSize={44} isAnimationActive={false} radius={[4, 4, 0, 0]}>
            {rows.map((r) => (
              <Cell key={r.key} fill={r.realized >= 0 ? 'var(--gain)' : 'var(--loss)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Earnings({ p }: { p: Portfolio }) {
  const [yearMode, setYearMode] = useState<'fy' | 'cy'>('fy')
  const [range, setRange] = useState<'all' | '12' | '24'>('all')
  if (!p.hasTrades) {
    return (
      <Empty title="Earnings need a tradebook">
        Monthly and yearly earnings are worked out from your buy and sell history. Import your tradebook files (one per financial year) to unlock this view.
      </Empty>
    )
  }
  const years = yearMode === 'fy' ? p.financialYears : p.calendarYears
  const months = range === 'all' ? p.monthly : p.monthly.slice(-+range)
  const active = p.monthly.filter((m) => m.sold > 0)
  const bestMonth = active.length ? active.reduce((a, b) => (b.realized > a.realized ? b : a)) : undefined
  const worstMonth = active.length ? active.reduce((a, b) => (b.realized < a.realized ? b : a)) : undefined
  const thisYear = years[years.length - 1]
  const positive = active.filter((m) => m.realized > 0).length

  // month x calendar-year grid
  const cy = p.calendarYears.map((y) => y.key)
  const cell = new Map(p.monthly.map((m) => [m.key, m]))
  const peak = Math.max(1, ...p.monthly.map((m) => Math.abs(m.realized)))

  return (
    <>
      <div className="grid kpis">
        <Stat label="Realised P&L, all time" value={<Delta value={p.realized}>{fmtSigned(p.realized)}</Delta>} foot="Booked profit from sells, before charges" />
        {thisYear && <Stat label={`Realised, ${thisYear.key}`} value={<Delta value={thisYear.realized}>{fmtSigned(thisYear.realized)}</Delta>} foot={`${fmtCompact(thisYear.sold)} sold`} />}
        {bestMonth && <Stat label="Best month" value={<Delta value={bestMonth.realized}>{fmtSignedCompact(bestMonth.realized)}</Delta>} foot={fmtMonth(bestMonth.key)} />}
        {worstMonth && <Stat label="Worst month" value={<Delta value={worstMonth.realized}>{fmtSignedCompact(worstMonth.realized)}</Delta>} foot={fmtMonth(worstMonth.key)} />}
        <Stat label="Profitable months" value={active.length ? `${positive} of ${active.length}` : '—'} foot="Months with at least one sell" />
      </div>

      <Card
        className="block"
        title="Monthly earnings"
        sub="Realised P&L by month of sale"
        right={
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: '12', label: '12M' },
              { value: '24', label: '24M' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      >
        <PnlBars rows={months} label={fmtMonth} />
      </Card>

      <div className="grid two">
        <Card
          title="Yearly earnings"
          sub="Realised P&L"
          right={
            <Segmented
              label="Year type"
              value={yearMode}
              onChange={setYearMode}
              options={[
                { value: 'fy', label: 'Financial year' },
                { value: 'cy', label: 'Calendar year' },
              ]}
            />
          }
        >
          <PnlBars rows={years} label={(k) => k.replace('FY 20', 'FY ')} height={220} />
        </Card>
        <Card title="Year by year" sub="Money in, money out, profit booked">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Bought</th>
                  <th>Sold</th>
                  <th>Realised P&L</th>
                </tr>
              </thead>
              <tbody>
                {[...years].reverse().map((y) => (
                  <tr key={y.key}>
                    <td>{y.key}</td>
                    <td>{fmtINR(y.bought)}</td>
                    <td>{fmtINR(y.sold)}</td>
                    <td>
                      <Delta value={y.realized}>{fmtSigned(y.realized)}</Delta>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="block" title="Earnings calendar" sub="Realised P&L for every month; stronger colour means a larger amount">
        <div className="table-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th>Year</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i}>{monthName(i + 1)}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {[...cy].reverse().map((y) => (
                <tr key={y}>
                  <td>{y}</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = cell.get(`${y}-${String(i + 1).padStart(2, '0')}`)
                    if (!m || (!m.sold && !m.realized)) return <td key={i} className="cell" style={{ color: 'var(--text-3)' }}>·</td>
                    const strength = Math.round(10 + 45 * Math.sqrt(Math.abs(m.realized) / peak))
                    return (
                      <td key={i} className="cell" title={`${monthName(i + 1)} ${y}: ${fmtSigned(m.realized)}`} style={{ background: `color-mix(in srgb, var(${m.realized >= 0 ? '--gain' : '--loss'}) ${strength}%, var(--surface))` }}>
                        {fmtSignedCompact(m.realized).replace('₹', '')}
                      </td>
                    )
                  })}
                  <td className="total">{fmtSignedCompact(p.calendarYears.find((r) => r.key === y)!.realized)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
