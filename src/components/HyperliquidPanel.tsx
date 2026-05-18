import { useState, useMemo, useEffect } from 'react'
import {
  useHLLeaderboard,
  useHLTrades,
  useHLTraderFills,
} from '../hooks/useHyperliquid'
import type { LbWindow, HLTraderFill } from '../hooks/useHyperliquid'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
}

function fmtRelTime(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000)
  if (sec < 60)   return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}p`
  return `${Math.floor(sec / 3600)}h`
}

function shortAddr(addr: string, name: string | null): string {
  if (name) return name
  if (!addr || addr === '—') return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const COIN_ICONS: Record<string, string> = { BTC: '₿', ETH: 'Ξ', SOL: '◎', ARB: 'Ⓐ', OP: 'Ⓞ' }

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <span className="text-sm">Đang tải...</span>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

const WINDOWS: { key: LbWindow; label: string }[] = [
  { key: 'day',     label: '1 Ngày'  },
  { key: 'week',    label: '1 Tuần'  },
  { key: 'month',   label: '1 Tháng' },
  { key: 'allTime', label: 'Tất cả'  },
]

function Leaderboard({
  onTradersLoaded,
}: {
  onTradersLoaded: (t: { address: string; displayName: string | null; rank: number }[]) => void
}) {
  const [timeWindow, setTimeWindow] = useState<LbWindow>('day')
  const { traders, loading, error, refresh } = useHLLeaderboard(timeWindow)
  const top10 = useMemo(() => traders.slice(0, 10), [traders])

  useEffect(() => {
    if (top10.length > 0) {
      onTradersLoaded(top10.map(t => ({ address: t.address, displayName: t.displayName, rank: t.rank })))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top10])

  // Max PnL để tính thanh bar
  const maxPnl = Math.max(...top10.map(t => Math.abs(t.windowPnl)), 1)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏆</span>
            <h3 className="text-slate-900 font-bold text-sm">Top 10 Traders</h3>
            <span className="text-[11px] text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full">Hyperliquid</span>
          </div>
          <button onClick={refresh}
            className="text-slate-400 hover:text-slate-900 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100"
            title="Refresh">
            ↻
          </button>
        </div>

        {/* Time window */}
        <div className="grid grid-cols-4 gap-1 bg-slate-100 rounded-xl p-1">
          {WINDOWS.map(({ key, label }) => (
            <button key={key} onClick={() => setTimeWindow(key)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeWindow === key
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[36px_1fr_110px_72px] text-[10px] text-slate-400 uppercase tracking-wide px-5 py-2 bg-slate-50">
        <span>#</span>
        <span>Trader</span>
        <span className="text-right">PnL</span>
        <span className="text-right">ROI</span>
      </div>

      {/* Rows — top 10, no scroll */}
      {loading && !top10.length ? <Spinner /> : error ? (
        <div className="text-center py-10 text-red-400/70 text-xs">{error}</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {top10.map((t) => {
            const pos    = t.windowPnl >= 0
            const medal  = t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : null
            const barW   = Math.round(Math.abs(t.windowPnl) / maxPnl * 100)
            const isTop3 = t.rank <= 3

            return (
              <div key={t.address + t.rank}
                className={`grid grid-cols-[36px_1fr_110px_72px] items-center px-5 py-3 transition-colors hover:bg-slate-50 group ${
                  isTop3 ? 'bg-violet-50/50' : ''
                }`}>

                {/* Rank */}
                <div className="font-mono text-sm">
                  {medal ?? <span className="text-slate-400 text-xs">#{t.rank}</span>}
                </div>

                {/* Trader */}
                <div className="min-w-0">
                  <a href={`https://app.hyperliquid.xyz/stats/${t.address}`}
                    target="_blank" rel="noreferrer"
                    className="text-slate-700 text-xs font-medium hover:text-violet-600 transition-colors truncate block">
                    {shortAddr(t.address, t.displayName)}
                    <span className="opacity-0 group-hover:opacity-60 text-violet-600 ml-1">↗</span>
                  </a>
                  <div className="text-slate-400 text-[10px] mt-0.5 font-mono truncate">
                    {fmtUSD(t.accountValue)} acct
                  </div>
                </div>

                {/* PnL + bar */}
                <div className="flex flex-col items-end gap-1">
                  <span className={`font-mono text-xs font-bold ${pos ? 'text-emerald-600' : 'text-red-600'}`}>
                    {pos ? '+' : ''}{fmtUSD(t.windowPnl)}
                  </span>
                  <div className="w-full h-1 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pos ? 'bg-gradient-to-r from-green-600 to-green-400' : 'bg-gradient-to-r from-red-600 to-red-400'}`}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>

                {/* ROI */}
                <div className={`text-right font-mono text-xs font-semibold ${pos ? 'text-emerald-600' : 'text-red-600'}`}>
                  {pos ? '+' : ''}{t.roi.toFixed(1)}%
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-slate-200 flex items-center gap-2 text-[11px] text-slate-400 mt-auto">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        <span>Live · 60s</span>
        <a href="https://app.hyperliquid.xyz/leaderboard" target="_blank" rel="noreferrer"
          className="ml-auto hover:text-violet-600 transition-colors">Xem thêm ↗</a>
      </div>
    </div>
  )
}

