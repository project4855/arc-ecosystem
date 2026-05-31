// api/agent.ts — Autonomous DeFi Agent (JSON-mode, no native tool use)
// Works with any LLM: model returns { "tool": "...", "args": {...} } JSON
// We parse + execute manually → no Groq tool API compatibility issues
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
const ARC_SWAP          = '0x8C16097F1f9a4B7Fab0497C29D3fC6a85a43C550'
const ARC_RPC           = 'https://rpc.testnet.arc.network'
const MARKETPLACE_WALLET = '0xDfF4CBf94D459AeAa5cb34fa11eBE49b6213E9c9'

// ── RPC helpers ───────────────────────────────────────────────────────────────
async function ethCall(to: string, data: string): Promise<string> {
  const r = await fetch(ARC_RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_call', params:[{to,data},'latest'] }),
  })
  const j = await r.json() as { result?: string }
  return j.result || '0x0'
}
const pad = (s: string) => s.toLowerCase().replace('0x','').padStart(64,'0')
const encAmtOut  = (a: string, b: string, n: bigint) => '0xb10a6fd6'+pad(a)+pad(b)+n.toString(16).padStart(64,'0')
const encLiq     = (t: string) => '0x1090ce62'+t.toLowerCase().replace('0x','').padStart(64,'0')
const hexToNum   = (h: string, d: number) => Number(BigInt(h==='0x'||h==='0x0'?'0x0':h)) / Math.pow(10,d)

// ── Marketplace catalog ───────────────────────────────────────────────────────
interface Product { id:string; name:string; author:string; category:string; description:string; price:number }
const PRODUCTS: Product[] = [
  {id:'1', name:'DeFi Fundamentals',           author:'Arc Academy',  category:'Education',    description:'Complete beginner guide to DeFi on Arc Testnet',               price:1.5 },
  {id:'2', name:'Advanced Yield Strategies',   author:'YieldLab',     category:'Education',    description:'Master yield farming and liquidity provision',                  price:3.0 },
  {id:'3', name:'Circle USDC Developer Guide', author:'Circle Docs',  category:'Education',    description:'Build with USDC on Arc — Swap Kit, Bridge Kit, APIs',           price:0.5 },
  {id:'4', name:'ArcSwap Strategy Book',       author:'DeFi Masters', category:'Education',    description:'Optimal swap routing and arbitrage strategies on Arc',          price:2.0 },
  {id:'5', name:'Arc Testnet Analytics Pro',   author:'ArcAnalytics', category:'Analytics',    description:'30-day access to real-time on-chain analytics dashboard',       price:4.0 },
  {id:'6', name:'Portfolio Tracker Access',    author:'CryptoTrack',  category:'Analytics',    description:'Multi-wallet portfolio tracking with USD value alerts',          price:1.0 },
  {id:'7', name:'ARC/USDC Trading Signals',    author:'SignalBot',    category:'Trading',      description:'Weekly AI-powered trading signals for ARC/USDC pair',           price:2.5 },
  {id:'8', name:'cirBTC Price Alert Bot',      author:'AlertBot',     category:'Trading',      description:'Real-time price alerts for cirBTC/USDC and cirBTC/EURC pairs',  price:0.5 },
  {id:'9', name:'Arc Builders Community',      author:'Arc House',    category:'Community',    description:'Premium membership — Discord, ArcTalks, hackathon access',      price:1.0 },
  {id:'10',name:'AI Agent Development Kit',    author:'AgentLab',     category:'Tools',        description:'SDK + templates for building autonomous DeFi agents on Arc',    price:3.5 },
  {id:'11',name:'Smart Contract Audit Report', author:'AuditDAO',     category:'Services',     description:'Security audit report template for Arc Testnet contracts',       price:5.0 },
  {id:'12',name:'DeFi Glossary & Cheatsheet',  author:'CryptoLearn',  category:'Education',    description:'200+ DeFi terms with Arc-specific examples',                    price:0.25},
  {id:'13',name:'Liquidity Provider Guide',    author:'LPMaster',     category:'Education',    description:'Step-by-step guide to providing liquidity on Arc DEXes',        price:1.5 },
  {id:'14',name:'Stablecoin Economics',        author:'EconLab',      category:'Education',    description:'USDC, EURC, cirBTC mechanics and arbitrage deep dive',          price:2.0 },
  {id:'15',name:'Arc Testnet NFT Badge',       author:'ArcNFT',       category:'Collectibles', description:'Exclusive digital badge for Arc Testnet builders',              price:0.1 },
  {id:'16',name:'QCAD Integration Tutorial',   author:'Stablecorp',   category:'Education',    description:'How to integrate Canadian stablecoin QCAD in dApps',           price:0.75},
  {id:'17',name:'Cross-Chain Bridge Mastery',  author:'BridgePro',    category:'Education',    description:'Complete guide to CCTP and cross-chain USDC transfers',         price:2.5 },
  {id:'18',name:'Automated Trading Bot',       author:'BotFactory',   category:'Tools',        description:'Template for automated DeFi trading bots on Arc',              price:4.5 },
  {id:'19',name:'DeFi Risk Assessment',        author:'RiskDAO',      category:'Analytics',    description:'Framework for evaluating smart contract and liquidity risk',    price:1.5 },
  {id:'20',name:'Arc Agentic Economy Guide',   author:'AgentEcon',    category:'Education',    description:'Building ERC-8183 agentic payment flows on Arc',               price:3.0 },
]

