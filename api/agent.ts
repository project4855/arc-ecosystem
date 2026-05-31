// api/agent.ts — Autonomous DeFi Agent using Grok (xAI) tool use
// xAI API is OpenAI-compatible: baseURL = https://api.x.ai/v1
import OpenAI from 'openai'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const client = new OpenAI({
  apiKey:  process.env.XAI_API_KEY ?? '',
  baseURL: 'https://api.x.ai/v1',
})

const MODEL = 'grok-3-mini-beta'

// ── Token config ─────────────────────────────────────────────────────────────
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

function encodeGetAmountOut(tIn: string, tOut: string, amt: bigint): string {
  const pad = (s: string) => s.toLowerCase().replace('0x', '').padStart(64, '0')
  return '0xb10a6fd6' + pad(tIn) + pad(tOut) + amt.toString(16).padStart(64, '0')
}
function encodeLiquidity(token: string): string {
  return '0x1090ce62' + token.toLowerCase().replace('0x', '').padStart(64, '0')
}
function hexToNum(hex: string, decimals: number): number {
  const big = BigInt(hex === '0x' || hex === '0x0' ? '0x0' : hex)
  return Number(big) / Math.pow(10, decimals)
}

// ── OpenAI-format tools ───────────────────────────────────────────────────────
const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_wallet_info',
      description: 'Lấy địa chỉ ví và số dư tất cả token. Dùng khi user hỏi số dư, ví, tôi có bao nhiêu.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_token_prices',
      description: 'Lấy giá hiện tại của các cặp token trên Arc Testnet.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_swap_liquidity',
      description: 'Kiểm tra liquidity trên ArcSwap cho cặp token. Luôn gọi trước khi prepare_swap.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          toToken:   { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          amount:    { type: 'number', description: 'Số lượng fromToken muốn swap' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_swap',
      description: 'Chuẩn bị lệnh swap. Frontend sẽ hiện nút Xác nhận để user ký giao dịch.',
      parameters: {
        type: 'object',
        properties: {
          fromToken:   { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          toToken:     { type: 'string', enum: ['USDC','EURC','ARC','cirBTC','QCAD'] },
          amount:      { type: 'number', description: 'Số lượng fromToken' },
          expectedOut: { type: 'number', description: 'Số lượng toToken dự kiến' },
        },
        required: ['fromToken', 'toToken', 'amount', 'expectedOut'],
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

const SYSTEM = `Bạn là AI DeFi Agent trên Arc Testnet — blockchain stablecoin-native của Circle.
Bạn giúp người dùng: kiểm tra số dư, xem giá, swap token, chuyển token.

Token hỗ trợ: USDC (gas), EURC, ARC, cirBTC (8 decimals), QCAD
Swap route: USDC↔EURC dùng Circle Swap Kit | Các cặp khác dùng ArcSwap contract

Quy tắc:
- Trả lời tiếng Việt, ngắn gọn
- Trước khi prepare_swap, luôn gọi check_swap_liquidity trước
- Không swap nếu số dư không đủ
- Sau khi prepare_swap/prepare_transfer, nói: "Bấm Xác nhận để thực hiện giao dịch."`

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.XAI_API_KEY) {
    return res.status(500).json({ error: 'XAI_API_KEY chưa được set trong Vercel Environment Variables.' })
  }

  const { messages, walletAddress, balances, prices } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    walletAddress: string
    balances: Record<string, number>
    prices:   Record<string, number>
  }

  // Context injection
  const contextMsg = `[Thông tin hiện tại]\nVí: ${walletAddress || 'Chưa kết nối'}\nSố dư: ${JSON.stringify(balances)}\nGiá: ${JSON.stringify(prices)}`

  const allMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'user',      content: contextMsg },
    { role: 'assistant', content: 'Đã nhận thông tin ví và giá.' },
    ...messages,
  ]

  let action: Record<string, unknown> | undefined
  let loopMessages = [...allMessages]

  try {
    for (let i = 0; i < 6; i++) {
      const resp = await client.chat.completions.create({
        model:    MODEL,
        messages: loopMessages,
        tools:    TOOLS,
        tool_choice: 'auto',
        system: SYSTEM,
      } as OpenAI.ChatCompletionCreateParamsNonStreaming & { system?: string })

      const msg = resp.choices[0].message
      loopMessages.push(msg as OpenAI.ChatCompletionMessageParam)

      // No tool calls → done
      if (!msg.tool_calls?.length) {
        return res.status(200).json({ reply: msg.content ?? '', action })
      }

      // Handle tool calls
      const toolResults: OpenAI.ChatCompletionMessageParam[] = []

      for (const tc of msg.tool_calls) {
        const name = tc.function.name
        const inp  = JSON.parse(tc.function.arguments) as Record<string, unknown>
        let result = ''

        if (name === 'get_wallet_info') {
          result = JSON.stringify({ address: walletAddress, balances })
        }
        else if (name === 'get_token_prices') {
          result = JSON.stringify(prices)
        }
        else if (name === 'check_swap_liquidity') {
          const { fromToken, toToken, amount } = inp as { fromToken: string; toToken: string; amount: number }
          const fAddr = TOKEN_ADDR[fromToken]
          const tAddr = TOKEN_ADDR[toToken]
          const fDec  = TOKEN_DEC[fromToken] ?? 6
          const tDec  = TOKEN_DEC[toToken]   ?? 6
          if (!fAddr || !tAddr) {
            result = `Token không hỗ trợ.`
          } else {
            const amtRaw = BigInt(Math.round(amount * Math.pow(10, fDec)))
            try {
              const [outHex, liqHex] = await Promise.all([
                ethCall(ARC_SWAP, encodeGetAmountOut(fAddr, tAddr, amtRaw)),
                ethCall(ARC_SWAP, encodeLiquidity(tAddr)),
              ])
              const expectedOut = hexToNum(outHex, tDec)
              const liquidity   = hexToNum(liqHex, tDec)
              const dp = tDec === 8 ? 8 : 4
              if (expectedOut === 0) {
                result = `Rate chưa set cho ${fromToken}→${toToken}.`
              } else if (liquidity < expectedOut) {
                result = `Không đủ liquidity: cần ${expectedOut.toFixed(dp)} ${toToken}, pool chỉ có ${liquidity.toFixed(dp)}.`
              } else {
                result = `OK: ${amount} ${fromToken} → ~${expectedOut.toFixed(dp)} ${toToken}. Pool còn ${liquidity.toFixed(dp)} ${toToken}.`
              }
            } catch {
              result = 'RPC lỗi, không kiểm tra được liquidity.'
            }
          }
        }
        else if (name === 'prepare_swap') {
          const { fromToken, toToken, amount, expectedOut } = inp as { fromToken: string; toToken: string; amount: number; expectedOut: number }
          action = { type: 'swap', fromToken, toToken, amount, expectedOut }
          result = `Đã chuẩn bị: ${amount} ${fromToken} → ~${expectedOut} ${toToken}`
        }
        else if (name === 'prepare_transfer') {
          const { toAddress, token, amount } = inp as { toAddress: string; token: string; amount: number }
          action = { type: 'transfer', toAddress, token, amount }
          result = `Đã chuẩn bị: chuyển ${amount} ${token} → ${toAddress}`
        }

        toolResults.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        } as OpenAI.ChatCompletionMessageParam)
      }

      loopMessages.push(...toolResults)
    }

    // Fallback if loop exhausted
    const last = loopMessages.findLast(m => m.role === 'assistant') as { content?: string } | undefined
    return res.status(200).json({ reply: last?.content ?? 'Xong.', action })

  } catch (e) {
    console.error('[agent]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
