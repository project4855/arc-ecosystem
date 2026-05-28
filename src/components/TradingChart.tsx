import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface IndicatorSet {
  ma7: boolean; ma25: boolean; ma99: boolean
  ema12: boolean; ema26: boolean; bb: boolean
}

interface Bar {
  time: number; open: number; high: number; low: number; close: number; volume: number
}

// ── Binance symbol map ────────────────────────────────────────────────────────
const BINANCE_MAP: Record<string, { sym: string; invert?: boolean }> = {
  'cirBTC/USDC': { sym: 'BTCUSDT' },
  'cirBTC/EURC': { sym: 'BTCEUR'  },
  'ETH/USDC':    { sym: 'ETHUSDT' },
  'SOL/USDC':    { sym: 'SOLUSDT' },
  'USDC/EURC':   { sym: 'EURUSDT', invert: true },
}

// ── Math helpers ──────────────────────────────────────────────────────────────
function sma(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  })
}

function ema(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const out: (number | null)[] = Array(closes.length).fill(null)
  let prev: number | null = null
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { continue }
    if (prev === null) {
      prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
      out[i] = prev
    } else {
      prev = closes[i] * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period)
  return closes.map((_, i) => {
    if (mid[i] === null) return { upper: null, mid: null, lower: null }
    const slice = closes.slice(i - period + 1, i + 1)
    const mean  = mid[i]!
    const std   = Math.sqrt(slice.reduce((s, x) => s + (x - mean) ** 2, 0) / period)
    return { upper: mean + mult * std, mid: mean, lower: mean - mult * std }
  })
}

// ── Simulated data ────────────────────────────────────────────────────────────
function genSimBars(base: number, interval: string): Bar[] {
  const step = interval === '1d' ? 86400 : interval === '4h' ? 14400 : interval === '1h' ? 3600 : interval === '15m' ? 900 : interval === '5m' ? 300 : 60
  const bars: Bar[] = []
  let p = Math.max(base, 0.0001)
  const now = Math.floor(Date.now() / 1000)
  for (let i = 300; i >= 0; i--) {
    const chg = (Math.random() - 0.49) * 0.002
    const o = p; p = p * (1 + chg)
    bars.push({
      time: now - i * step,
      open: o, high: Math.max(o, p) * (1 + Math.random() * 0.0008),
      low: Math.min(o, p) * (1 - Math.random() * 0.0008), close: p,
      volume: 50000 + Math.random() * 500000,
    })
  }
  return bars
}

// ── Formatting ────────────────────────────────────────────────────────────────
function fmt(p: number) {
  if (p >= 10000) return p.toFixed(2)
  if (p >= 1000)  return p.toFixed(2)
  if (p >= 1)     return p.toFixed(4)
  return p.toFixed(6)
}
function fmtVol(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K'
  return v.toFixed(2)
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  pair: string; interval: string; chartType: 'candle' | 'line'
  lastPrice?: number; indicators: IndicatorSet
}

