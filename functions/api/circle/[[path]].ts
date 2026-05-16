// Cloudflare Pages Function — proxies requests to Circle's API
// This fixes the CORS issue caused by Circle SDK adding x-user-agent header
// which Circle's own API server blocks in browser preflight checks.

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)

  // Strip our /api/circle prefix to get the real Circle API path
  const circlePath = url.pathname.replace(/^\/api\/circle/, '')
  const circleUrl = `https://api.circle.com/v1${circlePath}${url.search}`

  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    })
  }

  // Forward request headers except x-user-agent (blocked by Circle's CORS policy)
  const headers = new Headers()
  for (const [key, value] of context.request.headers.entries()) {
    if (key.toLowerCase() !== 'x-user-agent') {
      headers.set(key, value)
    }
  }

  try {
    const response = await fetch(circleUrl, {
      method: context.request.method,
      headers,
      body: ['GET', 'HEAD'].includes(context.request.method)
        ? undefined
        : context.request.body,
    })

    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })

    // Add CORS headers so browser accepts the response
    for (const [key, value] of Object.entries(corsHeaders())) {
      newResponse.headers.set(key, value)
    }

    return newResponse
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-agent, x-request-id',
  }
}
