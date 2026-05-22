/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURNKEY_ORG_ID: string
  readonly VITE_TURNKEY_AUTH_PROXY_CONFIG_ID: string
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  readonly VITE_CIRCLE_KIT_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
