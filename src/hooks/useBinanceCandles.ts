import { useState, useEffect, useRef } from 'react'
import type { Candle } from './useMarketData'

// Map Arc testnet pairs → Binance symbols
const BINANCE: Record<string, { sym: string; invert?: boolean }> = {
  'cirBTC/USDC': { sym: 'BTCUSDT' },
  'cirBTC/EURC': { sym: 'BTCEUR'  },
  'ETH/USDC':    { sym: 'ETHUSDT' },
  'SOL/USDC':    { sym: 'SOLUSDT' },
  'USDC/EURC':   { sym: 'EURUSDT', invert: true }, // 1/EURUSD ≈ USDC/EURC
}

function genSimulated(base: number, count = 100): Candle[] {
  const out: Candle[] = []
  let p = base
  const now = Date.now()
  for (let i = count; i >= 0; i--) {
    const chg = (Math.random() - 0.49) * 0.002
    const o = p
    p = p * (1 + chg)
    const h = Math.max(o, p) * (1 + Math.random() * 0.001)
    const l = Math.min(o, p) * (1 - Math.random() * 0.001)
    const d = new Date(now - i * 60_000)
    out.push({
      time: `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`,
      open: o, high: h, low: l, close: p,
      volume: 1000 + Math.random() * 9000,
    })
  }
  return out
}

function fmtTime(ts: number, interval: string): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  if (interval === '1h') return `${hh}:00`
  return `${hh}:${mm}`
}

export function useBinanceCandles(
  pair: string,
  interval: string,
  fallbackPrice = 1,
): Candle[] {
  const [candles, setCandles] = useState<Candle[]>(() =>
    genSimulated(fallbackPrice)
  )
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)

    const entry = BINANCE[pair]
    if (!entry?.sym) {
      setCandles(genSimulated(fallbackPrice > 0 ? fallbackPrice : 1))
      return
    }

    const { sym, invert } = entry

    const load = async () => {
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=100`
        )
        if (!res.ok) throw new Error('fetch failed')
        const raw: [number, string, string, string, string, string, ...unknown[]][] = await res.json()
        const result: Candle[] = raw.map(k => {
          let o = +k[1], h = +k[2], l = +k[3], c = +k[4]
          if (invert) { [o, h, l, c] = [1/o, 1/l, 1/h, 1/c] }
          return {
            time: fmtTime(k[0], interval),
            open: o, high: h, low: l, close: c,
            volume: +k[5],
          }
        })
        setCandles(result)
      } catch {
        // keep current candles on network error
      }
    }

    load()
    timerRef.current = setInterval(load, 30_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, interval])

  return candles
}
