// deploy-swap.ts — deploy ArcSwap, set rates, fund with ARC tokens
import { ethers } from 'hardhat'

const USDC_ADDRESS   = '0x3600000000000000000000000000000000000000'
const EURC_ADDRESS   = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const CIRBTC_ADDRESS = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF'
const ARC_ADDRESS    = '0x55e1a127e33C4Ccca470Ea9eE8F15683DEf2dCc1'

// Rate formula: rate = amountOut_raw * 1e18 / amountIn_raw
// Both USDC and ARC have 6 decimals, cirBTC has 8.
//
// USDC(6) → ARC(6)    1 USDC = 10 ARC    → rate = 10 * 1e18
// ARC(6)  → USDC(6)   1 ARC  = 0.1 USDC  → rate = 0.1 * 1e18  = 1e17
// USDC(6) → EURC(6)   1 USDC ≈ 0.9259    → rate = 0.9259 * 1e18
// EURC(6) → USDC(6)   1 EURC ≈ 1.08      → rate = 1.08 * 1e18
//
// cirBTC(8) → USDC(6)  1 BTC = 78200 USDC
//   amountIn_raw=1e8, amountOut_raw=78200*1e6=78200e6
//   rate = 78200e6 * 1e18 / 1e8 = 78200e16 = 7.82e22
//
// USDC(6) → cirBTC(8)  1 USDC = 0.00001279 BTC
//   amountIn_raw=1e6, amountOut_raw=0.00001279*1e8=1279
//   rate = 1279 * 1e18 / 1e6 = 1279e12

const RATES: [string, string, bigint][] = [
  [USDC_ADDRESS,   ARC_ADDRESS,    10n * 10n**18n],              // 1 USDC = 10 ARC
  [ARC_ADDRESS,    USDC_ADDRESS,   10n**17n],                    // 1 ARC  = 0.1 USDC
  [USDC_ADDRESS,   EURC_ADDRESS,   925900n * 10n**12n],          // ≈ 0.9259
  [EURC_ADDRESS,   USDC_ADDRESS,   1080000n * 10n**12n],         // ≈ 1.08
  [CIRBTC_ADDRESS, USDC_ADDRESS,   78200n * 10n**16n],           // 1 BTC = 78200 USDC
  [USDC_ADDRESS,   CIRBTC_ADDRESS, 1279n * 10n**12n],            // 1 USDC = 0.00001279 BTC
  [CIRBTC_ADDRESS, ARC_ADDRESS,    782000n * 10n**18n],          // 1 BTC = 782000 ARC (approx)
  [ARC_ADDRESS,    CIRBTC_ADDRESS, 128n * 10n**10n],             // 1 ARC = 0.00000128 BTC
  [ARC_ADDRESS,    EURC_ADDRESS,   85920n * 10n**12n],           // 1 ARC ≈ 0.08592 EURC
  [EURC_ADDRESS,   ARC_ADDRESS,    11639n * 10n**15n],           // 1 EURC ≈ 11.639 ARC
]

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deployer:', deployer.address)

  // Deploy ArcSwap
  const ArcSwap = await ethers.getContractFactory('ArcSwap')
  const arcSwap = await ArcSwap.deploy()
  await arcSwap.waitForDeployment()
  const arcSwapAddr = await arcSwap.getAddress()
  console.log('ArcSwap deployed to:', arcSwapAddr)

  // Set all rates
  console.log('\nSetting rates...')
  for (const [tokenIn, tokenOut, r] of RATES) {
    const tx = await arcSwap.setRate(tokenIn, tokenOut, r)
    await tx.wait()
    console.log(`  ✓ ${tokenIn.slice(0,8)}… → ${tokenOut.slice(0,8)}… = ${r}`)
  }

  // Fund with ARC tokens (deployer has 1,000,000 ARC)
  const arcToken = await ethers.getContractAt('ArcToken', ARC_ADDRESS)
  const arcFund  = 500_000n * 10n**6n   // 500k ARC
  console.log('\nFunding ArcSwap with 500,000 ARC...')
  const fundTx = await arcToken.transfer(arcSwapAddr, arcFund)
  await fundTx.wait()
  console.log('  ✓ ARC funded')

  // Check ARC balance
  const arcBal = await arcToken.balanceOf(arcSwapAddr)
  console.log(`  ArcSwap ARC balance: ${arcBal / 10n**6n} ARC`)

  console.log('\n=== Copy to contracts.ts ===')
  console.log(`export const ARC_SWAP_ADDRESS = '${arcSwapAddr}' as \`0x\${string}\``)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
