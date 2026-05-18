import { useState } from 'react'
import { useTransactions } from '../hooks/useTransactions'
import type { TxRecord } from '../hooks/useTransactions'

interface Props {
  pair: string
  myTxs?: TxRecord[]
}

type Tab = 'market' | 'mine'

export default function TransactionHistory({ pair, myTxs = [] }: Props) {
  const { txs } = useTransactions(pair, myTxs)
  const [tab, setTab] = useState<Tab>('market')

  const displayed = tab === 'mine' ? myTxs : txs

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-slate-900 font-semibold text-sm">Trades</h3>
        <div className="flex gap-1">
          {(['market', 'mine'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                tab === t
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:text-slate-900'
              }`}
            >
              {t === 'market' ? 'Market' : 'My Trades'}
            </button>
          ))}
        </div>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-4 text-xs text-slate-400 bg-slate-50 px-1 py-1 rounded-lg">
        <span>Time</span>
        <span className="text-center">Price</span>
        <span className="text-center">Amount</span>
        <span className="text-right">Wallet</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-px max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300">
        {displayed.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            {tab === 'mine' ? 'No trades yet — swap something!' : 'Loading...'}
          </div>
        ) : (
          displayed.map((tx) => (
            <div
              key={tx.id}
              className={`grid grid-cols-4 text-xs px-1 py-1 rounded hover:bg-slate-50 border-b border-slate-100 transition-colors group ${
                tx.status === 'pending' ? 'opacity-60' : ''
              }`}
            >
              <span className="text-slate-400 font-mono">{tx.time}</span>
              <span className={`text-center font-mono font-medium ${
                tx.type === 'buy' ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {tx.price.toFixed(4)}
              </span>
              <span className="text-slate-700 text-center font-mono">{tx.fromAmount.toFixed(2)}</span>
              <div className="flex items-center justify-end gap-1">
                <span className="text-slate-500 font-mono">{tx.wallet}</span>
                {tx.txHash && (
                  <a
                    href={`https://testnet.arcscan.app/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="opacity-0 group-hover:opacity-100 text-violet-600 transition-opacity"
                    title="View on ArcScan"
                  >
                    ↗
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        Live · {displayed.length} trades
      </div>
    </div>
  )
}
