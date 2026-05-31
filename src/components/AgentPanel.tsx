// AgentPanel.tsx — Autonomous DeFi Agent
// Features: chat, auto-execute countdown, portfolio, browse market, persistent history
import { useState, useRef, useEffect, useCallback } from 'react'
import { useBalance, useReadContract, usePublicClient } from 'wagmi'
import { formatUnits } from 'viem'
import { useWallet } from '../hooks/useWallet'
import { arcTestnet } from '../config/wagmi'
import { useLivePrices } from '../hooks/useLivePrices'
import { ARC_SWAP_ADDRESS, TOKEN_ADDRESSES, TOKEN_DECIMALS } from '../config/contracts'

// ── Types ─────────────────────────────────────────────────────────────────────
type Role = 'user' | 'agent' | 'system'
interface ChatMessage { id: string; role: Role; text: string; time: string }
type AgentAction =
  | { type: 'swap';     fromToken: string; toToken: string; amount: number; expectedOut: number }
  | { type: 'transfer'; toAddress: string; token: string;  amount: number }
  | { type: 'purchase'; toAddress: string; token: string;  amount: number; productId: string; productName: string; author: string; category: string }

// ── ABIs ──────────────────────────────────────────────────────────────────────
const ERC20_APPROVE_ABI = [{
  name: 'approve', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}] as const
const ERC20_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}] as const
const ARC_SWAP_EXEC_ABI = [{
  name: 'swap', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint256' }],
  outputs: [{ name: 'amountOut', type: 'uint256' }],
}] as const
const ERC20_BAL_ABI = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }],
}] as const

// ── Helpers ───────────────────────────────────────────────────────────────────
const nowTime = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const uid = () => Math.random().toString(36).slice(2)
const HISTORY_KEY = 'agent_chat_v1'
const loadHistory = (): ChatMessage[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    if (!Array.isArray(raw)) { localStorage.removeItem(HISTORY_KEY); return [] }
    return raw.filter((m): m is ChatMessage =>
      m != null && typeof m === 'object' &&
      typeof m.text === 'string' && typeof m.id === 'string' && typeof m.role === 'string'
    )
  } catch { localStorage.removeItem(HISTORY_KEY); return [] }
}
const saveHistory = (h: ChatMessage[]) => {
  if (!Array.isArray(h)) return
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-60))) } catch { /* ignore */ }
}
const loadApiHist = (): { role: 'user' | 'assistant'; content: string }[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY + '_api') ?? '[]')
    if (!Array.isArray(raw)) { localStorage.removeItem(HISTORY_KEY + '_api'); return [] }
    return raw.filter(m => m != null && typeof m.role === 'string' && typeof m.content === 'string')
  } catch { localStorage.removeItem(HISTORY_KEY + '_api'); return [] }
}
const saveApiHist = (h: { role: 'user' | 'assistant'; content: string }[]) => {
  if (!Array.isArray(h)) return
  try { localStorage.setItem(HISTORY_KEY + '_api', JSON.stringify(h.slice(-20))) } catch { /* ignore */ }
}

