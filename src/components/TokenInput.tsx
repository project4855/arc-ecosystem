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
    <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 hover:border-violet-300 focus-within:border-violet-400 transition-colors">

      {/* Label + Balance row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
          {label}
        </span>
        {balance !== undefined && (
          <span className="text-[11px] text-slate-400">
            Balance: <span className="text-slate-600 font-semibold">{balance}</span>
          </span>
        )}
      </div>

      {/* Token selector + Amount row */}
      <div className="flex items-center gap-3 min-w-0">

        {/* Token pill: icon + select */}
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm shrink-0">
          <span className="text-base leading-none">{selectedToken?.icon ?? '🪙'}</span>
          <select
            value={token}
            onChange={(e) => onTokenChange?.(e.target.value)}
            disabled={readonly || !onTokenChange}
            className="bg-transparent text-slate-800 text-sm font-bold cursor-pointer disabled:cursor-default focus:outline-none appearance-none pr-4"
            style={{ minWidth: `${Math.max(...tokens.map(t => t.symbol.length)) * 8 + 8}px` }}
          >
            {tokens.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>
          {!readonly && onTokenChange && (
            <span className="text-slate-400 text-[10px] -ml-2 pointer-events-none">▾</span>
          )}
        </div>

        {/* Amount */}
        <input
          type="number"
          value={amount}
          onChange={(e) => onAmountChange?.(e.target.value)}
          readOnly={readonly}
          placeholder="0.00"
          min="0"
          className="min-w-0 flex-1 bg-transparent text-right text-xl font-bold text-slate-900 placeholder-slate-300 focus:outline-none overflow-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Token full name */}
      {selectedToken && (
        <p className="text-[11px] text-slate-400 mt-1.5">{selectedToken.name}</p>
      )}
    </div>
  )
}
