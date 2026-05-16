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
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
        }`}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full animate-pulse ${
            isArc ? 'bg-green-400' : 'bg-yellow-400'
          }`}
        />
        {isArc ? 'Arc Testnet' : 'Wrong Network — switch to Arc Testnet'}
      </div>
    </div>
  )
}