// ── General Commerce Marketplace ─────────────────────────────────────────────
const PRODUCTS_STATIC = [
  { id:'1', name:'The Great Gatsby',               author:'F. Scott Fitzgerald', price:0.1  },
  { id:'2', name:'Atomic Habits',                  author:'James Clear',         price:0.2  },
  { id:'3', name:'The Psychology of Money',        author:'Morgan Housel',       price:0.2  },
  { id:'4', name:'Clean Code',                     author:'Robert C. Martin',    price:0.3  },
  { id:'5', name:'Dune',                           author:'Frank Herbert',       price:0.15 },
  { id:'6', name:'Harry Potter & the Sorcerer',    author:'J.K. Rowling',        price:0.25 },
  { id:'7', name:'Avengers: Doomsday (IMAX)',      author:'Marvel Studios',      price:0.5  },
  { id:'8', name:'Mission: Impossible 8',          author:'Paramount Pictures',  price:0.4  },
  { id:'9', name:'Moana 2 (Family 4 seats)',        author:'Disney Animation',    price:1.2  },
  { id:'10',name:'Inception 4K Remaster',          author:'Warner Bros',         price:0.6  },
  { id:'11',name:'HAN → HCM (VietJet)',            author:'VietJet Air',         price:3.0  },
  { id:'12',name:'SGN → Bangkok (AirAsia)',        author:'AirAsia',             price:5.0  },
  { id:'13',name:'HAN → Singapore (SIA Business)', author:'Singapore Airlines',  price:15.0 },
  { id:'14',name:'SGN → Tokyo Return',             author:'Vietnam Airlines',    price:12.0 },
  { id:'15',name:'Sơn Tùng MTP Live VIP',         author:'M-TP Entertainment',  price:2.0  },
  { id:'16',name:'Taylor Swift Eras Tour Floor',   author:'Live Nation',         price:8.0  },
  { id:'17',name:'Mỹ Tâm Tour 2026',              author:'Mỹ Tâm Productions',  price:1.5  },
  { id:'18',name:'EDM Festival ArcFest 2026',      author:'ArcFest',             price:3.0  },
  { id:'19',name:'GTA VI (PC)',                    author:'Rockstar Games',      price:2.0  },
  { id:'20',name:'Minecraft Java Edition',         author:'Mojang Studios',      price:1.5  },
  { id:'21',name:'FIFA 2026 Ultimate Edition',     author:'EA Sports',           price:2.5  },
  { id:'22',name:'Steam Wallet $10',               author:'Valve Steam',         price:1.0  },
  { id:'23',name:'Grab Food Voucher 50K',          author:'Grab Vietnam',        price:0.3  },
  { id:'24',name:'Starbucks Coffee Bundle',        author:'Starbucks Vietnam',   price:0.5  },
  { id:'25',name:"Pizza 4P's Dining Voucher",      author:"Pizza 4P's",          price:1.5  },
  { id:'26',name:'Highlands Coffee 3-pack',        author:'Highlands Coffee',    price:0.4  },
  { id:'27',name:'Marriott Hanoi 1 Night',         author:'Marriott Hotels',     price:8.0  },
  { id:'28',name:'Vinpearl Nha Trang 2 Nights',   author:'Vinpearl',            price:6.0  },
  { id:'29',name:'Mường Thanh Đà Lạt 1 Night',    author:'Mường Thanh',         price:2.0  },
  { id:'30',name:'React + TypeScript 2026',        author:'Udemy',               price:0.5  },
  { id:'31',name:'AI & Machine Learning A-Z',      author:'Coursera',            price:1.0  },
  { id:'32',name:'Blockchain Developer Bootcamp',  author:'Alchemy University',  price:0.8  },
  { id:'33',name:'IELTS 7.0+ Preparation',         author:'British Council',     price:1.5  },
  { id:'34',name:'Shopee Voucher 100K',            author:'Shopee Vietnam',      price:0.5  },
  { id:'35',name:'Tiki Premium 1 Month',           author:'Tiki Vietnam',        price:0.4  },
  { id:'36',name:'Lazada Birthday Voucher',        author:'Lazada Vietnam',      price:0.3  },
  { id:'37',name:'CGV Cinema 3-pack',              author:'CGV Cinemas',         price:0.9  },
  { id:'38',name:'VinWonders Nha Trang',           author:'VinWonders',          price:2.0  },
  { id:'39',name:'Netflix 1 Month Premium',        author:'Netflix',             price:0.8  },
  { id:'40',name:'Spotify Premium 3 Months',       author:'Spotify',             price:0.6  },
]
const SHOP_SECTIONS = [
  { cat: '📚 E-Books',            ids: [1,2,3,4,5,6]          },
  { cat: '🎬 Vé xem phim',        ids: [7,8,9,10,37]          },
  { cat: '✈️ Vé máy bay',         ids: [11,12,13,14]          },
  { cat: '🎵 Concert & Events',   ids: [15,16,17,18]          },
  { cat: '🎮 Gaming',             ids: [19,20,21,22]          },
  { cat: '🍕 Food & Dining',      ids: [23,24,25,26]          },
  { cat: '🏨 Khách sạn',          ids: [27,28,29]             },
  { cat: '🎓 Khóa học',           ids: [30,31,32,33]          },
  { cat: '🛍️ Shopping',           ids: [34,35,36]             },
  { cat: '📺 Streaming & Fun',    ids: [38,39,40]             },
]