const ARCSWAP_PAIRS: [string,string][] = [
  ['USDC','ARC'],['ARC','USDC'],['USDC','cirBTC'],['cirBTC','USDC'],
  ['USDC','QCAD'],['QCAD','USDC'],['EURC','ARC'],['ARC','EURC'],
  ['EURC','cirBTC'],['cirBTC','EURC'],['EURC','QCAD'],['QCAD','EURC'],
]

// ── System prompt with JSON-mode tool schema ──────────────────────────────────
const SYSTEM = `Bạn là AI Autonomous Wallet Agent trên Arc Testnet (Circle blockchain).
Bạn PHẢI trả lời bằng JSON hợp lệ — không bao giờ trả lời plain text.

FORMAT BẮT BUỘC:
{"tool":"<tên_tool>","args":{...},"thinking":"lý do ngắn"}
HOẶC khi đã xong:
{"reply":"<câu trả lời tiếng Việt cho user>","action":null}
HOẶC khi cần thực hiện giao dịch:
{"reply":"<giải thích>","action":{"type":"swap|transfer|purchase",...}}

TOOLS CÓ SẴN:
- get_wallet_info: {} → trả về số dư và địa chỉ ví
- get_portfolio: {} → tổng tài sản bằng USD
- browse_market: {} → danh sách cặp swap với giá và liquidity
- get_token_prices: {} → giá các token
- calculate_quote: {"fromToken":"X","toToken":"Y","amount":N} → output chính xác
- check_swap_liquidity: {"fromToken":"X","toToken":"Y","amount":N} → kiểm tra pool
- prepare_swap: {"fromToken":"X","toToken":"Y","amount":N,"expectedOut":N} → TẠO ACTION SWAP
- prepare_transfer: {"toAddress":"0x...","token":"X","amount":N} → TẠO ACTION TRANSFER
- browse_products: {"category":"Education|Analytics|..."} → xem marketplace (category có thể bỏ trống)
- search_products: {"query":"từ khóa"} → tìm sản phẩm
- get_product_price: {"productId":"1"} → giá sản phẩm
- purchase_product: {"productId":"1"} → TẠO ACTION PURCHASE
- list_transactions: {"limit":5,"token":"USDC"} → lịch sử giao dịch
- get_transaction: {"txHash":"0x..."} → chi tiết tx
- search_tokens: {"query":"tên"} → tìm thông tin token

QUY TRÌNH SWAP (tuần tự, không bỏ bước):
1. calculate_quote → 2. check_swap_liquidity → 3. prepare_swap → reply với action

QUY TRÌNH MUA HÀNG:
1. search_products → 2. get_wallet_info → 3. purchase_product → reply với action

Sau prepare_swap/transfer/purchase, reply phải có action object để frontend thực hiện.
Dùng tiếng Việt trong reply. KHÔNG giải thích format JSON, chỉ output JSON.`

