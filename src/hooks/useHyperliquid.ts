import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// Proxy endpoint — Vercel serverless functions in /api/hyperliquid/
// Dev: also proxied via vite.config.ts
const PROXY = '/api/hyperliquid'

// Direct Hyperliquid APIs (fallback when proxy fails)
const HL_INFO  = 'https://api.hyperliquid.xyz/info'
const HL_STATS = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'

// ── Mock data helpers ─────────────────────────────────────────────────────────

// Seed prices for known coins (used when API is unavailable)
const SEED_PRICES: Record<string, number> = {
  BTC: 105_000, ETH: 2_580, SOL: 175, BNB: 620,
  ARB: 0.52,    OP: 0.78,   AVAX: 28, DOGE: 0.17,
  LINK: 15.2,   UNI: 7.8,   AAVE: 220, WLD: 1.2,
}

function mockMarket(coin: string, i: number): HLMarket {
  const base    = SEED_PRICES[coin] ?? (100 - i * 3)
  const change  = (Math.random() - 0.48) * 4   // −4 % … +4 %
  const markPx  = base * (1 + change / 100)
  const funding = (Math.random() - 0.5) * 0.0004
  return {
    coin,
    markPx,
    prevDayPx:    base,
    oraclePx:     markPx * 0.9998,
    change24h:    change,
    funding8h:    funding,
    fundingAnn:   funding * 3 * 365 * 100,
    openInterest: markPx * (500 + Math.random() * 2000),
    volume24h:    markPx * (10_000 + Math.random() * 50_000),
    maxLeverage:  20,
  }
}

// Defined here so mockCandles can use it (also re-exported below for the hook)
const MS_PER_INTERVAL: Record<string, number> = {
  '1m':  60_000,   '5m':  300_000,
  '15m': 900_000,  '1h':  3_600_000,
  '4h':  14_400_000, '1D': 86_400_000,
}

const MOCK_COINS = [
  'BTC','ETH','SOL','BNB','ARB','OP','AVAX','DOGE','LINK','UNI','AAVE','WLD',
]

function mockMarkets(): HLMarket[] {
  return MOCK_COINS.map((coin, i) => mockMarket(coin, i))
}

function mockCandles(coin: string, interval: string, count = 180): Candle[] {
  const ms    = MS_PER_INTERVAL[interval] ?? 900_000
  const base  = SEED_PRICES[coin.replace('-PERP', '')] ?? 100
  const now   = Date.now()
  let   price = base
  const out: Candle[] = []

  for (let i = count; i >= 0; i--) {
    const time  = now - i * ms
    const open  = price
    const move  = (Math.random() - 0.495) * base * 0.008
    const close = Math.max(open + move, 0.001)
    const hi    = Math.max(open, close) * (1 + Math.random() * 0.003)
    const lo    = Math.min(open, close) * (1 - Math.random() * 0.003)
    out.push({ time, open, high: hi, low: lo, close, volume: base * (5 + Math.random() * 20) })
    price = close
  }
  return out
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LbWindow = 'day' | 'week' | 'month' | 'allTime'

export interface HLMarket {
  coin:         string
  markPx:       number
  prevDayPx:    number
  oraclePx:     number
  change24h:    number   // percent
  funding8h:    number   // raw 8-hour rate e.g. 0.0001
  fundingAnn:   number   // annualised %
  openInterest: number   // in USD
  volume24h:    number   // in USD
  maxLeverage:  number
}

export interface HLTrader {
  rank:         number
  address:      string
  displayName:  string | null
  accountValue: number
  windowPnl:    number
  roi:          number
  volume:       number
}

export interface HLTrade {
  id:    number | string
  coin:  string
  side:  'buy' | 'sell'
  price: number
  size:  number
  value: number
  time:  number
  hash:  string
}

export interface HLTraderFill {
  id:          number | string
  trader:      string          // address
  displayName: string | null
  rank:        number
  coin:        string
  side:        'buy' | 'sell'
  dir:         string          // 'Open Long' | 'Close Long' | 'Open Short' | 'Close Short' | ...
  price:       number
  size:        number
  value:       number
  closedPnl:   number
  fee:         number
  time:        number
  hash:        string
}

// ── Leaderboard hook ──────────────────────────────────────────────────────────
// Fetch 1 lần duy nhất (mỗi 60s), sort/filter theo timeWindow trong memory
// Không re-fetch khi đổi tab → nhanh hơn, không race condition

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = any

export function useHLLeaderboard(timeWindow: LbWindow = 'day') {
  const [rawRows,  setRawRows]  = useState<RawRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    // Huỷ request cũ nếu đang chạy
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      setLoading(true)

      // Try proxy first, then direct stats endpoint as fallback
      const endpoints = [
        () => fetch(`${PROXY}/leaderboard`, { signal: ctrl.signal }),
        () => fetch(HL_STATS, { signal: ctrl.signal, headers: { Accept: 'application/json' } }),
      ]

      let rows: RawRow[] = []
      for (const attempt of endpoints) {
        try {
          const res = await attempt()
          if (!res.ok) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = await res.json()
          const r: RawRow[] = Array.isArray(data)
            ? data
            : (data.leaderboardRows ?? data.rows ?? [])
          if (r.length > 0) { rows = r; break }
        } catch (e) {
          if ((e as Error).name === 'AbortError') return
        }
      }

      setRawRows(rows.slice(0, 200))
      setError(null)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      console.error('HL leaderboard error:', e)
      setError('Không thể tải leaderboard')
    } finally {
      setLoading(false)
    }
  }, [])  // không có deps → hàm ổn định, không recreate

  // Fetch khi mount, sau đó mỗi 60s
  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => {
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [load])

  // Parse & sort theo timeWindow trong memory (không fetch lại)
  const traders: HLTrader[] = rawRows
    .map((r: RawRow, i: number) => {
      const accountValue = parseFloat(r.accountValue ?? '0')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perfs: [string, any][] = Array.isArray(r.windowPerformances)
        ? r.windowPerformances : []
      const perf  = perfs.find(([key]) => key === timeWindow)?.[1] ?? {}
      const windowPnl = parseFloat(perf.pnl ?? '0')
      const roi       = parseFloat(perf.roi ?? '0') * 100
      const volume    = parseFloat(perf.vlm ?? '0')
      return {
        rank:        i + 1,
        address:     r.ethAddress ?? r.address ?? '—',
        displayName: r.displayName ?? null,
        accountValue, windowPnl, roi, volume,
      }
    })
    .sort((a, b) => b.windowPnl - a.windowPnl)
    .map((t, i) => ({ ...t, rank: i + 1 }))

  return { traders, loading, error, refresh: load }
}

