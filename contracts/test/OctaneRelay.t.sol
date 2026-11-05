// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {QuoteLib} from "../src/lib/QuoteLib.sol";
import {IERC3009, OctaneRelay} from "../src/pathB/OctaneRelay.sol";
import {MockEIP3009} from "./mocks/MockEIP3009.sol";

contract OctaneRelayTest is Test {
    using stdJson for string;

    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    MockEIP3009 private token;
    OctaneRelay private relay;

    uint256 private payerKey = uint256(keccak256("octane.test.relay.payer"));
    uint256 private makerKey = uint256(keccak256("octane.test.relay.maker"));
    uint256 private merchantKey = uint256(keccak256("octane.test.relay.merchant"));
    uint256 private otherKey = uint256(keccak256("octane.test.relay.other"));
    address private payer;
    address private maker;
    address private merchant;
    address private other;

    uint256 private constant AMOUNT = 10_000_000; // 10 USDT
    uint256 private constant FEE = 70_000; // 0.07 USDT
    bytes32 private constant SALT = bytes32(uint256(1));

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new MockEIP3009();
        relay = new OctaneRelay(IERC3009(address(token)));
        payer = vm.addr(payerKey);
        maker = vm.addr(makerKey);
        merchant = vm.addr(merchantKey);
        other = vm.addr(otherKey);
        token.mint(payer, 50_000_000);
    }

    function _quote() private view returns (QuoteLib.Quote memory) {
        return QuoteLib.Quote({
            maker: maker,
            chainId: block.chainid,
            settlement: address(relay),
            token: address(token),
            maxGas: 175_000,
            fee: FEE,
            validUntil: uint64(block.timestamp + 100),
            nonce: 1
        });
    }

    function _signQuote(uint256 key, QuoteLib.Quote memory quote) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, QuoteLib.digest(quote));
        return abi.encodePacked(r, s, v);
    }

    function _payment(address feePayer, bytes32 salt, uint64 validUntil)
        private
        view
        returns (OctaneRelay.Payment memory)
    {
        return OctaneRelay.Payment({
            payer: payer,
            merchant: merchant,
            amount: AMOUNT,
            feePayer: feePayer,
            salt: salt,
            validAfter: 0,
            validBefore: uint256(validUntil) + 1
        });
    }

    function _signAuth(
        uint256 key,
        QuoteLib.Quote memory quote,
        OctaneRelay.Payment memory payment,
        uint256 value
    ) private view returns (bytes memory) {
        bytes32 nonce = relay.bindingNonce(
            QuoteLib.digest(quote), payment.merchant, payment.amount, quote.maker, payment.feePayer, payment.salt
        );
        return _signAuthWithNonce(key, payment, value, nonce);
    }

    function _signAuthWithNonce(uint256 key, OctaneRelay.Payment memory payment, uint256 value, bytes32 nonce)
        private
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH, payment.payer, address(relay), value, payment.validAfter, payment.validBefore, nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _optIn() private view returns (OctaneRelay.MerchantOptIn memory) {
        return OctaneRelay.MerchantOptIn({
            merchant: merchant,
            amount: AMOUNT,
            maxFee: FEE,
            orderId: bytes32(uint256(42)),
            expiry: uint64(block.timestamp + 300)
        });
    }

    function _signOptIn(uint256 key, OctaneRelay.MerchantOptIn memory optIn) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, relay.optInDigest(optIn));
        return abi.encodePacked(r, s, v);
    }

    /// @dev The standard payer-pays setup, for tests that change one thing.
    function _ready()
        private
        view
        returns (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig)
    {
        quote = _quote();
        quoteSig = _signQuote(makerKey, quote);
        payment = _payment(payer, SALT, quote.validUntil);
        authSig = _signAuth(payerKey, quote, payment, AMOUNT + FEE);
    }

    function test_paysMerchantAndMakerAtomically() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _ready();

        vm.expectEmit(true, true, true, true);
        emit OctaneRelay.Relayed(QuoteLib.digest(quote), maker, payer, merchant, AMOUNT, FEE, payer);
        vm.prank(maker);
        relay.relay(quote, quoteSig, payment, authSig);

        assertEq(token.balanceOf(merchant), AMOUNT);
        assertEq(token.balanceOf(maker), FEE);
        assertEq(token.balanceOf(payer), 50_000_000 - AMOUNT - FEE);
        assertEq(token.balanceOf(address(relay)), 0, "relay keeps nothing");
    }

    function test_rejectsAnyoneButTheQuotedMaker() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _ready();
        vm.prank(other);
        vm.expectRevert(OctaneRelay.NotQuoteMaker.selector);
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_rejectsExpiredQuote() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _ready();
        vm.warp(uint256(quote.validUntil) + 1);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.QuoteExpired.selector);
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_rejectsQuoteNotSignedByMaker() public {
        (QuoteLib.Quote memory quote,, OctaneRelay.Payment memory payment, bytes memory authSig) = _ready();
        bytes memory forged = _signQuote(otherKey, quote);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.BadQuoteSignature.selector);
        relay.relay(quote, forged, payment, authSig);
    }

    function test_rejectsQuoteForAnotherContractOrChain() public {
        QuoteLib.Quote memory quote = _quote();
        quote.settlement = address(0xBAD);
        OctaneRelay.Payment memory payment = _payment(payer, SALT, quote.validUntil);
        bytes memory quoteSig = _signQuote(makerKey, quote);
        bytes memory authSig = _signAuth(payerKey, quote, payment, AMOUNT + FEE);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.WrongSettlement.selector);
        relay.relay(quote, quoteSig, payment, authSig);

        quote = _quote();
        quote.chainId = block.chainid + 1;
        quoteSig = _signQuote(makerKey, quote);
        authSig = _signAuth(payerKey, quote, payment, AMOUNT + FEE);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.WrongSettlement.selector);
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_rejectsQuoteForAnotherToken() public {
        QuoteLib.Quote memory quote = _quote();
        quote.token = address(0xBAD);
        OctaneRelay.Payment memory payment = _payment(payer, SALT, quote.validUntil);
        bytes memory quoteSig = _signQuote(makerKey, quote);
        bytes memory authSig = _signAuth(payerKey, quote, payment, AMOUNT + FEE);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.WrongToken.selector);
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_rejectsReusedAuthorisation() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _ready();
        vm.startPrank(maker);
        relay.relay(quote, quoteSig, payment, authSig);
        vm.expectRevert("authorization is used");
        relay.relay(quote, quoteSig, payment, authSig);
        vm.stopPrank();
    }

    function test_samePaymentRepeatsWithNewSalt() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _ready();
        OctaneRelay.Payment memory repeat = _payment(payer, bytes32(uint256(2)), quote.validUntil);
        bytes memory repeatSig = _signAuth(payerKey, quote, repeat, AMOUNT + FEE);

        vm.startPrank(maker);
        relay.relay(quote, quoteSig, payment, authSig);
        relay.relay(quote, quoteSig, repeat, repeatSig);
        vm.stopPrank();

        assertEq(token.balanceOf(merchant), 2 * AMOUNT);
        assertEq(token.balanceOf(maker), 2 * FEE);
    }

    function test_rejectsAuthorisationBoundToAnotherMaker() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment,) = _ready();
        bytes32 forOther =
            relay.bindingNonce(QuoteLib.digest(quote), payment.merchant, payment.amount, other, payer, SALT);
        bytes memory authSig = _signAuthWithNonce(payerKey, payment, AMOUNT + FEE, forOther);
        vm.prank(maker);
        vm.expectRevert("invalid signature");
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_rejectsTamperedAmount() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _ready();
        payment.amount = AMOUNT + 1;
        vm.prank(maker);
        vm.expectRevert("invalid signature");
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_rejectsTamperedRecipient() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _ready();
        payment.merchant = other;
        vm.prank(maker);
        vm.expectRevert("invalid signature");
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_rejectsHigherFeeThanSigned() public {
        (QuoteLib.Quote memory quote,, OctaneRelay.Payment memory payment, bytes memory authSig) = _ready();
        quote.fee = FEE + 1;
        bytes memory quoteSig = _signQuote(makerKey, quote);
        vm.prank(maker);
        vm.expectRevert("invalid signature");
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_rejectsWrongPayerSignature() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment,) = _ready();
        bytes memory authSig = _signAuth(otherKey, quote, payment, AMOUNT + FEE);
        vm.prank(maker);
        vm.expectRevert("invalid signature");
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_relayRejectsMerchantAsFeePayer() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig,, bytes memory authSig) = _ready();
        OctaneRelay.Payment memory payment = _payment(merchant, SALT, quote.validUntil);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.WrongFeePayer.selector);
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_merchantPaysTheFee() public {
        QuoteLib.Quote memory quote = _quote();
        OctaneRelay.Payment memory payment = _payment(merchant, SALT, quote.validUntil);
        OctaneRelay.MerchantOptIn memory optIn = _optIn();
        bytes memory quoteSig = _signQuote(makerKey, quote);
        bytes memory authSig = _signAuth(payerKey, quote, payment, AMOUNT);
        bytes memory optInSig = _signOptIn(merchantKey, optIn);

        vm.prank(maker);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, optIn, optInSig);

        assertEq(token.balanceOf(merchant), AMOUNT - FEE);
        assertEq(token.balanceOf(maker), FEE);
        assertEq(token.balanceOf(payer), 50_000_000 - AMOUNT);
        assertEq(token.balanceOf(address(relay)), 0, "relay keeps nothing");
    }

    function _merchantPaysSetup()
        private
        view
        returns (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig)
    {
        quote = _quote();
        quoteSig = _signQuote(makerKey, quote);
        payment = _payment(merchant, SALT, quote.validUntil);
        authSig = _signAuth(payerKey, quote, payment, AMOUNT);
    }

    function test_merchantPaysNeedsTheMerchantsSignature() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _merchantPaysSetup();
        OctaneRelay.MerchantOptIn memory optIn = _optIn();
        bytes memory forged = _signOptIn(payerKey, optIn);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.BadOptInSignature.selector);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, optIn, forged);
    }

    function test_merchantPaysRejectsMissingOptIn() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _merchantPaysSetup();
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.BadOptInSignature.selector);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, _optIn(), "");
    }

    function test_merchantPaysRejectsPayerAsFeePayer() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig,, bytes memory authSig) = _merchantPaysSetup();
        OctaneRelay.Payment memory payment = _payment(payer, SALT, quote.validUntil);
        OctaneRelay.MerchantOptIn memory optIn = _optIn();
        bytes memory optInSig = _signOptIn(merchantKey, optIn);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.WrongFeePayer.selector);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, optIn, optInSig);
    }

    function test_merchantPaysRejectsExpiredOptIn() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _merchantPaysSetup();
        OctaneRelay.MerchantOptIn memory optIn = _optIn();
        optIn.expiry = uint64(block.timestamp - 1);
        bytes memory optInSig = _signOptIn(merchantKey, optIn);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.OptInExpired.selector);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, optIn, optInSig);
    }

    function test_merchantPaysRejectsFeeAboveMax() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _merchantPaysSetup();
        OctaneRelay.MerchantOptIn memory optIn = _optIn();
        optIn.maxFee = FEE - 1;
        bytes memory optInSig = _signOptIn(merchantKey, optIn);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.FeeAboveMax.selector);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, optIn, optInSig);
    }

    function test_merchantPaysRejectsOptInForDifferentAmount() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _merchantPaysSetup();
        OctaneRelay.MerchantOptIn memory optIn = _optIn();
        optIn.amount = AMOUNT + 1;
        bytes memory optInSig = _signOptIn(merchantKey, optIn);
        vm.prank(maker);
        vm.expectRevert(OctaneRelay.OptInMismatch.selector);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, optIn, optInSig);
    }

    function test_merchantOptInWorksOnce() public {
        (QuoteLib.Quote memory quote, bytes memory quoteSig, OctaneRelay.Payment memory payment, bytes memory authSig) =
            _merchantPaysSetup();
        OctaneRelay.MerchantOptIn memory optIn = _optIn();
        bytes memory optInSig = _signOptIn(merchantKey, optIn);
        OctaneRelay.Payment memory second = _payment(merchant, bytes32(uint256(2)), quote.validUntil);
        bytes memory secondSig = _signAuth(payerKey, quote, second, AMOUNT);

        vm.startPrank(maker);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, optIn, optInSig);
        vm.expectRevert(OctaneRelay.OptInAlreadyUsed.selector);
        relay.relayMerchantPays(quote, quoteSig, second, secondSig, optIn, optInSig);
        vm.stopPrank();
    }

    /// @dev Regenerate with `pnpm fixture:quote`. Proves the SDK and the contract agree.
    function test_matchesPaymentHashesFromTypeScriptSdk() public {
        string memory json = vm.readFile("test/fixtures/payment.json");
        OctaneRelay fixtureRelay = OctaneRelay(json.readAddress(".relay"));
        vm.etch(address(fixtureRelay), address(relay).code);
        vm.chainId(json.readUint(".chainId"));

        bytes32 nonce = fixtureRelay.bindingNonce(
            json.readBytes32(".quoteHash"),
            json.readAddress(".merchant"),
            json.readUint(".amount"),
            json.readAddress(".maker"),
            json.readAddress(".feePayer"),
            json.readBytes32(".salt")
        );
        assertEq(nonce, json.readBytes32(".nonce"), "binding nonce");

        OctaneRelay.MerchantOptIn memory optIn = OctaneRelay.MerchantOptIn({
            merchant: json.readAddress(".optIn.merchant"),
            amount: json.readUint(".optIn.amount"),
            maxFee: json.readUint(".optIn.maxFee"),
            orderId: json.readBytes32(".optIn.orderId"),
            expiry: uint64(json.readUint(".optIn.expiry"))
        });
        assertEq(fixtureRelay.optInDigest(optIn), json.readBytes32(".optInDigest"), "opt-in digest");
    }
}
