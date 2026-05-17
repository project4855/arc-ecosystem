import { useState } from 'react'
import { useHLLeaderboard, useHLTrades } from '../hooks/useHyperliquid'
import type { LbWindow } from '../hooks/useHyperliquid'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUSD(n: number, compact = true): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  }
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
}

function shortAddr(addr: string): string {
  if (!addr || addr === '—') return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ── Leaderboard section ───────────────────────────────────────────────────────

const WINDOWS: { key: LbWindow; label: string }[] = [
  { key: 'day',     label: '1D' },
  { key: 'week',    label: '7D' },
  { key: 'month',   label: '30D' },
  { key: 'allTime', label: 'All' },
]

function Leaderboard() {
  const [window, setWindow] = useState<LbWindow>('day')
  const { traders, loading, error, refresh } = useHLLeaderboard(window)

  return (
    <div className="bg-[#0d0e12] border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🏆</span>
          <h3 className="text-white font-semibold text-sm">Top Traders</h3>
          <span className="text-xs text-gray-600">Hyperliquid</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Window selector */}
          <div className="flex gap-1">
            {WINDOWS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setWindow(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  window === key
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            className="text-gray-600 hover:text-gray-400 text-xs transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-[32px_1fr_90px_80px_80px] text-xs text-gray-600 px-1">
        <span>#</span>
        <span>Wallet</span>
        <span className="text-right">PnL</span>
        <span className="text-right">ROI</span>
        <span className="text-right">Account</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-px max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
        {loading && !traders.length ? (
          <div className="flex items-center justify-center py-10 text-gray-600 text-sm gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Đang tải...
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-400/70 text-xs">{error}</div>
        ) : traders.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">Không có dữ liệu</div>
        ) : (
          traders.map((t) => {
            const medal = t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : null
            return (
              <div
                key={t.address + t.rank}
                className="grid grid-cols-[32px_1fr_90px_80px_80px] items-center px-1 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
              >
                {/* Rank */}
                <span className="text-gray-500 font-mono text-xs">
                  {medal ?? `#${t.rank}`}
                </span>

                {/* Address */}
                <a
                  href={`https://app.hyperliquid.xyz/stats/${t.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-300 font-mono text-xs hover:text-violet-400 transition-colors truncate"
                >
                  {shortAddr(t.address)}
                  <span className="opacity-0 group-hover:opacity-100 text-violet-400 ml-1">↗</span>
                </a>

                {/* PnL */}
                <span className={`text-right font-mono text-xs font-semibold ${
                  t.windowPnl >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {t.windowPnl >= 0 ? '+' : ''}{fmtUSD(t.windowPnl)}
                </span>

                {/* ROI */}
                <span className={`text-right font-mono text-xs ${
                  t.roi >= 0 ? 'text-green-400/80' : 'text-red-400/80'
                }`}>
                  {t.roi >= 0 ? '+' : ''}{t.roi.toFixed(1)}%
                </span>

                {/* Account value */}
                <span className="text-right text-gray-500 font-mono text-xs">
                  {fmtUSD(t.accountValue)}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
        <span>Live · Hyperliquid · {traders.length} traders</span>
        <a
          href="https://app.hyperliquid.xyz/leaderboard"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-gray-600 hover:text-violet-400 transition-colors"
        >
          Xem đầy đủ ↗
        </a>
      </div>
    </div>
  )
}

// ── Recent trades section ─────────────────────────────────────────────────────

const COIN_ICONS: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', SOL: '◎',
}

function RecentTrades() {
  const [filterCoin, setFilterCoin] = useState<string>('ALL')
  const { trades, loading, error } = useHLTrades()

  const displayed = filterCoin === 'ALL'
    ? trades
    : trades.filter((t) => t.coin === filterCoin)

  return (
    <div className="bg-[#0d0e12] border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚡</span>
          <h3 className="text-white font-semibold text-sm">Lệnh vừa thực hiện</h3>
          <span className="text-xs text-gray-600">Hyperliquid</span>
        </div>
        {/* Coin filter */}
        <div className="flex gap-1">
          {['ALL', 'BTC', 'ETH', 'SOL'].map((c) => (
            <button
              key={c}
              onClick={() => setFilterCoin(c)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterCoin === c
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {c === 'ALL' ? 'Tất cả' : `${COIN_ICONS[c]} ${c}`}
            </button>
          ))}
        </div>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-[50px_45px_36px_90px_70px_80px] text-xs text-gray-600 px-1">
        <span>Thời gian</span>
        <span>Token</span>
        <span>Chiều</span>
        <span className="text-right">Giá</span>
        <span className="text-right">Khối lượng</span>
        <span className="text-right">Giá trị</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-px max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
        {loading && !trades.length ? (
          <div className="flex items-center justify-center py-10 text-gray-600 text-sm gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Đang tải...
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-400/70 text-xs">{error}</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">Không có lệnh nào</div>
        ) : (
          displayed.map((t) => (
            <div
              key={`${t.id}-${t.time}`}
              className={`grid grid-cols-[50px_45px_36px_90px_70px_80px] items-center px-1 py-1 rounded hover:bg-white/5 transition-colors text-xs group ${
                t.value >= 100_000 ? 'bg-yellow-500/5' : ''
              }`}
            >
              {/* Time */}
              <span className="text-gray-500 font-mono">{fmtTime(t.time)}</span>

              {/* Coin */}
              <span className="text-gray-300 font-mono">
                {COIN_ICONS[t.coin] ?? ''} {t.coin}
              </span>

              {/* Side */}
              <span className={`font-semibold font-mono ${
                t.side === 'buy' ? 'text-green-400' : 'text-red-400'
              }`}>
                {t.side === 'buy' ? 'B' : 'S'}
              </span>

              {/* Price */}
              <span className={`text-right font-mono ${
                t.side === 'buy' ? 'text-green-400' : 'text-red-400'
              }`}>
                {t.price >= 1000
                  ? t.price.toLocaleString(undefined, { maximumFractionDigits: 1 })
                  : t.price.toFixed(2)}
              </span>

              {/* Size */}
              <span className="text-right text-gray-300 font-mono">
                {t.size >= 1 ? t.size.toFixed(3) : t.size.toFixed(5)}
              </span>

              {/* Value — highlight whale trades */}
              <span className={`text-right font-mono font-semibold ${
                t.value >= 100_000
                  ? 'text-yellow-400'
                  : t.value >= 10_000
                  ? 'text-gray-200'
                  : 'text-gray-500'
              }`}>
                {fmtUSD(t.value)}
                {t.value >= 100_000 && <span className="ml-0.5">🐋</span>}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
        <span>Live · cập nhật 5s · {displayed.length} lệnh</span>
        <a
          href="https://app.hyperliquid.xyz"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-gray-600 hover:text-violet-400 transition-colors"
        >
          hyperliquid.xyz ↗
        </a>
      </div>
    </div>
  )
}

// ── Combined panel ────────────────────────────────────────────────────────────

export default function HyperliquidPanel() {
  return (
    <div className="flex flex-col gap-4">
      {/* Section title */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-800" />
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0d0e12] border border-gray-800">
          <img
            src="https://app.hyperliquid.xyz/favicon.ico"
            alt=""
            className="w-4 h-4 rounded-sm"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <span className="text-gray-400 text-xs font-medium">Dữ liệu thực từ Hyperliquid</span>
        </div>
        <div className="flex-1 h-px bg-gray-800" />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Leaderboard />
        <RecentTrades />
      </div>
    </div>
  )
}