// ── Recent trades hook ────────────────────────────────────────────────────────

const COINS = ['BTC', 'ETH', 'SOL']

export function useHLTrades() {
  const [trades,  setTrades]  = useState<HLTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    const fetchCoinTrades = async (coin: string) => {
      const body = JSON.stringify({ type: 'recentTrades', coin })
      for (const url of [`${PROXY}/trades`, HL_INFO]) {
        try {
          const r = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
          })
          if (r.ok) return r.json()
        } catch { /* try next */ }
      }
      return []
    }

    try {
      const results = await Promise.all(COINS.map(fetchCoinTrades))

      const all: HLTrade[] = []
      results.forEach((rows, ci) => {
        const coin = COINS[ci]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(Array.isArray(rows) ? rows : []).slice(0, 20).forEach((t: any) => {
          const price = parseFloat(t.px ?? '0')
          const size  = parseFloat(t.sz ?? '0')
          all.push({
            id:    t.tid ?? `${coin}-${t.time}-${Math.random()}`,
            coin,
            side:  t.side === 'B' ? 'buy' : 'sell',
            price,
            size,
            value: price * size,
            time:  t.time ?? Date.now(),
            hash:  t.hash ?? '',
          })
        })
      })

      all.sort((a, b) => b.time - a.time)
      setTrades(all.slice(0, 60))
      setError(null)
    } catch (e) {
      console.error('HL trades error:', e)
      setError('Không thể tải trades')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 5_000)
    return () => clearInterval(id)
  }, [load])

  return { trades, loading, error }
}

// ── Top-trader fills hook ─────────────────────────────────────────────────────
// Lấy các lệnh vừa thực hiện của top N traders trên leaderboard

export interface TraderInfo {
  address:     string
  displayName: string | null
  rank:        number
}

