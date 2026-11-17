import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Portfolio } from '../lib/engine'
import { fmtCompact, fmtINR, fmtMonth, fmtPct, fmtSigned } from '../lib/format'
import { BarList, Card, Delta, Stat } from './ui'

const SLICE_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)']

function slices(p: Portfolio) {
  const top = p.positions.slice(0, 7).map((x, i) => ({ name: x.symbol, value: x.value, weight: x.weight, color: SLICE_COLORS[i] }))
  const rest = p.positions.slice(7)
  if (rest.length) {
    const value = rest.reduce((s, x) => s + x.value, 0)
    top.push({ name: `Other (${rest.length})`, value, weight: p.value ? value / p.value : 0, color: 'var(--s-other)' })
  }
  return top
}

export function Overview({ p }: { p: Portfolio }) {
  const data = slices(p)
  const sectors = new Map<string, number>()
  for (const x of p.positions) if (x.sector) sectors.set(x.sector, (sectors.get(x.sector) ?? 0) + x.value)
  const sectorItems = [...sectors.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ key: name, name, value, label: fmtPct(value / p.value, 1).replace('+', ''), sub: fmtCompact(value) }))
  const byPct = [...p.positions].sort((a, b) => b.pct - a.pct)
  const gainers = byPct.filter((x) => x.pct > 0).slice(0, 3)
  const losers = byPct.filter((x) => x.pct < 0).slice(-3).reverse()
  const top5 = p.positions.slice(0, 5).reduce((s, x) => s + x.weight, 0)

  return (
    <>
      <div className="grid kpis">
        <Stat hero label="Current value" value={fmtINR(p.value)} foot={`${p.positions.length} holding${p.positions.length === 1 ? '' : 's'}`} />
        <Stat label="Invested" value={fmtINR(p.invested)} foot="Cost of current holdings" />
        <Stat label="Unrealised P&L" value={<Delta value={p.unrealized}>{fmtSigned(p.unrealized)}</Delta>} foot={`${fmtPct(p.unrealizedPct)} on invested`} />
        {p.dayChange !== undefined && <Stat label="Day change" value={<Delta value={p.dayChange}>{fmtSigned(p.dayChange)}</Delta>} foot={`${fmtPct(p.dayPct)} vs previous close`} />}
        {p.hasTrades && <Stat label="Realised P&L" value={<Delta value={p.realized}>{fmtSigned(p.realized)}</Delta>} foot={`${p.stats.closedTrades} closed trade${p.stats.closedTrades === 1 ? '' : 's'}, before charges`} />}
        {p.xirr !== undefined && <Stat label="XIRR" value={<Delta value={p.xirr}>{fmtPct(p.xirr, 1)}</Delta>} foot="Annualised, money-weighted" />}
      </div>

      <div className="grid two">
        <Card title="Allocation" sub={`Top 5 holdings are ${fmtPct(top5, 0).replace('+', '')} of the portfolio`}>
          <div className="alloc">
            <div className="donut">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={data.length > 1 ? 1.5 : 0} stroke="var(--surface)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                    {data.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div className="tip">
                          <b>{payload[0].payload.name}</b>
                          <div>
                            <span>Value</span>
                            <span>{fmtINR(payload[0].payload.value)}</span>
                          </div>
                          <div>
                            <span>Weight</span>
                            <span>{fmtPct(payload[0].payload.weight, 1).replace('+', '')}</span>
                          </div>
                        </div>
                      ) : null
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="center">
                <b>{fmtCompact(p.value)}</b>
                <span>total value</span>
              </div>
            </div>
            <ul className="legend">
              {data.map((d) => (
                <li key={d.name}>
                  <span className="sw" style={{ background: d.color }} />
                  <span className="name">{d.name}</span>
                  <span className="v">{fmtCompact(d.value)}</span>
                  <span className="w">{fmtPct(d.weight, 1).replace('+', '')}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {sectorItems.length > 1 ? (
          <Card title="Sector exposure" sub="Share of current value">
            <BarList neutral items={sectorItems} />
          </Card>
        ) : p.investedSeries.length > 1 ? (
          <Card title="Capital invested over time" sub="Cost basis of open positions at each month end">
            <InvestedChart p={p} />
          </Card>
        ) : (
          <Card title="Movers" sub="By return on cost">
            <BarList items={[...gainers, ...losers].map((x) => ({ key: x.symbol, name: x.symbol, value: x.pct, label: fmtPct(x.pct, 1), sub: fmtSigned(x.pnl) }))} />
          </Card>
        )}
      </div>

      {sectorItems.length > 1 && p.investedSeries.length > 1 && (
        <Card className="block" title="Capital invested over time" sub="Cost basis of open positions at each month end">
          <InvestedChart p={p} />
        </Card>
      )}

      <div className="grid two">
        <Card title="Top gainers" sub="Return on cost, current holdings">
          {gainers.length ? (
            <BarList scale={{ min: 0, max: Math.max(...byPct.map((x) => Math.abs(x.pct))) }} items={gainers.map((x) => ({ key: x.symbol, name: x.symbol, value: x.pct, label: fmtPct(x.pct, 1), sub: fmtSigned(x.pnl) }))} />
          ) : (
            <p className="sub">No holdings are in profit right now.</p>
          )}
        </Card>
        <Card title="Top losers" sub="Return on cost, current holdings">
          {losers.length ? (
            <BarList scale={{ min: -Math.max(...byPct.map((x) => Math.abs(x.pct))), max: 0 }} items={losers.map((x) => ({ key: x.symbol, name: x.symbol, value: x.pct, label: fmtPct(x.pct, 1), sub: fmtSigned(x.pnl) }))} />
          ) : (
            <p className="sub">No holdings are at a loss right now.</p>
          )}
        </Card>
      </div>
    </>
  )
}

function InvestedChart({ p }: { p: Portfolio }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer>
        <AreaChart data={p.investedSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={40} />
          <YAxis tickFormatter={fmtCompact} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickLine={false} axisLine={false} width={62} />
          <Tooltip
            cursor={{ stroke: 'var(--text-3)', strokeDasharray: '3 3' }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="tip">
                  <b>{fmtMonth(payload[0].payload.month)}</b>
                  <div>
                    <span>Invested</span>
                    <span>{fmtINR(payload[0].payload.invested)}</span>
                  </div>
                </div>
              ) : null
            }
          />
          <Area type="stepAfter" dataKey="invested" stroke="var(--s1)" strokeWidth={2} fill="var(--s1)" fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
