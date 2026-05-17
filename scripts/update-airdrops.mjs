/**
 * update-airdrops.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Chạy hàng ngày qua GitHub Actions.
 * 1. Đọc src/data/airdrops.json hiện tại
 * 2. Với mỗi dự án → tìm kiếm trên X API (Bearer Token) + CryptoRank scrape
 * 3. Nếu phát hiện token đã launch → đánh dấu hasToken: true, chuyển sang graduated
 * 4. Tìm dự án mới tiềm năng từ CryptoRank drophunting
 * 5. Ghi lại file JSON (GitHub Action sẽ commit auto)
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir   = dirname(fileURLToPath(import.meta.url))
const DATA    = join(__dir, '..', 'src', 'data', 'airdrops.json')
const X_TOKEN = process.env.X_BEARER_TOKEN ?? ''

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`) }

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

// ── X API search ──────────────────────────────────────────────────────────────

const TGE_KEYWORDS = [
  'token launch', 'tge', 'token generation event', 'airdrop live',
  'claim your tokens', 'listing today', 'now live', 'has launched',
  'token is live', 'mainnet token', 'airdrop completed', 'token distributed',
  'airdrop claimed', 'token listed', '$',
]

const NEGATIVE_KEYWORDS = ['upcoming', 'soon', 'rumor', 'predicted', 'might', 'could', 'expected', 'potential']

/**
 * Tìm X tweets cho một dự án.
 * Trả về { hasLaunched: bool, confidence: 'high'|'medium'|'low', tweets: [] }
 */
async function searchX(projectName, xSearch) {
  if (!X_TOKEN) return { hasLaunched: false, confidence: 'low', tweets: [] }

  try {
    const query = encodeURIComponent(
      `(${projectName} token launch OR ${projectName} TGE OR ${projectName} airdrop live) -is:retweet lang:en`
    )

    const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=10&tweet.fields=created_at,public_metrics&sort_order=recency`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${X_TOKEN}` },
    })

    if (!res.ok) {
      log(`X API error for ${projectName}: ${res.status}`)
      return { hasLaunched: false, confidence: 'low', tweets: [] }
    }

    const data = await res.json()
    const tweets = data.data ?? []

    // Phân tích nội dung tweet
    let launchSignals  = 0
    let negativeSignals = 0

    for (const tweet of tweets) {
      const text = tweet.text.toLowerCase()
      const likes = tweet.public_metrics?.like_count ?? 0
      const weight = likes > 500 ? 3 : likes > 100 ? 2 : 1

      for (const kw of TGE_KEYWORDS) {
        if (text.includes(kw)) launchSignals += weight
      }
      for (const kw of NEGATIVE_KEYWORDS) {
        if (text.includes(kw)) negativeSignals++
      }
    }

    const score     = launchSignals - negativeSignals
    const hasLaunched = score >= 4
    const confidence  = score >= 8 ? 'high' : score >= 4 ? 'medium' : 'low'

    return {
      hasLaunched,
      confidence,
      tweets: tweets.slice(0, 3).map((t) => ({
        text: t.text.slice(0, 120),
        likes: t.public_metrics?.like_count ?? 0,
        date:  t.created_at,
      })),
    }
  } catch (err) {
    log(`X search error for ${projectName}: ${err.message}`)
    return { hasLaunched: false, confidence: 'low', tweets: [] }
  }
}

// ── CryptoRank — tìm dự án mới ───────────────────────────────────────────────

async function fetchCryptoRankDropHunting() {
  try {
    // CryptoRank v0 API không cần key, tìm coin chưa trade và có funding
    const res = await fetch(
      'https://api.cryptorank.io/v0/coins?limit=200&isTraded=false&hasFundingRounds=true',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return []

    const json = await res.json()
    const coins = json.data ?? []

    return coins
      .filter((c) => {
        // Chỉ lấy coin chưa trade, có funding, không phải stablecoin
        return c.lifeCycle !== 'traded'
          && c.hasFundingRounds === true
          && c.category !== 'Stablecoin'
      })
      .slice(0, 30)
      .map((c) => ({
        id:        c.key,
        name:      c.name,
        symbol:    c.symbol,
        category:  c.category,
        lifeCycle: c.lifeCycle,
        logo:      c.image?.icon ?? null,
      }))
  } catch (err) {
    log(`CryptoRank fetch error: ${err.message}`)
    return []
  }
}

// ── Telegram alert ────────────────────────────────────────────────────────────

async function sendTelegramAlert(graduates) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    log('⚠️  Không có TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — bỏ qua Telegram')
    return
  }

  const lines = graduates.map((g) =>
    `✅ *${g.name}* đã phát token\\!\nConfidence: \`${g.confidence}\``
  ).join('\n\n')

  const text = `🪂 *Airdrop Bot Alert\\!*\n\n${lines}\n\n_Phát hiện lúc ${new Date().toLocaleString('vi-VN')}_`

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) log('✅ Đã gửi Telegram alert')
    else        log(`❌ Telegram lỗi: ${res.status} ${await res.text()}`)
  } catch (err) {
    log(`❌ Telegram error: ${err.message}`)
  }
}

