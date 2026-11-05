// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    Devnet,
    FrameMode,
    FrameParam,
    HegotaSupport,
    Scope,
    SigParam,
    TxParam
} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";
import {QuoteLib} from "../lib/QuoteLib.sol";

interface IStakingRegistry {
    function addStake(uint32 unstakeDelaySec) external payable;
    function unlockStake() external;
    function withdrawStake(address payable withdrawAddress) external;
}

interface IBalanceOf {
    function balanceOf(address account) external view returns (uint256);
}

/// @title OctanePaymaster
/// @notice One maker's own paymaster on the EF alt-mempool devnet. It pays gas in ETH for any
/// sender who repays the maker in USDC inside the same frame transaction.
/// @dev Deployed once; each maker gets an EIP-1167 clone, so makers share no funds. The maker
/// and its gas price cap are appended to the clone's code, so validation does no SLOAD.
///
/// Reading the sender's USDC balance touches another contract's storage, which the public mempool
/// forbids and the alt mempool allows for a staked payer. That read is why Octane needs it.
///
/// Expected frames:
///   [0] VERIFY  EXPIRY_VERIFIER, 8-byte deadline
///   [1] VERIFY  sender, approves execution
///   [2] VERIFY  this clone: pay(quote)
///   [3] SENDER  USDC.transfer(maker, fee)
///   [4..] SENDER the user's own calls
///
/// The maker's signature is not checked with ecrecover, because the sidecar rejects precompile
/// calls in this frame. It travels as signature entry 1 over the quote digest; the protocol
/// verifies it and this contract reads the result with SIGPARAM.
contract OctanePaymaster is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    using QuoteLib for QuoteLib.Quote;

    uint256 private constant EXPIRY_FRAME = 0;
    uint256 private constant FEE_FRAME = 3;
    uint256 private constant MAKER_SIGNATURE = 1;
    uint256 private constant EXPIRY_DATA_LENGTH = 8;
    uint256 private constant TRANSFER_DATA_LENGTH = 68;
    bytes4 private constant TRANSFER_SELECTOR = 0xa9059cbb;

    /// @dev Below these, a sender could starve the fee frame and still have its gas paid.
    uint256 private constant MIN_FEE_EXECUTION_GAS = 70_000;
    uint256 private constant MIN_FEE_STATE_GAS = 97_920;

    /// @dev 20 + 32 bytes of immutable args follow the 45-byte EIP-1167 runtime.
    uint256 private constant ARGS_OFFSET = 45;
    uint256 private constant ARGS_LENGTH = 52;

    uint32 private constant UNSTAKE_DELAY = 86_400;

    address public immutable usdc;
    IStakingRegistry public immutable registry;
    address public immutable expiryVerifier;

    error NotMaker();
    error WrongMaker();
    error WrongSettlement();
    error WrongToken();
    error BadExpiryFrame();
    error DeadlineAfterQuote();
    error BadFeeFrame();
    error FeeFrameUnderfunded();
    error InsufficientBalance();
    error BadMakerSignature();
    error CostAboveCap();
    error TransferFailed();

    constructor(address usdc_, IStakingRegistry registry_, address expiryVerifier_) {
        usdc = usdc_;
        registry = registry_;
        expiryVerifier = expiryVerifier_;
    }

    /// @notice Gas sponsorship is funded by plain ETH transfers to the clone.
    receive() external payable {}

    /// @notice The VERIFY frame. Approves payment only if the maker will be repaid.
    function pay(QuoteLib.Quote calldata quote) external {
        (address maker, uint256 maxGasPrice) = immutableArgs();
        QuoteLib.Quote memory q = quote;

        if (q.maker != maker) revert WrongMaker();
        if (!q.isBoundHere()) revert WrongSettlement();
        if (q.token != usdc) revert WrongToken();

        _checkExpiryFrame(q.validUntil);
        _checkFeeFrame(maker, q.fee);

        address sender = address(uint160(txparam(TxParam.SENDER)));
        if (IBalanceOf(usdc).balanceOf(sender) < q.fee) revert InsufficientBalance();

        if (address(uint160(sigparam(MAKER_SIGNATURE, SigParam.RESOLVED_SIGNER))) != maker) revert BadMakerSignature();
        if (bytes32(sigparam(MAKER_SIGNATURE, SigParam.MSG)) != q.digest()) revert BadMakerSignature();

        if (txparam(TxParam.MAX_COST) > q.maxGas * maxGasPrice) revert CostAboveCap();

        approve(Scope.PAYMENT);
    }

    /// @notice Stakes this clone. A contract must call the registry itself, hence this forwarder.
    function stake() external payable onlyMaker {
        registry.addStake{value: msg.value}(UNSTAKE_DELAY);
    }

    function unlockStake() external onlyMaker {
        registry.unlockStake();
    }

    function withdrawStake(address payable to) external onlyMaker {
        registry.withdrawStake(to);
    }

    function withdraw(address payable to, uint256 amount) external onlyMaker {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice The maker and gas price cap in this clone's bytecode. No storage is read.
    function immutableArgs() public view returns (address maker, uint256 maxGasPrice) {
        bytes memory args = new bytes(ARGS_LENGTH);
        assembly ("memory-safe") {
            extcodecopy(address(), add(args, 0x20), ARGS_OFFSET, ARGS_LENGTH)
            maker := shr(96, mload(add(args, 0x20)))
            maxGasPrice := mload(add(args, 0x34))
        }
    }

    modifier onlyMaker() {
        (address maker,) = immutableArgs();
        if (msg.sender != maker) revert NotMaker();
        _;
    }

    /// @dev Any scope-0 VERIFY frame counts as expiry to the sidecar, so the target must be checked here.
    function _checkExpiryFrame(uint64 validUntil) private view {
        if (frameparam(EXPIRY_FRAME, FrameParam.RESOLVED_TARGET) != uint256(uint160(expiryVerifier))) {
            revert BadExpiryFrame();
        }
        if (frameparam(EXPIRY_FRAME, FrameParam.MODE) != uint256(FrameMode.VERIFY)) revert BadExpiryFrame();
        if (frameparam(EXPIRY_FRAME, FrameParam.DATA_LENGTH) != EXPIRY_DATA_LENGTH) revert BadExpiryFrame();
        if (uint64(bytes8(framedataload(0, EXPIRY_FRAME))) > validUntil) revert DeadlineAfterQuote();
    }

    function _checkFeeFrame(address maker, uint256 fee) private view {
        if (frameparam(FEE_FRAME, FrameParam.RESOLVED_TARGET) != uint256(uint160(usdc))) revert BadFeeFrame();
        if (frameparam(FEE_FRAME, FrameParam.MODE) != uint256(FrameMode.SENDER)) revert BadFeeFrame();
        if (frameparam(FEE_FRAME, FrameParam.FLAGS) != 0) revert BadFeeFrame();
        if (frameparam(FEE_FRAME, FrameParam.VALUE) != 0) revert BadFeeFrame();
        if (frameparam(FEE_FRAME, FrameParam.DATA_LENGTH) != TRANSFER_DATA_LENGTH) revert BadFeeFrame();
        if (bytes4(framedataload(0, FEE_FRAME)) != TRANSFER_SELECTOR) revert BadFeeFrame();
        if (uint256(framedataload(4, FEE_FRAME)) != uint256(uint160(maker))) revert BadFeeFrame();
        if (uint256(framedataload(36, FEE_FRAME)) != fee) revert BadFeeFrame();

        if (frameparam(FEE_FRAME, FrameParam.EXECUTION_GAS_LIMIT) < MIN_FEE_EXECUTION_GAS) revert FeeFrameUnderfunded();
        if (frameparam(FEE_FRAME, FrameParam.STATE_GAS_LIMIT) < MIN_FEE_STATE_GAS) revert FeeFrameUnderfunded();
    }
}
