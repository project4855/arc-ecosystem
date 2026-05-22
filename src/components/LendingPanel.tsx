// ── LendingPanel.tsx ──────────────────────────────────────────────────────────
// Arc Blueprint Lending — USDC/EURC supply & borrow with sub-second finality

import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useLendingContract } from '../hooks/useLendingContract'
import type { PoolAsset } from '../hooks/useLendingContract'
import { useWallet } from '../hooks/useWallet'
import { LENDING_ADDRESS } from '../config/contracts'

type ActionType = 'supply' | 'withdraw' | 'borrow' | 'repay'
type TabView    = 'supply' | 'borrow'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function HealthBar({ factor }: { factor: number }) {
  if (!isFinite(factor)) return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-extrabold text-emerald-600 font-mono">∞</span>
      <span className="text-[11px] text-emerald-600 font-medium">Safe</span>
    </div>
  )
  const pct   = Math.min(100, (factor / 3) * 100)
  const color = factor >= 2 ? '#10b981' : factor >= 1.5 ? '#f59e0b' : factor >= 1.1 ? '#f97316' : '#ef4444'
  const label = factor >= 2 ? 'Safe' : factor >= 1.5 ? 'Moderate' : factor >= 1.1 ? 'Risky' : '⚠ Danger'
  const labelColor = factor >= 2 ? 'text-emerald-600' : factor >= 1.5 ? 'text-amber-600' : factor >= 1.1 ? 'text-orange-600' : 'text-red-600'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-extrabold font-mono" style={{ color }}>{factor.toFixed(2)}</span>
        <span className={`text-[11px] font-semibold ${labelColor}`}>{label}</span>
      </div>
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

const COLLATERAL_FACTOR: Record<string, number> = { USDC: 90, EURC: 88 }

// ── Main Component ────────────────────────────────────────────────────────────

