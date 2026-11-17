import type { Quote } from './types'

// Yahoo Finance serves free delayed NSE/BSE quotes but sends no CORS headers,
// so a browser-only app has to go through a public CORS relay. Only the ticker
// symbol leaves the browser; quantities and values never do.
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/'
const RELAYS: ((url: string) => string)[] = [
  (u) => u,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
]

// Remember which relay worked so later symbols skip the dead ones.
let preferred = 0

async function fetchJSON(url: string, ms = 8000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

interface YahooChart {
  chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }[] }
}

function readQuote(json: unknown): Quote | undefined {
  const meta = (json as YahooChart)?.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number' || !(meta.regularMarketPrice > 0)) return undefined
  return {
    price: meta.regularMarketPrice,
    prevClose: meta.previousClose ?? meta.chartPreviousClose,
    at: Date.now(),
    source: 'live',
  }
}

async function fetchOne(symbol: string): Promise<Quote | undefined> {
  // Company names (Groww-style exports) are not tickers; nothing to look up.
  if (/\s/.test(symbol)) return undefined
  const order = [preferred, ...RELAYS.map((_, i) => i).filter((i) => i !== preferred)]
  for (const suffix of ['.NS', '.BO']) {
    const url = `${YAHOO}${encodeURIComponent(symbol + suffix)}?range=1d&interval=1d`
    for (const i of order) {
      try {
        const json = await fetchJSON(RELAYS[i](url))
        preferred = i
        const quote = readQuote(json)
        if (quote) return quote
        break // relay works but Yahoo has no such ticker on this exchange
      } catch {
        // try the next relay
      }
    }
  }
  return undefined
}

export interface PriceResult {
  quotes: Record<string, Quote>
  failed: string[]
}

export async function fetchQuotes(symbols: string[], onProgress?: (done: number, total: number) => void): Promise<PriceResult> {
  const quotes: Record<string, Quote> = {}
  const failed: string[] = []
  let done = 0
  const queue = [...symbols]
  const one = async (s: string) => {
    const q = await fetchOne(s)
    if (q) quotes[s] = q
    else failed.push(s)
    onProgress?.(++done, symbols.length)
  }
  const worker = async () => {
    for (let s = queue.shift(); s !== undefined; s = queue.shift()) await one(s)
  }
  // Settle the first symbol alone so the working relay is known before fanning out.
  const first = queue.shift()
  if (first !== undefined) await one(first)
  await Promise.all(Array.from({ length: 4 }, worker))
  return { quotes, failed }
}
