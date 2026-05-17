// Cloudflare Pages Function — proxy kiểm tra trạng thái airdrop
// Fetch từ CryptoRank & Dropstab, trả về danh sách dự án chưa airdrop

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() })
  }

  try {
    // Thử lấy từ CryptoRank public API (không cần key)
    const res = await fetch(
      'https://api.cryptorank.io/v0/coins?status=active&hasPotentialAirdrop=true&limit=50',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    )

    if (res.ok) {
      const text = await res.text()
      return new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors() },
      })
    }

    throw new Error(`upstream ${res.status}`)
  } catch {
    // Fallback: trả về status thành công để client dùng local data
    return new Response(JSON.stringify({ ok: false, message: 'upstream unavailable' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors() },
    })
  }
}

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