// ── Discord alert ─────────────────────────────────────────────────────────────

async function sendDiscordAlert(graduates) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    log('⚠️  Không có DISCORD_WEBHOOK_URL — bỏ qua Discord')
    return
  }

  const embeds = graduates.map((g) => ({
    title:       `🚀 ${g.name} đã phát token!`,
    description: `Confidence: **${g.confidence}**`,
    color:       0x00ff88,
    timestamp:   new Date().toISOString(),
    footer:      { text: 'Airdrop Bot · arc-spot-trade' },
  }))

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '🪂 **Airdrop Bot Alert** — Có dự án vừa phát token!',
        embeds,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) log('✅ Đã gửi Discord alert')
    else        log(`❌ Discord lỗi: ${res.status}`)
  } catch (err) {
    log(`❌ Discord error: ${err.message}`)
  }
}

// ── Airdrops.io scrape ────────────────────────────────────────────────────────

async function fetchAirdropsIO() {
  try {
    const res = await fetch('https://airdrops.io/latest/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AirdropBot/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []

    const html = await res.text()

    // Trích xuất tên dự án từ HTML
    const names = []
    const regex = /class="airdrop-name"[^>]*>([^<]+)<\/[^>]+>/g
    let match
    while ((match = regex.exec(html)) !== null) {
      names.push(match[1].trim())
    }

    return names.slice(0, 20)
  } catch {
    return []
  }
}

// ── CoinGecko verify ──────────────────────────────────────────────────────────
// Nguồn đáng tin nhất: nếu coin có market_cap_rank → đang được trade thật sự

/**
 * So sánh tên dự án với tên coin trên CoinGecko.
 * Trả về: 'exact' | 'close' | null
 *
 * Quy tắc tránh false positive:
 * - "MetaMask" vs "MetaMask USD" → length ratio = 8/11 = 0.73 → KHÔNG match (< 0.85)
 * - "Polymarket" vs "Polymarket" → exact match ✓
 * - "Unichain" vs "Unichain" → exact match ✓
 */
function nameMatchLevel(projectName, coinName) {
  const norm  = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const a     = norm(projectName)
  const b     = norm(coinName)

  if (a === b) return 'exact'

  // Phải đủ dài tương đồng — ngăn "MetaMask" khớp "MetaMask USD"
  const shorter = Math.min(a.length, b.length)
  const longer  = Math.max(a.length, b.length)
  if (shorter / longer < 0.85) return null   // quá khác nhau về độ dài

  if (a.startsWith(b) || b.startsWith(a)) return 'close'
  return null
}

async function checkCoinGecko(project) {
  if (project.cgSkip) return { hasToken: false, source: 'skipped' }

  const searchTerm = project.cgSearch ?? project.name
  const CG_KEY     = process.env.COINGECKO_API_KEY ?? ''

  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(searchTerm)}`
    const headers = { Accept: 'application/json' }
    if (CG_KEY) headers['x-cg-demo-api-key'] = CG_KEY

    // Retry với exponential backoff khi bị rate limit (429)
    let res
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) })
      if (res.status !== 429) break
      const wait = attempt * 8_000   // 8s → 16s → 24s
      log(`  ⚠️  CoinGecko 429 — retry ${attempt}/3 sau ${wait/1000}s...`)
      await sleep(wait)
    }

    if (res.status === 429) {
      log(`  ⚠️  CoinGecko rate limit vẫn sau 3 lần — bỏ qua ${project.name}`)
      return { hasToken: false, source: 'rate-limited' }
    }
    if (!res.ok) return { hasToken: false, source: `error-${res.status}` }

    const { coins = [] } = await res.json()
    if (!coins.length) return { hasToken: false, source: 'no-results' }

    // Ưu tiên symbol match (chính xác nhất), sau đó name match
    let bestMatch   = null
    let matchLevel  = null

    for (const c of coins) {
      // Symbol match: chỉ khi project đã biết symbol (tránh match coin khác)
      if (project.symbol && c.symbol?.toUpperCase() === project.symbol.toUpperCase()) {
        bestMatch  = c
        matchLevel = 'symbol'
        break
      }
      // Name match
      const level = nameMatchLevel(project.name, c.name)
      if (level === 'exact' && !bestMatch) { bestMatch = c; matchLevel = 'exact' }
      else if (level === 'close' && !bestMatch) { bestMatch = c; matchLevel = 'close' }
    }

    if (!bestMatch) return { hasToken: false, source: 'no-match' }

    // Phải có market_cap_rank = đang được trade thật
    if (!bestMatch.market_cap_rank) {
      log(`  🔍 CoinGecko: "${bestMatch.name}" (${bestMatch.symbol?.toUpperCase()}) — chưa có market cap`)
      return { hasToken: false, source: 'no-market-cap' }
    }

    // ── Ngưỡng market cap rank theo mức độ match ──
    // Rank thấp (số lớn) = market cap nhỏ = có thể là coin scam trùng tên
    // Symbol match: tin tưởng đến rank 1500
    // Exact name: tin tưởng đến rank 1000
    // Close name: chỉ tin rank < 300 (phải rất nổi bật)
    const rankLimit = matchLevel === 'symbol' ? 1500
                    : matchLevel === 'exact'  ? 1000
                    :                           300   // close match

    if (bestMatch.market_cap_rank > rankLimit) {
      log(`  🔍 CoinGecko: "${bestMatch.name}" $${bestMatch.symbol?.toUpperCase()} rank #${bestMatch.market_cap_rank} — vượt ngưỡng ${rankLimit} cho ${matchLevel} match, bỏ qua`)
      return { hasToken: false, source: 'rank-too-low' }
    }

    const confidence = bestMatch.market_cap_rank <= 300 ? 'high' : 'medium'

    log(`  ✅ CoinGecko match: "${bestMatch.name}" $${bestMatch.symbol?.toUpperCase()} | rank #${bestMatch.market_cap_rank} | match=${matchLevel} | conf=${confidence}`)

    return {
      hasToken:      true,
      coinId:        bestMatch.id,
      coinSymbol:    bestMatch.symbol?.toUpperCase(),
      marketCapRank: bestMatch.market_cap_rank,
      coinName:      bestMatch.name,
      matchLevel,
      confidence,
      source:        'coingecko',
    }
  } catch (err) {
    log(`  CoinGecko error for ${project.name}: ${err.message}`)
    return { hasToken: false, source: 'exception' }
  }
}

