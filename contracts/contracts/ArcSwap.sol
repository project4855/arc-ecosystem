// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ArcSwap — instant fixed-rate token swap for Arc Testnet
/// @notice Owner funds the contract with tokens and sets exchange rates.
///         Users approve tokenIn then call swap() for an immediate exchange.
contract ArcSwap is Ownable {
    /// @dev rate[tokenIn][tokenOut] = amountOut per 1e18 of amountIn
    ///      Accounts for decimal differences between tokens.
    ///      Example: USDC(6) → ARC(6) at 10 ARC/USDC → rate = 10e18
    ///      Example: USDC(6) → cirBTC(8) at 0.00001279 BTC/USDC
    ///               → rate = 1279e12  (= 1279 * 1e18 / 1e6)
    mapping(address => mapping(address => uint256)) public rate;

    event Swapped(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event RateSet(address indexed tokenIn, address indexed tokenOut, uint256 newRate);
    event LiquidityAdded(address indexed token, uint256 amount);

    constructor() Ownable(msg.sender) {}

    // ── Owner ─────────────────────────────────────────────────────────────────

    /// @notice Set exchange rate. rate = amountOut_raw * 1e18 / amountIn_raw
    function setRate(address tokenIn, address tokenOut, uint256 _rate) external onlyOwner {
        rate[tokenIn][tokenOut] = _rate;
        emit RateSet(tokenIn, tokenOut, _rate);
    }

    /// @notice Withdraw tokens from contract back to owner
    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }

    // ── User ──────────────────────────────────────────────────────────────────

    /// @notice Instant swap: send tokenIn, receive tokenOut immediately.
    ///         Caller must approve ArcSwap for amountIn before calling.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external returns (uint256 amountOut) {
        uint256 r = rate[tokenIn][tokenOut];
        require(r > 0, "ArcSwap: rate not set for this pair");

        amountOut = amountIn * r / 1e18;
        require(amountOut > 0, "ArcSwap: amount too small");
        require(
            IERC20(tokenOut).balanceOf(address(this)) >= amountOut,
            "ArcSwap: insufficient liquidity"
        );

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).transfer(msg.sender, amountOut);

        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @notice Preview: how much tokenOut you'd receive for amountIn
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256) {
        uint256 r = rate[tokenIn][tokenOut];
        if (r == 0) return 0;
        return amountIn * r / 1e18;
    }

    /// @notice Check liquidity for a token
    function liquidity(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
