import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Earnings } from './components/Earnings'
import { Overview } from './components/Overview'
import { Performers } from './components/Performers'
import { HoldingsTable, Trades } from './components/Tables'
import { buildPortfolio, dedupeTrades } from './lib/engine'
import { parseFile } from './lib/parse'
import { fetchQuotes } from './lib/prices'
import { sampleData } from './lib/sample'
import { loadData, saveData } from './lib/storage'
import { emptyData, type AppData } from './lib/types'

// The hosted-preview build runs in a sandbox that blocks outside requests, so live quotes are unavailable there.
const CAN_FETCH = !import.meta.env.VITE_NO_NETWORK

type Tab = 'overview' | 'performers' | 'earnings' | 'holdings' | 'trades'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'performers', label: 'Performers' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'holdings', label: 'Holdings' },
  { id: 'trades', label: 'Trades & stats' },
]

interface Message {
  id: number
  kind: 'warn' | 'info'
  text: string
}

export default function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [tab, setTab] = useState<Tab>('overview')
  const [messages, setMessages] = useState<Message[]>([])
  const [hiddenWarnings, setHiddenWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)

  useEffect(() => saveData(data), [data])

  const say = useCallback((kind: Message['kind'], text: string) => {
    setMessages((m) => [...m, { id: nextId.current++, kind, text }])
  }, [])

  const portfolio = useMemo(() => buildPortfolio(data.trades, data.holdings, data.quotes), [data])
  const hasData = data.trades.length > 0 || data.holdings.length > 0

  const importFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return
      setBusy('Reading files…')
      const notes: string[] = []
      const errors: string[] = []
      for (const file of files) {
        try {
          const parsed = await parseFile(file)
          setData((d) => {
            // Demo data is replaced by the first real import.
            const base = d.files.some((f) => f.name === 'Sample portfolio') ? emptyData : d
            const files = [...base.files.filter((f) => f.name !== file.name), { name: file.name, kind: parsed.kind, rows: parsed.kind === 'trades' ? parsed.trades.length : parsed.holdings.length }]
            if (parsed.kind === 'trades') return { ...base, files, trades: dedupeTrades([...base.trades, ...parsed.trades]) }
            // A new holdings file is a fresh snapshot: it replaces the previous one and its prices supersede fetched ones.
            return { ...base, files: files.filter((f) => f.kind === 'trades' || f.name === file.name), holdings: parsed.holdings, quotes: {} }
          })
          const count = parsed.kind === 'trades' ? `${parsed.trades.length} trades` : `${parsed.holdings.length} holdings`
          notes.push(`${file.name}: ${count}${parsed.skipped ? ` (${parsed.skipped} rows skipped)` : ''}`)
        } catch (e) {
          errors.push(`${file.name}: ${e instanceof Error ? e.message : 'could not be read'}`)
        }
      }
      setBusy(null)
      setHiddenWarnings([])
      if (notes.length) say('info', `Imported ${notes.join('; ')}.`)
      for (const e of errors) say('warn', e)
    },
    [say],
  )

  const refreshPrices = useCallback(async () => {
    const symbols = portfolio.positions.map((p) => p.symbol)
    if (!symbols.length) return
    setBusy(`Fetching prices 0/${symbols.length}…`)
    const { quotes, failed } = await fetchQuotes(symbols, (done, total) => setBusy(`Fetching prices ${done}/${total}…`))
    setBusy(null)
    const got = Object.keys(quotes).length
    if (got) setData((d) => ({ ...d, quotes: { ...d.quotes, ...quotes } }))
    if (!got) say('warn', 'Live prices could not be fetched (the free quote relay may be down or blocked on this network). Values use the prices from your files; you can also click any price in the Holdings tab to set it by hand.')
    else if (failed.length) say('info', `Updated ${got} prices. No quote found for: ${failed.slice(0, 10).join(', ')}${failed.length > 10 ? '…' : ''}.`)
    else say('info', `Updated ${got} prices (free delayed quotes).`)
  }, [portfolio.positions, say])

  const setPrice = useCallback((symbol: string, price: number | undefined) => {
    setData((d) => {
      const quotes = { ...d.quotes }
      if (price === undefined) delete quotes[symbol]
      else quotes[symbol] = { price, at: Date.now(), source: 'manual' }
      return { ...d, quotes }
    })
  }, [])

  // Accept files dropped anywhere on the page.
  useEffect(() => {
    let depth = 0
    const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!isFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (isFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!isFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      void importFiles([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [importFiles])

  const picker = (
    <input
      ref={fileInput}
      type="file"
      accept=".csv,.xlsx,.txt"
      multiple
      hidden
      onChange={(e) => {
        void importFiles([...(e.target.files ?? [])])
        e.target.value = ''
      }}
    />
  )
  const liveCount = portfolio.positions.filter((p) => p.priceSource === 'live').length
  const lastLive = Math.max(0, ...Object.values(data.quotes).filter((q) => q.source === 'live').map((q) => q.at))
  const warnings = portfolio.warnings.filter((w) => !hiddenWarnings.includes(w))

  return (
    <div className="app">
      {picker}
      {dragging && <div className="dragging-overlay">Drop holdings or tradebook files to import</div>}
      <header className="header">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path d="M7 22l6-7 4 4 8-10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1>
            Portfolio Lens
            <small>Your demat portfolio, in detail</small>
          </h1>
        </div>
        {hasData && (
          <div className="actions">
            {CAN_FETCH && (
              <button type="button" className="btn primary" onClick={refreshPrices} disabled={!!busy}>
                {busy ?? 'Refresh prices'}
              </button>
            )}
            <button type="button" className={CAN_FETCH ? 'btn' : 'btn primary'} onClick={() => fileInput.current?.click()} disabled={!!busy}>
              Add files
            </button>
            <button
              type="button"
              className="btn danger"
              onBlur={() => setConfirmClear(false)}
              onClick={() => {
                // Two clicks instead of a browser dialog, which embedded viewers suppress.
                if (!confirmClear) return setConfirmClear(true)
                setConfirmClear(false)
                setData(emptyData)
                setMessages([])
                setTab('overview')
              }}
            >
              {confirmClear ? 'Tap again to remove all data' : 'Clear data'}
            </button>
          </div>
        )}
      </header>

      {messages.map((m) => (
        <div key={m.id} className={`notice ${m.kind === 'info' ? 'info' : ''}`} role={m.kind === 'warn' ? 'alert' : 'status'}>
          <span>{m.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setMessages((all) => all.filter((x) => x.id !== m.id))}>
            ✕
          </button>
        </div>
      ))}

      {!hasData ? (
        <Landing busy={busy} onPick={() => fileInput.current?.click()} onSample={() => setData(sampleData())} />
      ) : (
        <>
          {warnings.map((w) => (
            <div key={w} className="notice" role="alert">
              <span>{w}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setHiddenWarnings((h) => [...h, w])}>
                ✕
              </button>
            </div>
          ))}
          {portfolio.stalePrices > 0 && (
            <div className="notice info">
              <span>
                {portfolio.stalePrices} holding{portfolio.stalePrices === 1 ? ' is' : 's are'} valued at the last traded or cost price because no current price is available. {CAN_FETCH ? 'Use “Refresh prices”, import' : 'Import'} a holdings file, or tap a price in the Holdings tab to set it by hand.
              </span>
            </div>
          )}
          <p className="files">
            {data.files.map((f) => f.name).join(' · ')}
            {liveCount > 0 && lastLive > 0 && ` · ${liveCount} live price${liveCount === 1 ? '' : 's'} as of ${new Date(lastLive).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          </p>
          <nav className="tabs" role="tablist" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <main>
            {tab === 'overview' && <Overview p={portfolio} />}
            {tab === 'performers' && <Performers p={portfolio} />}
            {tab === 'earnings' && <Earnings p={portfolio} />}
            {tab === 'holdings' && <HoldingsTable p={portfolio} onSetPrice={setPrice} />}
            {tab === 'trades' && <Trades p={portfolio} />}
          </main>
        </>
      )}
    </div>
  )
}

function Landing({ busy, onPick, onSample }: { busy: string | null; onPick: () => void; onSample: () => void }) {
  return (
    <div className="landing">
      <h2>See your whole portfolio at a glance</h2>
      <p>Import the holdings and tradebook files from your broker to get best and worst performers, monthly and yearly earnings, allocation and trade statistics. Works with Zerodha, Groww, Upstox, Angel One and most other broker exports.</p>
      <div className="drop">
        <b>Drop your CSV or XLSX files here</b>
        <p>Holdings file, tradebook files, or both. You can add several at once.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={onPick} disabled={!!busy}>
            {busy ?? 'Choose files'}
          </button>
          <button type="button" className="btn" onClick={onSample}>
            Try with sample data
          </button>
        </div>
      </div>
      <div className="steps">
        <div className="card">
          <h3>Holdings (current positions)</h3>
          <ol>
            <li>Zerodha: Console → Portfolio → Holdings → Download (XLSX), or the download icon on Kite’s Holdings page.</li>
            <li>Other brokers: download the holdings statement as CSV or XLSX.</li>
          </ol>
        </div>
        <div className="card">
          <h3>Tradebook (for earnings and stats)</h3>
          <ol>
            <li>Zerodha: Console → Reports → Tradebook → Equity, pick a financial year, Download CSV.</li>
            <li>Repeat for every year since you started, then drop all the files in together.</li>
          </ol>
        </div>
      </div>
      <p className="privacy">Your files are read in this browser and stored only on this device. Nothing is uploaded.{CAN_FETCH && ' Refreshing prices sends only ticker symbols to a public quote service.'}</p>
    </div>
  )
}
