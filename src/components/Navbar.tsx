import { ConnectButton } from '@rainbow-me/rainbowkit'

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#0d0e12]">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center font-bold text-white text-sm">
          A
        </div>
        <span className="text-white font-semibold text-lg tracking-tight">
          Arc<span className="text-violet-400">Trade</span>
        </span>
      </div>

      {/* Nav links */}
      <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
        <a href="#swap" className="hover:text-white transition-colors">Swap</a>
        <a
          href="https://testnet.arcscan.app"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white transition-colors"
        >
          Explorer
        </a>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white transition-colors"
        >
          Faucet
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
