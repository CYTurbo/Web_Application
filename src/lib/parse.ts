import Papa from 'papaparse'
import type { Holding, Trade } from './types'

export type Cell = string | number | boolean | Date | null | undefined
export type Row = Cell[]

export type ParsedFile =
  | { kind: 'trades'; trades: Trade[]; skipped: number }
  | { kind: 'holdings'; holdings: Holding[]; skipped: number }

type Field = 'symbol' | 'isin' | 'sector' | 'qty' | 'avg' | 'ltp' | 'prevClose' | 'dayPct' | 'date' | 'time' | 'type' | 'price' | 'tradeId'

// Normalised header names (lowercase, alphanumerics only) seen in broker exports.
// Order within each list is priority: the first alias found in the header wins.
const ALIASES: Record<Field, string[]> = {
  symbol: ['symbol', 'tradingsymbol', 'instrument', 'scrip', 'scripname', 'scripsymbol', 'stocksymbol', 'ticker', 'stockname', 'stock', 'securityname', 'security', 'companyname', 'company', 'name'],
  isin: ['isin', 'isincode', 'isinno'],
  sector: ['sector', 'industry'],
  qty: ['quantity', 'qty', 'quantityavailable', 'totalquantity', 'netquantity', 'netqty', 'holdingquantity', 'holdingqty', 'shares', 'units', 'tradedquantity', 'tradedqty', 'filledquantity'],
  avg: ['avgcost', 'averageprice', 'avgprice', 'averagebuyprice', 'avgbuyprice', 'buyaverage', 'buyavg', 'averagecost', 'averagecostprice', 'avgcostprice', 'buyprice', 'costprice'],
  ltp: ['ltp', 'lastprice', 'lasttradedprice', 'currentprice', 'cmp', 'marketprice', 'closingprice', 'closeprice'],
  prevClose: ['previousclosingprice', 'previousclose', 'prevclose'],
  dayPct: ['daychg', 'daychange', 'daychangepct'],
  date: ['tradedate', 'date', 'executiondate', 'executiondateandtime', 'orderexecutiontime', 'tradedatetime', 'transactiondate', 'tradetime', 'time'],
  time: ['orderexecutiontime', 'executiontime', 'tradetime', 'executiondateandtime', 'tradedatetime'],
  type: ['tradetype', 'type', 'buysell', 'side', 'transactiontype', 'action', 'ordertype', 'bs'],
  price: ['price', 'tradeprice', 'tradedprice', 'rate', 'executionprice', 'averageprice', 'avgprice'],
  tradeId: ['tradeid', 'tradeno', 'tradenumber'],
}

const norm = (c: Cell) => String(c ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function toNumber(c: Cell): number | undefined {
  if (typeof c === 'number') return isFinite(c) ? c : undefined
  if (c == null || c instanceof Date || typeof c === 'boolean') return undefined
  let s = c.trim()
  if (!s) return undefined
  const negative = /^\(.*\)$/.test(s)
  s = s.replace(/[₹$,\s()%]|rs\.?|inr/gi, '')
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return undefined
  const n = Number(s)
  return isFinite(n) ? (negative ? -n : n) : undefined
}

const MONTH_IDX: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) =>
  y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : undefined

/** Parses the date formats brokers use. Day-first is assumed for ambiguous numeric dates (Indian convention). */
export function toISODate(c: Cell): string | undefined {
  if (c instanceof Date) return isNaN(+c) ? undefined : iso(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate())
  if (typeof c === 'number') {
    // Excel serial date
    if (c > 30000 && c < 80000) return toISODate(new Date(Math.round((c - 25569) * 86400000)))
    return undefined
  }
  if (typeof c !== 'string') return undefined
  const s = c.trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{2,4})/)
  if (m && MONTH_IDX[m[2].toLowerCase()]) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], MONTH_IDX[m[2].toLowerCase()], +m[1])
  return undefined
}

function toTradeType(c: Cell): 'buy' | 'sell' | undefined {
  const s = norm(c)
  if (s === 'b' || s.startsWith('buy') || s === 'purchase') return 'buy'
  if (s === 's' || s.startsWith('sell') || s === 'sale') return 'sell'
  return undefined
}

