// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ArcToken — a simple ERC-20 token for trading on Arc Network
contract ArcToken is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 tokenDecimals,
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _decimals = tokenDecimals;
        // Mint initial supply to the deployer
        _mint(msg.sender, initialSupply * 10 ** tokenDecimals);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// Allow the owner to mint more tokens (useful for testnet faucets)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