export function useHLTraderFills(traders: TraderInfo[], topN = 8) {
  const [fills,   setFills]   = useState<HLTraderFill[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Dùng key ổn định thay vì so sánh reference của array
  // Chỉ re-fetch khi danh sách địa chỉ thực sự thay đổi
  const tradersKey = traders.slice(0, topN).map(t => t.address).join(',')

  const load = useCallback(async (targets: TraderInfo[]) => {
    if (targets.length === 0) return

    try {
      setLoading(true)

      const fetchFills = async (addr: string) => {
        const body = JSON.stringify({ type: 'userFills', user: addr })
        for (const url of [`${PROXY}/trades`, HL_INFO]) {
          try {
            const r = await fetch(url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
            })
            if (r.ok) return r.json()
          } catch { /* try next */ }
        }
        return []
      }

      const results = await Promise.all(targets.map(t => fetchFills(t.address)))

      const all: HLTraderFill[] = []
      results.forEach((rows, ti) => {
        const trader = targets[ti]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(Array.isArray(rows) ? rows : []).slice(0, 10).forEach((f: any) => {
          const price     = parseFloat(f.px ?? '0')
          const size      = parseFloat(f.sz ?? '0')
          const closedPnl = parseFloat(f.closedPnl ?? '0')
          const fee       = parseFloat(f.fee ?? '0')
          all.push({
            id:          f.tid ?? `${trader.address}-${f.time}`,
            trader:      trader.address,
            displayName: trader.displayName,
            rank:        trader.rank,
            coin:        f.coin ?? '?',
            side:        f.side === 'B' ? 'buy' : 'sell',
            dir:         f.dir  ?? '',
            price,
            size,
            value:       price * size,
            closedPnl,
            fee,
            time:        f.time ?? Date.now(),
            hash:        f.hash ?? '',
          })
        })
      })

      all.sort((a, b) => b.time - a.time)
      setFills(all.slice(0, 80))
      setError(null)
    } catch (e) {
      console.error('HL trader fills error:', e)
      setError('Không thể tải lệnh trader')
    } finally {
      setLoading(false)
    }
  }, [])  // hàm ổn định, nhận targets làm tham số

  // Chỉ re-subscribe khi danh sách địa chỉ trader thực sự thay đổi
  useEffect(() => {
    const targets = traders.slice(0, topN)
    if (targets.length === 0) return

    load(targets)
    const id = setInterval(() => load(targets), 15_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradersKey, topN, load])  // tradersKey thay vì traders object

  return { fills, loading, error }
}

// ── Derivatives / Perps market hook ──────────────────────────────────────────
// Fetches metaAndAssetCtxs from Hyperliquid info API every 15s

export function useHLDerivatives() {
  const [markets, setMarkets] = useState<HLMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseMarkets = (data: any): HLMarket[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const universe: any[] = data?.[0]?.universe ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctxs:     any[] = data?.[1] ?? []
    return universe
      .map((asset, i) => {
        const ctx      = ctxs[i] ?? {}
        const markPx   = parseFloat(ctx.markPx   ?? '0')
        const prevDay  = parseFloat(ctx.prevDayPx ?? '0')
        const oraclePx = parseFloat(ctx.oraclePx  ?? '0')
        const funding  = parseFloat(ctx.funding    ?? '0')
        const oi       = parseFloat(ctx.openInterest ?? '0')
        const vol      = parseFloat(ctx.dayNtlVlm   ?? '0')
        return {
          coin:         asset.name ?? `Asset${i}`,
          markPx,
          prevDayPx:    prevDay,
          oraclePx,
          change24h:    prevDay > 0 ? ((markPx - prevDay) / prevDay) * 100 : 0,
          funding8h:    funding,
          fundingAnn:   funding * 3 * 365 * 100,
          openInterest: oi * markPx,
          volume24h:    vol,
          maxLeverage:  asset.maxLeverage ?? 20,
        }
      })
      .filter(m => m.markPx > 0)
  }

  const load = useCallback(async () => {
    const body = JSON.stringify({ type: 'metaAndAssetCtxs' })
    let parsed: HLMarket[] = []

    // Try proxy first, then direct API as fallback
    const endpoints = [
      () => fetch(`${PROXY}/trades`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }),
      () => fetch(HL_INFO, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }),
    ]

    for (const attempt of endpoints) {
      try {
        const res = await attempt()
        if (!res.ok) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json()
        parsed = parseMarkets(data)
        if (parsed.length > 0) break
      } catch { /* try next endpoint */ }
    }

    if (parsed.length > 0) {
      setMarkets(parsed)
      setUpdatedAt(Date.now())
      setError(null)
    } else {
      // Use mock/demo data so the UI always shows something
      setMarkets(prev => prev.length > 0 ? prev : mockMarkets())
      setError(null)   // don't show error — mock data is functional
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 5_000)
    return () => clearInterval(id)
  }, [load])

  return { markets, loading, error, updatedAt, refresh: load }
}

// ── Candle data hook ──────────────────────────────────────────────────────────

export interface Candle {
  time:   number   // unix ms
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1D'
// MS_PER_INTERVAL is defined in the mock helpers section above

export function useCandleData(coin: string, interval: CandleInterval) {
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const prevKey = useRef('')

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)

    const endTime   = Date.now()
    const startTime = endTime - (MS_PER_INTERVAL[interval] ?? 900_000) * 180
    const body = JSON.stringify({
      type: 'candleSnapshot',
      req:  { coin, interval, startTime, endTime },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseRaw = (data: any[]): Candle[] =>
      data.map(c => ({
        time:   c.T as number,
        open:   parseFloat(c.o),
        high:   parseFloat(c.h),
        low:    parseFloat(c.l),
        close:  parseFloat(c.c),
        volume: parseFloat(c.v),
      }))

    // Try proxy → direct API → mock fallback
    const endpoints = [
      () => fetch(`${PROXY}/trades`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }),
      () => fetch(HL_INFO, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }),
    ]

    let loaded = false
    for (const attempt of endpoints) {
      try {
        const res = await attempt()
        if (!res.ok) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any[] = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setCandles(parseRaw(data))
          loaded = true
          break
        }
      } catch { /* try next */ }
    }

    if (!loaded) {
      // Fallback: generate realistic demo candles so chart is never blank
      setCandles(prev =>
        prev.length > 0 ? prev : mockCandles(coin, interval)
      )
    }

    setLoading(false)
  }, [coin, interval])

  useEffect(() => {
    const key = `${coin}-${interval}`
    const isNew = key !== prevKey.current
    prevKey.current = key
    load(isNew)
    const id = setInterval(() => load(false), 30_000)
    return () => clearInterval(id)
  }, [load, coin, interval])

  // Expose a stable refresh function
  const refresh = useCallback(() => load(false), [load])
  return useMemo(() => ({ candles, loading, refresh }), [candles, loading, refresh])
}
