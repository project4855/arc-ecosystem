import { useMarketData } from '../hooks/useMarketData'

interface Props {
  pair: string
  basePrice?: number
}

function fmt(p: number) {
  if (p >= 1000) return p.toFixed(2)
  if (p >= 1)    return p.toFixed(4)
  return p.toFixed(6)
}

function fmtAmt(n: number) {
  if (n >= 10000) return n.toFixed(0)
  if (n >= 100)   return n.toFixed(1)
  if (n >= 1)     return n.toFixed(2)
  return n.toFixed(4)
}

export default function OrderBook({ pair, basePrice }: Props) {
  const { asks, bids, lastPrice, priceChange } = useMarketData(pair, basePrice)
  const [, quote] = pair.split('/')
  const isUp      = priceChange >= 0
  const maxTotal  = Math.max(...bids.map(b => b.total), ...asks.map(a => a.total), 1)

  const rowCount = 12

  return (
    <div className="flex flex-col h-full bg-white select-none">

      {/* ── Title ── */}
      <div className="px-3 py-2 border-b border-[#EAECEF] shrink-0">
        <p className="text-[13px] font-semibold text-[#1E2329]">Order Book</p>
      </div>

      {/* ── Column headers ── */}
      <div className="grid grid-cols-3 px-3 py-1 border-b border-[#EAECEF] shrink-0">
        <span className="text-[11px] text-[#707A8A]">Price({quote})</span>
        <span className="text-[11px] text-[#707A8A] text-right">Amount</span>
        <span className="text-[11px] text-[#707A8A] text-right">Total</span>
      </div>

      {/* ── Asks (sell orders) — lowest ask nearest mid ── */}
      <div className="flex flex-col justify-end overflow-hidden shrink-0" style={{ flex: '1 1 0' }}>
        {[...asks].slice(0, rowCount).reverse().map((ask, i) => (
          <div key={i} className="relative grid grid-cols-3 px-3 hover:bg-[#F5F5F5] cursor-default" style={{ lineHeight: '20px' }}>
            <div
              className="absolute inset-y-0 right-0 bg-[#F6465D]/10 pointer-events-none"
              style={{ width: `${(ask.total / maxTotal) * 100}%` }}
            />
            <span className="text-[12px] text-[#F6465D] font-mono relative z-10">{fmt(ask.price)}</span>
            <span className="text-[12px] text-[#1E2329] font-mono text-right relative z-10">{fmtAmt(ask.amount)}</span>
            <span className="text-[12px] text-[#707A8A] font-mono text-right relative z-10">{fmtAmt(ask.total)}</span>
          </div>
        ))}
      </div>

      {/* ── Mid price ── */}
      <div className={`flex items-center gap-2.5 px-3 py-1.5 border-y border-[#EAECEF] shrink-0 ${isUp ? 'bg-[#ECFDF5]' : 'bg-[#FFF0F0]'}`}>
        <span className={`text-[15px] font-bold font-mono ${isUp ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
          {fmt(lastPrice)}
        </span>
        <span className={`text-[11px] font-mono ${isUp ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
          {isUp ? '▲' : '▼'} {Math.abs(priceChange).toFixed(4)}%
        </span>
      </div>

      {/* ── Bids (buy orders) ── */}
      <div className="overflow-hidden shrink-0" style={{ flex: '1 1 0' }}>
        {bids.slice(0, rowCount).map((bid, i) => (
          <div key={i} className="relative grid grid-cols-3 px-3 hover:bg-[#F5F5F5] cursor-default" style={{ lineHeight: '20px' }}>
            <div
              className="absolute inset-y-0 right-0 bg-[#0ECB81]/10 pointer-events-none"
              style={{ width: `${(bid.total / maxTotal) * 100}%` }}
            />
            <span className="text-[12px] text-[#0ECB81] font-mono relative z-10">{fmt(bid.price)}</span>
            <span className="text-[12px] text-[#1E2329] font-mono text-right relative z-10">{fmtAmt(bid.amount)}</span>
            <span className="text-[12px] text-[#707A8A] font-mono text-right relative z-10">{fmtAmt(bid.total)}</span>
          </div>
        ))}
      </div>

      {/* ── Spread ── */}
      <div className="flex justify-between items-center px-3 py-1.5 border-t border-[#EAECEF] shrink-0">
        <span className="text-[11px] text-[#707A8A]">Spread</span>
        <span className="text-[11px] font-mono text-[#1E2329]">
          {asks[0] && bids[0] ? fmt(asks[0].price - bids[0].price) : '—'}
        </span>
      </div>

    </div>
  )
}
