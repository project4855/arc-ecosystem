import { useState, useCallback } from 'react'
import { useAccount, useBalance } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatUnits } from 'viem'
import TokenInput from './TokenInput'
import { arcTestnet } from '../config/wagmi'

// Tokens available on Arc Testnet via Circle App Kit
const TOKENS = [
  { symbol: 'USDC', name: 'USD Coin', icon: '💵', decimals: 6 },
  { symbol: 'EURC', name: 'Euro Coin', icon: '💶', decimals: 6 },
  { symbol: 'cirBTC', name: 'Circle Bitcoin', icon: '₿', decimals: 8 },
]

// Simulated exchange rates (from → to)
const RATES: Record<string, Record<string, number>> = {
  USDC:  { EURC: 0.924, cirBTC: 0.0000105 },
  EURC:  { USDC: 1.082, cirBTC: 0.0000114 },
  cirBTC:{ USDC: 95238, EURC: 87912 },
}

function getRate(from: string, to: string): number {
  if (from === to) return 1
  return RATES[from]?.[to] ?? 1
}

export default function SwapCard() {
  const { address, isConnected, chainId } = useAccount()
  const isArc = chainId === arcTestnet.id

  const [fromToken, setFromToken] = useState('USDC')
  const [toToken, setToToken] = useState('EURC')
  const [fromAmount, setFromAmount] = useState('')
  const [isSwapping, setIsSwapping] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Read native USDC balance
  const { data: balance } = useBalance({ address, chainId: arcTestnet.id })

  const toAmount = fromAmount
    ? (parseFloat(fromAmount) * getRate(fromToken, toToken)).toFixed(6)
    : ''

  const handleFlip = useCallback(() => {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmount(toAmount)
    setTxHash(null)
    setError(null)
  }, [fromToken, toToken, toAmount])

  const handleFromTokenChange = (token: string) => {
    if (token === toToken) {
      setToToken(fromToken)
    }
    setFromToken(token)
    setTxHash(null)
    setError(null)
  }

  const handleToTokenChange = (token: string) => {
    if (token === fromToken) {
      setFromToken(toToken)
    }
    setToToken(token)
    setTxHash(null)
    setError(null)
  }

  const handleSwap = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) return
    setIsSwapping(true)
    setError(null)
    setTxHash(null)

    try {
      // Circle App Kit integration point:
      // const kit = new AppKit({ kitKey: import.meta.env.VITE_CIRCLE_KIT_KEY })
      // const adapter = new ViemV2Adapter(walletClient)
      // const result = await kit.swap({
      //   adapter,
      //   srcChain: BridgeChain.Arc_Testnet,
      //   dstChain: BridgeChain.Arc_Testnet,
      //   srcToken: fromToken,
      //   dstToken: toToken,
      //   amount: parseUnits(fromAmount, fromTokenMeta.decimals).toString(),
      // })
      // setTxHash(result.txHash)

      // Demo simulation (remove when you add your Circle Kit Key)
      await new Promise((r) => setTimeout(r, 1500))
      setTxHash('0xdemo_' + Math.random().toString(16).slice(2, 10) + '...')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Swap failed. Please try again.')
    } finally {
      setIsSwapping(false)
    }
  }

  const rate = getRate(fromToken, toToken)

  const fromTokens = TOKENS
  const toTokens = TOKENS.filter((t) => t.symbol !== fromToken)

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-[#0d0e12] border border-gray-800 rounded-3xl p-6 shadow-2xl glow-purple">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-bold text-xl">Swap</h2>
            <p className="text-gray-500 text-sm mt-0.5">Arc Testnet · Circle App Kit</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors text-sm"
              title="Settings"
            >
              ⚙
            </button>
          </div>
        </div>

        {/* From input */}
        <TokenInput
          label="You pay"
          token={fromToken}
          amount={fromAmount}
          onAmountChange={setFromAmount}
          onTokenChange={handleFromTokenChange}
          tokens={fromTokens}
          balance={
            fromToken === 'USDC' && balance
              ? `${parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4)} USDC`
              : undefined
          }
        />

        {/* Flip button */}
        <div className="flex justify-center my-2">
          <button
            onClick={handleFlip}
            className="w-10 h-10 rounded-xl bg-[#1a1d24] border border-gray-700 hover:border-violet-500 hover:bg-violet-500/10 flex items-center justify-center text-gray-400 hover:text-violet-400 transition-all duration-200 text-lg"
            title="Flip tokens"
          >
            ⇅
          </button>
        </div>

        {/* To input */}
        <TokenInput
          label="You receive"
          token={toToken}
          amount={toAmount}
          onTokenChange={handleToTokenChange}
          readonly
          tokens={toTokens}
        />

        {/* Exchange rate info */}
        {fromAmount && parseFloat(fromAmount) > 0 && (
          <div className="mt-3 px-4 py-3 bg-[#111318] rounded-xl border border-gray-800">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Rate</span>
              <span className="text-gray-300">
                1 {fromToken} = {rate.toLocaleString(undefined, { maximumSignificantDigits: 6 })} {toToken}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-500">Gas (USDC)</span>
              <span className="text-green-400 text-xs">~0.001 USDC</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-500">Network</span>
              <span className="text-violet-400 text-xs">Arc Testnet</span>
            </div>
          </div>
        )}

        {/* Swap button */}
        <div className="mt-4">
          {!isConnected ? (
            <div className="flex justify-center">
              <ConnectButton label="Connect Wallet to Swap" />
            </div>
          ) : !isArc ? (
            <button
              disabled
              className="w-full py-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-semibold text-sm cursor-not-allowed"
            >
              Switch to Arc Testnet
            </button>
          ) : (
            <button
              onClick={handleSwap}
              disabled={isSwapping || !fromAmount || parseFloat(fromAmount) <= 0}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-500 hover:from-violet-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base transition-all duration-200 shadow-lg hover:shadow-violet-500/25"
            >
              {isSwapping ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Swapping...
                </span>
              ) : (
                `Swap ${fromToken} → ${toToken}`
              )}
            </button>
          )}
        </div>

        {/* Success */}
        {txHash && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
            <p className="text-green-400 text-sm font-medium text-center">✓ Swap simulated successfully!</p>
            <p className="text-green-500/50 text-xs text-center mt-1">
              Demo mode — add Circle Kit Key to enable real on-chain swaps
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}
      </div>

      {/* Info note */}
      <p className="text-center text-xs text-gray-600 mt-4">
        Powered by{' '}
        <a
          href="https://docs.arc.io/app-kit"
          target="_blank"
          rel="noreferrer"
          className="text-violet-500 hover:text-violet-400"
        >
          Circle App Kit
        </a>{' '}
        on Arc Testnet
      </p>
    </div>
  )
}
