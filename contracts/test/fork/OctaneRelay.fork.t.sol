// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {QuoteLib} from "../../src/lib/QuoteLib.sol";
import {IERC3009, OctaneRelay} from "../../src/pathB/OctaneRelay.sol";

interface IUSDT {
    function balanceOf(address account) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

/// @notice Runs the relay against the real test USDT on a local fork of Whitechain Sepolia.
/// Nothing is broadcast. This proves the EIP-712 domain, the EIP-3009 typehash and the
/// signature format against the actual token, which a mock can't do.
contract OctaneRelayForkTest is Test {
    address private constant USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    OctaneRelay private relay;
    uint256 private payerKey = uint256(keccak256("octane.test.fork.payer"));
    uint256 private makerKey = uint256(keccak256("octane.test.fork.maker"));
    uint256 private merchantKey = uint256(keccak256("octane.test.fork.merchant"));
    address private payer;
    address private maker;
    address private merchant;

    function setUp() public {
        vm.createSelectFork("whitechain");
        relay = new OctaneRelay(IERC3009(USDT));
        payer = vm.addr(payerKey);
        maker = vm.addr(makerKey);
        merchant = vm.addr(merchantKey);
        deal(USDT, payer, 20_000_000);
    }

    function _quote(uint256 fee) private view returns (QuoteLib.Quote memory) {
        return QuoteLib.Quote({
            maker: maker,
            chainId: block.chainid,
            settlement: address(relay),
            token: USDT,
            maxGas: 175_000,
            fee: fee,
            validUntil: uint64(block.timestamp + 100),
            nonce: 1
        });
    }

    function _signQuote(QuoteLib.Quote memory quote) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerKey, QuoteLib.digest(quote));
        return abi.encodePacked(r, s, v);
    }

    function _signAuth(QuoteLib.Quote memory quote, OctaneRelay.Payment memory p, uint256 value)
        private
        view
        returns (bytes memory)
    {
        bytes32 nonce =
            relay.bindingNonce(QuoteLib.digest(quote), p.merchant, p.amount, quote.maker, p.feePayer, p.salt);
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, p.payer, address(relay), value, p.validAfter, p.validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", IUSDT(USDT).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_domainMatchesTheOneTheSdkUses() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Tether USD"),
                keccak256("1"),
                uint256(1874),
                USDT
            )
        );
        assertEq(IUSDT(USDT).DOMAIN_SEPARATOR(), expected);
    }

    function test_settlesAgainstTheRealUsdt() public {
        QuoteLib.Quote memory quote = _quote(70_000);
        bytes memory quoteSig = _signQuote(quote);
        OctaneRelay.Payment memory payment = OctaneRelay.Payment({
            payer: payer,
            merchant: merchant,
            amount: 10_000_000,
            feePayer: payer,
            salt: bytes32(uint256(1)),
            validAfter: 0,
            validBefore: uint256(quote.validUntil) + 1
        });
        bytes memory authSig = _signAuth(quote, payment, 10_070_000);

        vm.prank(maker);
        uint256 gasBefore = gasleft();
        relay.relay(quote, quoteSig, payment, authSig);
        console2.log("gas for a first payment", gasBefore - gasleft());

        assertEq(IUSDT(USDT).balanceOf(merchant), 10_000_000);
        assertEq(IUSDT(USDT).balanceOf(maker), 70_000);
        assertEq(IUSDT(USDT).balanceOf(payer), 20_000_000 - 10_070_000);
        assertEq(IUSDT(USDT).balanceOf(address(relay)), 0);
        assertEq(payer.balance, 0, "payer holds no WBT");
        assertEq(vm.getNonce(payer), 0, "payer sent no transaction");

        vm.prank(maker);
        vm.expectRevert();
        relay.relay(quote, quoteSig, payment, authSig);
    }

    function test_merchantPaysAgainstTheRealUsdt() public {
        QuoteLib.Quote memory quote = _quote(70_000);
        bytes memory quoteSig = _signQuote(quote);
        OctaneRelay.Payment memory payment = OctaneRelay.Payment({
            payer: payer,
            merchant: merchant,
            amount: 10_000_000,
            feePayer: merchant,
            salt: bytes32(uint256(2)),
            validAfter: 0,
            validBefore: uint256(quote.validUntil) + 1
        });
        bytes memory authSig = _signAuth(quote, payment, 10_000_000);
        OctaneRelay.MerchantOptIn memory optIn = OctaneRelay.MerchantOptIn({
            merchant: merchant,
            amount: 10_000_000,
            maxFee: 70_000,
            orderId: bytes32(uint256(42)),
            expiry: uint64(block.timestamp + 300)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(merchantKey, relay.optInDigest(optIn));
        bytes memory optInSig = abi.encodePacked(r, s, v);

        vm.prank(maker);
        relay.relayMerchantPays(quote, quoteSig, payment, authSig, optIn, optInSig);

        assertEq(IUSDT(USDT).balanceOf(merchant), 9_930_000);
        assertEq(IUSDT(USDT).balanceOf(maker), 70_000);
    }
}