export default function TradingChart({ pair, interval, chartType, lastPrice, indicators }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const candleRef    = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineRef      = useRef<ISeriesApi<'Line'> | null>(null)
  const volRef       = useRef<ISeriesApi<'Histogram'> | null>(null)
  const maRefs       = useRef<Record<string, ISeriesApi<'Line'> | null>>({})
  const bbRefs       = useRef<Record<string, ISeriesApi<'Line'> | null>>({})
  const barsRef      = useRef<Bar[]>([])

  const [ohlcv, setOhlcv] = useState<{
    time: string; open: number; high: number; low: number; close: number; volume: number; isUp: boolean
  } | null>(null)

  // ── Build chart once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: '#FFFFFF' },
        textColor: '#707A8A',
        fontSize: 11,
        fontFamily: "'Inter', 'Roboto', 'Arial', sans-serif",
      },
      grid: {
        vertLines: { color: '#F5F6FA', style: LineStyle.Solid },
        horzLines: { color: '#F5F6FA', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#C8C8C8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#707A8A' },
        horzLine: { color: '#C8C8C8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#707A8A' },
      },
      rightPriceScale: {
        borderColor: '#EAECEF',
        scaleMargins: { top: 0.08, bottom: 0.22 },
        minimumWidth: 80,
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderColor: '#EAECEF',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        minBarSpacing: 2,
        fixLeftEdge: true,
      },
    })

    // Candle series
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#0ECB81', downColor: '#F6465D',
      borderUpColor: '#0ECB81', borderDownColor: '#F6465D',
      wickUpColor: '#0ECB81', wickDownColor: '#F6465D',
      priceLineVisible: true, priceLineColor: '#B7BDC6', priceLineWidth: 1,
      lastValueVisible: true,
    })

    // Line series (for Line chart mode)
    const lineS = chart.addSeries(LineSeries, {
      color: '#2D8DFF', lineWidth: 2,
      priceLineVisible: true, lastValueVisible: true,
      crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
      visible: false,
    })

    // Volume histogram
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      lastValueVisible: false, priceLineVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })

    // MA / EMA indicator series
    const maConfigs: Record<string, { color: string; width: number }> = {
      ma7:   { color: '#F0B90B', width: 1 },
      ma25:  { color: '#2D8DFF', width: 1 },
      ma99:  { color: '#FF6B2B', width: 1 },
      ema12: { color: '#A855F7', width: 1 },
      ema26: { color: '#10B981', width: 1 },
    }
    for (const [key, cfg] of Object.entries(maConfigs)) {
      maRefs.current[key] = chart.addSeries(LineSeries, {
        color: cfg.color, lineWidth: cfg.width as 1,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, visible: false,
      })
    }

    // Bollinger Band series (upper/mid/lower)
    for (const key of ['bb_upper', 'bb_mid', 'bb_lower']) {
      bbRefs.current[key] = chart.addSeries(LineSeries, {
        color: '#B7BDC6', lineWidth: 1 as 1,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, visible: false,
        ...(key === 'bb_mid' ? { lineStyle: LineStyle.Dashed } : {}),
      })
    }

    // Crosshair move → OHLCV overlay
    chart.subscribeCrosshairMove(param => {
      if (!param.time || !param.point) { setOhlcv(null); return }
      const d = param.seriesData.get(candle) as CandlestickData | undefined
      const v = param.seriesData.get(vol) as HistogramData | undefined
      if (d) {
        const ts = typeof d.time === 'number' ? d.time * 1000 : 0
        const dt = new Date(ts)
        const hh = dt.getHours().toString().padStart(2, '0')
        const mm = dt.getMinutes().toString().padStart(2, '0')
        setOhlcv({
          time: `${dt.getMonth()+1}/${dt.getDate()} ${hh}:${mm}`,
          open: d.open, high: d.high, low: d.low, close: d.close,
          volume: v?.value ?? 0, isUp: d.close >= d.open,
        })
      }
    })

    chartRef.current  = chart
    candleRef.current = candle
    lineRef.current   = lineS
    volRef.current    = vol

    return () => chart.remove()
  }, [])

  // ── Toggle chart type ───────────────────────────────────────────────────────
  useEffect(() => {
    candleRef.current?.applyOptions({ visible: chartType === 'candle' })
    lineRef.current?.applyOptions({ visible: chartType === 'line' })
  }, [chartType])

  // ── Apply indicator overlays after data loads ─────────────────────────────
  const applyIndicators = useCallback((bars: Bar[], inds: IndicatorSet) => {
    const closes = bars.map(b => b.close)
    const times  = bars.map(b => b.time as Time)

    const setMA = (key: string, values: (number | null)[]) => {
      const s = maRefs.current[key]
      if (!s) return
      const data: LineData<Time>[] = values
        .map((v, i) => v !== null ? { time: times[i], value: v } : null)
        .filter((d): d is LineData<Time> => d !== null)
      s.setData(data)
      s.applyOptions({ visible: inds[key as keyof IndicatorSet] ?? false })
    }

    setMA('ma7',   sma(closes, 7))
    setMA('ma25',  sma(closes, 25))
    setMA('ma99',  sma(closes, 99))
    setMA('ema12', ema(closes, 12))
    setMA('ema26', ema(closes, 26))

    // Bollinger Bands
    const bb = bollinger(closes)
    const keys: Array<'upper' | 'mid' | 'lower'> = ['upper', 'mid', 'lower']
    for (const k of keys) {
      const s = bbRefs.current[`bb_${k}`]
      if (!s) continue
      const data: LineData<Time>[] = bb
        .map((b, i) => b[k] !== null ? { time: times[i], value: b[k]! } : null)
        .filter((d): d is LineData<Time> => d !== null)
      s.setData(data)
      s.applyOptions({ visible: inds.bb })
    }
  }, [])

  // ── Show/hide indicators on toggle (no re-fetch) ──────────────────────────
  useEffect(() => {
    if (!barsRef.current.length) return
    // Just toggle visibility
    const toggleMA = (key: string) => maRefs.current[key]?.applyOptions({ visible: indicators[key as keyof IndicatorSet] ?? false })
    toggleMA('ma7'); toggleMA('ma25'); toggleMA('ma99'); toggleMA('ema12'); toggleMA('ema26')
    const bbVis = indicators.bb
    bbRefs.current['bb_upper']?.applyOptions({ visible: bbVis })
    bbRefs.current['bb_mid']?.applyOptions({ visible: bbVis })
    bbRefs.current['bb_lower']?.applyOptions({ visible: bbVis })
    // Recalc if BB was just enabled (needs data)
    if (bbVis) applyIndicators(barsRef.current, indicators)
  }, [indicators, applyIndicators])

  // ── Load / refresh data ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const entry = BINANCE_MAP[pair]
    let bars: Bar[]

    if (!entry?.sym) {
      bars = genSimBars(lastPrice ?? 1, interval)
    } else {
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${entry.sym}&interval=${interval}&limit=500`
        )
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const raw: [number, string, string, string, string, string, ...unknown[]][] = await res.json()
        bars = raw.map(k => {
          let o = +k[1], h = +k[2], l = +k[3], c = +k[4]
          if (entry.invert) { [o, h, l, c] = [1/o, 1/l, 1/h, 1/c] }
          return { time: Math.floor(k[0] / 1000), open: o, high: h, low: l, close: c, volume: +k[5] }
        })
      } catch {
        bars = genSimBars(lastPrice ?? 1, interval)
      }
    }

    barsRef.current = bars

    candleRef.current?.setData(bars.map(b => ({
      time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close,
    })))
    lineRef.current?.setData(bars.map(b => ({ time: b.time as Time, value: b.close })))
    volRef.current?.setData(bars.map(b => ({
      time: b.time as Time, value: b.volume,
      color: b.close >= b.open ? 'rgba(14,203,129,0.45)' : 'rgba(246,70,93,0.45)',
    })))

    applyIndicators(bars, indicators)
    chartRef.current?.timeScale().fitContent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, interval, lastPrice, applyIndicators])

  useEffect(() => {
    loadData()
    const id = setInterval(loadData, 30_000)
    return () => clearInterval(id)
  }, [loadData])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* OHLCV overlay — top left, Binance style */}
      <div className="absolute top-1.5 left-2 z-10 pointer-events-none select-none">
        {ohlcv ? (
          <div className="flex items-center gap-3 text-[11px] font-mono px-2 py-0.5 rounded bg-white/70">
            <span className="text-[#707A8A] text-[10px]">{ohlcv.time}</span>
            <span>
              <span className="text-[#B7BDC6]">O </span>
              <span className={ohlcv.isUp ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>{fmt(ohlcv.open)}</span>
            </span>
            <span>
              <span className="text-[#B7BDC6]">H </span>
              <span className="text-[#0ECB81]">{fmt(ohlcv.high)}</span>
            </span>
            <span>
              <span className="text-[#B7BDC6]">L </span>
              <span className="text-[#F6465D]">{fmt(ohlcv.low)}</span>
            </span>
            <span>
              <span className="text-[#B7BDC6]">C </span>
              <span className={ohlcv.isUp ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>{fmt(ohlcv.close)}</span>
            </span>
            <span>
              <span className="text-[#B7BDC6]">Vol </span>
              <span className="text-[#1E2329]">{fmtVol(ohlcv.volume)}</span>
            </span>
          </div>
        ) : (
          <div className="text-[10px] text-[#B7BDC6] font-mono px-1">{pair} · {interval}</div>
        )}
      </div>
    </div>
  )
}