const TX_HISTORY_KEY  = 'arc_swap_history'
const PURCHASE_KEY    = 'arc_purchases_v1'
const loadTxHistory   = () => { try { return JSON.parse(localStorage.getItem(TX_HISTORY_KEY) ?? '[]') } catch { return [] } }
const loadPurchases   = (): string[] => { try { return JSON.parse(localStorage.getItem(PURCHASE_KEY) ?? '[]') } catch { return [] } }
const savePurchase    = (productId: string) => {
  const p = loadPurchases(); if (!p.includes(productId)) p.push(productId)
  localStorage.setItem(PURCHASE_KEY, JSON.stringify(p))
}

const SUGGESTIONS = [
  '🛒 Xem sản phẩm marketplace',
  '💰 Số dư ví của tôi',
  '📊 Portfolio của tôi',
  '💱 Swap 5 USDC sang ARC',
  '📋 Lịch sử giao dịch',
  '🔄 Đổi tất cả ARC sang USDC',
]

const AUTO_EXEC_SECS = 5   // countdown before auto-execute

// ── Component ─────────────────────────────────────────────────────────────────
export default function AgentPanel() {
  const { address, isReady, walletType, chainId, writeContract } = useWallet()
  const isArc = walletType === 'turnkey' || walletType === 'circle' || chainId === arcTestnet.id
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const { prices } = useLivePrices(15_000)

  // ── Balances ─────────────────────────────────────────────────────────────
  const ZERO = '0x0000000000000000000000000000000000000000' as const
  const { data: nativeBal } = useBalance({ address, chainId: arcTestnet.id, query: { refetchInterval: 10_000 } })
  const { data: eurcRaw   } = useReadContract({ address: TOKEN_ADDRESSES.EURC,   abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: [address ?? ZERO], chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 10_000 } })
  const { data: arcRaw    } = useReadContract({ address: TOKEN_ADDRESSES.ARC,    abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: [address ?? ZERO], chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 10_000 } })
  const { data: cirBtcRaw } = useReadContract({ address: TOKEN_ADDRESSES.cirBTC, abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: [address ?? ZERO], chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 10_000 } })
  const { data: qcadRaw   } = useReadContract({ address: TOKEN_ADDRESSES.QCAD,   abi: ERC20_BAL_ABI, functionName: 'balanceOf', args: [address ?? ZERO], chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 10_000 } })

  const balances = {
    USDC:   nativeBal ? parseFloat(formatUnits(nativeBal.value, nativeBal.decimals)) : 0,
    EURC:   eurcRaw   ? parseFloat(formatUnits(eurcRaw   as bigint, 6)) : 0,
    ARC:    arcRaw    ? parseFloat(formatUnits(arcRaw    as bigint, 6)) : 0,
    cirBTC: cirBtcRaw ? parseFloat(formatUnits(cirBtcRaw as bigint, 8)) : 0,
    QCAD:   qcadRaw   ? parseFloat(formatUnits(qcadRaw   as bigint, 6)) : 0,
  }

  // ── Chat state ────────────────────────────────────────────────────────────
  const [purchases,  setPurchases]  = useState<string[]>(loadPurchases)
  const [showShop,   setShowShop]   = useState(false)

  const [messages,      setMessages]      = useState<ChatMessage[]>(() => {
    const saved = loadHistory()
    if (saved.length) return saved
    return [{
      id: uid(), role: 'agent', time: nowTime(),
      text: '👋 Xin chào! Tôi là AI Agent DeFi tự động trên Arc Testnet.\n\nTôi có thể:\n• Kiểm tra số dư & portfolio\n• Xem thị trường và giá token\n• Swap token tự động\n• Chuyển token đến ví khác\n• Tính toán quote trước khi giao dịch\n\nHãy nói lệnh bằng tiếng Việt hoặc tiếng Anh!',
    }]
  })
  const [input,         setInput]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [pendingAction, setPendingAction] = useState<AgentAction | null>(null)
  const [countdown,     setCountdown]     = useState(0)
  const [executing,     setExecuting]     = useState(false)
  const [txHash,        setTxHash]        = useState<string | null>(null)
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef     = useRef<HTMLDivElement>(null)
  const inputRef      = useRef<HTMLTextAreaElement>(null)
  const apiHistory    = useRef<{ role: 'user' | 'assistant'; content: string }[]>(loadApiHist())

  // On mount: clear corrupted localStorage
  useEffect(() => {
    const apiRaw = localStorage.getItem(HISTORY_KEY + '_api')
    if (apiRaw) {
      try {
        const p = JSON.parse(apiRaw)
        if (!Array.isArray(p)) { localStorage.removeItem(HISTORY_KEY + '_api'); apiHistory.current = [] }
      } catch { localStorage.removeItem(HISTORY_KEY + '_api'); apiHistory.current = [] }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { saveHistory(messages) }, [messages])


  // ── Auto-execute countdown ────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    setCountdown(AUTO_EXEC_SECS)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    setCountdown(0)
  }, [])

  // Auto-execute when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && pendingAction && !executing && isReady && isArc) {
      if (countdownRef.current === null) return // not started yet
      void executeAction()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: ChatMessage = { id: uid(), role: 'user', text: text.trim(), time: nowTime() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setPendingAction(null)
    stopCountdown()
    setTxHash(null)

    apiHistory.current.push({ role: 'user', content: text.trim() })

    try {
      const resp = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiHistory.current, walletAddress: address ?? '', balances, prices, txHistory: loadTxHistory() }),
      })
      const data = await resp.json() as { reply?: string; action?: AgentAction; error?: string }
      if (data.error) throw new Error(data.error)

      const reply = data.reply || '...'
      apiHistory.current.push({ role: 'assistant', content: reply })
      saveApiHist(apiHistory.current)

      setMessages(prev => [...prev, { id: uid(), role: 'agent', text: reply, time: nowTime() }])

      if (data.action && (data.action.type === 'swap' || data.action.type === 'transfer' || data.action.type === 'purchase')) {
        setPendingAction(data.action)
        if (isReady && isArc) startCountdown()
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      setMessages(prev => [...prev, { id: uid(), role: 'system', text: `❌ Lỗi: ${err}`, time: nowTime() }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  // ── Execute action ────────────────────────────────────────────────────────
  const executeAction = async () => {
    if (!pendingAction || !address) return
    stopCountdown()
    setPendingAction(null)
    setExecuting(true)

    const addSys = (text: string) =>
      setMessages(prev => [...prev, { id: uid(), role: 'system', text, time: nowTime() }])

    try {
      if (pendingAction.type === 'swap') {
        const { fromToken, toToken, amount } = pendingAction
        const inAddr  = TOKEN_ADDRESSES[fromToken] as `0x${string}`
        const outAddr = TOKEN_ADDRESSES[toToken]   as `0x${string}`
        const inDec   = TOKEN_DECIMALS[fromToken]  ?? 6
        const amtRaw  = BigInt(Math.round(amount * Math.pow(10, inDec)))

        addSys(`⏳ Đang approve ${fromToken}…`)
        const approveHash = await writeContract({
          address: inAddr, abi: ERC20_APPROVE_ABI, functionName: 'approve',
          args: [ARC_SWAP_ADDRESS, amtRaw],
        })
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 })
        addSys('✅ Approve thành công')

        addSys(`⏳ Đang swap ${amount} ${fromToken} → ${toToken}…`)
        const swapHash = await writeContract({
          address: ARC_SWAP_ADDRESS, abi: ARC_SWAP_EXEC_ABI, functionName: 'swap',
          args: [inAddr, outAddr, amtRaw],
        })
        if (publicClient) {
          const rcpt = await publicClient.waitForTransactionReceipt({ hash: swapHash, confirmations: 1 })
          if (rcpt.status === 'reverted') throw new Error('Giao dịch bị revert.')
        }
        setTxHash(swapHash)
        addSys(`✅ Swap thành công!`)
        setMessages(prev => [...prev, {
          id: uid(), role: 'agent', time: nowTime(),
          text: `🎉 Đã swap ${amount} ${fromToken} → ${toToken} thành công!\n[Xem trên ArcScan](https://testnet.arcscan.app/tx/${swapHash})`,
        }])
        apiHistory.current.push({ role: 'user', content: `Swap thành công. Tx: ${swapHash}` })
      }
      else if (pendingAction.type === 'transfer' || pendingAction.type === 'purchase') {
        const { toAddress, token, amount } = pendingAction
        const tokenAddr = TOKEN_ADDRESSES[token] as `0x${string}`
        const dec       = TOKEN_DECIMALS[token] ?? 6
        const amtRaw    = BigInt(Math.round(amount * Math.pow(10, dec)))
        const isPurchase = pendingAction.type === 'purchase'
        const productName = isPurchase ? pendingAction.productName : undefined

        addSys(`⏳ ${isPurchase ? `Đang mua "${productName}"` : `Đang chuyển ${amount} ${token}`}…`)
        const hash = await writeContract({
          address: tokenAddr, abi: ERC20_TRANSFER_ABI, functionName: 'transfer',
          args: [toAddress as `0x${string}`, amtRaw],
        })
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
        setTxHash(hash)

        if (isPurchase) {
          savePurchase(pendingAction.productId)
          setPurchases(loadPurchases())
          addSys(`✅ Đã mua thành công!`)
          setMessages(prev => [...prev, {
            id: uid(), role: 'agent', time: nowTime(),
            text: `🎉 ✅ Đã mua "${productName}" với giá ${amount} USDC!\n\nCảm ơn bạn đã mua sắm tại ARC DeFi Marketplace!\n[Xem giao dịch trên ArcScan](https://testnet.arcscan.app/tx/${hash})`,
          }])
          apiHistory.current.push({ role: 'user', content: `Mua "${productName}" thành công. Tx: ${hash}` })
        } else {
          addSys(`✅ Chuyển thành công!`)
          setMessages(prev => [...prev, {
            id: uid(), role: 'agent', time: nowTime(),
            text: `🎉 Đã chuyển ${amount} ${token} thành công!\n[Xem trên ArcScan](https://testnet.arcscan.app/tx/${hash})`,
          }])
          apiHistory.current.push({ role: 'user', content: `Chuyển thành công. Tx: ${hash}` })
        }
      }
      saveApiHist(apiHistory.current)
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      addSys(`❌ Thất bại: ${err}`)
    } finally {
      setExecuting(false)
    }
  }

  const cancelAction = () => {
    stopCountdown()
    setPendingAction(null)
    setMessages(prev => [...prev, { id: uid(), role: 'system', text: '↩️ Đã huỷ lệnh.', time: nowTime() }])
  }

  const clearChat = () => {
    if (messages.length <= 1) return
    if (!window.confirm('Xoá toàn bộ lịch sử trò chuyện?')) return
    const welcome: ChatMessage = { id: uid(), role: 'agent', time: nowTime(), text: '🔄 Đã xoá lịch sử. Tôi có thể giúp gì cho bạn?' }
    setMessages([welcome])
    apiHistory.current = []
    saveApiHist([])
    localStorage.removeItem(HISTORY_KEY)
  }

  // ── Portfolio total ───────────────────────────────────────────────────────
  const pricesAny = prices as unknown as Record<string, number>
  const totalUSD = Object.entries(balances).reduce((sum, [token, bal]) => {
    const price = token === 'USDC' ? 1
      : token === 'EURC' ? (pricesAny['USDC/EURC'] ? 1 / pricesAny['USDC/EURC'] : 1.08)
      : (pricesAny[`${token}/USDC`] ?? 0)
    return sum + bal * price
  }, 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-white rounded-t-2xl shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-white text-lg shadow-md">🤖</div>
        <div>
          <h2 className="font-bold text-slate-900 text-base">AI DeFi Agent</h2>
          <p className="text-[11px] text-slate-400">Groq · Llama 3.3 70B · Arc Testnet</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {isReady && isArc && totalUSD > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-slate-400">Portfolio</p>
              <p className="text-sm font-bold text-violet-700">${totalUSD.toFixed(2)}</p>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isReady && isArc ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
            <span className="text-[11px] text-slate-400">{isReady && isArc ? 'Connected' : 'No wallet'}</span>
          </div>
          {messages.length > 1 && (
            <button onClick={clearChat}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-200 transition-colors">
              🗑 Xoá chat
            </button>
          )}
        </div>
      </div>

      {/* ── Marketplace toggle bar ── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-100 bg-white shrink-0">
        <button onClick={() => setShowShop(v => !v)}
          className={`flex items-center gap-1.5 text-[12px] font-medium transition-colors ${showShop ? 'text-violet-700' : 'text-slate-500 hover:text-violet-600'}`}>
          🛒 Marketplace
          {purchases.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">{purchases.length} đã mua</span>}
          <span className="text-[10px]">{showShop ? '▲' : '▼'}</span>
        </button>
        <span className="text-[11px] text-slate-400">20 sản phẩm DeFi</span>
      </div>

      {/* ── Balance chips ── */}
      {isReady && isArc && (
        <div className="flex gap-1.5 px-3 py-2 border-b border-slate-100 bg-slate-50 overflow-x-auto [scrollbar-width:none] shrink-0">
          {Object.entries(balances).map(([sym, bal]) => bal > 0 ? (
            <span key={sym} className="flex-shrink-0 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[10px] font-mono text-slate-600 shadow-sm">
              <span className="font-semibold text-slate-900">{sym}</span>{' '}
              {sym === 'cirBTC' ? bal.toFixed(8) : bal.toFixed(2)}
            </span>
          ) : null)}
        </div>
      )}

      {/* ── Marketplace panel (dropdown, no tab switch) ── */}
      {showShop && (
        <div className="max-h-64 overflow-y-auto border-b border-slate-200 bg-slate-50 shrink-0">
          {SHOP_SECTIONS.map(({ cat, ids }) => (
            <div key={cat} className="px-3 py-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{cat}</p>
              <div className="flex flex-col gap-1">
                {PRODUCTS_STATIC.filter(p => ids.includes(parseInt(p.id))).map(p => {
                  const bought = purchases.includes(p.id)
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                      <div className="flex-1 min-w-0 mr-2">
                        <span className="text-[12px] font-medium text-slate-800 truncate block">{p.name}</span>
                        <span className="text-[10px] text-slate-400">{p.author}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[12px] font-bold text-violet-700">{p.price} USDC</span>
                        {bought ? (
                          <span className="text-[11px] text-emerald-600 font-bold">✓</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const cmd = 'Mua cho tôi sản phẩm "' + p.name + '" bởi ' + p.author
                              setInput(cmd)
                              setShowShop(false)
                              inputRef.current?.focus()
                            }}
                            className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold">
                            Mua
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Messages ── */}
      {<div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#F8F9FB]">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={msg.role !== 'user' ? 'flex gap-2 items-start max-w-[88%]' : 'max-w-[88%]'}>
              {msg.role !== 'user' && (
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5 ${msg.role === 'agent' ? 'bg-violet-100' : 'bg-amber-100'}`}>
                  {msg.role === 'agent' ? '🤖' : '⚙️'}
                </div>
              )}
              <div>
                <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-sm'
                    : msg.role === 'system'
                    ? 'bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-mono'
                    : 'bg-white border border-slate-200 text-slate-800 shadow-sm rounded-tl-sm'
                }`}>
                  {(msg.text ?? '').split(/(\[.*?\]\(.*?\))/g).map((part, i) => {
                    const m = part.match(/\[(.*?)\]\((.*?)\)/)
                    return m
                      ? <a key={i} href={m[2]} target="_blank" rel="noreferrer" className="text-violet-600 underline">{m[1]}</a>
                      : part
                  })}
                </div>
                {msg.role !== 'user' && <span className="text-[9px] text-slate-300 ml-1">{msg.time}</span>}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-2 items-center">
              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center text-sm">🤖</div>
              <div className="bg-white border border-slate-200 px-3 py-2 rounded-2xl rounded-tl-sm shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>}

      {/* ── Pending action with countdown ── */}
      {pendingAction && !executing && (
        <div className="mx-4 mb-3 p-4 bg-white border-2 border-violet-300 rounded-2xl shadow-lg shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{pendingAction.type === 'swap' ? '💱' : pendingAction.type === 'purchase' ? '🛒' : '💸'}</span>
              <span className="font-bold text-slate-900 text-sm">
                {pendingAction.type === 'swap' ? 'Tự động Swap' : pendingAction.type === 'purchase' ? 'Xác nhận mua hàng' : 'Tự động Chuyển'}
              </span>
            </div>
            {countdown > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                  <span className="text-xs font-bold text-violet-700">{countdown}</span>
                </div>
                <span className="text-[11px] text-slate-400">giây</span>
              </div>
            )}
          </div>

          {pendingAction.type === 'swap' && (
            <div className="flex items-center justify-between mb-4 bg-slate-50 rounded-xl p-3">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">{pendingAction.amount}</p>
                <p className="text-xs text-slate-500">{pendingAction.fromToken}</p>
              </div>
              <div className="text-violet-500 text-2xl">→</div>
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-600">
                  ~{pendingAction.toToken === 'cirBTC' ? pendingAction.expectedOut.toFixed(8) : pendingAction.expectedOut.toFixed(4)}
                </p>
                <p className="text-xs text-slate-500">{pendingAction.toToken}</p>
              </div>
            </div>
          )}

          {pendingAction.type === 'transfer' && (
            <div className="mb-4 bg-slate-50 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Số lượng</span>
                <span className="font-bold">{pendingAction.amount} {pendingAction.token}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Đến ví</span>
                <span className="font-mono text-xs text-slate-700">{pendingAction.toAddress.slice(0,10)}…{pendingAction.toAddress.slice(-6)}</span>
              </div>
            </div>
          )}

          {pendingAction.type === 'purchase' && (
            <div className="mb-4 bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📦</span>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{pendingAction.productName}</p>
                  <p className="text-[11px] text-slate-500">bởi {pendingAction.author} · {pendingAction.category}</p>
                </div>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-violet-200">
                <span className="text-slate-500">Thanh toán</span>
                <span className="font-bold text-violet-700">{pendingAction.amount} USDC</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Marketplace wallet</span>
                <span className="font-mono text-slate-400">{pendingAction.toAddress.slice(0,10)}…</span>
              </div>
            </div>
          )}

          {/* Countdown bar */}
          {countdown > 0 && (
            <div className="w-full bg-slate-100 rounded-full h-1 mb-3 overflow-hidden">
              <div
                className="bg-violet-500 h-1 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / AUTO_EXEC_SECS) * 100}%` }}
              />
            </div>
          )}

          {!isReady ? (
            <p className="text-xs text-red-500 text-center">Kết nối ví để tiếp tục</p>
          ) : !isArc ? (
            <p className="text-xs text-amber-600 text-center">Chuyển sang Arc Testnet</p>
          ) : (
            <div className="flex gap-2">
              <button onClick={cancelAction}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                ✗ Huỷ
              </button>
              <button onClick={() => { stopCountdown(); void executeAction() }}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-500 transition-colors shadow-sm">
                ✅ Thực hiện ngay
              </button>
            </div>
          )}
        </div>
      )}

      {/* Executing */}
      {executing && (
        <div className="mx-4 mb-3 p-3 bg-violet-50 border border-violet-200 rounded-2xl flex items-center gap-2 shrink-0">
          <svg className="animate-spin h-4 w-4 text-violet-600 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <span className="text-sm text-violet-700 font-medium">Agent đang thực hiện giao dịch…</span>
        </div>
      )}

      {txHash && (
        <div className="mx-4 mb-2 shrink-0">
          <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer"
            className="block text-center text-xs text-emerald-600 hover:text-emerald-500 underline truncate">
            🔗 Xem giao dịch trên ArcScan ↗
          </a>
        </div>
      )}

      {/* Quick suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => sendMessage(s)}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-600 hover:border-violet-300 hover:text-violet-600 transition-colors shadow-sm">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── Input (chat only) ── */}
      {<div className="p-4 border-t border-slate-200 bg-white rounded-b-2xl shrink-0">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input) } }}
            placeholder="Nhập lệnh bằng tiếng Việt hoặc tiếng Anh… (Enter để gửi, Shift+Enter xuống dòng)"
            disabled={loading || executing}
            rows={3}
            className="flex-1 resize-none bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-[15px] outline-none focus:border-violet-400 focus:bg-white transition-colors disabled:opacity-50 leading-relaxed"
            style={{ maxHeight: 160 }}
          />
          <button
            onClick={() => void sendMessage(input)}
            disabled={loading || executing || !input.trim()}
            className="w-12 h-12 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shrink-0 shadow-md"
          >
            {loading
              ? <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              : <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            }
          </button>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-2">
          🤖 Agent tự thực hiện sau {AUTO_EXEC_SECS}s · Testnet only · Groq free
        </p>
      </div>}
    </div>
  )
}
