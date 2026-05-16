import { ethers } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deploying with:', deployer.address)

  // Deploy a test ARC token (1 million supply, 6 decimals like USDC)
  const ArcToken = await ethers.getContractFactory('ArcToken')
  const arcToken = await ArcToken.deploy('Arc Test Token', 'ARC', 6, 1_000_000)
  await arcToken.waitForDeployment()
  console.log('ArcToken deployed to:', await arcToken.getAddress())

  // Deploy the DEX
  const ArcDEX = await ethers.getContractFactory('ArcDEX')
  const arcDEX = await ArcDEX.deploy()
  await arcDEX.waitForDeployment()
  console.log('ArcDEX deployed to:', await arcDEX.getAddress())

  console.log('\n--- Copy these into your .env or app config ---')
  console.log(`VITE_ARC_TOKEN_ADDRESS=${await arcToken.getAddress()}`)
  console.log(`VITE_ARC_DEX_ADDRESS=${await arcDEX.getAddress()}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
