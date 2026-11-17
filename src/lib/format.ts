const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

export const fmtINR = (v: number) => inr0.format(v).replace('-', '−')
export const fmtPrice = (v: number) => inr2.format(v).replace('-', '−')
export const fmtNum = (v: number) => num.format(v)

/** Compact Indian units: ₹1.25L, ₹3.4Cr */
export function fmtCompact(v: number): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)}Cr`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)}L`
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}K`
  return `${sign}₹${a.toFixed(0)}`
}

export const fmtSigned = (v: number) => (v > 0 ? '+' : '') + fmtINR(v)
export const fmtSignedCompact = (v: number) => (v > 0 ? '+' : '') + fmtCompact(v)

export function fmtPct(v: number | undefined, digits = 2): string {
  if (v === undefined || !isFinite(v)) return '—'
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(digits)}%`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthName = (m: number) => MONTHS[m - 1]
/** '2025-03' -> "Mar '25" */
export const fmtMonth = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} '${ym.slice(2, 4)}`
/** '2025-03-14' -> '14 Mar 2025' */
export const fmtDate = (d: string) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`

export function fmtDays(days: number): string {
  if (days < 60) return `${Math.round(days)}d`
  if (days < 730) return `${(days / 30.44).toFixed(1)}mo`
  return `${(days / 365.25).toFixed(1)}y`
}