export default function LendingPanel() {
  const { isReady: isConnected } = useWallet()
  const {
    isDeployed, assets, healthFactor,
    totalSuppliedUSD, totalBorrowedUSD, netAPY,
    txHash, txError, txStep,
    executeWithApprove, executeDirectly, setTxError,
  } = useLendingContract()

  const [modal,   setModal]   = useState<{ type: ActionType; asset: PoolAsset } | null>(null)
  const [amount,  setAmount]  = useState('')
  const [tabView, setTabView] = useState<TabView>('supply')

  const openModal = (type: ActionType, asset: PoolAsset) => {
    setModal({ type, asset }); setAmount(''); setTxError(null)
  }
  const closeModal = () => { if (!isActing) setModal(null) }

  const handleConfirm = async () => {
    if (!modal || !amount || parseFloat(amount) <= 0) return
    if (modal.type === 'supply' || modal.type === 'repay') {
      await executeWithApprove(modal.type, modal.asset.symbol, amount)
    } else {
      await executeDirectly(modal.type, modal.asset.symbol, amount)
    }
  }

  const isActing = txStep === 'approving' || txStep === 'sending'
  const isDone   = txStep === 'done'
  const totalTVL = assets.reduce((s, a) => s + a.totalSupplied * a.priceUSD, 0)

  // ── Contract not deployed ─────────────────────────────────────────────────
  if (!isDeployed) {
    return (
      <div className="bg-white border border-amber-200 rounded-2xl shadow-sm p-8 text-center flex flex-col items-center gap-4">
        <span className="text-4xl">🏗️</span>
        <h3 className="text-slate-900 font-bold text-lg">Contract Not Deployed</h3>
        <p className="text-slate-500 text-sm max-w-md leading-relaxed">
          The <code className="text-violet-600">ArcLending.sol</code> smart contract needs to be deployed to Arc Testnet first.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 text-left w-full max-w-lg">
          <p className="text-slate-400 text-xs mb-2"># Deploy contract</p>
          <code className="text-emerald-600 text-sm block">cd contracts && npx hardhat run scripts/deployLending.ts --network arc_testnet</code>
        </div>
      </div>
    )
  }

  // ── Modal amount helpers ──────────────────────────────────────────────────
  const maxAmount = modal
    ? modal.type === 'supply'   ? undefined
    : modal.type === 'withdraw' ? modal.asset.userSupplied
    : modal.type === 'repay'    ? modal.asset.userBorrowed
    : modal.type === 'borrow'
      ? totalSuppliedUSD > 0
        ? (totalSuppliedUSD * (COLLATERAL_FACTOR[modal.asset.symbol] ?? 80) / 100 - totalBorrowedUSD) / modal.asset.priceUSD
        : 0
      : undefined
    : undefined

  const amountN       = parseFloat(amount) || 0
  const amountUSD     = amountN * (modal?.asset.priceUSD ?? 1)
  const newBorrowedUSD =
    modal?.type === 'borrow' ? totalBorrowedUSD + amountUSD :
    modal?.type === 'repay'  ? Math.max(0, totalBorrowedUSD - amountUSD) : totalBorrowedUSD
  const newSuppliedUSD =
    modal?.type === 'supply'   ? totalSuppliedUSD + amountUSD :
    modal?.type === 'withdraw' ? Math.max(0, totalSuppliedUSD - amountUSD) : totalSuppliedUSD
  const newHealth = newBorrowedUSD > 0
    ? (newSuppliedUSD * ((COLLATERAL_FACTOR[modal?.asset.symbol ?? 'USDC'] ?? 80) / 100)) / newBorrowedUSD
    : Infinity

  return (
    <div className="flex flex-col gap-5">

      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 px-6 py-5 shadow-lg">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/30 text-white text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
                Arc Blueprint · On-chain
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-emerald-100 text-[11px] font-semibold">
                $52.73B DeFi TVL
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">🏦 Lending & Borrowing</h1>
            <p className="text-emerald-100 text-sm mt-1">Supply USDC/EURC · Borrow against collateral · Sub-second finality · RWA-ready</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {[
                { icon: '⚡', text: 'Instant settlement' },
                { icon: '💵', text: 'USDC gas'           },
                { icon: '🔒', text: 'Deterministic'      },
                { icon: '🏗️', text: 'RWA support'        },
              ].map(f => (
                <span key={f.text} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs font-medium">
                  {f.icon} {f.text}
                </span>
              ))}
            </div>
            <a href="https://www.arc.io/blog/how-arc-supports-lending-and-borrowing-arc-blueprints"
              target="_blank" rel="noreferrer"
              className="text-emerald-100 text-[11px] hover:text-white underline underline-offset-2">
              Read Blueprint ↗
            </a>
          </div>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Supplied',  value: fmtUSD(totalTVL),          sub: 'Protocol TVL',         color: 'text-emerald-600' },
          { label: 'Your Supply',     value: fmtUSD(totalSuppliedUSD),   sub: 'Earning interest',     color: 'text-emerald-600' },
          { label: 'Your Borrow',     value: fmtUSD(totalBorrowedUSD),   sub: 'Outstanding debt',     color: 'text-red-500'     },
          { label: 'Net APY',         value: `${netAPY >= 0 ? '+' : ''}${netAPY.toFixed(2)}%`, sub: 'After borrow cost', color: netAPY >= 0 ? 'text-emerald-600' : 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <p className="text-slate-400 text-[11px] font-medium mb-1">{s.label}</p>
            <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-slate-400 text-[10px] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Health factor + positions (only when user has positions) ───────── */}
      {isConnected && (totalSuppliedUSD > 0 || totalBorrowedUSD > 0) && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <h3 className="text-slate-900 font-bold text-sm mb-4">📊 Your Position</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <p className="text-[11px] text-slate-400 mb-1">Health Factor</p>
              <HealthBar factor={healthFactor} />
              <p className="text-[10px] text-slate-400 mt-1">Liquidation at &lt; 1.0</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Collateral value</span>
                <span className="font-semibold text-slate-900">{fmtUSD(totalSuppliedUSD)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Outstanding debt</span>
                <span className="font-semibold text-red-500">{fmtUSD(totalBorrowedUSD)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
                <span className="text-slate-500">Available credit</span>
                <span className="font-semibold text-violet-600">
                  {fmtUSD(Math.max(0, totalSuppliedUSD * 0.8 - totalBorrowedUSD))}
                </span>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-2">LTV used</p>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                {(() => {
                  const ltv = totalSuppliedUSD > 0 ? (totalBorrowedUSD / totalSuppliedUSD) * 100 : 0
                  const barColor = ltv > 80 ? '#ef4444' : ltv > 60 ? '#f59e0b' : '#10b981'
                  return <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ltv)}%`, backgroundColor: barColor }} />
                })()}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {totalSuppliedUSD > 0 ? ((totalBorrowedUSD / totalSuppliedUSD) * 100).toFixed(1) : '0.0'}% LTV · Max 80%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Markets tabs ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

        {/* Tab header */}
        <div className="flex border-b border-slate-100">
          {(['supply', 'borrow'] as TabView[]).map(v => (
            <button
              key={v}
              onClick={() => setTabView(v)}
              className={`flex-1 py-3.5 text-sm font-semibold capitalize transition-colors ${
                tabView === v
                  ? v === 'supply'
                    ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/50'
                    : 'text-violet-600 border-b-2 border-violet-500 bg-violet-50/50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              {v === 'supply' ? '💰 Supply Markets' : '📤 Borrow Markets'}
            </button>
          ))}
        </div>

        {/* Column headers */}
        <div className={`grid px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-50 ${
          tabView === 'supply'
            ? 'grid-cols-[2fr_1fr_1fr_1fr_120px]'
            : 'grid-cols-[2fr_1fr_1fr_1fr_120px]'
        }`}>
          <span>Asset</span>
          <span className="text-center">{tabView === 'supply' ? 'Supply APY' : 'Borrow APY'}</span>
          <span className="text-center">Total {tabView === 'supply' ? 'Supply' : 'Borrow'}</span>
          <span className="text-center">{tabView === 'supply' ? 'Collateral' : 'Utilization'}</span>
          <span className="text-right">Action</span>
        </div>

        {/* Asset rows */}
        <div className="divide-y divide-slate-50">
          {assets.map((asset) => {
            const cf  = COLLATERAL_FACTOR[asset.symbol]
            const totalBorrowedAsset = asset.totalSupplied * (asset.utilizationPct / 100)
            return (
              <div
                key={asset.symbol}
                className={`grid px-5 py-4 items-center gap-3 hover:bg-slate-50/60 transition-colors ${
                  tabView === 'supply'
                    ? 'grid-cols-[2fr_1fr_1fr_1fr_120px]'
                    : 'grid-cols-[2fr_1fr_1fr_1fr_120px]'
                }`}
              >
                {/* Asset info */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0">
                    {asset.icon}
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold text-sm">{asset.symbol}</p>
                    <p className="text-slate-400 text-[11px]">${asset.priceUSD.toFixed(4)}</p>
                    {tabView === 'supply' && asset.userSupplied > 0 && (
                      <p className="text-emerald-600 text-[10px] font-semibold mt-0.5">
                        ✓ Supplied: {asset.userSupplied.toFixed(4)}
                      </p>
                    )}
                    {tabView === 'borrow' && asset.userBorrowed > 0 && (
                      <p className="text-amber-600 text-[10px] font-semibold mt-0.5">
                        ↑ Borrowed: {asset.userBorrowed.toFixed(4)}
                      </p>
                    )}
                  </div>
                </div>

                {/* APY */}
                <div className="text-center">
                  <span className={`text-base font-extrabold font-mono ${tabView === 'supply' ? 'text-emerald-600' : 'text-violet-600'}`}>
                    {tabView === 'supply' ? asset.supplyAPY.toFixed(2) : asset.borrowAPY.toFixed(2)}%
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">{tabView === 'supply' ? 'earn' : 'cost'}</p>
                </div>

                {/* Volume */}
                <div className="text-center">
                  <p className="text-slate-900 font-semibold text-sm">
                    {fmtUSD(tabView === 'supply' ? asset.totalSupplied * asset.priceUSD : totalBorrowedAsset * asset.priceUSD)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {tabView === 'supply' ? asset.totalSupplied.toFixed(0) : totalBorrowedAsset.toFixed(0)} {asset.symbol}
                  </p>
                </div>

                {/* Collateral / Utilization */}
                <div className="flex flex-col items-center gap-1">
                  {tabView === 'supply' ? (
                    cf ? (
                      <>
                        <span className="text-sm font-bold text-slate-900">{cf}%</span>
                        <span className="text-[10px] text-slate-400">LTV max</span>
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-100">
                          ✓ Collateral
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-400">No collateral</span>
                    )
                  ) : (
                    <>
                      <span className={`text-sm font-bold ${asset.utilizationPct > 80 ? 'text-red-500' : asset.utilizationPct > 60 ? 'text-amber-500' : 'text-slate-700'}`}>
                        {asset.utilizationPct.toFixed(1)}%
                      </span>
                      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, asset.utilizationPct)}%`,
                            backgroundColor: asset.utilizationPct > 80 ? '#ef4444' : asset.utilizationPct > 60 ? '#f59e0b' : '#8b5cf6',
                          }} />
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 justify-end">
                  {tabView === 'supply' ? (
                    <>
                      <button
                        onClick={() => openModal('supply', asset)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400 transition-colors shadow-sm"
                      >Supply</button>
                      {asset.userSupplied > 0 && (
                        <button
                          onClick={() => openModal('withdraw', asset)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors"
                        >Withdraw</button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openModal('borrow', asset)}
                        disabled={totalSuppliedUSD === 0}
                        title={totalSuppliedUSD === 0 ? 'Supply collateral first' : ''}
                        className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                      >Borrow</button>
                      {asset.userBorrowed > 0 && (
                        <button
                          onClick={() => openModal('repay', asset)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-400 transition-colors shadow-sm"
                        >Repay</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400">
          <span>⚡ Sub-second finality on Arc Testnet</span>
          <span>💵 Gas paid in USDC</span>
          <span>🔒 Deterministic liquidations</span>
          <a href={`https://testnet.arcscan.app/address/${LENDING_ADDRESS}`} target="_blank" rel="noreferrer"
            className="ml-auto text-violet-400 hover:text-violet-600 underline underline-offset-2">
            Contract ↗
          </a>
        </div>
      </div>

      {/* ── Connect prompt ─────────────────────────────────────────────────── */}
      {!isConnected && (
        <div className="flex flex-col items-center gap-3 py-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <p className="text-slate-600 font-semibold text-sm">Connect your wallet to start earning</p>
          <p className="text-slate-400 text-xs">Supply USDC or EURC to earn yield on Arc Testnet</p>
          <ConnectButton label="Connect Wallet" />
        </div>
      )}

      {/* ── How it works (only when no positions) ──────────────────────────── */}
      {(!isConnected || (totalSuppliedUSD === 0 && totalBorrowedUSD === 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { step: '01', icon: '💵', title: 'Supply Collateral', desc: 'Deposit USDC or EURC to earn supply APY and unlock borrowing power. Arc\'s sub-second finality means your deposit is instantly live and earning.' },
            { step: '02', icon: '🏦', title: 'Borrow Against It', desc: 'Borrow up to 80% LTV against your collateral. Rates adjust dynamically based on pool utilization. Supports intraday and high-frequency credit flows.' },
            { step: '03', icon: '⚡', title: 'Repay Anytime', desc: 'Repay at any time with no penalties. Liquidations on Arc are deterministic and instant — tighter margin management than probabilistic chains.' },
          ].map(s => (
            <div key={s.step} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-sm transition-all group">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-lg group-hover:bg-emerald-100 transition-colors">
                  {s.icon}
                </div>
                <span className="text-emerald-400 font-mono text-xs font-bold">{s.step}</span>
              </div>
              <h3 className="text-slate-900 font-bold text-sm mb-1.5">{s.title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Arc Blueprint: 4 Key Capabilities ─────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest mb-0.5">Arc Blueprint · Lending & Borrowing</p>
            <h2 className="text-lg font-extrabold text-slate-900">How Arc enables a new era of onchain credit</h2>
          </div>
          <a href="https://www.arc.io/blog/how-arc-supports-lending-and-borrowing-arc-blueprints"
            target="_blank" rel="noreferrer"
            className="hidden sm:flex items-center gap-1 text-emerald-600 text-xs font-semibold hover:text-emerald-700">
            Full Blueprint ↗
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            {
              icon: '💵',
              title: 'Stablecoin-Native Design',
              desc: 'Loans denominated in USDC or EURC — no token wrapping, no FX conversion friction. Predictable dollar-based gas. Full auditability from origination through liquidation.',
              tags: ['USDC loans', 'EURC loans', 'No wrapping'],
              color: 'bg-emerald-50 border-emerald-200',
              iconBg: 'bg-emerald-100 text-emerald-700',
            },
            {
              icon: '⚡',
              title: 'Deterministic Finality',
              desc: 'Sub-second confirmation enables instant rebalancing, tighter liquidation mechanisms, reduced slippage on margin calls, and intraday/high-frequency credit flows.',
              tags: ['~780ms finality', 'Instant liquidations', 'Intraday credit'],
              color: 'bg-violet-50 border-violet-200',
              iconBg: 'bg-violet-100 text-violet-700',
            },
            {
              icon: '🔗',
              title: 'Programmable Credit Primitives',
              desc: 'Smart contracts define loan terms onchain: automated credit lines, dynamic collateralization, tokenized loan pools, multi-party structures, and offchain data integration.',
              tags: ['Credit lines', 'Tokenized pools', 'Multi-party'],
              color: 'bg-blue-50 border-blue-200',
              iconBg: 'bg-blue-100 text-blue-700',
            },
            {
              icon: '🏗️',
              title: 'Tokenized Real-World Credit',
              desc: 'RWA collateral support: invoices, receivables, trade finance. Embedded transfer restrictions, investor eligibility, KYC/AML compliance, selective disclosure.',
              tags: ['Invoices', 'Trade finance', 'KYC/AML'],
              color: 'bg-amber-50 border-amber-200',
              iconBg: 'bg-amber-100 text-amber-700',
            },
          ].map(c => (
            <div key={c.title} className={`${c.color} border rounded-2xl p-4 flex flex-col gap-2`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${c.iconBg}`}>{c.icon}</div>
              <h3 className="text-slate-900 font-bold text-sm leading-snug">{c.title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed flex-1">{c.desc}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {c.tags.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500 text-[9px] font-medium">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Comparison: Traditional vs Arc ────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-slate-900 font-bold text-sm">Traditional Finance vs. Arc Infrastructure</h3>
          <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">From the Blueprint</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">Challenge</th>
                <th className="px-4 py-3 text-left font-bold text-red-400 uppercase tracking-wider">❌ Traditional / Early DeFi</th>
                <th className="px-4 py-3 text-left font-bold text-emerald-600 uppercase tracking-wider">✅ Arc Solution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { challenge: 'Settlement Speed',     old: 'Days-long T+2 / T+3 settlement',              arc: 'Sub-second deterministic finality'            },
                { challenge: 'Gas Model',            old: 'Volatile native tokens (ETH)',                 arc: 'Predictable USDC-denominated fees'            },
                { challenge: 'Liquidations',         old: 'Probabilistic, slow, imprecise',               arc: 'Deterministic, instant, tighter margins'      },
                { challenge: 'Collateral Types',     old: 'Crypto-native only',                          arc: 'Crypto + RWA: invoices, receivables, trade finance' },
                { challenge: 'Cross-Currency',       old: 'Complex FX workflows, intermediaries',        arc: 'Atomic USDC ↔ EURC in single transaction'    },
                { challenge: 'Institutional Access', old: 'Opaque processes, jurisdiction-bound',         arc: 'KYC/AML integration, selective disclosure'   },
                { challenge: 'Credit Primitives',    old: 'Rigid loan structures',                       arc: 'Programmable: auto credit lines, tokenized pools' },
              ].map(row => (
                <tr key={row.challenge} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-700">{row.challenge}</td>
                  <td className="px-4 py-3 text-red-600">{row.old}</td>
                  <td className="px-4 py-3 text-emerald-700 font-medium">{row.arc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Use case showcase ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          {
            icon: '🏛️',
            title: 'Institutional Loan Origination',
            desc: 'Banks and asset managers originate loans directly onchain with automated compliance, instant settlement, and full audit trail from origination through repayment.',
            tag: 'Use Case',
            color: 'border-slate-200',
          },
          {
            icon: '📊',
            title: 'Undercollateralized DeFi Credit',
            desc: 'Credit protocols built beyond over-collateralization — cash-flow-based lending, identity-linked credit limits, hybrid models expanding access to 1B+ unbanked adults.',
            tag: 'Use Case',
            color: 'border-slate-200',
          },
          {
            icon: '💱',
            title: 'Stablecoin-Native Money Markets',
            desc: 'USDC and EURC money markets with atomic cross-currency flows. No wrapping, no bridge risk. Supply one stablecoin, borrow another in a single deterministic transaction.',
            tag: 'Use Case',
            color: 'border-emerald-200',
          },
          {
            icon: '🌍',
            title: 'Real-World Asset (RWA) Lending',
            desc: 'Tokenize invoices, receivables, and trade finance instruments as collateral. Embedded KYC/AML, investor eligibility controls, and selective disclosure for institutional compliance.',
            tag: 'Blueprint',
            color: 'border-amber-200',
          },
        ].map(u => (
          <div key={u.title} className={`bg-white border ${u.color} rounded-2xl p-4 hover:shadow-sm hover:border-emerald-300 transition-all flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <span className="text-2xl">{u.icon}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-100 text-emerald-600 font-semibold">{u.tag}</span>
            </div>
            <h3 className="text-slate-900 font-bold text-sm leading-snug">{u.title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed flex-1">{u.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Action Modal ───────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeModal}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-slate-900 font-extrabold text-xl capitalize">{modal.type}</h3>
                <p className="text-slate-400 text-sm mt-0.5">
                  {modal.asset.icon} {modal.asset.symbol} · Arc Testnet
                </p>
              </div>
              {!isActing && (
                <button onClick={closeModal} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">✕</button>
              )}
            </div>

            {/* APY row */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                <p className="text-[10px] text-emerald-600 font-semibold uppercase mb-0.5">Supply APY</p>
                <p className="text-emerald-700 font-extrabold text-lg">{modal.asset.supplyAPY.toFixed(2)}%</p>
              </div>
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
                <p className="text-[10px] text-violet-600 font-semibold uppercase mb-0.5">Borrow APY</p>
                <p className="text-violet-700 font-extrabold text-lg">{modal.asset.borrowAPY.toFixed(2)}%</p>
              </div>
            </div>

            {/* Amount input */}
            <div className="mb-1">
              <div className="flex justify-between mb-1">
                <label className="text-slate-500 text-xs font-medium">Amount</label>
                {maxAmount !== undefined && maxAmount > 0 && (
                  <button
                    onClick={() => setAmount(maxAmount.toFixed(6))}
                    className="text-violet-600 text-xs font-semibold hover:text-violet-700"
                  >
                    Max: {maxAmount.toFixed(4)} {modal.asset.symbol}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 focus-within:border-violet-400 rounded-xl px-4 py-3 transition-colors">
                <span className="text-xl">{modal.asset.icon}</span>
                <input
                  type="number" min="0" value={amount} autoFocus
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isActing}
                  className="flex-1 bg-transparent text-slate-900 text-xl font-bold outline-none placeholder-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-slate-400 text-sm font-semibold shrink-0">{modal.asset.symbol}</span>
              </div>
              {amountN > 0 && (
                <p className="text-slate-400 text-[11px] mt-1 pl-1">≈ {fmtUSD(amountUSD)}</p>
              )}
            </div>

            {/* Health factor preview */}
            {amountN > 0 && (modal.type === 'borrow' || modal.type === 'withdraw' || modal.type === 'supply') && (
              <div className="mt-3 mb-3 bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between text-sm">
                <span className="text-slate-500">New health factor</span>
                <span className={`font-extrabold font-mono ${
                  !isFinite(newHealth) ? 'text-emerald-600' :
                  newHealth >= 2 ? 'text-emerald-600' :
                  newHealth >= 1.5 ? 'text-amber-600' :
                  newHealth >= 1 ? 'text-orange-600' : 'text-red-600'
                }`}>
                  {isFinite(newHealth) ? newHealth.toFixed(2) : '∞'}
                </span>
              </div>
            )}

            {/* Borrow warning */}
            {modal.type === 'borrow' && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex gap-2">
                <span>⚠️</span>
                <span>Keep health factor above 1.0 to avoid liquidation. Arc's deterministic finality means liquidations are instant.</span>
              </div>
            )}

            {/* Tx status */}
            {(isActing || isDone) && (
              <div className={`mb-3 p-3 rounded-xl text-sm text-center font-semibold border ${
                isDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-violet-50 border-violet-200 text-violet-700'
              }`}>
                {isDone ? '✅ Transaction confirmed!' : txStep === 'approving' ? '⏳ Approving USDC…' : '⏳ Sending transaction…'}
                {txHash && (
                  <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer"
                    className="block text-xs opacity-70 hover:opacity-100 mt-1 underline">
                    View on ArcScan ↗
                  </a>
                )}
              </div>
            )}

            {/* Error */}
            {txError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{txError}</div>
            )}

            {/* Buttons */}
            {!isDone ? (
              <div className="flex gap-2 mt-2">
                <button onClick={closeModal} disabled={isActing}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 text-sm font-semibold hover:bg-slate-200 transition-colors disabled:opacity-40">
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!isConnected || amountN <= 0 || isActing || (maxAmount !== undefined && amountN > maxAmount)}
                  className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed capitalize ${
                    modal.type === 'supply'   ? 'bg-emerald-500 hover:bg-emerald-400' :
                    modal.type === 'withdraw' ? 'bg-slate-600 hover:bg-slate-500'     :
                    modal.type === 'borrow'   ? 'bg-violet-600 hover:bg-violet-500'   :
                                                'bg-amber-500 hover:bg-amber-400'
                  }`}
                >
                  {isActing
                    ? txStep === 'approving' ? 'Approving…' : 'Sending…'
                    : `${modal.type} ${amountN > 0 ? modal.asset.symbol : ''}`}
                </button>
              </div>
            ) : (
              <button onClick={closeModal}
                className="w-full py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 transition-colors mt-2">
                Done ✓
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
