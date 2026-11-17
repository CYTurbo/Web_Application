import type { Holding, Quote, Trade } from './types'

export interface ClosedLot {
  symbol: string
  buyDate: string
  sellDate: string
  qty: number
  buyPrice: number
  sellPrice: number
  pnl: number
  days: number
}

/** All lots closed by sells of one symbol on one day. */
export interface ClosedTrade {
  symbol: string
  sellDate: string
  qty: number
  cost: number
  proceeds: number
  pnl: number
  pct: number
  /** quantity-weighted holding period */
  days: number
}

export interface Position {
  symbol: string
  sector?: string
  qty: number
  avgPrice: number
  invested: number
  price: number
  priceSource: 'live' | 'manual' | 'file' | 'last-trade' | 'cost'
  value: number
  pnl: number
  pct: number
  weight: number
  dayChange?: number
  dayPct?: number
  firstBuy?: string
  heldDays?: number
  realized: number
}

export interface SymbolTotal {
  symbol: string
  realized: number
  unrealized: number
  total: number
  open: boolean
}

export interface PeriodRow {
  key: string
  realized: number
  bought: number
  sold: number
  trades: number
}

export interface Stats {
  closedTrades: number
  wins: number
  losses: number
  winRate?: number
  avgWin?: number
  avgLoss?: number
  profitFactor?: number
  best?: ClosedTrade
  worst?: ClosedTrade
  avgHoldDays?: number
  shortTerm: number
  longTerm: number
  buyTurnover: number
  sellTurnover: number
  tradeCount: number
  firstTrade?: string
  lastTrade?: string
}

export interface Portfolio {
  positions: Position[]
  closedLots: ClosedLot[]
  closedTrades: ClosedTrade[]
  symbolTotals: SymbolTotal[]
  invested: number
  value: number
  unrealized: number
  unrealizedPct?: number
  dayChange?: number
  dayPct?: number
  realized: number
  totalPnl: number
  xirr?: number
  monthly: PeriodRow[]
  calendarYears: PeriodRow[]
  financialYears: PeriodRow[]
  /** cost basis of open positions at each month end */
  investedSeries: { month: string; invested: number }[]
  stats: Stats
  warnings: string[]
  hasTrades: boolean
  hasHoldings: boolean
  stalePrices: number
}

const DAY = 86400000
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

/** Indian financial year label for an ISO date: 2025-02-10 -> 'FY 2024-25' */
export function financialYear(date: string): string {
  const y = +date.slice(0, 4)
  const start = +date.slice(5, 7) >= 4 ? y : y - 1
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export function dedupeTrades(trades: Trade[]): Trade[] {
  const seen = new Set<string>()
  const out: Trade[] = []
  for (const t of trades) {
    // Without a trade id, identical rows are legitimate separate fills, so keep them.
    if (t.tradeId) {
      const key = `${t.symbol}|${t.date}|${t.type}|${t.tradeId}`
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push(t)
  }
  return out
}

function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time && b.time ? a.time.localeCompare(b.time) : 0) ||
      (a.type === b.type ? 0 : a.type === 'buy' ? -1 : 1),
  )
}

/** Annualised money-weighted return. Flows: negative = money in, positive = money out. */
export function xirr(flows: { date: string; amount: number }[]): number | undefined {
  if (flows.length < 2 || !flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return undefined
  const t0 = Date.parse(flows[0].date)
  const pts = flows.map((f) => ({ t: (Date.parse(f.date) - t0) / (365 * DAY), a: f.amount }))
  if (Math.max(...pts.map((p) => p.t)) < 1 / 365) return undefined
  const npv = (r: number) => pts.reduce((s, p) => s + p.a / Math.pow(1 + r, p.t), 0)
  let lo = -0.9999
  let hi = 100
  let fLo = npv(lo)
  const fHi = npv(hi)
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return undefined
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const f = npv(mid)
    if (Math.abs(f) < 1e-7) return mid
    if (f * fLo < 0) hi = mid
    else {
      lo = mid
      fLo = f
    }
  }
  return (lo + hi) / 2
}

function addPeriod(map: Map<string, PeriodRow>, key: string): PeriodRow {
  let row = map.get(key)
  if (!row) {
    row = { key, realized: 0, bought: 0, sold: 0, trades: 0 }
    map.set(key, row)
  }
  return row
}

