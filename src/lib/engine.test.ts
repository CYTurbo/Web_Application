import { describe, expect, it } from 'vitest'
import { buildPortfolio, financialYear, xirr } from './engine'
import { parseRows, toISODate, toNumber } from './parse'
import { sampleData } from './sample'
import type { Trade } from './types'

const t = (symbol: string, date: string, type: 'buy' | 'sell', qty: number, price: number, tradeId?: string): Trade => ({ symbol, date, type, qty, price, tradeId })

describe('engine', () => {
  it('matches sells FIFO and reports realised and unrealised P&L', () => {
    const p = buildPortfolio(
      [t('A', '2024-01-10', 'buy', 10, 100), t('A', '2024-02-10', 'buy', 10, 120), t('A', '2025-03-05', 'sell', 15, 150)],
      [],
      { A: { price: 200, at: 0, source: 'manual' } },
      '2025-06-01',
    )
    // 10 @ 100 -> +500, 5 @ 120 -> +150
    expect(p.realized).toBe(650)
    expect(p.positions).toHaveLength(1)
    expect(p.positions[0]).toMatchObject({ qty: 5, avgPrice: 120, value: 1000, pnl: 400 })
    expect(p.totalPnl).toBe(1050)
    expect(p.monthly.find((m) => m.key === '2025-03')?.realized).toBe(650)
    expect(p.financialYears.find((y) => y.key === 'FY 2024-25')?.realized).toBe(650)
    expect(p.calendarYears.find((y) => y.key === '2025')?.realized).toBe(650)
    // both lots held > 365 days
    expect(p.stats.longTerm).toBe(650)
    expect(p.stats.shortTerm).toBe(0)
    expect(p.closedTrades).toHaveLength(1)
    expect(p.investedSeries.at(-1)).toEqual({ month: '2025-06', invested: 600 })
    expect(p.xirr).toBeGreaterThan(0)
  })

  it('dedupes overlapping tradebooks by trade id and warns on unmatched sells', () => {
    const buy = t('A', '2024-01-10', 'buy', 10, 100, 'x1')
    const p = buildPortfolio([buy, { ...buy }, t('B', '2024-01-11', 'sell', 5, 50, 'x2')], [])
    expect(p.positions[0].qty).toBe(10)
    expect(p.realized).toBe(0)
    expect(p.warnings[0]).toContain('B (5)')
    expect(p.xirr).toBeUndefined()
  })

  it('prefers the holdings file for positions and flags quantity mismatches', () => {
    const p = buildPortfolio([t('A', '2024-01-10', 'buy', 10, 100)], [{ symbol: 'A', qty: 20, avgPrice: 50, ltp: 80, prevClose: 78 }])
    expect(p.positions[0]).toMatchObject({ qty: 20, invested: 1000, value: 1600, priceSource: 'file' })
    expect(p.dayChange).toBe(40)
    expect(p.warnings.join()).toContain('disagree')
  })

  it('computes win rate and profit factor', () => {
    const p = buildPortfolio(
      [t('A', '2024-01-01', 'buy', 10, 100), t('A', '2024-02-01', 'sell', 10, 130), t('B', '2024-01-01', 'buy', 10, 100), t('B', '2024-03-01', 'sell', 10, 90)],
      [],
    )
    expect(p.stats.winRate).toBe(0.5)
    expect(p.stats.profitFactor).toBe(3)
    expect(p.stats.best?.symbol).toBe('A')
    expect(p.stats.worst?.symbol).toBe('B')
    expect(p.positions).toHaveLength(0)
  })

  it('xirr of a doubling over one year is 100%', () => {
    expect(xirr([{ date: '2024-01-01', amount: -100 }, { date: '2024-12-31', amount: 200 }])).toBeCloseTo(1, 2)
  })

  it('financial year runs April to March', () => {
    expect(financialYear('2025-03-31')).toBe('FY 2024-25')
    expect(financialYear('2025-04-01')).toBe('FY 2025-26')
  })

  it('sample data builds a consistent portfolio', () => {
    const d = sampleData(new Date('2026-11-17'))
    const p = buildPortfolio(d.trades, d.holdings, d.quotes, '2026-11-17')
    expect(p.warnings).toEqual([])
    expect(p.positions.length).toBeGreaterThan(5)
    expect(p.closedTrades.length).toBeGreaterThan(5)
    expect(p.positions.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1)
  })
})

