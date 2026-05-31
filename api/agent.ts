// api/agent.ts — Autonomous DeFi Agent (Groq + tool use)
// Features: browse market, portfolio, quote, swap, transfer, auto-execute,
//           list_transactions, get_transaction, search_tokens
import OpenAI from 'openai'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const client = new OpenAI({
  apiKey:  process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
})
const MODEL = 'llama-3.3-70b-versatile'

// ── Token config ──────────────────────────────────────────────────────────────
const TOKEN_ADDR: Record<string, string> = {
  USDC:   '0x3600000000000000000000000000000000000000',
  EURC:   '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  cirBTC: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
  ARC:    '0x55e1a127e33C4Ccca470Ea9eE8F15683DEf2dCc1',
  QCAD:   '0xf546Bc238F0893eD08586c892f3a111cBFf0d19a',
}
const TOKEN_DEC: Record<string, number> = {
  USDC: 6, EURC: 6, ARC: 6, QCAD: 6, cirBTC: 8,
}
const ARC_SWAP = '0x8C16097F1f9a4B7Fab0497C29D3fC6a85a43C550'
const ARC_RPC  = 'https://rpc.testnet.arc.network'

// ── RPC helpers ───────────────────────────────────────────────────────────────
async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  })
  const json = await res.json() as { result?: string }
  return json.result || '0x0'
}
const pad = (s: string) => s.toLowerCase().replace('0x', '').padStart(64, '0')
const encodeGetAmountOut = (tIn: string, tOut: string, amt: bigint) =>
  '0xb10a6fd6' + pad(tIn) + pad(tOut) + amt.toString(16).padStart(64, '0')
const encodeLiquidity = (token: string) =>
  '0x1090ce62' + token.toLowerCase().replace('0x', '').padStart(64, '0')
const hexToNum = (hex: string, dec: number) =>
  Number(BigInt(hex === '0x' || hex === '0x0' ? '0x0' : hex)) / Math.pow(10, dec)

// ── All ArcSwap pairs to browse ───────────────────────────────────────────────
const ARCSWAP_PAIRS: [string, string][] = [
  ['USDC','ARC'],   ['ARC','USDC'],
  ['USDC','cirBTC'],['cirBTC','USDC'],
  ['USDC','QCAD'],  ['QCAD','USDC'],
  ['EURC','ARC'],   ['ARC','EURC'],
  ['EURC','cirBTC'],['cirBTC','EURC'],
  ['EURC','QCAD'],  ['QCAD','EURC'],
  ['ARC','QCAD'],   ['QCAD','ARC'],
]

