// fund-swap.ts — add liquidity to ArcSwap for cirBTC and USDC pairs
// Run: npx hardhat run scripts/fund-swap.ts --network arc_testnet
import { ethers } from 'hardhat'

const ARC_SWAP_ADDRESS = '0x8C16097F1f9a4B7Fab0497C29D3fC6a85a43C550'
const USDC_ADDRESS     = '0x3600000000000000000000000000000000000000'
const EURC_ADDRESS     = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const CIRBTC_ADDRESS   = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF'
const ARC_ADDRESS      = '0x55e1a127e33C4Ccca470Ea9eE8F15683DEf2dCc1'
const QCAD_ADDRESS     = '0xf546Bc238F0893eD08586c892f3a111cBFf0d19a'

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]

const ARC_SWAP_ABI = [
  'function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)',
  'function liquidity(address token) view returns (uint256)',
  'function rate(address tokenIn, address tokenOut) view returns (uint256)',
  'function setRate(address tokenIn, address tokenOut, uint256 rate) external',
]

// How much liquidity to add per token (conservative — match deployer's actual balance)
// cirBTC: 4000 units = 0.00004 BTC (~$3) — deployer currently has ~4271 units
// USDC:   50 USDC    = 50_000_000 units  — deployer has ~63 USDC
// EURC:   50 EURC    = 50_000_000 units  — deployer has ~63 EURC
// QCAD:   500 QCAD   = 500_000_000 units — deployer has ~500k QCAD
const FUND_AMOUNTS: Record<string, { addr: string; amount: bigint; label: string }> = {
  cirBTC: { addr: CIRBTC_ADDRESS, amount: 4_000n,          label: '0.00004 cirBTC' },  // 8 dec
  USDC:   { addr: USDC_ADDRESS,   amount: 50_000_000n,     label: '50 USDC'        },  // 6 dec
  EURC:   { addr: EURC_ADDRESS,   amount: 50_000_000n,     label: '50 EURC'        },  // 6 dec
  QCAD:   { addr: QCAD_ADDRESS,   amount: 500_000_000n,    label: '500 QCAD'       },  // 6 dec
}

// Missing cirBTC rates (EURC ↔ cirBTC)
const MISSING_RATES: [string, string, bigint, string][] = [
  // cirBTC(8) → EURC(6): 1 BTC = 67183 EURC
  // amountIn_raw=1e8, amountOut_raw=67183*1e6 → rate = 67183e6*1e18/1e8 = 67183e16
  [CIRBTC_ADDRESS, EURC_ADDRESS, 67183n * 10n**16n, '1 cirBTC = 67183 EURC'],
  // EURC(6) → cirBTC(8): 1 EURC = 0.00001489 BTC
  // amountIn_raw=1e6, amountOut_raw=1489 → rate = 1489*1e18/1e6 = 1489e12
  [EURC_ADDRESS, CIRBTC_ADDRESS, 1489n * 10n**12n, '1 EURC = 0.00001489 cirBTC'],
  // QCAD(6) → USDC(6): 1 QCAD = 0.73 USDC → rate = 730000 * 1e12
  [QCAD_ADDRESS, USDC_ADDRESS,   730000n * 10n**12n, '1 QCAD = 0.73 USDC'],
  // USDC(6) → QCAD(6): 1 USDC = 1.37 QCAD → rate = 1370000 * 1e12
  [USDC_ADDRESS, QCAD_ADDRESS,   1370000n * 10n**12n, '1 USDC = 1.37 QCAD'],
  // QCAD(6) → EURC(6): 1 QCAD = 0.6757 EURC → rate = 675700 * 1e12
  [QCAD_ADDRESS, EURC_ADDRESS,   675700n * 10n**12n, '1 QCAD = 0.6757 EURC'],
  // EURC(6) → QCAD(6): 1 EURC = 1.48 QCAD → rate = 1480000 * 1e12
  [EURC_ADDRESS, QCAD_ADDRESS,   1480000n * 10n**12n, '1 EURC = 1.48 QCAD'],
]

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('\n🔑 Deployer:', deployer.address)

  const arcSwap = new ethers.Contract(ARC_SWAP_ADDRESS, ARC_SWAP_ABI, deployer)

  // ── 1. Check current liquidity ──────────────────────────────────────────────
  console.log('\n📊 Current ArcSwap liquidity:')
  for (const [sym, info] of Object.entries(FUND_AMOUNTS)) {
    const liq = await arcSwap.liquidity(info.addr)
    const erc20 = new ethers.Contract(info.addr, ERC20_ABI, deployer)
    const deplBal = await erc20.balanceOf(deployer.address)
    console.log(`  ${sym.padEnd(6)}: ArcSwap=${liq.toString().padStart(12)}  Deployer=${deplBal.toString().padStart(12)}`)
  }

  // ── 2. Set missing rates ────────────────────────────────────────────────────
  console.log('\n📈 Checking and setting missing rates...')
  for (const [tokenIn, tokenOut, r, label] of MISSING_RATES) {
    const existing = await arcSwap.rate(tokenIn, tokenOut)
    if (existing === 0n) {
      console.log(`  Setting rate: ${label}`)
      const tx = await arcSwap.setRate(tokenIn, tokenOut, r)
      await tx.wait()
      console.log(`    ✓ rate set: ${r}`)
    } else {
      console.log(`  ✓ Already set: ${label} (rate=${existing})`)
    }
  }

  // ── 3. Fund tokens ─────────────────────────────────────────────────────────
  console.log('\n💰 Funding ArcSwap...')
  for (const [sym, info] of Object.entries(FUND_AMOUNTS)) {
    const erc20 = new ethers.Contract(info.addr, ERC20_ABI, deployer)
    const deplBal = await erc20.balanceOf(deployer.address)

    if (deplBal < info.amount) {
      console.log(`  ⚠️  ${sym}: deployer only has ${deplBal} (need ${info.amount}) — SKIPPING`)
      console.log(`       → Get ${sym} from faucet.circle.com then run this script again`)
      continue
    }

    const liqBefore = await arcSwap.liquidity(info.addr)
    console.log(`  Transferring ${info.label} to ArcSwap...`)
    const tx = await erc20.transfer(ARC_SWAP_ADDRESS, info.amount)
    await tx.wait()
    const liqAfter = await arcSwap.liquidity(info.addr)
    console.log(`    ✓ ${sym} liquidity: ${liqBefore} → ${liqAfter}`)
  }

  // ── 4. Verify key swap pairs work ──────────────────────────────────────────
  console.log('\n✅ Verifying swap quotes:')
  const tests: [string, string, bigint, string][] = [
    [USDC_ADDRESS,   CIRBTC_ADDRESS, 5_000_000n,    '5 USDC → cirBTC'],
    [CIRBTC_ADDRESS, USDC_ADDRESS,   100_000n,       '0.001 cirBTC → USDC'],
    [USDC_ADDRESS,   ARC_ADDRESS,    10_000_000n,    '10 USDC → ARC'],
    [ARC_ADDRESS,    USDC_ADDRESS,   100_000_000n,   '100 ARC → USDC'],
    [USDC_ADDRESS,   QCAD_ADDRESS,   10_000_000n,    '10 USDC → QCAD'],
  ]
  for (const [tIn, tOut, amt, label] of tests) {
    try {
      const out = await arcSwap.getAmountOut(tIn, tOut, amt)
      console.log(`  ${label}: ${out}`)
    } catch (e) {
      console.log(`  ✗ ${label}: ${e}`)
    }
  }

  console.log('\n🎉 Done! ArcSwap is now funded.')
}

main().catch(e => { console.error(e); process.exit(1) })