// ── Recent Market Trades ──────────────────────────────────────────────────────

function RecentTrades() {
  const [filterCoin, setFilterCoin] = useState('ALL')
  const { trades, loading, error } = useHLTrades()
  const displayed = (filterCoin === 'ALL' ? trades : trades.filter(t => t.coin === filterCoin)).slice(0, 30)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <h3 className="text-slate-900 font-bold text-sm">Lệnh thị trường</h3>
          </div>
          <div className="flex gap-1">
            {['ALL', 'BTC', 'ETH', 'SOL'].map(c => (
              <button key={c} onClick={() => setFilterCoin(c)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  filterCoin === c ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                }`}>
                {c === 'ALL' ? 'Tất cả' : c}
              </button>
            ))}
          </div>
        </div>

        {/* Column header */}
        <div className="grid grid-cols-[44px_48px_1fr_70px] text-[10px] text-slate-400 uppercase tracking-wide">
          <span>Giờ</span><span>Token</span><span className="text-center">Chiều</span><span className="text-right">Giá trị</span>
        </div>
      </div>

      {/* Rows */}
      <div className="flex flex-col overflow-y-auto flex-1 max-h-[520px] scrollbar-thin scrollbar-thumb-slate-300">
        {loading && !trades.length ? <Spinner /> : error ? (
          <div className="text-center py-10 text-red-400/70 text-xs">{error}</div>
        ) : displayed.map((t, i) => {
          const isBuy  = t.side === 'buy'
          const isWhale = t.value >= 100_000
          return (
            <div key={`${t.id}-${i}`}
              className={`grid grid-cols-[44px_48px_1fr_70px] items-center px-4 py-2 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                isWhale ? 'bg-amber-50' : ''
              }`}>

              {/* Time */}
              <span className="text-slate-400 font-mono text-[10px]">{fmtTime(t.time)}</span>

              {/* Coin */}
              <span className="text-slate-700 font-mono text-[11px] font-semibold">
                {COIN_ICONS[t.coin] ?? ''}{t.coin}
              </span>

              {/* Direction badge */}
              <div className="flex justify-center">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  isBuy ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}>
                  {isBuy ? 'MUA' : 'BÁN'}
                </span>
              </div>

              {/* Value */}
              <span className={`text-right font-mono text-[11px] font-semibold ${
                isWhale ? 'text-amber-600' : t.value >= 10_000 ? 'text-slate-700' : 'text-slate-500'
              }`}>
                {fmtUSD(t.value)}{isWhale && ' 🐋'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-2 border-t border-slate-200 flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        <span>Live · 5s · {displayed.length} lệnh</span>
        <span className="ml-auto text-slate-300">🐋 ≥ $100K</span>
      </div>
    </div>
  )
}

// ── Copy Trade Signals ────────────────────────────────────────────────────────

interface SignalData {
  coin: string; dir: 'Open Long' | 'Open Short'
  traders: Set<string>; totalValue: number; latestTime: number
}

function CopyTradeSignals({ fills }: { fills: HLTraderFill[] }) {
  const signals = useMemo((): SignalData[] => {
    const map = new Map<string, SignalData>()
    for (const f of fills) {
      if (f.dir !== 'Open Long' && f.dir !== 'Open Short') continue
      const key = `${f.coin}|${f.dir}`
      if (!map.has(key)) map.set(key, { coin: f.coin, dir: f.dir as 'Open Long' | 'Open Short', traders: new Set(), totalValue: 0, latestTime: 0 })
      const s = map.get(key)!
      s.traders.add(f.trader)
      s.totalValue += f.value
      s.latestTime = Math.max(s.latestTime, f.time)
    }
    return [...map.values()].filter(s => s.traders.size >= 2).sort((a, b) => b.traders.size - a.traders.size || b.totalValue - a.totalValue).slice(0, 6)
  }, [fills])

  if (signals.length === 0) return null

  return (
    <div className="bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50 border border-violet-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🔥</span>
        <span className="text-slate-900 font-bold text-sm">Copy Trade Signal</span>
        <span className="px-2 py-0.5 rounded-full bg-violet-100 border border-violet-300 text-violet-700 text-[10px] font-bold animate-pulse">LIVE</span>
        <span className="text-slate-500 text-xs hidden sm:block">· ≥2 top traders mở cùng vị thế</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {signals.map(s => {
          const isLong = s.dir === 'Open Long'
          const bars   = '●'.repeat(s.traders.size) + '○'.repeat(Math.max(0, 4 - s.traders.size))
          return (
            <div key={`${s.coin}|${s.dir}`}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all hover:scale-[1.02] cursor-default ${
                isLong ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
              }`}>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className={`font-bold text-base ${isLong ? 'text-emerald-600' : 'text-red-600'}`}>{isLong ? '▲' : '▼'}</span>
                  <span className={`font-bold text-sm ${isLong ? 'text-emerald-700' : 'text-red-700'}`}>{s.coin}</span>
                  <span className={`text-xs ${isLong ? 'text-emerald-600' : 'text-red-600'}`}>{isLong ? 'Long' : 'Short'}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[11px] tracking-wider ${isLong ? 'text-emerald-500' : 'text-red-500'}`}>{bars}</span>
                  <span className="text-slate-400 text-[10px]">{fmtUSD(s.totalValue)}</span>
                  <span className="text-slate-300 text-[10px]">{fmtRelTime(s.latestTime)} trước</span>
                </div>
              </div>
              <div className={`flex flex-col items-center px-2 py-1 rounded-lg ${isLong ? 'bg-emerald-100' : 'bg-red-100'}`}>
                <span className="text-slate-900 font-bold text-lg leading-none">{s.traders.size}</span>
                <span className="text-slate-500 text-[9px]">traders</span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-slate-400 mt-2">⚠️ Tín hiệu tham khảo · Không phải lời khuyên đầu tư</p>
    </div>
  )
}

// ── Top Trader Fills ──────────────────────────────────────────────────────────

const DIR_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  'Open Long':   { icon: '▲', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  'Close Long':  { icon: '▽', color: 'text-emerald-600', bg: 'bg-emerald-50/60'  },
  'Open Short':  { icon: '▼', color: 'text-red-700',   bg: 'bg-red-50'   },
  'Close Short': { icon: '△', color: 'text-red-600',   bg: 'bg-red-50/60'    },
}

function TopTraderFills({ traders }: { traders: { address: string; displayName: string | null; rank: number }[] }) {
  const [filterCoin, setFilterCoin] = useState('Tất cả')
  const [filterDir,  setFilterDir]  = useState('Tất cả')
  const { fills, loading, error } = useHLTraderFills(traders, 10)

  const coins    = ['Tất cả', ...Array.from(new Set(fills.map(f => f.coin))).sort().slice(0, 10)]
  const dirOpts  = ['Tất cả', 'Open Long', 'Open Short', 'Close Long', 'Close Short']

  const displayed = fills.filter(f => {
    if (filterCoin !== 'Tất cả' && f.coin !== filterCoin) return false
    if (filterDir  !== 'Tất cả' && f.dir  !== filterDir)  return false
    return true
  })

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔭</span>
            <h3 className="text-slate-900 font-bold text-sm">Lệnh của Top Traders</h3>
            <span className="text-[11px] bg-violet-50 border border-violet-200 text-violet-600 px-2 py-0.5 rounded-full font-semibold">
              Top {traders.length}
            </span>
            {loading && <svg className="animate-spin h-3.5 w-3.5 text-gray-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-pulse"/>
            <span>Cập nhật 15s</span>
          </div>
        </div>

        {/* Copy Trade Signals */}
        <CopyTradeSignals fills={fills} />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mt-3">
          {/* Coin filter */}
          <div className="flex gap-1 flex-wrap">
            {coins.map(c => (
              <button key={c} onClick={() => setFilterCoin(c)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  filterCoin === c ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                }`}>
                {c === 'Tất cả' ? 'Tất cả coin' : `${COIN_ICONS[c] ?? ''}${c}`}
              </button>
            ))}
          </div>

          <div className="w-px bg-slate-200 hidden sm:block self-stretch" />

          {/* Direction filter */}
          <div className="flex gap-1 flex-wrap">
            {dirOpts.map(d => {
              const cfg = DIR_CONFIG[d]
              return (
                <button key={d} onClick={() => setFilterDir(d)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                    filterDir === d ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                  }`}>
                  {cfg && <span className={filterDir === d ? 'text-white' : cfg.color}>{cfg.icon}</span>}
                  {d === 'Tất cả' ? 'Tất cả chiều' : d.replace('Open ', 'Mở ').replace('Close ', 'Đóng ')}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[28px_120px_80px_56px_100px_80px_80px] text-[10px] text-slate-400 uppercase tracking-wide px-5 py-2 bg-slate-50 gap-2">
        <span>#</span><span>Trader</span><span>Thời gian</span><span>Coin</span>
        <span>Chiều</span><span className="text-right">Giá trị</span><span className="text-right">PnL đóng</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300">
        {loading && fills.length === 0 ? <Spinner /> : error ? (
          <div className="text-center py-10 text-red-400/70 text-xs">{error}</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">Không có lệnh phù hợp</div>
        ) : displayed.map((f, idx) => {
          const dirCfg  = DIR_CONFIG[f.dir] ?? { icon: '?', color: 'text-gray-400', bg: 'bg-gray-800/30' }
          const hasPnl  = f.closedPnl !== 0
          const pnlPos  = f.closedPnl >= 0
          const isWhale = f.value >= 100_000
          const medal   = f.rank === 1 ? '🥇' : f.rank === 2 ? '🥈' : f.rank === 3 ? '🥉' : null

          return (
            <div key={`${f.id}-${idx}`}
              className={`grid grid-cols-[28px_120px_80px_56px_100px_80px_80px] items-center px-5 py-3 gap-2 hover:bg-slate-50 transition-colors group ${
                isWhale ? 'bg-amber-50' : ''
              }`}>

              {/* Rank */}
              <span className="text-xs font-mono text-slate-400">{medal ?? `#${f.rank}`}</span>

              {/* Trader */}
              <a href={`https://app.hyperliquid.xyz/stats/${f.trader}`}
                target="_blank" rel="noreferrer"
                className="font-mono text-[11px] text-slate-500 hover:text-violet-600 transition-colors truncate">
                {shortAddr(f.trader, f.displayName)}
                <span className="opacity-0 group-hover:opacity-60 text-violet-600 ml-1">↗</span>
              </a>

              {/* Time */}
              <div>
                <div className="text-slate-500 font-mono text-[10px]">{fmtTime(f.time)}</div>
                <div className="text-slate-300 text-[10px]">{fmtRelTime(f.time)} trước</div>
              </div>

              {/* Coin */}
              <span className="font-mono font-bold text-slate-700 text-[11px]">
                {COIN_ICONS[f.coin] ?? ''}{f.coin}
              </span>

              {/* Direction */}
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg w-fit ${dirCfg.bg}`}>
                <span className={`text-sm ${dirCfg.color}`}>{dirCfg.icon}</span>
                <span className={`text-[10px] font-semibold ${dirCfg.color}`}>
                  {f.dir.replace('Open ', 'Mở ').replace('Close ', 'Đóng ')}
                </span>
              </div>

              {/* Value */}
              <span className={`text-right font-mono text-[11px] font-bold ${
                isWhale ? 'text-amber-600' : f.value >= 10_000 ? 'text-slate-700' : 'text-slate-500'
              }`}>
                {fmtUSD(f.value)}{isWhale && ' 🐋'}
              </span>

              {/* Closed PnL */}
              <span className={`text-right font-mono text-[11px] font-semibold ${
                !hasPnl ? 'text-slate-300' : pnlPos ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {!hasPnl ? '—' : `${pnlPos ? '+' : ''}${fmtUSD(f.closedPnl)}`}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2 text-[11px] text-slate-400">
        <span className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-pulse"/>
        <span>{displayed.length} lệnh · Top {traders.length} traders · 15s</span>
        <span className="ml-auto text-slate-300">▲ Mở Long · ▼ Mở Short · ▽▵ Đóng · 🐋 ≥$100K</span>
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function HyperliquidPanel() {
  const [topTraders, setTopTraders] = useState<
    { address: string; displayName: string | null; rank: number }[]
  >([])

  return (
    <div className="flex flex-col gap-4">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200">
          <img src="https://app.hyperliquid.xyz/favicon.ico" alt=""
            className="w-4 h-4 rounded-sm"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <span className="text-slate-400 text-xs font-medium">Dữ liệu thực từ Hyperliquid Mainnet</span>
        </div>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Row 1: Leaderboard (left) + Market Trades (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4">
        <Leaderboard onTradersLoaded={setTopTraders} />
        <RecentTrades />
      </div>

      {/* Row 2: Top trader fills */}
      {topTraders.length > 0 && (
        <TopTraderFills traders={topTraders} />
      )}
    </div>
  )
}
