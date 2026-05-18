// ── WalletPanel.tsx ──────────────────────────────────────────────────────────
// Create wallet, receive tokens (QR), send USDC/EURC on Arc Testnet

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { parseUnits, formatUnits, isAddress } from 'viem'
import { TOKEN_ADDRESSES, TOKEN_DECIMALS, ERC20_ABI } from '../config/contracts'

// ─── Types ────────────────────────────────────────────────────────────────────

type WTab = 'create' | 'receive' | 'send'

interface GeneratedWallet {
  address:    string
  privateKey: string
  mnemonic:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateNewWallet(): Promise<GeneratedWallet> {
  // Use viem/accounts for browser-safe key generation
  const { generatePrivateKey } = await import('viem/accounts')
  const { english, generateMnemonic, mnemonicToAccount } = await import('viem/accounts')

  const mnemonic = generateMnemonic(english)
  const account  = mnemonicToAccount(mnemonic)
  // We use the mnemonic-derived address as the canonical one
  return {
    address:    account.address,
    privateKey: generatePrivateKey(),
    mnemonic,
  }
}

async function deriveFromPK(pk: string): Promise<string | null> {
  try {
    const { privateKeyToAccount } = await import('viem/accounts')
    const hex = pk.startsWith('0x') ? pk as `0x${string}` : `0x${pk}` as `0x${string}`
    const acc = privateKeyToAccount(hex)
    return acc.address
  } catch { return null }
}

// ─── Small components ─────────────────────────────────────────────────────────

function CopyBtn({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
    >
      {copied ? '✓ Copied' : `📋 ${label}`}
    </button>
  )
}

function RevealField({
  label, value, mono = true, warn,
}: {
  label: string; value: string; mono?: boolean; warn?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className={`rounded-xl border p-3 ${warn ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShow(v => !v)}
            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 text-xs hover:bg-slate-100 transition-colors"
          >{show ? '🙈 Hide' : '👁 Show'}</button>
          <CopyBtn value={value} />
        </div>
      </div>
      <p className={`text-xs break-all ${mono ? 'font-mono' : ''} ${show ? 'text-slate-800' : 'text-slate-300 select-none'}`}>
        {show ? value : '•'.repeat(Math.min(value.length, 48))}
      </p>
    </div>
  )
}

// ─── Token balance hook ───────────────────────────────────────────────────────

function useBalance(tokenSymbol: 'USDC' | 'EURC', userAddress: `0x${string}` | undefined) {
  const { data } = useReadContract({
    address:      TOKEN_ADDRESSES[tokenSymbol],
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         userAddress ? [userAddress] : undefined,
    query:        { enabled: !!userAddress, refetchInterval: 10_000 },
  })
  return data ? parseFloat(formatUnits(data as bigint, TOKEN_DECIMALS[tokenSymbol])) : 0
}

// ─── CREATE TAB ───────────────────────────────────────────────────────────────

function CreateTab() {
  const [wallet,      setWallet]      = useState<GeneratedWallet | null>(null)
  const [generating,  setGenerating]  = useState(false)
  const [importPK,    setImportPK]    = useState('')
  const [importAddr,  setImportAddr]  = useState<string | null>(null)
  const [importError, setImportError] = useState('')

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const w = await generateNewWallet()
      setWallet(w)
    } finally {
      setGenerating(false)
    }
  }

  const handleImport = useCallback(async () => {
    setImportError('')
    if (!importPK.trim()) return
    const addr = await deriveFromPK(importPK.trim())
    if (!addr) setImportError('Invalid private key')
    else setImportAddr(addr)
  }, [importPK])

  return (
    <div className="flex flex-col gap-5">

      {/* Warning banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
        <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
        <div>
          <p className="text-amber-700 font-semibold text-sm">Security Notice</p>
          <p className="text-amber-600 text-xs mt-0.5 leading-relaxed">
            Never share your private key or seed phrase with anyone.
            This tool is for <strong>testnet use only</strong> — do not use real funds.
          </p>
        </div>
      </div>

      {/* Generate new wallet */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">✨</span>
          <div>
            <h3 className="font-bold text-slate-900">Generate New Wallet</h3>
            <p className="text-slate-500 text-xs mt-0.5">Create a brand-new Arc Testnet wallet in your browser</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="ml-auto px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-colors disabled:opacity-50"
          >
            {generating ? '⏳ Generating…' : '+ New Wallet'}
          </button>
        </div>

        {wallet && (
          <div className="flex flex-col gap-3 mt-1">
            {/* Address */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Wallet Address</span>
                <CopyBtn value={wallet.address} />
              </div>
              <p className="font-mono text-sm text-emerald-800 break-all">{wallet.address}</p>
            </div>

            <RevealField label="Seed Phrase (12 words)" value={wallet.mnemonic} mono={false} warn />
            <RevealField label="Private Key" value={wallet.privateKey} warn />

            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
              <strong>How to use in MetaMask:</strong><br />
              1. Open MetaMask → Import Account → Paste Private Key<br />
              2. Or: Create new wallet with the seed phrase above<br />
              3. Add Arc Testnet: RPC <code className="bg-blue-100 px-1 rounded">https://rpc.testnet.arc.network</code> · Chain ID <code className="bg-blue-100 px-1 rounded">5042002</code>
            </div>
          </div>
        )}
      </div>

      {/* Import / derive address from PK */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🔑</span>
          <div>
            <h3 className="font-bold text-slate-900">Derive Address from Private Key</h3>
            <p className="text-slate-500 text-xs mt-0.5">Paste a private key to get the corresponding address</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="password"
            placeholder="0x private key…"
            value={importPK}
            onChange={e => { setImportPK(e.target.value); setImportAddr(null); setImportError('') }}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:border-violet-400 transition-colors"
          />
          <button
            onClick={handleImport}
            className="px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            Derive
          </button>
        </div>

        {importError && (
          <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><span>⚠</span> {importError}</p>
        )}

        {importAddr && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-emerald-700">Derived Address</span>
              <CopyBtn value={importAddr} />
            </div>
            <p className="font-mono text-sm text-emerald-800 break-all">{importAddr}</p>
          </div>
        )}
      </div>

      {/* Arc Testnet connection guide */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🌐</span>
          <div>
            <h3 className="font-bold text-slate-900">Add Arc Testnet to MetaMask</h3>
            <p className="text-slate-500 text-xs mt-0.5">Network settings</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Network Name',    value: 'Arc Testnet'                         },
            { label: 'RPC URL',         value: 'https://rpc.testnet.arc.network'     },
            { label: 'Chain ID',        value: '5042002'                             },
            { label: 'Currency Symbol', value: 'USDC'                                },
            { label: 'Block Explorer',  value: 'https://testnet.arcscan.app'         },
            { label: 'USDC Address',    value: '0x36000000000000000000000000000000000000' },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
              <span className="text-slate-400 w-28 shrink-0">{row.label}</span>
              <span className="font-mono text-slate-700 text-[11px] flex-1 truncate">{row.value}</span>
              <CopyBtn value={row.value} label="" />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer"
            className="flex-1 text-center py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors">
            💧 Get Free USDC → faucet.circle.com
          </a>
          <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer"
            className="flex-1 text-center py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors">
            🔍 Explorer → arcscan.app
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── RECEIVE TAB ──────────────────────────────────────────────────────────────

function ReceiveTab({ address }: { address: `0x${string}` | undefined }) {
  const usdcBal = useBalance('USDC', address)
  const eurcBal = useBalance('EURC', address)

  if (!address) return (
    <div className="flex flex-col items-center gap-4 py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <p className="text-slate-500 text-sm">Connect your wallet to receive tokens</p>
      <ConnectButton label="Connect Wallet" />
    </div>
  )

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=svg&data=${encodeURIComponent(address)}`

  return (
    <div className="flex flex-col gap-5">

      {/* QR + address */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">

          {/* QR code */}
          <div className="shrink-0 p-3 bg-white border-2 border-violet-200 rounded-2xl shadow-sm">
            <img
              src={qrUrl}
              alt="Wallet QR Code"
              width={160} height={160}
              className="rounded-lg"
            />
          </div>

          {/* Info */}
          <div className="flex flex-col gap-3 flex-1 w-full">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Your Wallet Address</p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                <p className="font-mono text-xs text-slate-700 break-all flex-1">{address}</p>
                <CopyBtn value={address} />
              </div>
            </div>

            {/* Balances */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { symbol: 'USDC', balance: usdcBal, icon: '💵', color: 'text-blue-600 bg-blue-50 border-blue-200' },
                { symbol: 'EURC', balance: eurcBal, icon: '💶', color: 'text-violet-600 bg-violet-50 border-violet-200' },
              ].map(t => (
                <div key={t.symbol} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${t.color}`}>
                  <span className="text-xl">{t.icon}</span>
                  <div>
                    <p className="font-bold text-sm">{t.balance.toFixed(4)}</p>
                    <p className="text-[10px] opacity-70">{t.symbol}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Get testnet tokens */}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold hover:from-emerald-400 hover:to-teal-400 transition-all shadow-sm"
            >
              💧 Get Free Testnet USDC
              <span className="text-emerald-200 text-xs">faucet.circle.com</span>
            </a>
          </div>
        </div>
      </div>

      {/* Token addresses */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Token Addresses on Arc Testnet</p>
        <div className="flex flex-col gap-2">
          {Object.entries(TOKEN_ADDRESSES).map(([sym, addr]) => (
            <div key={sym} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-lg">{sym === 'USDC' ? '💵' : '💶'}</span>
              <span className="font-semibold text-slate-700 text-sm w-12">{sym}</span>
              <span className="font-mono text-xs text-slate-500 flex-1 truncate">{addr}</span>
              <CopyBtn value={addr} />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3 text-center">
          Add these tokens to MetaMask: Settings → Import Token → Paste address
        </p>
      </div>

      {/* Network info */}
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-4 text-center">
        <p className="text-slate-600 text-xs">
          Transactions on <strong className="text-violet-700">Arc Testnet</strong> ·
          Chain ID <code className="bg-violet-100 px-1 rounded text-violet-700">5042002</code> ·
          Gas paid in USDC · Sub-second finality
        </p>
      </div>
    </div>
  )
}

// ─── SEND TAB ─────────────────────────────────────────────────────────────────

const TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

function SendTab({ address }: { address: `0x${string}` | undefined }) {
  const [token,    setToken]   = useState<'USDC' | 'EURC'>('USDC')
  const [toAddr,   setToAddr]  = useState('')
  const [amount,   setAmount]  = useState('')
  const [step,     setStep]    = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [txHash,   setTxHash]  = useState<`0x${string}` | null>(null)

  const usdcBal = useBalance('USDC', address)
  const eurcBal = useBalance('EURC', address)
  const balance = token === 'USDC' ? usdcBal : eurcBal

  const { writeContractAsync } = useWriteContract()
  const { data: receipt } = useWaitForTransactionReceipt({ hash: txHash ?? undefined })

  useEffect(() => {
    if (receipt) setStep('done')
  }, [receipt])

  const validAddress = isAddress(toAddr)
  const amountN      = parseFloat(amount) || 0
  const canSend      = validAddress && amountN > 0 && amountN <= balance && step === 'idle'

  const handleSend = async () => {
    if (!canSend) return
    setStep('sending'); setErrorMsg(''); setTxHash(null)
    try {
      const hash = await writeContractAsync({
        address:      TOKEN_ADDRESSES[token],
        abi:          TRANSFER_ABI,
        functionName: 'transfer',
        args:         [toAddr as `0x${string}`, parseUnits(amount, TOKEN_DECIMALS[token])],
      })
      setTxHash(hash)
    } catch (e: unknown) {
      setStep('error')
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed'
      setErrorMsg(msg)
    }
  }

  const reset = () => {
    setStep('idle'); setErrorMsg(''); setTxHash(null)
    setToAddr(''); setAmount('')
  }

  if (!address) return (
    <div className="flex flex-col items-center gap-4 py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <p className="text-slate-500 text-sm">Connect your wallet to send tokens</p>
      <ConnectButton label="Connect Wallet" />
    </div>
  )

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-4">

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col gap-5">
        <h3 className="font-bold text-slate-900 text-base">Send Tokens</h3>

        {/* Token selector */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Token</label>
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            {(['USDC', 'EURC'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setToken(t); setAmount(''); setStep('idle') }}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  token === t
                    ? 'bg-white text-slate-900 shadow-md'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>{t === 'USDC' ? '💵' : '💶'}</span>
                <span>{t}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-2 px-1">
            <span className="text-xs text-slate-400">Balance</span>
            <span className="text-xs font-semibold text-slate-600">{balance.toFixed(4)} {token}</span>
          </div>
        </div>

        {/* Recipient address */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Recipient Address</label>
          <div className={`flex items-center gap-2 bg-slate-50 border rounded-xl px-3 py-2.5 focus-within:border-violet-400 transition-colors ${
            toAddr && !validAddress ? 'border-red-300' : 'border-slate-200'
          }`}>
            <span className="text-slate-400">👤</span>
            <input
              type="text"
              placeholder="0x…"
              value={toAddr}
              onChange={e => { setToAddr(e.target.value); setStep('idle') }}
              className="flex-1 bg-transparent text-slate-900 text-sm font-mono outline-none placeholder:text-slate-300"
            />
            {validAddress && <span className="text-emerald-500 text-sm">✓</span>}
          </div>
          {toAddr && !validAddress && (
            <p className="text-red-500 text-xs mt-1">Invalid address format</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Amount</label>
          <div className={`flex items-center gap-2 bg-slate-50 border rounded-xl px-3 py-2.5 focus-within:border-violet-400 transition-colors ${
            amountN > balance ? 'border-red-300' : 'border-slate-200'
          }`}>
            <span className="text-slate-400">{token === 'USDC' ? '💵' : '💶'}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => { setAmount(e.target.value); setStep('idle') }}
              className="flex-1 bg-transparent text-slate-900 font-bold text-xl outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-slate-500 font-semibold text-sm">{token}</span>
            <button
              onClick={() => setAmount(balance.toFixed(6))}
              className="px-2 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-600 text-xs font-semibold hover:bg-violet-100 transition-colors"
            >Max</button>
          </div>
          {amountN > balance && (
            <p className="text-red-500 text-xs mt-1">Insufficient {token} balance</p>
          )}
        </div>

        {/* Transaction preview */}
        {validAddress && amountN > 0 && amountN <= balance && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Sending</span>
              <span className="font-bold text-slate-900">{amount} {token}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">To</span>
              <span className="font-mono text-slate-600">{toAddr.slice(0, 10)}…{toAddr.slice(-8)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Network</span>
              <span className="text-violet-600 font-medium">Arc Testnet · gas: USDC</span>
            </div>
          </div>
        )}

        {/* Status */}
        {step !== 'idle' && (
          <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${
            step === 'done'  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            step === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
                               'bg-violet-50 border-violet-200 text-violet-700'
          }`}>
            <span>{step === 'done' ? '✅' : step === 'error' ? '⚠' : '⏳'}</span>
            <div className="flex-1">
              <p className="font-semibold">
                {step === 'sending' ? 'Sending transaction…' :
                 step === 'done'    ? `Sent ${amount} ${token} successfully!` :
                 errorMsg}
              </p>
              {txHash && step !== 'error' && (
                <a href={`https://testnet.arcscan.app/tx/${txHash}`}
                  target="_blank" rel="noreferrer"
                  className="text-[10px] font-mono underline opacity-70 hover:opacity-100 block mt-0.5">
                  {txHash.slice(0, 18)}… ↗ View on ArcScan
                </a>
              )}
            </div>
          </div>
        )}

        {/* Send / Reset button */}
        {step === 'done' ? (
          <button
            onClick={reset}
            className="w-full py-3.5 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors"
          >
            ↩ Send Another
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${
              canSend
                ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-500 hover:to-blue-500 shadow-lg shadow-violet-900/20'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {(step as string) === 'sending'
              ? '⏳ Sending…'
              : `Send ${amount || '0'} ${token}${validAddress ? ` → ${toAddr.slice(0, 6)}…` : ''}`}
          </button>
        )}
      </div>

      {/* Transaction history hint */}
      {address && (
        <a
          href={`https://testnet.arcscan.app/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-slate-200 text-slate-500 text-xs hover:border-violet-300 hover:text-violet-600 transition-all shadow-sm"
        >
          🔍 View all transactions on ArcScan ↗
        </a>
      )}
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function WalletPanel() {
  const { address, isConnected } = useAccount()
  const [tab, setTab] = useState<WTab>('receive')

  const usdcBal = useBalance('USDC', address)

  const TABS: { key: WTab; label: string; icon: string }[] = [
    { key: 'create',  label: 'Create / Import', icon: '✨' },
    { key: 'receive', label: 'Receive',          icon: '📥' },
    { key: 'send',    label: 'Send',             icon: '📤' },
  ]

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-slate-50 via-violet-50 to-blue-50 border border-violet-200">
        <span className="text-3xl">👛</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-slate-900 font-bold text-lg">Wallet</h2>
            {isConnected && address && (
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Connected
              </span>
            )}
          </div>
          {isConnected && address ? (
            <p className="text-slate-500 text-xs font-mono">
              {address.slice(0, 12)}…{address.slice(-8)} · {usdcBal.toFixed(2)} USDC
            </p>
          ) : (
            <p className="text-slate-500 text-xs">Create a wallet, receive or send USDC / EURC on Arc Testnet</p>
          )}
        </div>
        {!isConnected && (
          <div className="shrink-0">
            <ConnectButton label="Connect" />
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex bg-white border border-slate-200 shadow-sm rounded-2xl p-1.5 gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-violet-600 text-white shadow-lg'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'create'  && <CreateTab />}
      {tab === 'receive' && <ReceiveTab address={address} />}
      {tab === 'send'    && <SendTab    address={address} />}

      {/* Footer */}
      <p className="text-center text-xs text-slate-400 pb-2">
        Arc Testnet · For testing purposes only · Real funds not supported
      </p>
    </div>
  )
}