// ── Execute a tool call by name ───────────────────────────────────────────────
async function execTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { walletAddress: string; balances: Record<string,number>; prices: Record<string,number>; txHistory: unknown[] }
): Promise<{ result: string; action?: Record<string, unknown> }> {
  const { walletAddress, balances, prices, txHistory } = ctx
  let result = ''
  let action: Record<string, unknown> | undefined

  if (name === 'get_wallet_info') {
    result = JSON.stringify({ address: walletAddress, balances })
  }
  else if (name === 'get_portfolio') {
    const pm = prices as Record<string,number>
    let total = 0; const lines: string[] = []
    for (const [t,b] of Object.entries(balances)) {
      if (b < 0.000001) continue
      const p = t==='USDC'?1:t==='EURC'?(pm['USDC/EURC']?1/pm['USDC/EURC']:1.08):(pm[`${t}/USDC`]??0)
      total += b*p
      lines.push(`  ${t}: ${b.toFixed(t==='cirBTC'?8:4)} (~$${(b*p).toFixed(2)})`)
    }
    result = `Portfolio:\n${lines.join('\n')}\nTổng: ~$${total.toFixed(2)} USD`
  }
  else if (name === 'get_token_prices') {
    result = JSON.stringify(prices)
  }
  else if (name === 'browse_market') {
    const checks = await Promise.all(ARCSWAP_PAIRS.map(async ([f,t]) => {
      const fa=TOKEN_ADDR[f],ta=TOKEN_ADDR[t],fd=TOKEN_DEC[f]??6,td=TOKEN_DEC[t]??6
      const s=BigInt(Math.round(Math.pow(10,fd)))
      try {
        const [rh,lh]=await Promise.all([ethCall(ARC_SWAP,encAmtOut(fa,ta,s)),ethCall(ARC_SWAP,encLiq(ta))])
        return {f,t,rate:hexToNum(rh,td),liq:hexToNum(lh,td),td,ok:hexToNum(rh,td)>0}
      } catch { return {f,t,rate:0,liq:0,td,ok:false} }
    }))
    const lines=['=== ARC DeFi Marketplace ===','','🔵 Circle (unlimited):','  USDC↔EURC','','⚡ ArcSwap:']
    let i=1
    for (const c of checks) {
      if (!c.ok) continue
      const dp=c.td===8?8:4
      lines.push(`  #${i++} ${c.f}→${c.t}: 1 ${c.f}=${c.rate.toFixed(dp)} ${c.t} | pool:${c.liq<0.0001?'⚠️低':c.liq.toFixed(dp)} ${c.t}`)
    }
    lines.push('','💡 Lệnh: "Swap 5 USDC sang ARC"')
    result = lines.join('\n')
  }
  else if (name === 'calculate_quote') {
    const {fromToken:f,toToken:t,amount:a} = args as {fromToken:string;toToken:string;amount:number}
    if ((f==='USDC'&&t==='EURC')||(f==='EURC'&&t==='USDC')) {
      const p=(prices as Record<string,number>)[`${f}/${t}`]??(f==='USDC'?0.926:1.08)
      result=`${a} ${f} → ~${(a*p).toFixed(4)} ${t} (Circle)`
    } else {
      const fa=TOKEN_ADDR[f],ta=TOKEN_ADDR[t],fd=TOKEN_DEC[f]??6,td=TOKEN_DEC[t]??6
      const raw=BigInt(Math.round(a*Math.pow(10,fd)))
      const h=await ethCall(ARC_SWAP,encAmtOut(fa,ta,raw))
      const out=hexToNum(h,td)
      result=out===0?`Không có rate ${f}→${t}.`:`${a} ${f} → ${out.toFixed(td===8?8:4)} ${t}`
    }
  }
  else if (name === 'check_swap_liquidity') {
    const {fromToken:f,toToken:t,amount:a} = args as {fromToken:string;toToken:string;amount:number}
    if ((f==='USDC'&&t==='EURC')||(f==='EURC'&&t==='USDC')) { result='OK: Circle unlimited liquidity.'; }
    else {
      const fa=TOKEN_ADDR[f],ta=TOKEN_ADDR[t],fd=TOKEN_DEC[f]??6,td=TOKEN_DEC[t]??6,dp=td===8?8:4
      const raw=BigInt(Math.round(a*Math.pow(10,fd)))
      try {
        const [oh,lh]=await Promise.all([ethCall(ARC_SWAP,encAmtOut(fa,ta,raw)),ethCall(ARC_SWAP,encLiq(ta))])
        const o=hexToNum(oh,td),l=hexToNum(lh,td)
        if (o===0) result=`Rate chưa set cho ${f}→${t}.`
        else if (l<o) result=`Không đủ liquidity: cần ${o.toFixed(dp)}, pool có ${l.toFixed(dp)} ${t}.`
        else result=`OK: ${a} ${f} → ~${o.toFixed(dp)} ${t}. Pool: ${l.toFixed(dp)} ${t}.`
      } catch { result='RPC lỗi.' }
    }
  }
  else if (name === 'prepare_swap') {
    const {fromToken,toToken,amount,expectedOut} = args as {fromToken:string;toToken:string;amount:number;expectedOut:number}
    action = {type:'swap',fromToken,toToken,amount,expectedOut}
    result = `Đã chuẩn bị: ${amount} ${fromToken} → ~${expectedOut} ${toToken}`
  }
  else if (name === 'prepare_transfer') {
    const {toAddress,token,amount} = args as {toAddress:string;token:string;amount:number}
    action = {type:'transfer',toAddress,token,amount}
    result = `Đã chuẩn bị: chuyển ${amount} ${token} → ${toAddress}`
  }
  else if (name === 'browse_products') {
    const {category} = args as {category?:string}
    const items = category ? PRODUCTS.filter(p=>p.category.toLowerCase()===category.toLowerCase()) : PRODUCTS
    const byCat: Record<string,Product[]> = {}
    for (const p of items) { (byCat[p.category]??=[]).push(p) }
    const ICON: Record<string,string> = {Education:'📚',Analytics:'📊',Trading:'📈',Tools:'🔧',Community:'🤝',Services:'⚙️',Collectibles:'🏆'}
    const lines=['=== 🛒 ARC DeFi Marketplace ===','']
    for (const [cat,ps] of Object.entries(byCat)) {
      lines.push(`${ICON[cat]??'📦'} ${cat}:`)
      for (const p of ps) lines.push(`  #${p.id} "${p.name}" by ${p.author} — ${p.price} USDC\n     ${p.description}`)
      lines.push('')
    }
    lines.push('💡 Để mua: "Mua \'[tên sản phẩm]\'"')
    result = lines.join('\n')
  }
  else if (name === 'search_products') {
    const {query} = args as {query:string}
    const q=query.toLowerCase()
    const found=PRODUCTS.filter(p=>p.name.toLowerCase().includes(q)||p.author.toLowerCase().includes(q)||p.description.toLowerCase().includes(q))
    result = found.length ? `Tìm thấy ${found.length} sản phẩm:\n`+found.map(p=>`#${p.id} "${p.name}" by ${p.author} — ${p.price} USDC\n  ${p.description}`).join('\n\n')
      : `Không tìm thấy sản phẩm cho "${query}".`
  }
  else if (name === 'get_product_price') {
    const pid=String((args as {productId:unknown}).productId)
    const p=PRODUCTS.find(x=>x.id===pid)
    result = p ? `#${p.id} "${p.name}" by ${p.author}\nGiá: ${p.price} USDC\nDanh mục: ${p.category}\n${p.description}` : `Không tìm thấy #${pid}.`
  }
  else if (name === 'purchase_product') {
    const pid=String((args as {productId:unknown}).productId)
    const p=PRODUCTS.find(x=>x.id===pid)
    if (!p) { result=`Không tìm thấy #${pid}.` }
    else {
      action={type:'purchase',toAddress:MARKETPLACE_WALLET,token:'USDC',amount:p.price,productId:p.id,productName:p.name,author:p.author,category:p.category}
      result=`Chuẩn bị mua "${p.name}" — ${p.price} USDC`
    }
  }
  else if (name === 'list_transactions') {
    const {limit=5,token} = args as {limit?:number;token?:string}
    type TxRec = {time:string;type:string;fromToken:string;toToken:string;fromAmount:number;toAmount:number;status:string;route?:string;txHash?:string}
    const hist=(txHistory as TxRec[])
    const filtered=token?hist.filter(t=>t.fromToken===token||t.toToken===token):hist
    const rows=filtered.slice(0,limit).map(t=>`[${t.time}] ${t.fromAmount.toFixed(t.fromToken==='cirBTC'?8:4)} ${t.fromToken}→${t.toToken} | ${t.status} | ${t.txHash?t.txHash.slice(0,12)+'...':'N/A'}`)
    result = rows.length ? `Lịch sử ${rows.length} giao dịch:\n${rows.join('\n')}` : 'Chưa có giao dịch.'
  }
  else if (name === 'get_transaction') {
    const {txHash} = args as {txHash:string}
    type TxRec2 = {fromAmount:number;fromToken:string;toToken:string;time:string;status:string;route?:string;txHash?:string}
    const found=(txHistory as TxRec2[]).find(t=>t.txHash?.startsWith(txHash.slice(0,10)))
    result = found
      ? `Giao dịch: ${found.fromAmount} ${found.fromToken}→${found.toToken}\n${found.time} | ${found.status}\nArcScan: https://testnet.arcscan.app/tx/${found.txHash}`
      : `ArcScan: https://testnet.arcscan.app/tx/${txHash}`
  }
  else if (name === 'search_tokens') {
    const {query} = args as {query:string}
    const q=query.toLowerCase()
    const INFO: Record<string,{name:string;desc:string}> = {
      USDC:{name:'USD Coin',desc:'Gas token của Arc, stablecoin USD của Circle'},
      EURC:{name:'Euro Coin',desc:'Stablecoin EUR của Circle'},
      ARC:{name:'Arc Token',desc:'Native token của Arc Testnet'},
      cirBTC:{name:'Circle Bitcoin',desc:'Bitcoin tokenized bởi Circle (8 decimals)'},
      QCAD:{name:'QCAD',desc:'Stablecoin CAD của Stablecorp'},
    }
    const matches=Object.entries(INFO).filter(([s,i])=>s.toLowerCase().includes(q)||i.name.toLowerCase().includes(q))
    result = matches.length ? matches.map(([s,i])=>{
      const p=(prices as Record<string,number>)[`${s}/USDC`]??(s==='USDC'?1:0)
      return `${s} (${i.name})\nGiá: ~$${p||'N/A'} | Contract: ${TOKEN_ADDR[s]}\n${i.desc}`
    }).join('\n\n') : `Không tìm thấy token "${query}".`
  }
  else {
    result = `Tool "${name}" không tồn tại.`
  }

  return { result, action }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY missing' })

  const { messages, walletAddress, balances, prices, txHistory } = req.body as {
    messages:      { role:'user'|'assistant'; content:string }[]
    walletAddress: string
    balances:      Record<string,number>
    prices:        Record<string,number>
    txHistory:     unknown[]
  }

  const ctx = `[Context]\nVí: ${walletAddress||'Chưa kết nối'}\nSố dư: ${JSON.stringify(balances)}\nGiá: ${JSON.stringify(prices)}`

  // Build message history
  type Msg = { role:'system'|'user'|'assistant'; content:string }
  const history: Msg[] = [
    { role:'system',    content:SYSTEM },
    { role:'user',      content:ctx },
    { role:'assistant', content:'{"reply":"Đã nhận context. Sẵn sàng.","action":null}' },
    ...messages,
  ]

  let finalReply = ''
  let action: Record<string, unknown> | undefined

  try {
    for (let i = 0; i < 8; i++) {
      const resp = await client.chat.completions.create({
        model:       MODEL,
        messages:    history,
        temperature: 0,
        max_tokens:  1024,
      })

      const raw = resp.choices[0].message.content?.trim() ?? ''

      // Extract JSON — find first {...} block anywhere in the response
      let jsonStr = raw
      if (raw.includes('```')) {
        jsonStr = raw.replace(/```(?:json)?\n?/g,'').replace(/```/g,'').trim()
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) jsonStr = jsonMatch[0]

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(jsonStr) as Record<string, unknown>
      } catch {
        // Still can't parse — if contains a reply keyword, show it; otherwise show raw
        const replyMatch = raw.match(/"reply"\s*:\s*"([^"]+)"/)
        return res.status(200).json({ reply: replyMatch ? replyMatch[1] : raw, action })
      }

      // If model wants to call a tool
      if (parsed.tool && typeof parsed.tool === 'string') {
        const toolName = parsed.tool as string
        const toolArgs = (parsed.args ?? {}) as Record<string, unknown>

        history.push({ role:'assistant', content:jsonStr })

        const { result, action: toolAction } = await execTool(toolName, toolArgs, { walletAddress, balances, prices, txHistory: txHistory ?? [] })

        if (toolAction) action = toolAction

        history.push({ role:'user', content:`Tool result for ${toolName}: ${result}` })
        continue
      }

      // Model gave final reply
      finalReply = String(parsed.reply ?? raw)
      if (parsed.action && typeof parsed.action === 'object' && parsed.action !== null) {
        action = parsed.action as Record<string, unknown>
      }
      break
    }

    return res.status(200).json({ reply: finalReply, action })
  } catch (e) {
    console.error('[agent]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
