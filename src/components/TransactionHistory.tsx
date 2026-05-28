import { useState } from 'react'
import { useTransactions } from '../hooks/useTransactions'
import type { TxRecord } from '../hooks/useTransactions'

interface Props { pair: string; myTxs?: TxRecord[] }
type Tab = 'market' | 'mine'

export default function TransactionHistory({ pair, myTxs = [] }: Props) {
  const { txs } = useTransactions(pair, myTxs)
  const [tab, setTab] = useState<Tab>('market')
  const displayed = tab === 'mine' ? myTxs : txs

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Header ── */}
      <div className="flex items-center border-b border-[#EAECEF] shrink-0">
        {(['market', 'mine'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'border-b-2 transition-colors font-medium',
              tab === t
                ? 'border-[#F0B90B] text-[#1E2329] font-semibold'
                : 'border-transparent text-[#707A8A] hover:text-[#1E2329]',
            ].join(' ')}
            style={{ padding: '8px 20px', fontSize: 13, flexShrink: 0 }}
          >
            {t === 'market' ? 'Market Trades' : 'My Trades'}
          </button>
        ))}
        <div className="ml-auto pr-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-[#0ECB81] rounded-full animate-pulse" />
          <span className="text-[11px] text-[#707A8A]">{displayed.length} trades</span>
        </div>
      </div>

      {/* ── Column labels ── */}
      <div className="grid grid-cols-4 px-3 py-1.5 border-b border-[#EAECEF] shrink-0">
        <span className="text-[11px] text-[#707A8A]">Time</span>
        <span className="text-[11px] text-[#707A8A] text-right">Price</span>
        <span className="text-[11px] text-[#707A8A] text-right">Amount</span>
        <span className="text-[11px] text-[#707A8A] text-right">Wallet</span>
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {displayed.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[12px] text-[#B7BDC6]">
            {tab === 'mine' ? 'No trades yet' : 'Loading…'}
          </div>
        ) : (
          displayed.map(tx => (
            <div
              key={tx.id}
              className={`grid grid-cols-4 px-3 hover:bg-[#F5F5F5] group transition-colors ${
                tx.status === 'pending' ? 'opacity-60' : ''
              }`}
              style={{ lineHeight: '22px' }}
            >
              <span className="text-[11px] text-[#707A8A] font-mono">{tx.time}</span>
              <span className={`text-[12px] font-mono text-right ${
                tx.type === 'buy' ? 'text-[#0ECB81]' : 'text-[#F6465D]'
              }`}>
                {tx.price >= 1000 ? tx.price.toFixed(2) : tx.price.toFixed(4)}
              </span>
              <span className="text-[12px] font-mono text-[#1E2329] text-right">
                {tx.fromAmount.toFixed(2)}
              </span>
              <div className="flex items-center justify-end gap-1">
                <span className="text-[11px] font-mono text-[#707A8A] truncate">{tx.wallet}</span>
                {tx.txHash && (
                  <a href={`https://testnet.arcscan.app/tx/${tx.txHash}`}
                    target="_blank" rel="noreferrer"
                    className="opacity-0 group-hover:opacity-100 text-[#F0B90B] text-[10px] transition-opacity shrink-0">
                    ↗
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
