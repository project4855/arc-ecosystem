interface TokenInputProps {
  label: string
  token: string
  amount: string
  onAmountChange?: (value: string) => void
  onTokenChange?: (token: string) => void
  readonly?: boolean
  balance?: string
  tokens: { symbol: string; name: string; icon: string }[]
}

export default function TokenInput({
  label,
  token,
  amount,
  onAmountChange,
  onTokenChange,
  readonly = false,
  balance,
  tokens,
}: TokenInputProps) {
  const selectedToken = tokens.find((t) => t.symbol === token)

  return (
    <div className="bg-[#111318] rounded-2xl p-4 border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">
          {label}
        </span>
        {balance !== undefined && (
          <span className="text-xs text-gray-500">
            Balance:{' '}
            <span className="text-gray-300 font-medium">{balance}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Token selector */}
        <div className="relative">
          <select
            value={token}
            onChange={(e) => onTokenChange?.(e.target.value)}
            disabled={readonly || !onTokenChange}
            className="appearance-none bg-[#1a1d24] border border-gray-700 rounded-xl px-3 py-2 pr-8 text-white text-sm font-semibold cursor-pointer hover:border-violet-500 transition-colors disabled:cursor-default focus:outline-none focus:border-violet-500"
          >
            {tokens.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.icon} {t.symbol}
              </option>
            ))}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">
            ▾
          </div>
        </div>

        {/* Amount input */}
        <input
          type="number"
          value={amount}
          onChange={(e) => onAmountChange?.(e.target.value)}
          readOnly={readonly}
          placeholder="0.00"
          min="0"
          className="flex-1 bg-transparent text-right text-2xl font-semibold text-white placeholder-gray-700 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {selectedToken && (
        <p className="text-xs text-gray-600 mt-2">{selectedToken.name}</p>
      )}
    </div>
  )
}
