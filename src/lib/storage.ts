import { emptyData, type AppData } from './types'

const KEY = 'portfolio-lens:v1'

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyData
    const d = JSON.parse(raw)
    if (!Array.isArray(d.trades) || !Array.isArray(d.holdings)) return emptyData
    return { ...emptyData, ...d }
  } catch {
    return emptyData
  }
}

export function saveData(d: AppData): void {
  try {
    if (!d.trades.length && !d.holdings.length) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // storage full or blocked: the app still works for this session
  }
}
