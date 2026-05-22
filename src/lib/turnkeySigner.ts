// ── turnkeySigner.ts ──────────────────────────────────────────────────────────
// Module-level singleton: stores a viem WalletClient backed by Turnkey HSM.
// WalletPanel's TurnkeyDashboard populates it after login.
// PaymentsPanel reads it to auto-sign without MetaMask popups.

import { createWalletClient, http, type WalletClient, type Account } from 'viem'
import { createAccountWithAddress } from '@turnkey/viem'
import type { TurnkeySDKClientBase } from '@turnkey/core'
import { arcTestnet } from '../config/wagmi'

let _walletClient: WalletClient | null = null
let _address: `0x${string}` | null = null

/** Called by TurnkeyDashboard when user logs in. */
export async function initTurnkeySigner(
  httpClient: TurnkeySDKClientBase,
  orgId: string,
  address: `0x${string}`,
): Promise<void> {
  try {
    const localAccount = createAccountWithAddress({
      client: httpClient,
      organizationId: orgId,
      signWith: address,
      ethereumAddress: address,
    })

    _walletClient = createWalletClient({
      account: localAccount as Account,
      chain: arcTestnet,
      transport: http('https://rpc.testnet.arc.network'),
    })
    _address = address

    window.dispatchEvent(new CustomEvent('turnkey_signer_ready', { detail: { address } }))
    console.log('[Turnkey] HSM signer ready for', address)
  } catch (err) {
    console.error('[Turnkey] Failed to init signer:', err)
  }
}

/** Returns the active Turnkey WalletClient, or null if not logged in. */
export function getTurnkeyWalletClient(): WalletClient | null {
  return _walletClient
}

/** Returns the active Turnkey address, or null. */
export function getTurnkeyAddress(): `0x${string}` | null {
  return _address
}

/** Called on logout / disconnect. */
export function clearTurnkeySigner(): void {
  _walletClient = null
  _address = null
  window.dispatchEvent(new Event('turnkey_signer_ready'))
}
