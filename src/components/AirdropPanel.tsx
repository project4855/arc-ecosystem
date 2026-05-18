// ── AirdropPanel.tsx ──────────────────────────────────────────────────────────
// Lists projects WITHOUT a token or airdrop yet
// Dữ liệu xác minh từ X & nguồn tin. Updated daily.

import { useState, useEffect } from 'react'
import airdropData from '../data/airdrops.json'

type AirdropTab = 'airdrops' | 'yields' | 'external' | 'funding'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Step {
  action: string
  detail: string
}

interface AirdropProject {
  id:        string
  name:      string
  logo:      string
  category:  string
  raised:    string
  investors: string
  status:    string
  prob:      string
  tge?:      string
  hasToken:  boolean
  xSearch:   string
  desc:      string
  steps:     Step[]
  links: {
    site:     string
    twitter?: string
    app?:     string
  }
}

// ── External data types ────────────────────────────────────────────────────────

interface YieldPool {
  pool:       string
  chain:      string
  project:    string
  symbol:     string
  tvlUsd:     number
  apy:        number
  apyBase:    number | null
  apyReward:  number | null
  stablecoin: boolean
  ilRisk:     string
  exposure:   string
  fetchedAt:  string
}

interface ExternalAirdrop {
  id:          string
  name:        string
  logo:        string | null
  chain:       string | null
  description: string
  totalValue:  string | null
  endDate:     string | null
  link:        string | null
  type:        string
  fetchedAt:   string
}

interface AlertItem {
  title:       string
  link:        string
  pubDate:     string
  description: string
  fetchedAt:   string
}

interface FundingRound {
  id:        string
  coinName:  string
  coinKey:   string | null
  symbol:    string | null
  logo:      string | null
  amount:    number | null
  amountUsd: number | null
  stage:     string | null
  date:      string | null
  investors: string[]
  category:  string | null
  isTraded:  boolean
  fetchedAt: string
}

// ── Data từ JSON (cập nhật tự động hàng ngày) ────────────────────────────────

const PROJECTS     = airdropData.projects as AirdropProject[]
const LAST_UPDATED = airdropData.lastUpdated
const DATA_SOURCE  = airdropData.source
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GRADUATED    = (airdropData as any).graduated as {
  id: string; name: string; logo: string; detectedAt: string; confidence: string
}[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UPDATE_LOG   = (airdropData as any).updateLog as {
  graduatedThisRun: string[]; checkedProjects: number; runAt: string; xApiUsed: boolean;
  externalFetchCounts?: { defiLlama: number; dappRadar: number; airdropAlert: number; cryptorank: number }
} | undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YIELDS            = (airdropData as any).yields            as YieldPool[]      ?? []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EXTERNAL_AIRDROPS = (airdropData as any).externalAirdrops  as ExternalAirdrop[] ?? []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALERT_FEED        = (airdropData as any).airdropAlertFeed  as AlertItem[]       ?? []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FUNDING_ROUNDS    = (airdropData as any).cryptorankFunding  as FundingRound[]   ?? []

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'L1':       'bg-violet-50 text-violet-700 border-violet-200',
  'L2':       'bg-blue-50 text-blue-700 border-blue-200',
  'DeFi':     'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Infra':    'bg-orange-50 text-orange-700 border-orange-200',
  'Gaming':   'bg-pink-50 text-pink-700 border-pink-200',
  'BTC Layer':'bg-amber-50 text-amber-700 border-amber-200',
}

