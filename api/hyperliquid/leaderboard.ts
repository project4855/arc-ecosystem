import type { VercelRequest, VercelResponse } from '@vercel/node'

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const upstream = await fetch(
      'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard',
      { headers: { Accept: 'application/json' } }
    )
    const text = await upstream.text()
    res.setHeader('Content-Type', 'application/json')
    res.status(upstream.status).send(text)
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', detail: String(err) })
  }
}
