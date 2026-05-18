const stats = [
  { label: 'Network', value: 'Arc Testnet', highlight: true },
  { label: 'Chain ID', value: '5042002' },
  { label: 'Gas Token', value: 'USDC' },
  { label: 'Finality', value: '< 1 second' },
  { label: 'Explorer', value: 'ArcScan', link: 'https://testnet.arcscan.app' },
]

export default function StatsBar() {
  return (
    <div className="w-full max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-5 gap-3 px-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 text-center"
        >
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
          {s.link ? (
            <a
              href={s.link}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-violet-600 hover:text-violet-700"
            >
              {s.value} ↗
            </a>
          ) : (
            <p
              className={`text-sm font-semibold ${
                s.highlight ? 'text-emerald-600' : 'text-slate-900'
              }`}
            >
              {s.value}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
