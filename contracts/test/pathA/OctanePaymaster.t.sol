// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FrameMode, FrameParam, SigParam, TxParam} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";
import {QuoteLib} from "../../src/lib/QuoteLib.sol";
import {IStakingRegistry, OctanePaymaster} from "../../src/pathA/OctanePaymaster.sol";
import {OctanePaymasterFactory} from "../../src/pathA/OctanePaymasterFactory.sol";
import {MockApprove, MockBalances, MockFrameHelper, MockStakingRegistry} from "./FrameMocks.sol";

contract OctanePaymasterTest is Test {
    event Approved(uint256 scope);
    event CloneCreated(address indexed maker, address clone, uint256 maxGasPrice);

    uint256 private constant FEE = 70_000;
    uint256 private constant MAX_GAS = 400_000;
    uint256 private constant MAX_GAS_PRICE = 3 gwei;
    uint64 private constant VALID_UNTIL = 2_000_000_000;
    bytes32 private constant TRANSFER_SELECTOR_WORD = bytes32(bytes4(0xa9059cbb));
    uint256 private constant PAYMENT_SCOPE = 1;

    address private constant EXPIRY_VERIFIER = address(0x8141);
    address private maker = makeAddr("maker");
    address private sender = makeAddr("sender");
    address private stranger = makeAddr("stranger");

    MockBalances private usdc;
    MockStakingRegistry private registry;
    OctanePaymasterFactory private factory;
    OctanePaymaster private clone;
    MockFrameHelper private txParams;
    MockFrameHelper private frameData;
    MockFrameHelper private frameParams;
    MockFrameHelper private sigParams;

    function setUp() public {
        usdc = new MockBalances();
        registry = new MockStakingRegistry();
        OctanePaymaster implementation =
            new OctanePaymaster(address(usdc), IStakingRegistry(address(registry)), EXPIRY_VERIFIER);
        factory = new OctanePaymasterFactory(address(implementation));

        vm.prank(maker);
        clone = OctanePaymaster(payable(factory.createClone(MAX_GAS_PRICE)));

        // HegotaSupport creates its helpers in a fixed order, so their addresses are known.
        vm.etch(vm.computeCreateAddress(address(implementation), 1), address(new MockApprove()).code);
        txParams = _mockHelper(implementation, 2);
        frameData = _mockHelper(implementation, 3);
        frameParams = _mockHelper(implementation, 5);
        sigParams = _mockHelper(implementation, 6);

        usdc.setBalance(sender, FEE);
        _setValidTransaction(_quote());
    }

    function _mockHelper(OctanePaymaster implementation, uint256 nonce) private returns (MockFrameHelper helper) {
        helper = MockFrameHelper(vm.computeCreateAddress(address(implementation), nonce));
        vm.etch(address(helper), address(new MockFrameHelper()).code);
    }

    function _quote() private view returns (QuoteLib.Quote memory) {
        return QuoteLib.Quote({
            maker: maker,
            chainId: block.chainid,
            settlement: address(clone),
            token: address(usdc),
            maxGas: MAX_GAS,
            fee: FEE,
            validUntil: VALID_UNTIL,
            nonce: 1
        });
    }

    function _setFrame(uint256 index, FrameParam param, uint256 value) private {
        frameParams.setAnswer(abi.encode(index, param), value);
    }

    function _setData(uint256 frame, uint256 offset, bytes32 value) private {
        frameData.setAnswer(abi.encode(offset, frame), uint256(value));
    }

    function _setValidTransaction(QuoteLib.Quote memory quote) private {
        _setFrame(0, FrameParam.RESOLVED_TARGET, uint160(EXPIRY_VERIFIER));
        _setFrame(0, FrameParam.MODE, uint256(FrameMode.VERIFY));
        _setFrame(0, FrameParam.DATA_LENGTH, 8);
        _setData(0, 0, bytes32(bytes8(uint64(VALID_UNTIL))));

        _setFrame(3, FrameParam.RESOLVED_TARGET, uint160(address(usdc)));
        _setFrame(3, FrameParam.MODE, uint256(FrameMode.SENDER));
        _setFrame(3, FrameParam.FLAGS, 0);
        _setFrame(3, FrameParam.VALUE, 0);
        _setFrame(3, FrameParam.DATA_LENGTH, 68);
        _setFrame(3, FrameParam.EXECUTION_GAS_LIMIT, 80_000);
        _setFrame(3, FrameParam.STATE_GAS_LIMIT, 100_000);
        _setData(3, 0, TRANSFER_SELECTOR_WORD);
        _setData(3, 4, bytes32(uint256(uint160(maker))));
        _setData(3, 36, bytes32(FEE));

        txParams.setAnswer(abi.encode(TxParam.SENDER), uint160(sender));
        txParams.setAnswer(abi.encode(TxParam.MAX_COST), MAX_GAS * 2 gwei);

        sigParams.setAnswer(abi.encode(uint256(1), SigParam.RESOLVED_SIGNER), uint160(maker));
        sigParams.setAnswer(abi.encode(uint256(1), SigParam.MSG), uint256(QuoteLib.digest(quote)));
    }

    function test_approvesAValidTransaction() public {
        vm.expectEmit(address(clone));
        emit Approved(PAYMENT_SCOPE);
        clone.pay(_quote());
    }

    function test_keepsTheMakerAndCapInCode() public view {
        (address storedMaker, uint256 cap) = clone.immutableArgs();
        assertEq(storedMaker, maker);
        assertEq(cap, MAX_GAS_PRICE);
    }

    function test_rejectsAQuoteFromAnotherMaker() public {
        QuoteLib.Quote memory quote = _quote();
        quote.maker = stranger;
        vm.expectRevert(OctanePaymaster.WrongMaker.selector);
        clone.pay(quote);
    }

    function test_rejectsAQuoteForAnotherClone() public {
        QuoteLib.Quote memory quote = _quote();
        quote.settlement = stranger;
        vm.expectRevert(OctanePaymaster.WrongSettlement.selector);
        clone.pay(quote);
    }

    function test_rejectsAQuoteForAnotherChain() public {
        QuoteLib.Quote memory quote = _quote();
        quote.chainId = block.chainid + 1;
        vm.expectRevert(OctanePaymaster.WrongSettlement.selector);
        clone.pay(quote);
    }

    function test_rejectsAQuoteForAnotherToken() public {
        QuoteLib.Quote memory quote = _quote();
        quote.token = stranger;
        vm.expectRevert(OctanePaymaster.WrongToken.selector);
        clone.pay(quote);
    }

    function test_requiresTheRealExpiryVerifier() public {
        _setFrame(0, FrameParam.RESOLVED_TARGET, uint160(stranger));
        vm.expectRevert(OctanePaymaster.BadExpiryFrame.selector);
        clone.pay(_quote());
    }

    function test_rejectsAMalformedExpiryFrame() public {
        _setFrame(0, FrameParam.DATA_LENGTH, 32);
        vm.expectRevert(OctanePaymaster.BadExpiryFrame.selector);
        clone.pay(_quote());
    }

    function test_rejectsADeadlineAfterTheQuoteExpires() public {
        _setData(0, 0, bytes32(bytes8(uint64(VALID_UNTIL + 1))));
        vm.expectRevert(OctanePaymaster.DeadlineAfterQuote.selector);
        clone.pay(_quote());
    }

    function test_rejectsAFeeFrameToAnotherToken() public {
        _setFrame(3, FrameParam.RESOLVED_TARGET, uint160(stranger));
        vm.expectRevert(OctanePaymaster.BadFeeFrame.selector);
        clone.pay(_quote());
    }

    function test_rejectsAFeeFrameInTheWrongMode() public {
        _setFrame(3, FrameParam.MODE, uint256(FrameMode.DEFAULT));
        vm.expectRevert(OctanePaymaster.BadFeeFrame.selector);
        clone.pay(_quote());
    }

    function test_rejectsAFeeFrameInAnAtomicBatch() public {
        _setFrame(3, FrameParam.FLAGS, 4);
        vm.expectRevert(OctanePaymaster.BadFeeFrame.selector);
        clone.pay(_quote());
    }

    function test_rejectsAFeeFrameCallingAnotherFunction() public {
        _setData(3, 0, bytes32(bytes4(0x095ea7b3)));
        vm.expectRevert(OctanePaymaster.BadFeeFrame.selector);
        clone.pay(_quote());
    }

    function test_rejectsAFeeSentToSomeoneElse() public {
        _setData(3, 4, bytes32(uint256(uint160(stranger))));
        vm.expectRevert(OctanePaymaster.BadFeeFrame.selector);
        clone.pay(_quote());
    }

    function test_rejectsALowerFee() public {
        _setData(3, 36, bytes32(FEE - 1));
        vm.expectRevert(OctanePaymaster.BadFeeFrame.selector);
        clone.pay(_quote());
    }

    function test_rejectsAStarvedFeeFrame() public {
        _setFrame(3, FrameParam.EXECUTION_GAS_LIMIT, 69_999);
        vm.expectRevert(OctanePaymaster.FeeFrameUnderfunded.selector);
        clone.pay(_quote());

        _setFrame(3, FrameParam.EXECUTION_GAS_LIMIT, 80_000);
        _setFrame(3, FrameParam.STATE_GAS_LIMIT, 97_919);
        vm.expectRevert(OctanePaymaster.FeeFrameUnderfunded.selector);
        clone.pay(_quote());
    }

    function test_rejectsASenderWhoCantPay() public {
        usdc.setBalance(sender, FEE - 1);
        vm.expectRevert(OctanePaymaster.InsufficientBalance.selector);
        clone.pay(_quote());
    }

    function test_rejectsASignatureFromAnotherSigner() public {
        sigParams.setAnswer(abi.encode(uint256(1), SigParam.RESOLVED_SIGNER), uint160(stranger));
        vm.expectRevert(OctanePaymaster.BadMakerSignature.selector);
        clone.pay(_quote());
    }

    function test_rejectsASignatureOverAnotherQuote() public {
        sigParams.setAnswer(abi.encode(uint256(1), SigParam.MSG), uint256(keccak256("another quote")));
        vm.expectRevert(OctanePaymaster.BadMakerSignature.selector);
        clone.pay(_quote());
    }

    function test_rejectsACostAboveTheCap() public {
        txParams.setAnswer(abi.encode(TxParam.MAX_COST), MAX_GAS * MAX_GAS_PRICE + 1);
        vm.expectRevert(OctanePaymaster.CostAboveCap.selector);
        clone.pay(_quote());
    }

    function test_makerStakesTheCloneItself() public {
        vm.deal(maker, 1 ether);
        vm.prank(maker);
        clone.stake{value: 0.012 ether}();
        assertEq(registry.staked(address(clone)), 0.012 ether);
        assertEq(registry.delay(address(clone)), 86_400);
    }

    function test_onlyTheMakerControlsTheClone() public {
        vm.deal(stranger, 1 ether);
        vm.startPrank(stranger);
        vm.expectRevert(OctanePaymaster.NotMaker.selector);
        clone.stake{value: 0.012 ether}();
        vm.expectRevert(OctanePaymaster.NotMaker.selector);
        clone.unlockStake();
        vm.expectRevert(OctanePaymaster.NotMaker.selector);
        clone.withdrawStake(payable(stranger));
        vm.expectRevert(OctanePaymaster.NotMaker.selector);
        clone.withdraw(payable(stranger), 1);
        vm.stopPrank();
    }

    function test_makerGetsItsFundsBack() public {
        vm.deal(address(this), 1 ether);
        (bool funded,) = address(clone).call{value: 0.5 ether}("");
        assertTrue(funded, "clone takes plain transfers");

        vm.prank(maker);
        clone.withdraw(payable(maker), 0.5 ether);
        assertEq(maker.balance, 0.5 ether);
    }

    function test_factoryMakesOneClonePerMaker() public {
        assertTrue(factory.isClone(address(clone)));
        assertEq(factory.cloneOf(maker), address(clone));
        vm.prank(maker);
        vm.expectRevert(OctanePaymasterFactory.AlreadyCreated.selector);
        factory.createClone(MAX_GAS_PRICE);
    }

    function test_factoryPredictsCloneAddresses() public {
        address predicted = factory.predictClone(stranger, MAX_GAS_PRICE);
        vm.expectEmit(true, false, false, true);
        emit CloneCreated(stranger, predicted, MAX_GAS_PRICE);
        vm.prank(stranger);
        factory.createClone(MAX_GAS_PRICE);
    }
}
