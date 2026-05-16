import { expect } from 'chai'
import { ethers } from 'hardhat'
import { ArcToken, ArcDEX } from '../typechain-types'

describe('ArcDEX', () => {
  let tokenA: ArcToken
  let tokenB: ArcToken
  let dex: ArcDEX
  let maker: ReturnType<typeof ethers.provider.getSigner> extends Promise<infer T> ? T : never
  let taker: ReturnType<typeof ethers.provider.getSigner> extends Promise<infer T> ? T : never

  beforeEach(async () => {
    const signers = await ethers.getSigners()
    maker = signers[0]
    taker = signers[1]

    const ArcToken = await ethers.getContractFactory('ArcToken')
    tokenA = await ArcToken.deploy('Token A', 'TKA', 6, 1_000_000) as ArcToken
    tokenB = await ArcToken.deploy('Token B', 'TKB', 6, 1_000_000) as ArcToken

    const ArcDEX = await ethers.getContractFactory('ArcDEX')
    dex = await ArcDEX.deploy() as ArcDEX

    // Give taker some tokenB
    await tokenB.mint(taker.address, ethers.parseUnits('1000', 6))
  })

  it('places and fills an order', async () => {
    const sellAmt = ethers.parseUnits('100', 6)  // maker sells 100 TKA
    const buyAmt  = ethers.parseUnits('90', 6)   // maker wants 90 TKB

    // Maker approves DEX and places order
    await tokenA.approve(await dex.getAddress(), sellAmt)
    await dex.placeOrder(await tokenA.getAddress(), await tokenB.getAddress(), sellAmt, buyAmt)

    // Taker approves DEX and fills order
    await tokenB.connect(taker).approve(await dex.getAddress(), buyAmt)
    await dex.connect(taker).fillOrder(0)

    // Taker should have received sellAmt minus 0.3% fee
    const fee = (sellAmt * 30n) / 10_000n
    const takerBalance = await tokenA.balanceOf(taker.address)
    expect(takerBalance).to.equal(sellAmt - fee)
  })

  it('allows maker to cancel an order', async () => {
    const sellAmt = ethers.parseUnits('50', 6)
    const buyAmt  = ethers.parseUnits('45', 6)

    await tokenA.approve(await dex.getAddress(), sellAmt)
    await dex.placeOrder(await tokenA.getAddress(), await tokenB.getAddress(), sellAmt, buyAmt)

    const balanceBefore = await tokenA.balanceOf(maker.address)
    await dex.cancelOrder(0)
    const balanceAfter = await tokenA.balanceOf(maker.address)

    expect(balanceAfter - balanceBefore).to.equal(sellAmt)
  })
})
