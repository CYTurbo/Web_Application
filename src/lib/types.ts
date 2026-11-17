export type TradeType = 'buy' | 'sell'

export interface Trade {
  symbol: string
  isin?: string
  /** ISO date, yyyy-mm-dd */
  date: string
  /** Sortable execution time within the day, when the file provides one */
  time?: string
  type: TradeType
  qty: number
  price: number
  tradeId?: string
}

export interface Holding {
  symbol: string
  isin?: string
  sector?: string
  qty: number
  avgPrice: number
  ltp?: number
  prevClose?: number
}

export interface Quote {
  price: number
  prevClose?: number
  /** epoch ms */
  at: number
  source: 'live' | 'manual'
}

export interface ImportedFile {
  name: string
  kind: 'trades' | 'holdings'
  rows: number
}

export interface AppData {
  trades: Trade[]
  holdings: Holding[]
  quotes: Record<string, Quote>
  files: ImportedFile[]
}

export const emptyData: AppData = { trades: [], holdings: [], quotes: {}, files: [] }
