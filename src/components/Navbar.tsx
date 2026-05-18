import { ConnectButton } from '@rainbow-me/rainbowkit'

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center font-bold text-white text-sm">
          A
        </div>
        <span className="text-slate-900 font-semibold text-lg tracking-tight">
          Arc<span className="text-violet-600">Trade</span>
        </span>
      </div>

      {/* Nav links */}
      <div className="hidden md:flex items-center gap-6 text-sm text-slate-500">
        <a href="#swap" className="hover:text-slate-900 transition-colors">Swap</a>
        <a
          href="https://testnet.arcscan.app"
          target="_blank"
          rel="noreferrer"
          className="hover:text-slate-900 transition-colors"
        >
          Explorer
        </a>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 transition-all text-xs font-medium"
        >
          <span>💧</span> Testnet Faucet
        </a>
      </div>

      {/* Wallet connect */}
      <ConnectButton
        chainStatus="icon"
        showBalance={false}
        accountStatus="avatar"
      />
    </nav>
  )
}
