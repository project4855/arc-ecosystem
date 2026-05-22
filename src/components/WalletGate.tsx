// ── WalletGate.tsx ────────────────────────────────────────────────────────────
// Drop-in replacement for <ConnectButton> that supports BOTH MetaMask and Turnkey.
// When no wallet is connected, shows a two-option CTA.
// When connected (either type), renders children or nothing.

import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useWallet } from '../hooks/useWallet'

interface WalletGateProps {
  /** Content to render when connected (optional — gate can be used standalone) */
  children?: React.ReactNode
  /** CTA label shown in the connect prompt */
  label?: string
  /** Called when user clicks "Turnkey" option — should navigate to Wallet tab */
  onNavigateToWallet?: () => void
  /** Layout variant */
  variant?: 'inline' | 'centered' | 'button-only'
}

export default function WalletGate({
  children,
  label = 'Connect your wallet to continue',
  onNavigateToWallet,
  variant = 'centered',
}: WalletGateProps) {
  const { isReady } = useWallet()
  const { openConnectModal } = useConnectModal()

  // If connected — just render children
  if (isReady) {
    return <>{children}</>
  }

  // ── Not connected ── show CTA ──────────────────────────────────────────────

  if (variant === 'button-only') {
    return (
      <div className="flex gap-2">
        <button
          onClick={openConnectModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold hover:bg-orange-100 transition-colors"
        >
          🦊 Browser Wallet
        </button>
        {onNavigateToWallet && (
          <button
            onClick={onNavigateToWallet}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
          >
            🔐 Turnkey
          </button>
        )}
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500 text-xs">{label}</span>
        <button
          onClick={openConnectModal}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold hover:bg-orange-100 transition-colors"
        >
          🦊 Browser Wallet
        </button>
        {onNavigateToWallet && (
          <button
            onClick={onNavigateToWallet}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
          >
            🔐 Turnkey
          </button>
        )}
      </div>
    )
  }

  // Default: centered card
  return (
    <div className="flex flex-col items-center gap-4 py-10 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl">👛</div>
      <div>
        <p className="text-slate-700 font-semibold text-sm">{label}</p>
        <p className="text-slate-400 text-xs mt-1">Choose a wallet type to sign transactions on Arc Testnet</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={openConnectModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-sm font-semibold hover:bg-orange-100 transition-colors"
        >
          <span>🦊</span>
          <div className="text-left">
            <p className="font-bold text-xs">Browser Wallet</p>
            <p className="text-[10px] text-orange-500 font-normal">MetaMask, Coinbase…</p>
          </div>
        </button>
        {onNavigateToWallet && (
          <button
            onClick={onNavigateToWallet}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-sm font-semibold hover:bg-violet-100 transition-colors"
          >
            <span>🔐</span>
            <div className="text-left">
              <p className="font-bold text-xs">Turnkey HSM</p>
              <p className="text-[10px] text-violet-500 font-normal">Hardware-secured</p>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
