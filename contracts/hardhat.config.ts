import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'
dotenv.config()

// Arc Testnet: Chain ID 5042002, gas token is USDC
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Local development network (built into Hardhat)
    hardhat: {},
    // Arc Testnet
    arc_testnet: {
      url: 'https://rpc.testnet.arc.network',
      chainId: 5042002,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
}

export default config
