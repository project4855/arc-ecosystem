import { useAccount, useChainId } from 'wagmi'
import { arcTestnet } from '../config/wagmi'

export default function NetworkBadge() {
  const chainId = useChainId()
  const { isConnected } = useAccount()

  if (!isConnected) return null

  const isArc = chainId === arcTestnet.id

  return (
    <div className="flex justify-center mt-4">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
          isArc
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full animate-pulse ${
            isArc ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
        {isArc ? 'Arc Testnet' : 'Wrong Network — switch to Arc Testnet'}
      </div>
    </div>
  )
}
