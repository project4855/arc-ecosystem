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

// ── General Commerce Marketplace ─────────────────────────────────────────────
interface Product { id:string; name:string; author:string; category:string; description:string; price:number }
const PRODUCTS: Product[] = [
  // 📚 E-Books
  {id:'1', name:'The Great Gatsby',                author:'F. Scott Fitzgerald', category:'E-Book',       description:'Classic American novel — the roaring 20s, wealth and dreams',           price:0.1  },
  {id:'2', name:'Atomic Habits',                   author:'James Clear',         category:'E-Book',       description:'Tiny changes, remarkable results — bestseller on habit formation',       price:0.2  },
  {id:'3', name:'The Psychology of Money',         author:'Morgan Housel',       category:'E-Book',       description:'Timeless lessons on wealth, greed, and happiness',                      price:0.2  },
  {id:'4', name:'Clean Code',                      author:'Robert C. Martin',    category:'E-Book',       description:'A handbook of agile software craftsmanship for developers',             price:0.3  },
  {id:'5', name:'Dune',                            author:'Frank Herbert',       category:'E-Book',       description:'Epic sci-fi saga — the most celebrated novel in the genre',             price:0.15 },
  {id:'6', name:'Harry Potter & the Sorcerer',     author:'J.K. Rowling',        category:'E-Book',       description:'The magical world of Hogwarts begins — collector edition',              price:0.25 },
  // 🎬 Movie Tickets
  {id:'7', name:'Avengers: Doomsday (2026)',       author:'Marvel Studios',      category:'Movie Ticket', description:'IMAX ticket — Avengers assemble one final time. May 2026',             price:0.5  },
  {id:'8', name:'Mission: Impossible 8',           author:'Paramount Pictures',  category:'Movie Ticket', description:'Standard ticket — Tom Cruise returns for the ultimate mission',       price:0.4  },
  {id:'9', name:'Moana 2',                         author:'Disney Animation',    category:'Movie Ticket', description:'Family ticket (4 seats) — magical voyage continues',                  price:1.2  },
  {id:'10',name:'Inception (Remaster 4K)',         author:'Warner Bros',         category:'Movie Ticket', description:'Premium 4DX ticket — Nolan\'s masterpiece re-released in 4K',        price:0.6  },
  // ✈️ Flight Tickets
  {id:'11',name:'HAN → HCM (VietJet)',             author:'VietJet Air',         category:'Flight Ticket',description:'Hanoi → Ho Chi Minh City, Economy class, one-way',                  price:3.0  },
  {id:'12',name:'SGN → Bangkok (AirAsia)',         author:'AirAsia',             category:'Flight Ticket',description:'Ho Chi Minh → Bangkok, Economy, direct flight',                     price:5.0  },
  {id:'13',name:'HAN → Singapore (Singapore Air)', author:'Singapore Airlines',  category:'Flight Ticket',description:'Hanoi → Singapore, Business class, one-way',                       price:15.0 },
  {id:'14',name:'SGN → Tokyo (Vietnam Airlines)',  author:'Vietnam Airlines',    category:'Flight Ticket',description:'Ho Chi Minh → Tokyo Narita, Economy, return',                      price:12.0 },
  // 🎵 Concert & Events
  {id:'15',name:'Sơn Tùng MTP Live Concert',      author:'M-TP Entertainment',  category:'Concert',      description:'VIP ticket — Sơn Tùng live show, Mỹ Đình Stadium 2026',              price:2.0  },
  {id:'16',name:'Taylor Swift Eras Tour',          author:'Live Nation',         category:'Concert',      description:'Floor ticket — The Eras Tour 2026, Asia leg',                         price:8.0  },
  {id:'17',name:'Mỹ Tâm Tour 2026',               author:'Mỹ Tâm Productions',  category:'Concert',      description:'Standard ticket — Mỹ Tâm nationwide tour, HCMC show',                price:1.5  },
  {id:'18',name:'EDM Festival ArcFest 2026',       author:'ArcFest',             category:'Concert',      description:'3-day pass — Arc ecosystem music festival, blockchain + beats',        price:3.0  },
  // 🎮 Gaming
  {id:'19',name:'GTA VI (PC)',                     author:'Rockstar Games',      category:'Game',         description:'Grand Theft Auto VI — most anticipated game of the decade',            price:2.0  },
  {id:'20',name:'Minecraft Java Edition',          author:'Mojang Studios',      category:'Game',         description:'Unlimited creative world — Java Edition, lifetime license',            price:1.5  },
  {id:'21',name:'FIFA 2026 Ultimate Edition',      author:'EA Sports',           category:'Game',         description:'Full game + 4600 FIFA points — football simulator 2026',             price:2.5  },
  {id:'22',name:'Steam Wallet $10',                author:'Valve Steam',         category:'Game',         description:'$10 Steam gift card — buy any game on Steam store',                   price:1.0  },
  // 🍕 Food & Dining
  {id:'23',name:'Grab Food Voucher 50K',           author:'Grab Vietnam',        category:'Food',         description:'50,000 VND food delivery voucher — valid all restaurants',             price:0.3  },
  {id:'24',name:'Starbucks Coffee Bundle',         author:'Starbucks Vietnam',   category:'Food',         description:'Buy 2 get 1 free — any venti-size drink, valid 30 days',              price:0.5  },
  {id:'25',name:'Pizza 4P\'s Dining Voucher',      author:"Pizza 4P's",          category:'Food',         description:'Dinner for 2 — include 2 pizzas and 2 drinks',                         price:1.5  },
  {id:'26',name:'Highlands Coffee 3-pack',         author:'Highlands Coffee',    category:'Food',         description:'3 any-size drinks voucher — valid at all branches',                    price:0.4  },
  // 🏨 Hotels
  {id:'27',name:'Marriott Hanoi 1 Night',          author:'Marriott Hotels',     category:'Hotel',        description:'Deluxe room, breakfast included, city view — JW Marriott Hanoi',     price:8.0  },
  {id:'28',name:'Vinpearl Resort 2 Nights',        author:'Vinpearl',            category:'Hotel',        description:'Beach resort room, Nha Trang — 2 nights with breakfast',             price:6.0  },
  {id:'29',name:'Mường Thanh Đà Lạt',             author:'Mường Thanh Hotels',  category:'Hotel',        description:'Mountain view room, 1 night — enjoy Da Lat highland weather',        price:2.0  },
  // 🎓 Online Courses
  {id:'30',name:'React + TypeScript 2026',         author:'Udemy',               category:'Course',       description:'Complete React & TypeScript bootcamp — 40 hours, certificate',       price:0.5  },
  {id:'31',name:'AI & Machine Learning A-Z',       author:'Coursera',            category:'Course',       description:'Google-certified AI/ML course — 6 months access',                    price:1.0  },
  {id:'32',name:'Blockchain Developer Bootcamp',   author:'Alchemy University',  category:'Course',       description:'Full-stack Web3 development — Solidity, ethers.js, DeFi',            price:0.8  },
  {id:'33',name:'IELTS 7.0+ Preparation',          author:'British Council',     category:'Course',       description:'60-day intensive IELTS prep — all 4 skills, mock tests',            price:1.5  },
  // 🛍️ Shopping
  {id:'34',name:'Shopee Voucher 100K',             author:'Shopee Vietnam',      category:'Shopping',     description:'100,000 VND Shopee voucher — min order 150K, valid 7 days',          price:0.5  },
  {id:'35',name:'Tiki Premium 1 Month',            author:'Tiki Vietnam',        category:'Shopping',     description:'Free 2-hour delivery + 15% cashback on all orders for 1 month',     price:0.4  },
  {id:'36',name:'Lazada Birthday Voucher',         author:'Lazada Vietnam',      category:'Shopping',     description:'20% off any item up to 200K — valid all categories',                  price:0.3  },
  // 🎟️ Other
  {id:'37',name:'Vincom Cinema Bundle',            author:'CGV Vincom',          category:'Entertainment',description:'3 movie tickets — any film, any showtime, 30-day validity',          price:0.9  },
  {id:'38',name:'VinWonders Nha Trang Ticket',     author:'VinWonders',          category:'Entertainment',description:'Full-day access to VinWonders Nha Trang theme park',                 price:2.0  },
  {id:'39',name:'Netflix 1 Month Premium',         author:'Netflix',             category:'Streaming',    description:'4K Ultra HD, 4 screens simultaneously — 30 days',                    price:0.8  },
  {id:'40',name:'Spotify Premium 3 Months',        author:'Spotify',             category:'Streaming',    description:'Ad-free music, offline listening — 3 months subscription',           price:0.6  },
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
