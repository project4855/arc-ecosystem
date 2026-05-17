import { useState, useEffect, useCallback } from 'react'

const HL_API = 'https://api.hyperliquid.xyz/info'

async function hlPost(body: object) {
  const res = await fetch(HL_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LbWindow = 'day' | 'week' | 'month' | 'allTime'

export interface HLTrader {
  rank:         number
  address:      string
  accountValue: number   // USD
  windowPnl:   number    // USD, for selected window
  roi:          number   // %
  volume:       number   // USD 30d
}

export interface HLTrade {
  id:    number
  coin:  string
  side:  'buy' | 'sell'
  price: number
  size:  number
  value: number           // price × size
  time:  number           // ms timestamp
  hash:  string
}

// ── Leaderboard hook ──────────────────────────────────────────────────────────

export function useHLLeaderboard(window: LbWindow = 'day') {
  const [traders, setTraders] = useState<HLTrader[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await hlPost({ type: 'leaderboard', window })
      const rows = (data?.leaderboardRows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .slice(0, 25).map((r: any, i: number) => {
          const accountValue = parseFloat(r.accountValue ?? r.account_value ?? '0')
          const windowPnl    = parseFloat(r.windowPnl ?? r.window_pnl ?? r.pnl ?? '0')
          const roi          = accountValue > 0 ? (windowPnl / (accountValue - windowPnl)) * 100 : 0
          return {
            rank:         i + 1,
            address:      r.ethAddress ?? r.eth_address ?? r.address ?? '—',
            accountValue,
            windowPnl,
            roi,
            volume:       parseFloat(r.vlm ?? r.volume ?? '0'),
          }
        })
      setTraders(rows)
      setError(null)
    } catch {
      setError('Không thể tải leaderboard')
    } finally {
      setLoading(false)
    }
  }, [window])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)  // refresh every 1 min
    return () => clearInterval(id)
  }, [load])

  return { traders, loading, error, refresh: load }
}

// ── Recent trades hook ────────────────────────────────────────────────────────

const COINS = ['BTC', 'ETH', 'SOL']

export function useHLTrades() {
  const [trades,  setTrades]  = useState<HLTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const results = await Promise.all(
        COINS.map((coin) => hlPost({ type: 'recentTrades', coin }).catch(() => []))
      )

      const all: HLTrade[] = []
      results.forEach((rows, ci) => {
        const coin = COINS[ci]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(rows ?? []).slice(0, 20).forEach((t: any) => {
          const price = parseFloat(t.px ?? '0')
          const size  = parseFloat(t.sz ?? '0')
          all.push({
            id:    t.tid ?? Math.random(),
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
      setTrades(all.slice(0, 50))
      setError(null)
    } catch {
      setError('Không thể tải trades')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 5_000)  // refresh every 5s
    return () => clearInterval(id)
  }, [load])

  return { trades, loading, error }
}