describe('parse', () => {
  it('reads a Zerodha tradebook CSV', () => {
    const r = parseRows([
      ['symbol', 'isin', 'trade_date', 'exchange', 'segment', 'series', 'trade_type', 'auction', 'quantity', 'price', 'trade_id', 'order_id', 'order_execution_time'],
      ['INFY', 'INE009A01021', '2024-05-02', 'NSE', 'EQ', 'EQ', 'buy', 'false', '10.000000', '1420.500000', '123', '456', '2024-05-02T09:20:11'],
      ['M&M-BE', 'INE101A01026', '2024-05-03', 'NSE', 'EQ', 'BE', 'sell', 'false', '2', '2100', '124', '457', '2024-05-03T10:00:00'],
    ])
    expect(r.kind).toBe('trades')
    if (r.kind !== 'trades') return
    expect(r.trades[0]).toMatchObject({ symbol: 'INFY', date: '2024-05-02', type: 'buy', qty: 10, price: 1420.5, tradeId: '123' })
    expect(r.trades[1].symbol).toBe('M&M')
  })

  it('reads a Kite holdings CSV', () => {
    const r = parseRows([
      ['Instrument', 'Qty.', 'Avg. cost', 'LTP', 'Invested', 'Cur. val', 'P&L', 'Net chg.', 'Day chg.'],
      ['TCS', '5', '3,200.50', '3,900.00', '16,002.50', '19,500.00', '3,497.50', '21.85', '0.4'],
    ])
    expect(r).toMatchObject({ kind: 'holdings', holdings: [{ symbol: 'TCS', qty: 5, avgPrice: 3200.5, ltp: 3900 }] })
    if (r.kind === 'holdings') expect(r.holdings[0].prevClose).toBeCloseTo(3900 / 1.004)
  })

  it('reads a Console holdings sheet with a preamble and split quantity columns', () => {
    const r = parseRows([
      ['Client ID', 'AB1234'],
      [],
      ['Equity Holdings Statement as on 2026-11-16'],
      [null, 'Symbol', 'ISIN', 'Sector', 'Quantity Available', 'Quantity Discrepant', 'Quantity Long Term', 'Quantity Pledged (Margin)', 'Quantity Pledged (Loan)', 'Average Price', 'Previous Closing Price', 'Unrealized P&L', 'Unrealized P&L Pct.'],
      [null, 'SBIN', 'INE062A01020', 'Banks', 10, 0, 10, 5, 0, 500, 800, 4500, 60],
    ])
    expect(r).toMatchObject({ kind: 'holdings', holdings: [{ symbol: 'SBIN', sector: 'Banks', qty: 15, avgPrice: 500, ltp: 800 }] })
  })

  it('reads a generic broker tradebook with day-first dates', () => {
    const r = parseRows([
      ['Stock name', 'Symbol', 'ISIN', 'Type', 'Quantity', 'Value', 'Exchange', 'Execution date and time', 'Price'],
      ['Wipro Ltd', 'WIPRO', 'INE075A01022', 'BUY', 4, 2000, 'NSE', '05-08-2024 10:15 AM', 500],
    ])
    expect(r).toMatchObject({ kind: 'trades', trades: [{ symbol: 'WIPRO', date: '2024-08-05', type: 'buy', qty: 4, price: 500 }] })
  })

  it('rejects files without recognisable columns', () => {
    expect(() => parseRows([['foo', 'bar'], ['1', '2']])).toThrow()
  })

  it('parses numbers and dates in broker formats', () => {
    expect(toNumber('₹1,23,456.50')).toBe(123456.5)
    expect(toNumber('(250)')).toBe(-250)
    expect(toNumber('abc')).toBeUndefined()
    expect(toISODate('14-Mar-2025')).toBe('2025-03-14')
    expect(toISODate('14/03/25')).toBe('2025-03-14')
    expect(toISODate(new Date(Date.UTC(2025, 2, 14)))).toBe('2025-03-14')
  })
})