// ── Kiểm tra từng dự án hiện tại ─────────────────────────────────────────────

async function checkProjectStatus(project) {
  log(`\nChecking: ${project.name}...`)

  // ① CoinGecko — nguồn tin cậy nhất (không cần API key)
  const cg = await checkCoinGecko(project)
  await sleep(5_000)   // CoinGecko free: ~10 req/min → 5s/req, retry xử lý 429

  if (cg.hasToken) {
    log(`  🪙 CoinGecko confirm: $${cg.coinSymbol} | rank #${cg.marketCapRank} | confidence: ${cg.confidence}`)
    return {
      hasLaunched: true,
      confidence:  cg.confidence,
      source:      'coingecko',
      coinSymbol:  cg.coinSymbol,
      coinId:      cg.coinId,
      marketCapRank: cg.marketCapRank,
      tweets:      [],
      projectId:   project.id,
    }
  }

  log(`  ⬜ CoinGecko: chưa thấy token (${cg.source})`)

  // ② X API — secondary signal
  if (!X_TOKEN) return { hasLaunched: false, confidence: 'low', source: 'no-x-token', tweets: [], projectId: project.id }

  const xResult = await searchX(project.name, project.xSearch ?? project.name)
  await sleep(3_000)   // Rate limit X API

  if (xResult.hasLaunched && xResult.confidence !== 'low') {
    log(`  📣 X API signal: confidence=${xResult.confidence} — cần verify thêm`)
    return { ...xResult, source: 'x-api', projectId: project.id }
  }

  log(`  ✓ ${project.name} → xác nhận chưa có token`)
  return { hasLaunched: false, confidence: 'low', source: 'clean', tweets: [], projectId: project.id }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('═══ Airdrop Update Job bắt đầu ═══')

  // 1. Đọc dữ liệu hiện tại
  const raw   = readFileSync(DATA, 'utf-8')
  const store = JSON.parse(raw)

  const projects  = store.projects    ?? []
  const graduated = store.graduated   ?? []

  log(`Hiện có ${projects.length} dự án active, ${graduated.length} đã graduated`)

  // 2. Kiểm tra từng dự án — CoinGecko (primary) + X API (secondary)
  const stillActive  = []
  const newGraduated = []

  if (!X_TOKEN) log('⚠️  Không có X_BEARER_TOKEN — chỉ dùng CoinGecko verify')

  log(`\n── Bắt đầu verify ${projects.length} dự án ──`)

  for (const project of projects) {
    const status = await checkProjectStatus(project)

    if (status.hasLaunched && status.confidence !== 'low') {
      log(`✅ ${project.name} ĐÃ CÓ TOKEN! source=${status.source} confidence=${status.confidence}`)
      newGraduated.push({
        id:           project.id,
        name:         project.name,
        logo:         project.logo,
        detectedAt:   new Date().toISOString().split('T')[0],
        confidence:   status.confidence,
        source:       status.source,
        coinSymbol:   status.coinSymbol ?? null,
        marketCapRank: status.marketCapRank ?? null,
        evidence:     status.tweets ?? [],
      })
    } else {
      stillActive.push(project)
    }
  }

  // 2b. Gửi alert nếu có dự án mới graduated
  if (newGraduated.length > 0) {
    log(`\n🔔 Phát hiện ${newGraduated.length} dự án mới graduated — gửi alerts...`)
    await Promise.allSettled([
      sendTelegramAlert(newGraduated),
      sendDiscordAlert(newGraduated),
    ])
  }

  // 3. Fetch CryptoRank để xem dự án mới
  log('\nFetch CryptoRank drophunting...')
  const crCoins     = await fetchCryptoRankDropHunting()
  const existingIds = new Set(projects.map((p) => p.id))

  const newSuggestions = crCoins
    .filter((c) => !existingIds.has(c.id))
    .slice(0, 5)

  if (newSuggestions.length > 0) {
    log(`\n📌 CryptoRank gợi ý ${newSuggestions.length} dự án mới cần xem xét:`)
    newSuggestions.forEach((c) => log(`   - ${c.name} (${c.symbol}) [${c.lifeCycle}]`))
  }

  // 4. Fetch airdrops.io
  log('\nFetch airdrops.io...')
  const airdropsIONames = await fetchAirdropsIO()
  if (airdropsIONames.length > 0) {
    log(`airdrops.io có ${airdropsIONames.length} tên: ${airdropsIONames.join(', ')}`)
  }

  // 5. Ghi lại JSON
  const updated = {
    lastUpdated: new Date().toISOString().split('T')[0],
    source:      'Auto-updated daily via GitHub Actions · X API + CryptoRank + airdrops.io',
    updateLog: {
      graduatedThisRun:  newGraduated.map((g) => g.name),
      checkedProjects:   projects.length,
      runAt:             new Date().toISOString(),
      xApiUsed:          !!X_TOKEN,
      coinGeckoUsed:     true,
      verificationSources: ['coingecko', X_TOKEN ? 'x-api' : null].filter(Boolean),
      newSuggestionsFromCryptoRank: newSuggestions.map((c) => `${c.name} (${c.symbol})`),
    },
    projects:  stillActive,
    graduated: [
      ...newGraduated,
      ...(graduated.filter((g) => !newGraduated.find((n) => n.id === g.id))),
    ],
  }

  writeFileSync(DATA, JSON.stringify(updated, null, 2), 'utf-8')

  log(`\n═══ Kết quả ═══`)
  log(`  Active:    ${stillActive.length} dự án`)
  log(`  Graduated: ${newGraduated.length} dự án mới phát hiện`)
  log(`  File đã ghi: ${DATA}`)
  log('═══ Done ═══')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
