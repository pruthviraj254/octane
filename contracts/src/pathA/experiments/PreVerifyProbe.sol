// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Devnet, FrameParam, HegotaSupport, Scope, TxParam} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IStaking {
    function addStake(uint32 unstakeDelaySec) external payable;
}

/// @notice An experiment, not part of Octane. It tests whether a paymaster can collect its fee
/// during validation with a pre_verify frame, which would remove Layout 1's settle-revert risk.
/// EIP-3009 can't do this, because USDC's check uses TIMESTAMP. transferFrom doesn't, but needs
/// the sender's earlier approval. The pull lands on this contract, whose slots a staked entity
/// may write, rather than on the maker.
contract PreVerifyProbe is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    uint256 private constant PRE_VERIFY_FRAME = 1;
    uint256 private constant SUCCESS = 1;

    address public immutable usdc;
    address public immutable owner;
    IStaking public immutable registry;
    uint256 public immutable fee;

    constructor(address usdc_, IStaking registry_, uint256 fee_) {
        usdc = usdc_;
        registry = registry_;
        fee = fee_;
        owner = msg.sender;
    }

    receive() external payable {}

    function stake() external payable {
        require(msg.sender == owner, "not owner");
        registry.addStake{value: msg.value}(86_400);
    }

    /// @notice The pre_verify frame: pulls the fee before payment is approved.
    function collect() external {
        address sender = address(uint160(txparam(TxParam.SENDER)));
        require(IERC20(usdc).transferFrom(sender, address(this), fee), "pull failed");
    }

    /// @notice The paying frame. Nodes can't enforce this check, so the paymaster must.
    function pay() external {
        require(frameparam(PRE_VERIFY_FRAME, FrameParam.STATUS) == SUCCESS, "fee not collected");
        approve(Scope.PAYMENT);
    }
}
