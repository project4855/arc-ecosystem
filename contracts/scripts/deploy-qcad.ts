// deploy-qcad.ts — deploy QCAD test token, set ArcSwap rates, fund liquidity
import { ethers } from 'hardhat'

// Existing contracts
const USDC_ADDRESS   = '0x3600000000000000000000000000000000000000'
const EURC_ADDRESS   = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const ARC_ADDRESS    = '0x55e1a127e33C4Ccca470Ea9eE8F15683DEf2dCc1'
const CIRBTC_ADDRESS = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF'
const ARC_SWAP_ADDR  = '0x8C16097F1f9a4B7Fab0497C29D3fC6a85a43C550'

// Exchange rates (2026-05-27):
// 1 CAD ≈ 0.73 USD  →  1 USDC = 1.37 QCAD
// 1 EUR ≈ 1.08 USD  →  1 EURC ≈ 1.48 QCAD
// 1 BTC ≈ 78200 USD →  1 cirBTC = 107,134 QCAD
// 1 ARC = 0.10 USD  →  1 ARC = 0.137 QCAD

// Rate formula: rate = (amountOut_raw / amountIn_raw) * 1e18
// QCAD: 6 decimals (same as USDC/EURC)
//
// USDC(6) → QCAD(6)  1 USDC = 1.37 QCAD   → rate = 1.37e18
// QCAD(6) → USDC(6)  1 QCAD = 0.73 USDC   → rate = 0.73e18
// EURC(6) → QCAD(6)  1 EURC = 1.48 QCAD   → rate = 1.48e18
// QCAD(6) → EURC(6)  1 QCAD = 0.675 EURC  → rate = 0.675e18
// ARC(6)  → QCAD(6)  1 ARC  = 0.137 QCAD  → rate = 0.137e18
// QCAD(6) → ARC(6)   1 QCAD = 7.3 ARC     → rate = 7.3e18
// cirBTC(8)→ QCAD(6) 1 BTC  = 107134 QCAD
//   amountIn_raw=1e8, amountOut_raw=107134*1e6
//   rate = 107134e6 * 1e18 / 1e8 = 107134e16
// QCAD(6) → cirBTC(8) 1 QCAD = 0.00000934 BTC
//   amountIn_raw=1e6, amountOut_raw=0.00000934*1e8=934
//   rate = 934 * 1e18 / 1e6 = 934e12

const toE18 = (x: number) => BigInt(Math.round(x * 1e12)) * 10n**6n  // avoid float precision issues

const QCAD_RATES: [string, string, bigint][] = []  // filled after QCAD deploy

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deployer:', deployer.address)

  // ── 1. Deploy QCAD test token ──────────────────────────────────────────────
  console.log('\n[1] Deploying QCAD test token...')
  const ArcToken = await ethers.getContractFactory('ArcToken')
  const qcad = await ArcToken.deploy(
    'QCAD Stablecoin',   // name
    'QCAD',              // symbol
    6,                   // decimals (same as USDC)
    1_000_000            // 1 million initial supply to deployer
  )
  await qcad.waitForDeployment()
  const QCAD_ADDRESS = await qcad.getAddress()
  console.log('QCAD deployed to:', QCAD_ADDRESS)

  // ── 2. Set rates in ArcSwap ────────────────────────────────────────────────
  console.log('\n[2] Setting ArcSwap rates for QCAD...')
  const arcSwap = await ethers.getContractAt('ArcSwap', ARC_SWAP_ADDR)

  const rates: [string, string, bigint, string][] = [
    [USDC_ADDRESS,   QCAD_ADDRESS, toE18(1.37),    '1 USDC = 1.37 QCAD'],
    [QCAD_ADDRESS,   USDC_ADDRESS, toE18(0.73),    '1 QCAD = 0.73 USDC'],
    [EURC_ADDRESS,   QCAD_ADDRESS, toE18(1.48),    '1 EURC = 1.48 QCAD'],
    [QCAD_ADDRESS,   EURC_ADDRESS, toE18(0.6757),  '1 QCAD = 0.6757 EURC'],
    [ARC_ADDRESS,    QCAD_ADDRESS, toE18(0.137),   '1 ARC  = 0.137 QCAD'],
    [QCAD_ADDRESS,   ARC_ADDRESS,  toE18(7.3),     '1 QCAD = 7.3 ARC'],
    [CIRBTC_ADDRESS, QCAD_ADDRESS, 107134n * 10n**16n, '1 BTC = 107134 QCAD'],
    [QCAD_ADDRESS,   CIRBTC_ADDRESS, 934n * 10n**12n, '1 QCAD = 0.00000934 BTC'],
  ]

  for (const [tokenIn, tokenOut, rate, label] of rates) {
    const tx = await arcSwap.setRate(tokenIn, tokenOut, rate)
    await tx.wait()
    console.log(`  ✓ ${label}`)
  }

  // ── 3. Fund ArcSwap with QCAD ──────────────────────────────────────────────
  console.log('\n[3] Funding ArcSwap with 500,000 QCAD...')
  const fundAmt = 500_000n * 10n**6n
  const fundTx  = await qcad.transfer(ARC_SWAP_ADDR, fundAmt)
  await fundTx.wait()
  const bal = await qcad.balanceOf(ARC_SWAP_ADDR)
  console.log(`  ✓ ArcSwap QCAD balance: ${bal / 10n**6n} QCAD`)

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n=== Add to contracts.ts ===')
  console.log(`QCAD:   '${QCAD_ADDRESS}',`)
  console.log(`QCAD decimals: 6`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
