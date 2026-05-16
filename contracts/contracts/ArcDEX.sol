// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ArcDEX — a minimal spot-trade DEX for Arc Network
/// @notice Users can list token sell orders and other users can fill them.
///         This is a simple order-book style DEX for learning purposes.
contract ArcDEX is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Order {
        address maker;
        address sellToken;
        address buyToken;
        uint256 sellAmount;  // amount maker is selling
        uint256 buyAmount;   // amount maker wants to receive
        bool active;
    }

    uint256 public nextOrderId;
    mapping(uint256 => Order) public orders;

    // 0.3% fee (30 out of 10000)
    uint256 public feeBps = 30;
    address public feeRecipient;

    event OrderPlaced(
        uint256 indexed orderId,
        address indexed maker,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount
    );
    event OrderFilled(uint256 indexed orderId, address indexed taker);
    event OrderCancelled(uint256 indexed orderId);

    constructor() Ownable(msg.sender) {
        feeRecipient = msg.sender;
    }

    /// @notice Place a new sell order — transfer sellAmount to this contract
    function placeOrder(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount
    ) external nonReentrant returns (uint256 orderId) {
        require(sellToken != buyToken, "Same token");
        require(sellAmount > 0 && buyAmount > 0, "Zero amount");

        IERC20(sellToken).safeTransferFrom(msg.sender, address(this), sellAmount);

        orderId = nextOrderId++;
        orders[orderId] = Order({
            maker: msg.sender,
            sellToken: sellToken,
            buyToken: buyToken,
            sellAmount: sellAmount,
            buyAmount: buyAmount,
            active: true
        });

        emit OrderPlaced(orderId, msg.sender, sellToken, buyToken, sellAmount, buyAmount);
    }

    /// @notice Fill an existing order — taker sends buyAmount, receives sellAmount minus fee
    function fillOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.active, "Order not active");

        order.active = false;

        uint256 fee = (order.sellAmount * feeBps) / 10_000;
        uint256 takerReceives = order.sellAmount - fee;

        // Taker pays buyAmount to maker
        IERC20(order.buyToken).safeTransferFrom(msg.sender, order.maker, order.buyAmount);

        // Taker receives sellAmount minus fee
        IERC20(order.sellToken).safeTransfer(msg.sender, takerReceives);

        // Fee goes to feeRecipient
        if (fee > 0) {
            IERC20(order.sellToken).safeTransfer(feeRecipient, fee);
        }

        emit OrderFilled(orderId, msg.sender);
    }

    /// @notice Cancel your own order and get sellAmount back
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.active, "Order not active");
        require(order.maker == msg.sender, "Not your order");

        order.active = false;
        IERC20(order.sellToken).safeTransfer(msg.sender, order.sellAmount);

        emit OrderCancelled(orderId);
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 100, "Fee too high"); // max 1%
        feeBps = _feeBps;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }
}
