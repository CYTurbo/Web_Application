# Portfolio Lens

A private, browser-only dashboard for your demat portfolio. Import the holdings and
tradebook files from your broker and get:

- **Overview** – current value, invested amount, unrealised and realised P&L, day change, XIRR, allocation and sector exposure
- **Performers** – best and worst stocks by return %, by rupee P&L, or all-time (including stocks you have sold)
- **Earnings** – realised P&L by month and by year (financial or calendar), plus a month-by-year calendar
- **Holdings** – sortable, searchable table with weight, return and holding period
- **Trades & stats** – win rate, profit factor, average win/loss, holding period, short-term vs long-term gains, every closed trade

There is no server and no account. Files are parsed in your browser and kept in its local
storage on your device. No paid service is used.

## Getting your data

Built and tested against Zerodha exports; column names from Groww, Upstox, Angel One and
most other brokers are recognised too.

| File | Where (Zerodha) | What it unlocks |
| --- | --- | --- |
| Holdings (XLSX/CSV) | Console → Portfolio → Holdings → Download, or the download icon on Kite's Holdings page | Current positions, prices, allocation, performers |
| Tradebook (CSV) | Console → Reports → Tradebook → Equity → pick a financial year → Download | Earnings, realised P&L, XIRR, trade statistics |

Download one tradebook per financial year back to when you started and drop them all in
together. Overlapping files are safe: trades are de-duplicated by trade id.

## Running it

```bash
npm install
npm run dev      # local development
npm test         # unit tests for the parser and P&L engine
npm run build    # static site in dist/
```

`dist/` is a plain static site and can be hosted anywhere. A GitHub Pages workflow is
included (`.github/workflows/deploy.yml`): set **Settings → Pages → Source** to
**GitHub Actions** and it deploys on every push to `main`.

## How the numbers are worked out

- Sells are matched to buys **first-in, first-out**, which is how Indian capital gains are computed.
- Realised P&L is **before brokerage, taxes and other charges**; dividends are not included.
- When a holdings file is present it is the source of truth for current positions; otherwise positions are derived from the tradebook.
- Prices come from, in order: live refresh or a price you typed, the holdings file, the last traded price in your tradebook.
- "Refresh prices" uses free delayed Yahoo Finance quotes through public CORS relays. Only ticker symbols are sent. These relays are best-effort; if they are down, click a price in the Holdings tab to set it by hand.

## Known limits

- Splits, bonuses, mergers and off-market transfers are not in a tradebook, so tradebook-derived quantities can be off for those stocks. Importing a holdings file corrects current positions, and the app flags the affected symbols.
- Built for delivery equity. Short sales and F&O are not modelled; unmatched sells are ignored with a warning.
- Mutual funds held outside the demat account are not covered.