const PROB_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string; bar: string }> = {
  'Rất cao':    { label: 'Very High', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', bar: 'from-emerald-500 to-green-400' },
  'Cao':        { label: 'High',      color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', bar: 'from-green-500 to-teal-400'   },
  'Trung bình': { label: 'Medium',    color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-500',   bar: 'from-yellow-500 to-amber-400'  },
}

const PROB_LABEL = (prob: string) => PROB_CONFIG[prob]?.label ?? prob

const STATUS_COLORS: Record<string, string> = {
  'Testnet':      'text-blue-600 bg-blue-50 border-blue-200',
  'Mainnet Beta': 'text-emerald-600 bg-emerald-50 border-emerald-200',
  'Pre-launch':   'text-slate-500 bg-slate-100 border-slate-200',
  'Points Live':  'text-purple-600 bg-purple-50 border-purple-200',
}

const ALL_CATEGORIES = ['All', 'L1', 'L2', 'Infra', 'DeFi', 'BTC Layer', 'Gaming'] as const

// ── TGE Countdown ─────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function parseTGEDate(tge: string): Date | null {
  if (!tge) return null
  const lower = tge.toLowerCase()
  // Too vague
  if (lower === '2026' || lower === '2025' || lower === '2027') return null
  if (lower.startsWith('tbd') || lower.startsWith('mainnet 20')) return null

  // "July–Sept 2026", "July 2026", "July-Sept 2026" — take first month
  const mMatch = lower.match(/([a-z]{3,})[^a-z0-9]*(\d{4})/)
  if (mMatch) {
    const month = MONTH_MAP[mMatch[1]]
    const year  = parseInt(mMatch[2])
    if (month !== undefined && !isNaN(year)) return new Date(year, month, 1)
  }

  // "Q1 2026", "Q3 2026"
  const qMatch = lower.match(/q([1-4])[^0-9]*(\d{4})/)
  if (qMatch) {
    const q    = parseInt(qMatch[1])
    const year = parseInt(qMatch[2])
    return new Date(year, (q - 1) * 3, 1)
  }

  return null
}

function CountdownBadge({ tge }: { tge: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const target = parseTGEDate(tge)

  if (!target) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span>🗓</span>
        <span className="text-slate-500">Expected TGE:</span>
        <span className="text-amber-600 font-semibold">{tge}</span>
      </div>
    )
  }

  const diff  = target.getTime() - now
  const days  = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)

  if (diff <= 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        <span>🚨</span>
        <span className="text-slate-500">TGE:</span>
        <span className="text-orange-600 font-bold animate-pulse">{tge} — may have launched!</span>
      </div>
    )
  }

  let countdown: React.ReactNode
  if (days <= 30) {
    countdown = (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 font-bold animate-pulse">
        ⏰ {days}d {hours}h left!
      </span>
    )
  } else if (days <= 90) {
    countdown = (
      <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600 font-semibold">
        📅 ~{days} days left
      </span>
    )
  } else {
    countdown = (
      <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 font-medium">
        📅 ~{Math.ceil(days / 30)} months left
      </span>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs flex-wrap">
      <span>🗓</span>
      <span className="text-slate-500">TGE:</span>
      <span className="text-amber-600">{tge}</span>
      <span className="text-gray-700">·</span>
      {countdown}
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ p }: { p: AirdropProject }) {
  const [expanded, setExpanded] = useState(false)
  const probCfg = PROB_CONFIG[p.prob] ?? PROB_CONFIG['Trung bình']
  const catColor = CATEGORY_COLORS[p.category] ?? 'bg-gray-500/15 text-gray-300 border-gray-500/30'
  const statusColor = STATUS_COLORS[p.status] ?? 'text-gray-400 bg-gray-500/10 border-gray-500/20'

  const xUrl = `https://x.com/search?q=${encodeURIComponent(p.xSearch)}&f=live`

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all flex flex-col shadow-sm">

      {/* Accent bar */}
      <div className={`h-0.5 bg-gradient-to-r ${probCfg.bar}`} />

      <div className="p-4 flex flex-col gap-3 flex-1">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="text-2xl w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 shrink-0">
              {p.logo}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-slate-900 font-bold text-sm">{p.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${catColor}`}>
                  {p.category}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
                  {p.status}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 font-medium">
                  No token yet
                </span>
              </div>
            </div>
          </div>

          {/* Prob badge */}
          <div className={`shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg border ${probCfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${probCfg.dot} animate-pulse`} />
            <span className={`text-xs font-bold ${probCfg.color}`}>{PROB_LABEL(p.prob)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-xl p-2.5">
            <div className="text-slate-400 text-[10px] mb-0.5">💰 Raised</div>
            <div className="text-slate-900 font-bold text-sm">{p.raised}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5">
            <div className="text-slate-400 text-[10px] mb-0.5">🏦 Investors</div>
            <div className="text-slate-600 text-xs font-medium leading-tight">{p.investors}</div>
          </div>
        </div>

        {/* Description */}
        <p className="text-slate-500 text-xs leading-relaxed">{p.desc}</p>

        {/* TGE với countdown */}
        {p.tge && <CountdownBadge tge={p.tge} />}

        {/* X verification link */}
        <a
          href={xUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-sky-600 transition-colors"
        >
          <span className="font-bold">𝕏</span>
          <span>Latest updates on X →</span>
        </a>
      </div>

      {/* Steps accordion */}
      <div className="border-t border-slate-100">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all"
        >
          <div className="flex items-center gap-2">
            <span>📋</span>
            <span>How to qualify ({p.steps.length} bước)</span>
          </div>
          <span className={`transition-transform duration-200 text-slate-400 ${expanded ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {expanded && (
          <div className="px-4 pb-4 flex flex-col gap-2.5 bg-slate-50/50">
            {p.steps.map((s, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <div className="text-slate-900 text-xs font-semibold">{s.action}</div>
                  <div className="text-slate-500 text-xs mt-0.5 leading-relaxed">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer links */}
      <div className="border-t border-slate-100 px-4 py-2.5 flex gap-3 bg-slate-50/30">
        <a href={p.links.site} target="_blank" rel="noreferrer"
          className="text-xs text-slate-400 hover:text-violet-600 transition-colors">
          🌐 Website
        </a>
        {p.links.twitter && (
          <a href={p.links.twitter} target="_blank" rel="noreferrer"
            className="text-xs text-slate-400 hover:text-sky-600 transition-colors">
            𝕏 Twitter
          </a>
        )}
        {p.links.app && (
          <a href={p.links.app} target="_blank" rel="noreferrer"
            className="text-xs text-slate-400 hover:text-emerald-600 transition-colors ml-auto font-medium">
            Vào App →
          </a>
        )}
      </div>
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function SummaryStats({ projects }: { projects: AirdropProject[] }) {
  const veryHigh = projects.filter((p) => p.prob === 'Rất cao').length
  const high     = projects.filter((p) => p.prob === 'Cao').length
  const live     = projects.filter((p) => p.status !== 'Pre-launch').length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'No Token Yet',   value: String(projects.length), icon: '🪂', color: 'text-violet-600' },
        { label: 'Very High', value: String(veryHigh),      icon: '🎯', color: 'text-emerald-600' },
        { label: 'High',   value: String(high),            icon: '✅', color: 'text-emerald-600'   },
        { label: 'Active', value: String(live),            icon: '🟢', color: 'text-blue-600'    },
      ].map((s) => (
        <div key={s.label} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 text-center">
          <div className="text-xl mb-1">{s.icon}</div>
          <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
          <div className="text-slate-400 text-xs mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Graduated banner (đọc từ JSON) ───────────────────────────────────────────

function GraduatedBanner() {
  const [show, setShow] = useState(false)
  const newThisRun = UPDATE_LOG?.graduatedThisRun ?? []

  return (
    <div className={`border rounded-2xl p-4 ${
      newThisRun.length > 0
        ? 'bg-orange-50 border-orange-200'
        : 'bg-slate-50 border-slate-200'
    }`}>
      <button
        onClick={() => setShow((v) => !v)}
        className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {newThisRun.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600 font-semibold animate-pulse">
              🔔 {newThisRun.length} projects just launched token!
            </span>
          )}
          <span>✅</span>
          <span className="font-semibold">Airdropped / token launched ({GRADUATED.length} projects)</span>
          <span className="text-slate-300">— no need to farm</span>
        </div>
        <span className={`transition-transform duration-200 shrink-0 text-slate-400 ${show ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {show && (
        <div className="mt-3 flex flex-wrap gap-2">
          {GRADUATED.map((g) => {
            const isNew = newThisRun.includes(g.name)
            return (
              <div key={g.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
                  isNew
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-slate-100 border-slate-200'
                }`}>
                <span className="text-sm">{g.logo}</span>
                <span className={`text-xs font-semibold ${isNew ? 'text-orange-600' : 'text-slate-600'}`}>
                  {g.name}
                </span>
                <span className="text-slate-400 text-xs">· {g.detectedAt}</span>
                {isNew && <span className="text-orange-600 text-[10px] font-bold">NEW</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Yield Farming Panel ───────────────────────────────────────────────────────

function YieldFarmingPanel() {
  const [chainFilter, setChainFilter] = useState('All')
  const [search, setSearch] = useState('')

  const chains = ['All', ...Array.from(new Set(YIELDS.map(y => y.chain))).sort()]

  const filtered = YIELDS.filter(y => {
    if (chainFilter !== 'All' && y.chain !== chainFilter) return false
    if (search && !y.project.toLowerCase().includes(search.toLowerCase()) &&
        !y.symbol.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const formatTvl = (tvl: number) => {
    if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(1)}B`
    if (tvl >= 1_000_000)     return `$${(tvl / 1_000_000).toFixed(1)}M`
    return `$${(tvl / 1_000).toFixed(0)}K`
  }

  if (YIELDS.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <div className="text-5xl mb-4">🌾</div>
        <div className="text-slate-500 font-semibold mb-2">No yield farming data yet</div>
        <p className="text-sm max-w-sm mx-auto">Data is updated automatically every day from DeFiLlama. Re-run GitHub Actions to fetch data.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200">
        <span className="text-2xl">🌾</span>
        <div>
          <div className="font-bold text-slate-900 text-sm">DeFiLlama Yield Farming</div>
          <div className="text-slate-500 text-xs mt-0.5">Top {YIELDS.length} pools · Highest APY · TVL &gt; $5M · Updated daily</div>
        </div>
        <a href="https://defillama.com/yields" target="_blank" rel="noreferrer"
          className="ml-auto text-xs text-emerald-600 hover:text-emerald-700 font-medium">
          defillama.com →
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Search protocol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-400 w-40"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {chains.slice(0, 8).map(c => (
            <button key={c} onClick={() => setChainFilter(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                chainFilter === c
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'
              }`}>
              {c}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} pools</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Protocol / Pool</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Chain</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">APY</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">TVL</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">IL Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.slice(0, 50).map((y, i) => (
                <tr key={y.pool} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 text-xs">{y.project}</div>
                    <div className="text-slate-400 text-[10px] mt-0.5">{y.symbol}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 font-medium">
                      {y.chain}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold text-sm ${y.apy >= 20 ? 'text-emerald-600' : y.apy >= 10 ? 'text-blue-600' : 'text-slate-700'}`}>
                      {y.apy.toFixed(1)}%
                    </span>
                    {y.apyReward && y.apyReward > 0 && (
                      <div className="text-[10px] text-violet-500 mt-0.5">+{y.apyReward.toFixed(1)}% reward</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600 font-medium">{formatTvl(y.tvlUsd)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      y.ilRisk === 'YES'
                        ? 'bg-red-50 border-red-200 text-red-600'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    }`}>
                      {y.ilRisk === 'YES' ? '⚠ IL Risk' : '✓ Low'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        Data from <a href="https://defillama.com/yields" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">DeFiLlama</a> ·
        Last updated {YIELDS[0]?.fetchedAt ? new Date(YIELDS[0].fetchedAt).toLocaleString('en-US') : '—'}
      </p>
    </div>
  )
}

// ── External Airdrops Panel ────────────────────────────────────────────────────

function ExternalAirdropsPanel() {
  const hasData = EXTERNAL_AIRDROPS.length > 0 || ALERT_FEED.length > 0

  if (!hasData) {
    return (
      <div className="text-center py-20 text-slate-400">
        <div className="text-5xl mb-4">📡</div>
        <div className="text-slate-500 font-semibold mb-2">No aggregated data yet</div>
        <p className="text-sm max-w-sm mx-auto">Data from DappRadar và AirdropAlert sẽ được cập nhật tự động hàng ngày qua GitHub Actions.</p>
        <div className="mt-4 flex justify-center gap-3">
          <a href="https://dappradar.com/rewards" target="_blank" rel="noreferrer"
            className="text-xs text-violet-600 hover:underline">dappradar.com/rewards →</a>
          <a href="https://airdropalert.com" target="_blank" rel="noreferrer"
            className="text-xs text-blue-600 hover:underline">airdropalert.com →</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* DappRadar section */}
      {EXTERNAL_AIRDROPS.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎮</span>
            <h3 className="font-bold text-slate-900">DappRadar Airdrops & Rewards</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600">
              {EXTERNAL_AIRDROPS.length} campaigns
            </span>
            <a href="https://dappradar.com/rewards" target="_blank" rel="noreferrer"
              className="ml-auto text-xs text-violet-600 hover:underline">View all →</a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {EXTERNAL_AIRDROPS.map(a => (
              <div key={a.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0 text-xl">
                    {a.logo ? <img src={a.logo} alt="" className="w-8 h-8 rounded-lg object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} /> : '🎁'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{a.name}</div>
                    {a.chain && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 font-medium">
                        {a.chain}
                      </span>
                    )}
                  </div>
                  {a.totalValue && (
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">Total Reward</div>
                      <div className="text-emerald-600 font-bold text-sm">{a.totalValue}</div>
                    </div>
                  )}
                </div>
                {a.description && (
                  <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">{a.description}</p>
                )}
                <div className="flex items-center justify-between mt-auto">
                  {a.endDate && (
                    <div className="text-xs text-slate-400">
                      <span>⏰ Ends: </span>
                      <span className="text-amber-600 font-medium">{a.endDate}</span>
                    </div>
                  )}
                  {a.link && (
                    <a href={a.link} target="_blank" rel="noreferrer"
                      className="ml-auto text-xs text-violet-600 hover:text-violet-700 font-semibold transition-colors">
                      Join →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AirdropAlert RSS section */}
      {ALERT_FEED.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <h3 className="font-bold text-slate-900">AirdropAlert — Latest News</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600">
              {ALERT_FEED.length} items
            </span>
            <a href="https://airdropalert.com" target="_blank" rel="noreferrer"
              className="ml-auto text-xs text-orange-600 hover:underline">airdropalert.com →</a>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-50">
            {ALERT_FEED.map((item, i) => (
              <div key={i} className="px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm leading-tight">{item.title}</div>
                  {item.description && (
                    <p className="text-slate-500 text-xs mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    {item.pubDate && (
                      <span className="text-slate-400 text-[10px]">
                        {new Date(item.pubDate).toLocaleDateString('en-US')}
                      </span>
                    )}
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noreferrer"
                        className="text-[10px] text-orange-600 hover:underline font-medium">
                        Read more →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 text-center">
            RSS from <a href="https://airdropalert.com" target="_blank" rel="noreferrer" className="text-orange-600 hover:underline">AirdropAlert</a> ·
            Last updated {ALERT_FEED[0]?.fetchedAt ? new Date(ALERT_FEED[0].fetchedAt).toLocaleString('en-US') : '—'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Funding Rounds Panel ──────────────────────────────────────────────────────

function FundingPanel() {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('All')

  const stages = ['All', ...Array.from(new Set(FUNDING_ROUNDS.map(r => r.stage ?? 'Unknown'))).filter(Boolean).sort()]

  const filtered = FUNDING_ROUNDS.filter(r => {
    if (stageFilter !== 'All' && (r.stage ?? 'Unknown') !== stageFilter) return false
    if (search && !r.coinName.toLowerCase().includes(search.toLowerCase()) &&
        !(r.symbol ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const formatAmount = (usd: number | null) => {
    if (!usd) return '—'
    if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
    if (usd >= 1_000_000)     return `$${(usd / 1_000_000).toFixed(1)}M`
    if (usd >= 1_000)         return `$${(usd / 1_000).toFixed(0)}K`
    return `$${usd}`
  }

  if (FUNDING_ROUNDS.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <div className="text-5xl mb-4">💰</div>
        <div className="text-slate-500 font-semibold mb-2">No funding data yet</div>
        <p className="text-sm max-w-sm mx-auto">Funding rounds data from CryptoRank is updated automatically every day.</p>
        <a href="https://cryptorank.io/funding-rounds" target="_blank" rel="noreferrer"
          className="mt-3 inline-block text-xs text-violet-600 hover:underline">cryptorank.io/funding-rounds →</a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
        <span className="text-2xl">💰</span>
        <div>
          <div className="font-bold text-slate-900 text-sm">CryptoRank — Latest Funding Rounds</div>
          <div className="text-slate-500 text-xs mt-0.5">{FUNDING_ROUNDS.length} deals · Pre-launch projects = airdrop potential · Updated daily</div>
        </div>
        <a href="https://cryptorank.io/funding-rounds" target="_blank" rel="noreferrer"
          className="ml-auto text-xs text-amber-700 hover:text-amber-800 font-medium">
          cryptorank.io →
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Deals', value: String(FUNDING_ROUNDS.length), color: 'text-amber-600', icon: '📊' },
          { label: 'Pre-launch', value: String(FUNDING_ROUNDS.filter(r => !r.isTraded).length), color: 'text-violet-600', icon: '🎯' },
          { label: 'Total Raised', value: formatAmount(FUNDING_ROUNDS.reduce((s, r) => s + (r.amountUsd ?? 0), 0)), color: 'text-emerald-600', icon: '💵' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 text-center">
            <div className="text-lg mb-1">{s.icon}</div>
            <div className={`font-bold text-base ${s.color}`}>{s.value}</div>
            <div className="text-slate-400 text-xs">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-400 w-40"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {stages.slice(0, 6).map(s => (
            <button key={s} onClick={() => setStageFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                stageFilter === s
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'
              }`}>
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} deals</span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(r => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 text-xl">
                {r.logo
                  ? <img src={r.logo} alt="" className="w-8 h-8 rounded-lg object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} />
                  : '🪙'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-sm truncate">{r.coinName}</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {r.symbol && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-mono">
                      ${r.symbol}
                    </span>
                  )}
                  {r.stage && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">
                      {r.stage}
                    </span>
                  )}
                  {!r.isTraded && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-semibold">
                      🎯 Pre-launch
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-emerald-600 font-bold">{formatAmount(r.amountUsd)}</div>
                {r.date && <div className="text-[10px] text-slate-400 mt-0.5">{r.date}</div>}
              </div>
            </div>
            {r.investors.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {r.investors.map(inv => (
                  <span key={inv} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                    {inv}
                  </span>
                ))}
              </div>
            )}
            {r.category && (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <span>📂</span>
                <span>{r.category}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        Data from <a href="https://cryptorank.io" target="_blank" rel="noreferrer" className="text-amber-600 hover:underline">CryptoRank</a> ·
        Last updated {FUNDING_ROUNDS[0]?.fetchedAt ? new Date(FUNDING_ROUNDS[0].fetchedAt).toLocaleString('en-US') : '—'}
      </p>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function AirdropPanel() {
  const [activeTab, setActiveTab]   = useState<AirdropTab>('airdrops')
  const [catFilter,  setCatFilter]  = useState<string>('All')
  const [probFilter, setProbFilter] = useState<string>('All')
  const [search,     setSearch]     = useState('')

  const filtered = PROJECTS.filter((p) => {
    if (catFilter  !== 'All' && p.category !== catFilter) return false
    if (probFilter !== 'All' && p.prob     !== probFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Format last updated
  const updatedDate = new Date(LAST_UPDATED).toLocaleDateString('en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  const TABS: { key: AirdropTab; label: string; count?: number }[] = [
    { key: 'airdrops', label: '🪂 Airdrop',      count: PROJECTS.length },
    { key: 'yields',   label: '🌾 Yield Farming', count: YIELDS.length || undefined },
    { key: 'external', label: '📡 Aggregated',     count: (EXTERNAL_AIRDROPS.length + ALERT_FEED.length) || undefined },
    { key: 'funding',  label: '💰 Funding',        count: FUNDING_ROUNDS.length || undefined },
  ]

  return (
    <div className="flex flex-col gap-5">

      {/* Banner */}
      <div className="w-full rounded-2xl bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50 border border-violet-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-2xl">🪂</span>
              <h2 className="text-slate-900 font-bold text-lg">Airdrop Radar</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                No token yet
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 font-medium">
                {PROJECTS.length} projects
              </span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xl">
              Only projects <strong className="text-slate-900">without a token or airdrop yet</strong>.
              Data from <strong className="text-slate-900">DeFiLlama · DappRadar · AirdropAlert · CryptoRank</strong>.
            </p>
          </div>

          {/* Update info */}
          <div className="text-xs bg-white rounded-xl px-3 py-2.5 border border-slate-200 shrink-0 flex flex-col gap-1.5 min-w-[160px]">
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="font-medium">Auto-updated daily</span>
            </div>
            <div className="text-slate-900 font-semibold">{updatedDate}</div>
            <div className="flex items-center gap-1 text-slate-400">
              <span>{UPDATE_LOG?.xApiUsed ? '𝕏 X API ✓' : '𝕏 X API'}</span>
              <span>·</span>
              <span>5 sources</span>
            </div>
            <a
              href="https://github.com/project4855/arc-spot/actions"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-violet-600 hover:text-violet-700 transition-colors"
            >
              <span>⚙️</span>
              <span>GitHub Actions →</span>
            </a>
          </div>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex bg-white border border-slate-200 shadow-sm rounded-2xl p-1 gap-1 flex-wrap">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === key
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {label}
            {count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ AIRDROP TAB ═══ */}
      {activeTab === 'airdrops' && (
        <>
          {/* Data source note */}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <span>📌</span>
            <span>Source: {DATA_SOURCE}</span>
          </div>

          {/* Stats */}
          <SummaryStats projects={PROJECTS} />

          {/* Already graduated */}
          <GraduatedBanner />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">🔍</span>
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 w-36"
              />
            </div>

            <div className="flex gap-1 flex-wrap">
              {ALL_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    catFilter === c
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex gap-1 ml-auto">
              {['All', 'Rất cao', 'Cao', 'Trung bình'].map((p) => (
                <button
                  key={p}
                  onClick={() => setProbFilter(p)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    probFilter === p
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  {p === 'All' ? 'Probability' : PROB_LABEL(p)}
                </button>
              ))}
            </div>
          </div>

          {filtered.length !== PROJECTS.length && (
            <p className="text-slate-400 text-xs">Showing {filtered.length} of {PROJECTS.length} projects</p>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">🔍</div>
              <div>No matching projects found</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p) => <ProjectCard key={p.id} p={p} />)}
            </div>
          )}
        </>
      )}

      {/* ═══ YIELD FARMING TAB ═══ */}
      {activeTab === 'yields' && <YieldFarmingPanel />}

      {/* ═══ EXTERNAL AGGREGATED TAB ═══ */}
      {activeTab === 'external' && <ExternalAirdropsPanel />}

      {/* ═══ FUNDING ROUNDS TAB ═══ */}
      {activeTab === 'funding' && <FundingPanel />}

      <p className="text-center text-xs text-slate-400 py-2">
        For reference only · Not financial advice ·
        Always verify on <a href="https://x.com" target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-500">X</a> before participating
      </p>
    </div>
  )
}
