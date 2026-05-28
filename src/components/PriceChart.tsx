import { useState, useRef, useEffect } from 'react'
import { useMarketData } from '../hooks/useMarketData'
import TradingChart, { type IndicatorSet } from './TradingChart'

function fmtPrice(p: number) {
  if (p >= 1000) return p.toFixed(2)
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

interface Props { pair: string; basePrice?: number }

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
type ChartType  = 'candle' | 'line'

const INDICATOR_OPTIONS = [
  { key: 'ma7',   label: 'MA 7',   color: '#F0B90B' },
  { key: 'ma25',  label: 'MA 25',  color: '#2D8DFF' },
  { key: 'ma99',  label: 'MA 99',  color: '#FF6B2B' },
  { key: 'ema12', label: 'EMA 12', color: '#A855F7' },
  { key: 'ema26', label: 'EMA 26', color: '#10B981' },
  { key: 'bb',    label: 'BB(20)', color: '#B7BDC6' },
] as const

export default function PriceChart({ pair, basePrice }: Props) {
  const [interval, setInterval]     = useState<typeof INTERVALS[number]>('1m')
  const [chartType, setChartType]   = useState<ChartType>('candle')
  const [indicators, setIndicators] = useState<IndicatorSet>({ ma7: true, ma25: true, ma99: true, ema12: false, ema26: false, bb: false })
  const [showIndMenu, setShowIndMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { lastPrice, priceChange } = useMarketData(pair, basePrice)
  const isUp = priceChange >= 0

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowIndMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleInd = (key: keyof IndicatorSet) =>
    setIndicators(prev => ({ ...prev, [key]: !prev[key] }))

  const activeCount = Object.values(indicators).filter(Boolean).length

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Toolbar ── */}
      <div className="flex items-center border-b border-[#EAECEF] shrink-0 overflow-x-auto [scrollbar-width:none]"
        style={{ height: 52, padding: '0 16px', gap: 0 }}>

        {/* Live price */}
        <div className="flex items-baseline shrink-0" style={{ gap: 10, paddingRight: 20, marginRight: 16, borderRight: '1px solid #EAECEF' }}>
          <span className={`font-bold font-mono leading-none ${isUp ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`} style={{ fontSize: 20 }}>
            {fmtPrice(lastPrice)}
          </span>
          <span className={`font-mono ${isUp ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`} style={{ fontSize: 13 }}>
            {isUp ? '+' : ''}{priceChange.toFixed(4)}%
          </span>
        </div>

        {/* Chart type */}
        <div className="flex items-center shrink-0" style={{ gap: 4, marginRight: 16 }}>
          {(['candle', 'line'] as ChartType[]).map(t => (
            <button key={t} onClick={() => setChartType(t)}
              style={{ height: 32, padding: '0 16px', fontSize: 13, flexShrink: 0 }}
              className={`font-medium rounded transition-colors ${
                chartType === t ? 'bg-[#F5F5F5] text-[#1E2329]' : 'text-[#707A8A] hover:text-[#1E2329]'
              }`}>
              {t === 'candle' ? '🕯 Candles' : '📈 Line'}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="shrink-0" style={{ width: 1, height: 24, background: '#EAECEF', marginRight: 16 }} />

        {/* Intervals */}
        <div className="flex items-center shrink-0" style={{ gap: 6 }}>
          {INTERVALS.map(iv => (
            <button key={iv} onClick={() => setInterval(iv)}
              style={{ height: 32, padding: '0 16px', fontSize: 13, flexShrink: 0 }}
              className={`font-semibold rounded transition-colors ${
                interval === iv
                  ? 'text-[#F0B90B] bg-[#FFF8E1]'
                  : 'text-[#707A8A] hover:text-[#1E2329] hover:bg-[#F5F5F5]'
              }`}>
              {iv}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="shrink-0" style={{ width: 1, height: 24, background: '#EAECEF', margin: '0 16px' }} />

        {/* Indicators dropdown */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setShowIndMenu(v => !v)}
            style={{ height: 32, padding: '0 16px', fontSize: 13, flexShrink: 0 }}
            className={`flex items-center font-medium rounded transition-colors ${
              showIndMenu ? 'bg-[#F5F5F5] text-[#1E2329]' : 'text-[#707A8A] hover:text-[#1E2329] hover:bg-[#F5F5F5]'
            }`}>
            <span style={{ marginRight: 6 }}>📊</span>
            <span>Indicators</span>
            {activeCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#F0B90B] text-[#1E2329] text-[10px] font-bold flex items-center justify-center">
                {activeCount}
              </span>
            )}
            <span className="text-[10px]">{showIndMenu ? '▲' : '▼'}</span>
          </button>

          {showIndMenu && (
            <div className="absolute top-8 left-0 z-50 bg-white border border-[#EAECEF] rounded shadow-xl w-[180px] py-1">
              <p className="px-3 py-1.5 text-[10px] text-[#B7BDC6] font-semibold uppercase tracking-wider">
                Moving Averages
              </p>
              {INDICATOR_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => toggleInd(opt.key as keyof IndicatorSet)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#F5F5F5] transition-colors text-left"
                >
                  <span className="w-3 h-3 rounded-sm border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: opt.color, backgroundColor: indicators[opt.key as keyof IndicatorSet] ? opt.color : 'transparent' }}>
                    {indicators[opt.key as keyof IndicatorSet] && (
                      <span className="text-white text-[8px] font-black">✓</span>
                    )}
                  </span>
                  <span className="text-[12px] text-[#1E2329]">{opt.label}</span>
                  <span className="ml-auto w-4 h-1 rounded" style={{ backgroundColor: opt.color }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Screenshot */}
        <button
          onClick={() => window.print()}
          style={{ height: 32, padding: '0 12px', fontSize: 13, flexShrink: 0 }}
          className="text-[#707A8A] hover:text-[#1E2329] hover:bg-[#F5F5F5] rounded transition-colors"
          title="Screenshot">
          📷
        </button>
      </div>

      {/* ── Chart ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TradingChart
          pair={pair}
          interval={interval}
          chartType={chartType}
          lastPrice={lastPrice}
          indicators={indicators}
        />
      </div>

    </div>
  )
}