// ── Tools ─────────────────────────────────────────────────────────────────────
const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_wallet_info',
      description: 'Lấy địa chỉ ví và số dư tất cả token (USDC, EURC, ARC, cirBTC, QCAD). Dùng khi hỏi số dư.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio',
      description: 'Tính tổng giá trị danh mục đầu tư bằng USD. Dùng khi hỏi portfolio, tổng tài sản, tôi có bao nhiêu tiền.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_market',
      description: 'Xem tất cả cặp giao dịch có sẵn trên Arc Testnet với giá và liquidity. Dùng khi hỏi "có thể swap gì", "thị trường", "cặp nào có sẵn".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_token_prices',
      description: 'Lấy giá hiện tại của các cặp token.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_quote',
      description: 'Tính chính xác số lượng token nhận được khi swap. Gọi trước prepare_swap để biết expectedOut chính xác.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          toToken:   { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          amount:    { type: 'number', description: 'Số lượng fromToken' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_swap_liquidity',
      description: 'Kiểm tra liquidity trên ArcSwap. Luôn gọi trước prepare_swap.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          toToken:   { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          amount:    { type: 'number' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_swap',
      description: 'Chuẩn bị lệnh swap token. Frontend hiện nút Xác nhận (hoặc tự thực hiện sau đếm ngược).',
      parameters: {
        type: 'object',
        properties: {
          fromToken:   { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          toToken:     { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          amount:      { type: 'number' },
          expectedOut: { type: 'number' },
        },
        required: ['fromToken', 'toToken', 'amount', 'expectedOut'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_transactions',
      description: 'Xem lịch sử giao dịch (swap, transfer) gần đây của ví. Dùng khi hỏi "lịch sử", "giao dịch gần đây", "tôi đã swap gì".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Số lượng giao dịch hiển thị (mặc định 5)' },
          token: { type: 'string', description: 'Lọc theo token, ví dụ: USDC, ARC, cirBTC' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transaction',
      description: 'Lấy chi tiết một giao dịch cụ thể theo tx hash. Trả về link ArcScan.',
      parameters: {
        type: 'object',
        properties: {
          txHash: { type: 'string', description: 'Transaction hash dạng 0x...' },
        },
        required: ['txHash'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_tokens',
      description: 'Tìm kiếm token theo tên hoặc symbol. Trả về thông tin token, giá, địa chỉ contract.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Tên hoặc symbol token cần tìm' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_transfer',
      description: 'Chuẩn bị lệnh chuyển token đến ví khác.',
      parameters: {
        type: 'object',
        properties: {
          toAddress: { type: 'string', description: 'Địa chỉ ví nhận (0x...)' },
          token:     { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          amount:    { type: 'number' },
        },
        required: ['toAddress', 'token', 'amount'],
      },
    },
  },
]

const SYSTEM = `Bạn là AI DeFi Agent tự động trên Arc Testnet — blockchain stablecoin-native của Circle.
Bạn hoạt động như một autonomous wallet agent: hiểu ngôn ngữ tự nhiên, lên kế hoạch, và thực thi giao dịch tự động.

Token hỗ trợ: USDC (gas), EURC, ARC, cirBTC (8 decimals), QCAD
Swap route: USDC↔EURC = Circle Swap Kit | Các cặp khác = ArcSwap

Công cụ có sẵn:
- get_wallet_info / get_portfolio: kiểm tra ví và tổng tài sản
- browse_market: xem tất cả cặp giao dịch, giá, liquidity
- search_tokens: tìm kiếm thông tin token
- get_token_prices: giá thị trường
- calculate_quote: tính output chính xác trước swap
- check_swap_liquidity: xác minh liquidity
- list_transactions: lịch sử giao dịch (filter theo token)
- get_transaction: chi tiết một giao dịch cụ thể
- prepare_swap: chuẩn bị swap (→ auto-execute sau 5s)
- prepare_transfer: chuẩn bị chuyển token (→ auto-execute sau 5s)

Quy trình swap (LUÔN tuân theo):
1. calculate_quote → lấy expectedOut chính xác
2. check_swap_liquidity → xác nhận pool đủ tiền
3. prepare_swap với expectedOut từ bước 1
4. Thông báo: "Agent sẽ tự thực hiện sau 5 giây."

Khi user nói "50% USDC", "tất cả ARC": gọi get_wallet_info trước, tính số lượng, rồi swap.
Luôn trả lời tiếng Việt, ngắn gọn, chuyên nghiệp.`

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY chưa set trong Vercel env vars.' })
  }

  const { messages, walletAddress, balances, prices, txHistory } = req.body as {
    messages:      { role: 'user' | 'assistant'; content: string }[]
    walletAddress: string
    balances:      Record<string, number>
    prices:        Record<string, number>
    txHistory:     Array<{
      id: string; time: string; type: string
      fromToken: string; toToken: string
      fromAmount: number; toAmount: number
      price: number; txHash: string; status: string; route?: string
    }>
  }

  const contextMsg = `[Context]\nVí: ${walletAddress || 'Chưa kết nối'}\nSố dư: ${JSON.stringify(balances)}\nGiá: ${JSON.stringify(prices)}`

  const allMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system',    content: SYSTEM },
    { role: 'user',      content: contextMsg },
    { role: 'assistant', content: 'Đã nhận thông tin ví và thị trường.' },
    ...messages,
  ]

  let action: Record<string, unknown> | undefined
  let loopMessages = [...allMessages]

  try {
    for (let i = 0; i < 8; i++) {
      const resp = await client.chat.completions.create({
        model:       MODEL,
        messages:    loopMessages,
        tools:       TOOLS,
        tool_choice: 'auto',
      })

      const msg = resp.choices[0].message
      loopMessages.push(msg as OpenAI.ChatCompletionMessageParam)

      if (!msg.tool_calls?.length) {
        return res.status(200).json({ reply: msg.content ?? '', action })
      }

      const toolResults: OpenAI.ChatCompletionMessageParam[] = []

      for (const tc of msg.tool_calls) {
        const name = tc.function.name
        const inp  = JSON.parse(tc.function.arguments) as Record<string, unknown>
        let result = ''

        // ── get_wallet_info ──────────────────────────────────────────────────
        if (name === 'get_wallet_info') {
          result = JSON.stringify({ address: walletAddress, balances })
        }

        // ── get_portfolio ────────────────────────────────────────────────────
        else if (name === 'get_portfolio') {
          const priceMap: Record<string, number> = {
            USDC: 1, EURC: prices['USDC/EURC'] ? 1 / prices['USDC/EURC'] : 1.08,
          }
          for (const [pair, p] of Object.entries(prices)) {
            const [base] = pair.split('/')
            if (!priceMap[base]) priceMap[base] = p
          }
          let totalUSD = 0
          const lines: string[] = []
          for (const [token, bal] of Object.entries(balances)) {
            if (bal < 0.000001) continue
            const usd = bal * (priceMap[token] ?? 0)
            totalUSD += usd
            const dp = token === 'cirBTC' ? 8 : 4
            lines.push(`  ${token}: ${bal.toFixed(dp)} (~$${usd.toFixed(2)})`)
          }
          result = `Portfolio:\n${lines.join('\n')}\nTổng giá trị: ~$${totalUSD.toFixed(2)} USD`
        }

        // ── browse_market ────────────────────────────────────────────────────
        else if (name === 'browse_market') {
          const lines: string[] = ['=== Thị trường Arc Testnet ===', '']
          lines.push('🔵 Circle Swap Kit (unlimited liquidity):')
          lines.push('  USDC ↔ EURC')
          lines.push('')
          lines.push('⚡ ArcSwap (instant fixed-rate):')

          const checks = await Promise.all(
            ARCSWAP_PAIRS.map(async ([from, to]) => {
              const fAddr = TOKEN_ADDR[from]
              const tAddr = TOKEN_ADDR[to]
              const fDec  = TOKEN_DEC[from] ?? 6
              const tDec  = TOKEN_DEC[to]   ?? 6
              const sampleAmt = BigInt(Math.round(1 * Math.pow(10, fDec)))
              try {
                const [rHex, lHex] = await Promise.all([
                  ethCall(ARC_SWAP, encodeGetAmountOut(fAddr, tAddr, sampleAmt)),
                  ethCall(ARC_SWAP, encodeLiquidity(tAddr)),
                ])
                const rate = hexToNum(rHex, tDec)
                const liq  = hexToNum(lHex, tDec)
                return { from, to, rate, liq, tDec, ok: rate > 0 }
              } catch {
                return { from, to, rate: 0, liq: 0, tDec, ok: false }
              }
            })
          )

          for (const c of checks) {
            if (!c.ok) continue
            const dp = c.tDec === 8 ? 8 : 4
            const liqStr = c.liq < 0.001 ? '⚠️ thấp' : c.liq.toFixed(dp)
            lines.push(`  ${c.from}→${c.to}: 1 ${c.from} = ${c.rate.toFixed(dp)} ${c.to} | pool: ${liqStr} ${c.to}`)
          }
          result = lines.join('\n')
        }

        // ── get_token_prices ─────────────────────────────────────────────────
        else if (name === 'get_token_prices') {
          result = JSON.stringify(prices)
        }

        // ── list_transactions ────────────────────────────────────────────────
        else if (name === 'list_transactions') {
          const { limit = 5, token } = inp as { limit?: number; token?: string }
          const hist = (txHistory ?? [])
          const filtered = token
            ? hist.filter(t => t.fromToken === token || t.toToken === token)
            : hist
          const rows = filtered.slice(0, limit).map(t =>
            `[${t.time}] ${t.type === 'buy' ? '📈' : '📉'} ${t.fromAmount.toFixed(t.fromToken === 'cirBTC' ? 8 : 4)} ${t.fromToken} → ${t.toAmount.toFixed(t.toToken === 'cirBTC' ? 8 : 4)} ${t.toToken} | ${t.status} | ${t.route ?? 'arcswap'} | tx: ${t.txHash ? t.txHash.slice(0,12) + '...' : 'N/A'}`
          )
          result = rows.length
            ? `Lịch sử giao dịch (${rows.length} gần nhất):\n${rows.join('\n')}`
            : 'Chưa có giao dịch nào trong lịch sử.'
        }

        // ── get_transaction ──────────────────────────────────────────────────
        else if (name === 'get_transaction') {
          const { txHash } = inp as { txHash: string }
          const found = (txHistory ?? []).find(t => t.txHash === txHash || t.txHash?.startsWith(txHash.slice(0, 10)))
          if (found) {
            result = `Giao dịch: ${found.fromAmount} ${found.fromToken} → ${found.toAmount} ${found.toToken}\nThời gian: ${found.time}\nTrạng thái: ${found.status}\nRoute: ${found.route ?? 'arcswap'}\nArcScan: https://testnet.arcscan.app/tx/${found.txHash}`
          } else {
            result = `Tx hash: ${txHash}\nXem trực tiếp trên ArcScan: https://testnet.arcscan.app/tx/${txHash}`
          }
        }

        // ── search_tokens ────────────────────────────────────────────────────
        else if (name === 'search_tokens') {
          const { query } = inp as { query: string }
          const q = query.toLowerCase()
          const TOKEN_INFO: Record<string, { name: string; decimals: number; desc: string }> = {
            USDC:   { name: 'USD Coin',        decimals: 6, desc: 'Stablecoin USD, gas token của Arc Testnet' },
            EURC:   { name: 'Euro Coin',        decimals: 6, desc: 'Stablecoin EUR của Circle' },
            ARC:    { name: 'Arc Token',        decimals: 6, desc: 'Native token của Arc Testnet ecosystem' },
            cirBTC: { name: 'Circle Bitcoin',   decimals: 8, desc: 'Bitcoin được tokenized bởi Circle trên Arc' },
            QCAD:   { name: 'QCAD',             decimals: 6, desc: 'Stablecoin CAD của Stablecorp' },
          }
          const matches = Object.entries(TOKEN_INFO).filter(
            ([sym, info]) => sym.toLowerCase().includes(q) || info.name.toLowerCase().includes(q) || info.desc.toLowerCase().includes(q)
          )
          if (!matches.length) {
            result = `Không tìm thấy token nào khớp với "${query}". Token hỗ trợ: USDC, EURC, ARC, cirBTC, QCAD`
          } else {
            result = matches.map(([sym, info]) => {
              const price = (prices as Record<string, number>)[`${sym}/USDC`] ?? (sym === 'USDC' ? 1 : 0)
              const addr  = TOKEN_ADDR[sym]
              return `${sym} (${info.name})\n  Decimals: ${info.decimals} | Giá: ~$${price || 'N/A'}\n  Contract: ${addr}\n  Mô tả: ${info.desc}`
            }).join('\n\n')
          }
        }

        // ── calculate_quote ──────────────────────────────────────────────────
        else if (name === 'calculate_quote') {
          const { fromToken, toToken, amount } = inp as { fromToken: string; toToken: string; amount: number }
          const fAddr = TOKEN_ADDR[fromToken]
          const tAddr = TOKEN_ADDR[toToken]
          const fDec  = TOKEN_DEC[fromToken] ?? 6
          const tDec  = TOKEN_DEC[toToken]   ?? 6

          if (!fAddr || !tAddr) {
            result = 'Token không hỗ trợ.'
          } else if (
            (fromToken === 'USDC' && toToken === 'EURC') ||
            (fromToken === 'EURC' && toToken === 'USDC')
          ) {
            const rate = prices[`${fromToken}/${toToken}`] ?? (fromToken === 'USDC' ? 0.926 : 1.08)
            const out  = amount * rate
            result = `${amount} ${fromToken} → ~${out.toFixed(4)} ${toToken} (Circle Swap Kit)`
          } else {
            const amtRaw = BigInt(Math.round(amount * Math.pow(10, fDec)))
            const outHex = await ethCall(ARC_SWAP, encodeGetAmountOut(fAddr, tAddr, amtRaw))
            const out    = hexToNum(outHex, tDec)
            if (out === 0) {
              result = `Không có rate cho ${fromToken}→${toToken}.`
            } else {
              const dp = tDec === 8 ? 8 : 4
              result = `${amount} ${fromToken} → ${out.toFixed(dp)} ${toToken} (rate: 1 ${fromToken} = ${(out/amount).toFixed(dp)} ${toToken})`
            }
          }
        }

        // ── check_swap_liquidity ─────────────────────────────────────────────
        else if (name === 'check_swap_liquidity') {
          const { fromToken, toToken, amount } = inp as { fromToken: string; toToken: string; amount: number }
          if (fromToken === 'USDC' && toToken === 'EURC' || fromToken === 'EURC' && toToken === 'USDC') {
            result = 'OK: Circle Swap Kit có unlimited liquidity.'
          } else {
            const fAddr = TOKEN_ADDR[fromToken]
            const tAddr = TOKEN_ADDR[toToken]
            const fDec  = TOKEN_DEC[fromToken] ?? 6
            const tDec  = TOKEN_DEC[toToken]   ?? 6
            const amtRaw = BigInt(Math.round(amount * Math.pow(10, fDec)))
            const dp = tDec === 8 ? 8 : 4
            try {
              const [outHex, liqHex] = await Promise.all([
                ethCall(ARC_SWAP, encodeGetAmountOut(fAddr, tAddr, amtRaw)),
                ethCall(ARC_SWAP, encodeLiquidity(tAddr)),
              ])
              const expectedOut = hexToNum(outHex, tDec)
              const liquidity   = hexToNum(liqHex, tDec)
              if (expectedOut === 0) result = `Rate chưa set cho ${fromToken}→${toToken}.`
              else if (liquidity < expectedOut) result = `Không đủ liquidity: cần ${expectedOut.toFixed(dp)}, pool có ${liquidity.toFixed(dp)} ${toToken}.`
              else result = `OK: ${amount} ${fromToken} → ~${expectedOut.toFixed(dp)} ${toToken}. Pool: ${liquidity.toFixed(dp)} ${toToken}.`
            } catch { result = 'RPC lỗi khi kiểm tra liquidity.' }
          }
        }

        // ── prepare_swap ─────────────────────────────────────────────────────
        else if (name === 'prepare_swap') {
          const { fromToken, toToken, amount, expectedOut } = inp as {
            fromToken: string; toToken: string; amount: number; expectedOut: number
          }
          action = { type: 'swap', fromToken, toToken, amount, expectedOut }
          result = `Đã chuẩn bị swap: ${amount} ${fromToken} → ~${expectedOut} ${toToken}. Frontend sẽ tự thực hiện sau đếm ngược 5 giây.`
        }

        // ── prepare_transfer ─────────────────────────────────────────────────
        else if (name === 'prepare_transfer') {
          const { toAddress, token, amount } = inp as { toAddress: string; token: string; amount: number }
          action = { type: 'transfer', toAddress, token, amount }
          result = `Đã chuẩn bị chuyển ${amount} ${token} → ${toAddress}. Frontend sẽ tự thực hiện sau đếm ngược 5 giây.`
        }

        toolResults.push({
          role: 'tool', tool_call_id: tc.id, content: result,
        } as OpenAI.ChatCompletionMessageParam)
      }

      loopMessages.push(...toolResults)
    }

    const last = [...loopMessages].reverse().find(m => m.role === 'assistant') as { content?: string } | undefined
    return res.status(200).json({ reply: last?.content ?? 'Xong.', action })

  } catch (e) {
    console.error('[agent]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
