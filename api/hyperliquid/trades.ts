import type { VercelRequest, VercelResponse } from '@vercel/node'

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)

    const upstream = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const text = await upstream.text()
    res.setHeader('Content-Type', 'application/json')
    res.status(upstream.status).send(text)
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', detail: String(err) })
  }
}
