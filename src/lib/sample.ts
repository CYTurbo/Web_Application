import type { AppData, Trade } from './types'

// Deterministic demo portfolio so the dashboard can be explored without real data.
// Prices are invented and only loosely resemble the real stocks.
const STOCKS: [symbol: string, sector: string, start: number, drift: number][] = [
  ['RELIANCE', 'Energy', 1180, 0.006],
  ['TCS', 'IT', 3300, 0.004],
  ['HDFCBANK', 'Financials', 1450, 0.005],
  ['INFY', 'IT', 1500, 0.003],
  ['ITC', 'FMCG', 260, 0.012],
  ['TATAMOTORS', 'Auto', 420, 0.014],
  ['SBIN', 'Financials', 480, 0.011],
  ['ASIANPAINT', 'Consumer', 3100, -0.004],
  ['BAJFINANCE', 'Financials', 6800, 0.002],
  ['ZOMATO', 'Consumer', 70, 0.028],
  ['PAYTM', 'Fintech', 900, -0.012],
  ['SUNPHARMA', 'Pharma', 880, 0.013],
  ['WIPRO', 'IT', 520, -0.002],
  ['LT', 'Industrials', 1800, 0.013],
]

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

export function sampleData(today = new Date()): AppData {
  const rand = rng(42)
  const trades: Trade[] = []
  const quotes: AppData['quotes'] = {}
  const sectors: Record<string, string> = {}
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const MONTHS = 46
  let id = 1

  STOCKS.forEach(([symbol, sector, start, drift], si) => {
    sectors[symbol] = sector
    let price = start
    let held = 0
    for (let m = MONTHS; m >= 0; m--) {
      price *= 1 + drift + (rand() - 0.5) * 0.16
      const day = 2 + Math.floor(rand() * 25)
      const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - m, day))
      if (d >= end || d.getUTCDay() === 0 || d.getUTCDay() === 6) continue
      const date = d.toISOString().slice(0, 10)
      const roll = rand()
      const p = Math.round(price * 20) / 20
      if (roll < 0.3 && m > si % 5) {
        const qty = Math.max(1, Math.round((15000 + rand() * 45000) / price))
        trades.push({ symbol, date, type: 'buy', qty, price: p, tradeId: String(id++) })
        held += qty
      } else if (roll > 0.87 && held > 0) {
        const qty = rand() < 0.35 ? held : Math.max(1, Math.round(held * (0.3 + rand() * 0.4)))
        trades.push({ symbol, date, type: 'sell', qty, price: p, tradeId: String(id++) })
        held -= qty
      }
    }
    const ltp = Math.round(price * (1 + (rand() - 0.5) * 0.04) * 20) / 20
    quotes[symbol] = { price: ltp, prevClose: Math.round(ltp * (1 + (rand() - 0.5) * 0.03) * 20) / 20, at: Date.now(), source: 'manual' }
  })

  return { trades, holdings: [], quotes, files: [{ name: 'Sample portfolio', kind: 'trades', rows: trades.length }] }
}