/** NSE/BSE series suffixes and exchange prefixes are noise for our purposes. */
export function cleanSymbol(c: Cell): string {
  return String(c ?? '')
    .trim()
    .toUpperCase()
    .replace(/^(NSE|BSE)[:\s]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/-(EQ|BE|BZ|BL|SM|ST|T0|T1)$/, '')
    .replace(/[*#]+$/, '')
}

interface Header {
  rowIndex: number
  cols: Partial<Record<Field, number>>
  /** every column whose header starts with "quantity" (Console splits quantity over several) */
  qtyCols: number[]
}

function findHeader(rows: Row[]): Header | undefined {
  let best: (Header & { score: number }) | undefined
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const names = rows[i].map(norm)
    const cols: Partial<Record<Field, number>> = {}
    let score = 0
    for (const field of Object.keys(ALIASES) as Field[]) {
      for (const alias of ALIASES[field]) {
        const idx = names.indexOf(alias)
        if (idx >= 0) {
          cols[field] = idx
          score++
          break
        }
      }
    }
    if (cols.symbol !== undefined && cols.qty !== undefined && score >= 3 && (!best || score > best.score)) {
      const qtyCols = names.flatMap((n, idx) => (n.startsWith('quantity') && !n.includes('longterm') ? [idx] : []))
      best = { rowIndex: i, cols, qtyCols, score }
    }
  }
  return best
}

/** Turns raw spreadsheet rows from any broker export into trades or holdings. */
export function parseRows(rows: Row[]): ParsedFile {
  const header = findHeader(rows)
  if (!header) {
    throw new Error('Could not find a header row with symbol and quantity columns. Expected a holdings or tradebook export.')
  }
  const { cols, qtyCols } = header
  const body = rows.slice(header.rowIndex + 1)
  const isTrades = cols.date !== undefined && cols.type !== undefined && cols.price !== undefined
  let skipped = 0

  if (isTrades) {
    const trades: Trade[] = []
    for (const r of body) {
      if (r.every((c) => c == null || c === '')) continue
      const symbol = cleanSymbol(r[cols.symbol!])
      const date = toISODate(r[cols.date!])
      const type = toTradeType(r[cols.type!])
      const qty = toNumber(r[cols.qty!])
      const price = toNumber(r[cols.price!])
      if (!symbol || !date || !type || !qty || price === undefined || price < 0) {
        skipped++
        continue
      }
      const t: Trade = { symbol, date, type, qty: Math.abs(qty), price }
      if (cols.isin !== undefined && r[cols.isin]) t.isin = String(r[cols.isin]).trim()
      if (cols.time !== undefined && r[cols.time] != null) {
        const raw = r[cols.time]
        t.time = raw instanceof Date ? raw.toISOString() : String(raw)
      }
      if (cols.tradeId !== undefined && r[cols.tradeId] != null && r[cols.tradeId] !== '') t.tradeId = String(r[cols.tradeId])
      trades.push(t)
    }
    if (!trades.length) throw new Error('The file looks like a tradebook but no valid trade rows were found.')
    return { kind: 'trades', trades, skipped }
  }

  const holdings: Holding[] = []
  for (const r of body) {
    if (r.every((c) => c == null || c === '')) continue
    const symbol = cleanSymbol(r[cols.symbol!])
    const qty =
      qtyCols.length > 1 ? qtyCols.reduce((s, i) => s + (toNumber(r[i]) ?? 0), 0) : toNumber(r[cols.qty!])
    const avg = cols.avg !== undefined ? toNumber(r[cols.avg]) : undefined
    if (!symbol || !qty || qty <= 0 || /^(total|grand total)$/i.test(symbol)) {
      skipped++
      continue
    }
    const h: Holding = { symbol, qty, avgPrice: avg ?? 0 }
    if (cols.isin !== undefined && r[cols.isin]) h.isin = String(r[cols.isin]).trim()
    if (cols.sector !== undefined && r[cols.sector]) h.sector = String(r[cols.sector]).trim()
    const ltp = cols.ltp !== undefined ? toNumber(r[cols.ltp]) : undefined
    const prev = cols.prevClose !== undefined ? toNumber(r[cols.prevClose]) : undefined
    if (ltp) h.ltp = ltp
    if (prev) h.prevClose = prev
    if (!h.ltp && prev) h.ltp = prev
    // Kite gives the day's move as a percentage rather than a previous close.
    const dayPct = cols.dayPct !== undefined ? toNumber(r[cols.dayPct]) : undefined
    if (h.ltp && !h.prevClose && dayPct !== undefined && dayPct > -100) h.prevClose = h.ltp / (1 + dayPct / 100)
    holdings.push(h)
  }
  if (!holdings.length) throw new Error('No holdings rows with a symbol and a positive quantity were found.')
  return { kind: 'holdings', holdings, skipped }
}

export async function readFileRows(file: File): Promise<Row[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const sheets = await readXlsxFile(file)
    // Pick the sheet with the most rows; broker workbooks keep data on one sheet.
    const sheet = [...sheets].sort((a, b) => b.data.length - a.data.length)[0]
    return (sheet?.data ?? []) as Row[]
  }
  if (name.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported. Re-save as .xlsx or .csv and import again.')
  }
  const text = await file.text()
  return Papa.parse<string[]>(text, { skipEmptyLines: true }).data
}

export async function parseFile(file: File): Promise<ParsedFile> {
  return parseRows(await readFileRows(file))
}
