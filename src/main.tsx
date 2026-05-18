import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'
import App from './App.tsx'
import { wagmiConfig } from './config/wagmi.ts'

// Intercept Circle API calls and route through our CORS proxy
// This removes the x-user-agent header that Circle's API blocks in browsers.
const _fetch = window.fetch.bind(window)
window.fetch = function (input, init) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : (input as Request).url

  if (url.startsWith('https://api.circle.com/v1/stablecoinKits')) {
    const proxyUrl = url.replace(
      'https://api.circle.com/v1/stablecoinKits',
      '/api/circle/stablecoinKits',
    )
    const headers = new Headers((init?.headers as HeadersInit) ?? {})
    headers.delete('x-user-agent')
    return _fetch(proxyUrl, { ...init, headers })
  }

  return _fetch(input, init)
}

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#7c3aed',
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
