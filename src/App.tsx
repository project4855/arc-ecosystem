import { useState, useCallback } from 'react'
import Navbar from './components/Navbar'
import SwapCard, { type SwapRecord } from './components/SwapCard'
import StatsBar from './components/StatsBar'
import NetworkBadge from './components/NetworkBadge'
import OrderBook from './components/OrderBook'
import PriceChart from './components/PriceChart'
import TransactionHistory from './components/TransactionHistory'
import LendingPanel from './components/LendingPanel'
import HyperliquidPanel from './components/HyperliquidPanel'
import AirdropPanel from './components/AirdropPanel'
import BridgePanel from './components/BridgePanel'

const PAIRS = ['USDC/EURC', 'ETH/USDC', 'SOL/USDC', 'cirBTC/USDC', 'USDC/cirBTC', 'EURC/cirBTC'] as const
type Pair = typeof PAIRS[number]
type AppTab = 'trade' | 'bridge' | 'lending' | 'traders' | 'airdrops'

export default function App() {
  const [tab, setTab] = useState<AppTab>('trade')
  const [pair, setPair] = useState<Pair>('USDC/EURC')
  const [fromToken, toToken] = pair.split('/') as [string, string]
  const [myTxs, setMyTxs] = useState<SwapRecord[]>([])
  const handleSwapComplete = useCallback((tx: SwapRecord) => {
    setMyTxs((prev) => [tx, ...prev].slice(0, 50))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col px-4 pt-6 pb-16 gap-6 max-w-[1400px] mx-auto w-full">

        {/* Hero */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium mb-3">
            <span className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-pulse" />
            Live on Arc Testnet
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            DeFi on{' '}
            <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              Arc Network
            </span>
          </h1>
          <p className="mt-2 text-slate-500 text-sm sm:text-base">
            Sub-second finality · Gas fees in USDC · Circle App Kit
          </p>
        </div>

        <NetworkBadge />

        {/* ── Tab navigation ── */}
        <div className="flex justify-center">
          <div className="flex bg-white border border-slate-200 shadow-sm rounded-2xl p-1.5 gap-2">
            {([
              { key: 'trade',    label: '📊 Trade' },
              { key: 'bridge',   label: '🌉 Bridge' },
              { key: 'lending',  label: '🏦 Lending' },
              { key: 'traders',  label: '🏆 Traders' },
              { key: 'airdrops', label: '🪂 Airdrop' },
            ] as { key: AppTab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-8 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  tab === key
                    ? 'bg-violet-600 text-white shadow-lg'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ══ TRADE TAB ══ */}
        {tab === 'trade' && (
          <>
            {/* Pair selector */}
            <div className="flex justify-center gap-2 flex-wrap">
              {PAIRS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPair(p)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    pair === p
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Faucet banner */}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 w-full max-w-xl mx-auto px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-100 transition-all group"
            >
              <span className="text-2xl">💧</span>
              <div className="flex-1 text-left">
                <p className="text-emerald-700 font-semibold text-sm">Get Free Testnet USDC</p>
                <p className="text-emerald-600/70 text-xs mt-0.5">faucet.circle.com → select Arc Testnet</p>
              </div>
              <span className="text-emerald-600 text-sm group-hover:translate-x-0.5 transition-transform">→</span>
            </a>

            {/* Trading layout */}
            <div id="swap" className="grid grid-cols-1 xl:grid-cols-[1fr_420px_280px] gap-4">
              <div className="flex flex-col gap-4">
                <PriceChart pair={pair} />
                <TransactionHistory pair={pair} myTxs={myTxs} />
              </div>
              <div>
                <SwapCard fromTokenProp={fromToken} toTokenProp={toToken} onSwapComplete={handleSwapComplete} />
              </div>
              <div>
                <OrderBook pair={pair} />
              </div>
            </div>
          </>
        )}

        {/* ══ BRIDGE TAB ══ */}
        {tab === 'bridge' && (
          <>
            <div className="text-center -mt-2 mb-2">
              <p className="text-slate-500 text-sm">
                Bridge USDC từ các chain về Arc Testnet · Powered by Circle CCTP
              </p>
            </div>
            <BridgePanel />
          </>
        )}

        {/* ══ LENDING TAB ══ */}
        {tab === 'lending' && (
          <>
            <div className="text-center -mt-2 mb-2">
              <p className="text-slate-500 text-sm">
                Supply assets to earn yield · Borrow against your collateral
              </p>
            </div>
            <LendingPanel />
          </>
        )}

        {/* ══ TRADERS TAB ══ */}
        {tab === 'traders' && (
          <>
            <div className="text-center -mt-2 mb-2">
              <p className="text-slate-500 text-sm">
                Dữ liệu thực từ Hyperliquid · Cập nhật liên tục
              </p>
            </div>
            <HyperliquidPanel />
          </>
        )}

        {/* ══ AIRDROPS TAB ══ */}
        {tab === 'airdrops' && (
          <>
            <div className="text-center -mt-2 mb-2">
              <p className="text-slate-500 text-sm">
                Dự án tiềm năng airdrop · Vốn huy động · Cách tham gia
              </p>
            </div>
            <AirdropPanel />
          </>
        )}

        {/* Stats bar */}
        <StatsBar />

        {/* How it works */}
        <div className="w-full max-w-3xl mx-auto">
          <h2 className="text-center text-slate-900 font-semibold text-xl mb-5">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: '01', title: 'Connect Wallet',    desc: 'Connect MetaMask or any EVM wallet. Arc Testnet is added automatically.' },
              { step: '02', title: 'Get Testnet USDC',  desc: 'Visit the Circle faucet to get free USDC on Arc Testnet for testing.' },
              { step: '03', title: 'Trade or Lend',     desc: 'Swap tokens instantly or supply assets to earn yield and borrow against collateral.' },
            ].map((item) => (
              <div key={item.step} className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 hover:border-violet-300 transition-colors">
                <div className="text-violet-600 font-mono text-xs font-bold mb-3">{item.step}</div>
                <h3 className="text-slate-900 font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 py-6 px-4 text-center text-xs text-slate-400">
        Built on{' '}
        <a href="https://arc.network" target="_blank" rel="noreferrer" className="text-violet-500 hover:text-violet-400">Arc Network</a>
        {' '}· Powered by{' '}
        <a href="https://docs.arc.io/app-kit" target="_blank" rel="noreferrer" className="text-violet-500 hover:text-violet-400">Circle App Kit</a>
        {' '}· For testnet use only
      </footer>
    </div>
  )
}