function monthRange(first: string, last: string): string[] {
  const out: string[] = []
  let y = +first.slice(0, 4)
  let m = +first.slice(5, 7)
  while (`${y}-${String(m).padStart(2, '0')}` <= last) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export function buildPortfolio(
  rawTrades: Trade[],
  rawHoldings: Holding[],
  quotes: Record<string, Quote> = {},
  today: string = new Date().toISOString().slice(0, 10),
): Portfolio {
  const trades = sortTrades(dedupeTrades(rawTrades))
  const warnings: string[] = []

  // ---- FIFO matching -------------------------------------------------------
  const lots = new Map<string, { qty: number; price: number; date: string }[]>()
  const closedLots: ClosedLot[] = []
  const unmatched = new Map<string, number>()
  const lastTradePrice = new Map<string, number>()
  const monthlyMap = new Map<string, PeriodRow>()
  const basisByMonth = new Map<string, number>()
  let basis = 0
  let buyTurnover = 0
  let sellTurnover = 0

  for (const t of trades) {
    const month = t.date.slice(0, 7)
    const period = addPeriod(monthlyMap, month)
    period.trades++
    lastTradePrice.set(t.symbol, t.price)
    const open = lots.get(t.symbol) ?? []
    lots.set(t.symbol, open)
    if (t.type === 'buy') {
      open.push({ qty: t.qty, price: t.price, date: t.date })
      basis += t.qty * t.price
      buyTurnover += t.qty * t.price
      period.bought += t.qty * t.price
    } else {
      let remaining = t.qty
      while (remaining > 1e-9 && open.length) {
        const lot = open[0]
        const q = Math.min(lot.qty, remaining)
        const pnl = q * (t.price - lot.price)
        closedLots.push({
          symbol: t.symbol,
          buyDate: lot.date,
          sellDate: t.date,
          qty: q,
          buyPrice: lot.price,
          sellPrice: t.price,
          pnl,
          days: daysBetween(lot.date, t.date),
        })
        period.realized += pnl
        basis -= q * lot.price
        lot.qty -= q
        remaining -= q
        if (lot.qty <= 1e-9) open.shift()
      }
      const matched = t.qty - remaining
      sellTurnover += matched * t.price
      period.sold += matched * t.price
      if (remaining > 1e-9) unmatched.set(t.symbol, (unmatched.get(t.symbol) ?? 0) + remaining)
    }
    basisByMonth.set(month, basis)
  }

  if (unmatched.size) {
    const list = [...unmatched.entries()].map(([s, q]) => `${s} (${+q.toFixed(4)})`)
    warnings.push(
      `Sells without a matching earlier buy were ignored for: ${list.slice(0, 8).join(', ')}${list.length > 8 ? ` and ${list.length - 8} more` : ''}. ` +
        'This usually means the tradebook does not go back far enough, or there was a split, bonus, transfer or short sale. Import older tradebooks to fix realised P&L.',
    )
  }

  // ---- Closed trades (grouped per symbol per sell day) ---------------------
  const tradeMap = new Map<string, ClosedTrade & { dayQty: number }>()
  for (const l of closedLots) {
    const key = `${l.symbol}|${l.sellDate}`
    let ct = tradeMap.get(key)
    if (!ct) {
      ct = { symbol: l.symbol, sellDate: l.sellDate, qty: 0, cost: 0, proceeds: 0, pnl: 0, pct: 0, days: 0, dayQty: 0 }
      tradeMap.set(key, ct)
    }
    ct.qty += l.qty
    ct.cost += l.qty * l.buyPrice
    ct.proceeds += l.qty * l.sellPrice
    ct.pnl += l.pnl
    ct.dayQty += l.days * l.qty
  }
  const closedTrades: ClosedTrade[] = [...tradeMap.values()]
    .map(({ dayQty, ...ct }) => ({ ...ct, pct: ct.cost ? ct.pnl / ct.cost : 0, days: ct.qty ? dayQty / ct.qty : 0 }))
    .sort((a, b) => b.sellDate.localeCompare(a.sellDate))

  // ---- Open positions ------------------------------------------------------
  const derived = new Map<string, { qty: number; cost: number; firstBuy: string }>()
  for (const [symbol, open] of lots) {
    const qty = open.reduce((s, l) => s + l.qty, 0)
    if (qty > 1e-9) derived.set(symbol, { qty, cost: open.reduce((s, l) => s + l.qty * l.price, 0), firstBuy: open[0].date })
  }

  const merged = new Map<string, Holding>()
  for (const h of rawHoldings) {
    const prev = merged.get(h.symbol)
    if (!prev) merged.set(h.symbol, { ...h })
    else {
      const qty = prev.qty + h.qty
      prev.avgPrice = qty ? (prev.qty * prev.avgPrice + h.qty * h.avgPrice) / qty : 0
      prev.qty = qty
      prev.ltp ??= h.ltp
      prev.prevClose ??= h.prevClose
      prev.sector ??= h.sector
    }
  }
  const hasHoldings = merged.size > 0
  const hasTrades = trades.length > 0

  const base: Holding[] = hasHoldings
    ? [...merged.values()]
    : [...derived.entries()].map(([symbol, d]) => ({ symbol, qty: d.qty, avgPrice: d.cost / d.qty }))

  if (hasHoldings && hasTrades) {
    const diffs: string[] = []
    for (const h of base) {
      const d = derived.get(h.symbol)
      if (Math.abs((d?.qty ?? 0) - h.qty) > 1e-6) diffs.push(h.symbol)
    }
    for (const s of derived.keys()) if (!merged.has(s)) diffs.push(s)
    if (diffs.length) {
      warnings.push(
        `Holdings file and tradebook disagree on quantity for ${diffs.slice(0, 8).join(', ')}${diffs.length > 8 ? ` and ${diffs.length - 8} more` : ''}. ` +
          'Current positions follow the holdings file. Differences come from splits, bonuses, transfers or tradebooks that do not cover the full history.',
      )
    }
  }

  const realizedBySymbol = new Map<string, number>()
  for (const l of closedLots) realizedBySymbol.set(l.symbol, (realizedBySymbol.get(l.symbol) ?? 0) + l.pnl)

  let stalePrices = 0
  const positions: Position[] = base.map((h) => {
    const q = quotes[h.symbol]
    let price: number
    let priceSource: Position['priceSource']
    if (q) [price, priceSource] = [q.price, q.source]
    else if (h.ltp) [price, priceSource] = [h.ltp, 'file']
    else if (lastTradePrice.has(h.symbol)) [price, priceSource] = [lastTradePrice.get(h.symbol)!, 'last-trade']
    else [price, priceSource] = [h.avgPrice, 'cost']
    if (priceSource === 'last-trade' || priceSource === 'cost') stalePrices++
    const prevClose = q?.prevClose ?? (q ? undefined : h.prevClose && h.ltp && h.prevClose !== h.ltp ? h.prevClose : undefined)
    const invested = h.qty * h.avgPrice
    const value = h.qty * price
    const d = derived.get(h.symbol)
    return {
      symbol: h.symbol,
      sector: h.sector,
      qty: h.qty,
      avgPrice: h.avgPrice,
      invested,
      price,
      priceSource,
      value,
      pnl: value - invested,
      pct: invested ? (value - invested) / invested : 0,
      weight: 0,
      dayChange: prevClose ? h.qty * (price - prevClose) : undefined,
      dayPct: prevClose ? (price - prevClose) / prevClose : undefined,
      firstBuy: d?.firstBuy,
      heldDays: d ? daysBetween(d.firstBuy, today) : undefined,
      realized: realizedBySymbol.get(h.symbol) ?? 0,
    }
  })

  const invested = positions.reduce((s, p) => s + p.invested, 0)
  const value = positions.reduce((s, p) => s + p.value, 0)
  for (const p of positions) p.weight = value ? p.value / value : 0
  positions.sort((a, b) => b.value - a.value)

  const withDay = positions.filter((p) => p.dayChange !== undefined)
  const dayChange = withDay.length ? withDay.reduce((s, p) => s + p.dayChange!, 0) : undefined
  const prevValue = withDay.reduce((s, p) => s + p.value - p.dayChange!, 0)

  const unrealized = value - invested
  const realized = closedLots.reduce((s, l) => s + l.pnl, 0)

  // ---- Per-symbol totals (realised + unrealised) ---------------------------
  const totals = new Map<string, SymbolTotal>()
  for (const [symbol, r] of realizedBySymbol) totals.set(symbol, { symbol, realized: r, unrealized: 0, total: r, open: false })
  for (const p of positions) {
    const t = totals.get(p.symbol) ?? { symbol: p.symbol, realized: 0, unrealized: 0, total: 0, open: true }
    t.unrealized = p.pnl
    t.total = t.realized + p.pnl
    t.open = true
    totals.set(p.symbol, t)
  }
  const symbolTotals = [...totals.values()].sort((a, b) => b.total - a.total)

  // ---- Periods -------------------------------------------------------------
  let monthly: PeriodRow[] = []
  const investedSeries: { month: string; invested: number }[] = []
  if (hasTrades) {
    const months = monthRange(trades[0].date.slice(0, 7), today.slice(0, 7) > trades[trades.length - 1].date.slice(0, 7) ? today.slice(0, 7) : trades[trades.length - 1].date.slice(0, 7))
    let running = 0
    monthly = months.map((m) => {
      if (basisByMonth.has(m)) running = basisByMonth.get(m)!
      investedSeries.push({ month: m, invested: Math.max(0, running) })
      return monthlyMap.get(m) ?? { key: m, realized: 0, bought: 0, sold: 0, trades: 0 }
    })
  }
  const rollUp = (keyOf: (m: string) => string) => {
    const map = new Map<string, PeriodRow>()
    for (const m of monthly) {
      const row = addPeriod(map, keyOf(m.key))
      row.realized += m.realized
      row.bought += m.bought
      row.sold += m.sold
      row.trades += m.trades
    }
    return [...map.values()]
  }
  const calendarYears = rollUp((m) => m.slice(0, 4))
  const financialYears = rollUp((m) => financialYear(`${m}-01`))

  // ---- XIRR ----------------------------------------------------------------
  let xirrValue: number | undefined
  if (hasTrades && !unmatched.size) {
    const flows = trades.map((t) => ({ date: t.date, amount: (t.type === 'buy' ? -1 : 1) * t.qty * t.price }))
    let terminal = 0
    for (const [symbol, d] of derived) {
      const p = positions.find((x) => x.symbol === symbol)
      terminal += d.qty * (p ? p.price : (lastTradePrice.get(symbol) ?? d.cost / d.qty))
    }
    if (terminal > 0) flows.push({ date: today, amount: terminal })
    xirrValue = xirr(flows)
  }

  // ---- Stats ---------------------------------------------------------------
  const winners = closedTrades.filter((t) => t.pnl > 0)
  const losers = closedTrades.filter((t) => t.pnl < 0)
  const grossWin = winners.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = -losers.reduce((s, t) => s + t.pnl, 0)
  const closedQty = closedLots.reduce((s, l) => s + l.qty, 0)
  const byPnl = [...closedTrades].sort((a, b) => b.pnl - a.pnl)
  const stats: Stats = {
    closedTrades: closedTrades.length,
    wins: winners.length,
    losses: losers.length,
    winRate: closedTrades.length ? winners.length / closedTrades.length : undefined,
    avgWin: winners.length ? grossWin / winners.length : undefined,
    avgLoss: losers.length ? -grossLoss / losers.length : undefined,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : undefined,
    best: byPnl[0]?.pnl > 0 ? byPnl[0] : undefined,
    worst: byPnl.length && byPnl[byPnl.length - 1].pnl < 0 ? byPnl[byPnl.length - 1] : undefined,
    avgHoldDays: closedQty ? closedLots.reduce((s, l) => s + l.days * l.qty, 0) / closedQty : undefined,
    shortTerm: closedLots.filter((l) => l.days <= 365).reduce((s, l) => s + l.pnl, 0),
    longTerm: closedLots.filter((l) => l.days > 365).reduce((s, l) => s + l.pnl, 0),
    buyTurnover,
    sellTurnover,
    tradeCount: trades.length,
    firstTrade: trades[0]?.date,
    lastTrade: trades[trades.length - 1]?.date,
  }

  return {
    positions,
    closedLots,
    closedTrades,
    symbolTotals,
    invested,
    value,
    unrealized,
    unrealizedPct: invested ? unrealized / invested : undefined,
    dayChange,
    dayPct: dayChange !== undefined && prevValue ? dayChange / prevValue : undefined,
    realized,
    totalPnl: realized + unrealized,
    xirr: xirrValue,
    monthly,
    calendarYears,
    financialYears,
    investedSeries,
    stats,
    warnings,
    hasTrades,
    hasHoldings,
    stalePrices,
  }
}
