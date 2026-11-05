// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {QuoteLib} from "../src/lib/QuoteLib.sol";

/// @dev Library functions take calldata signatures, so tests go through an external call.
contract QuoteHarness {
    function isSignedByMaker(QuoteLib.Quote memory quote, bytes calldata signature) external pure returns (bool) {
        return QuoteLib.isSignedByMaker(quote, signature);
    }

    function isBoundHere(QuoteLib.Quote memory quote) external view returns (bool) {
        return QuoteLib.isBoundHere(quote);
    }
}

contract QuoteLibTest is Test {
    using stdJson for string;

    uint256 private constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    QuoteHarness private harness;
    uint256 private signerKey;
    address private maker;

    function setUp() public {
        harness = new QuoteHarness();
        // Derived from a public label: a test-only signer that never holds funds.
        signerKey = uint256(keccak256("octane.test.quote.signer"));
        maker = vm.addr(signerKey);
    }

    function _quote() private view returns (QuoteLib.Quote memory) {
        return QuoteLib.Quote({
            maker: maker,
            chainId: block.chainid,
            settlement: address(harness),
            token: address(0xBEEF),
            maxGas: 200_000,
            fee: 50_000,
            validUntil: 1_800_000_000,
            nonce: 7
        });
    }

    function _sign(uint256 key, QuoteLib.Quote memory quote) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, QuoteLib.digest(quote));
        return abi.encodePacked(r, s, v);
    }

    function test_acceptsMakerSignature() public view {
        QuoteLib.Quote memory quote = _quote();
        assertTrue(harness.isSignedByMaker(quote, _sign(signerKey, quote)));
    }

    function test_rejectsWrongMaker() public view {
        QuoteLib.Quote memory quote = _quote();
        uint256 otherKey = uint256(keccak256("octane.test.quote.other"));
        assertFalse(harness.isSignedByMaker(quote, _sign(otherKey, quote)));
    }

    function test_rejectsEveryTamperedField() public view {
        QuoteLib.Quote memory signed = _quote();
        bytes memory signature = _sign(signerKey, signed);

        QuoteLib.Quote memory tampered = _quote();
        tampered.maker = address(0xBAD);
        assertFalse(harness.isSignedByMaker(tampered, signature), "maker");

        tampered = _quote();
        tampered.chainId += 1;
        assertFalse(harness.isSignedByMaker(tampered, signature), "chainId");

        tampered = _quote();
        tampered.settlement = address(0xBAD);
        assertFalse(harness.isSignedByMaker(tampered, signature), "settlement");

        tampered = _quote();
        tampered.token = address(0xBAD);
        assertFalse(harness.isSignedByMaker(tampered, signature), "token");

        tampered = _quote();
        tampered.maxGas += 1;
        assertFalse(harness.isSignedByMaker(tampered, signature), "maxGas");

        tampered = _quote();
        tampered.fee -= 1;
        assertFalse(harness.isSignedByMaker(tampered, signature), "fee");

        tampered = _quote();
        tampered.validUntil += 1;
        assertFalse(harness.isSignedByMaker(tampered, signature), "validUntil");

        tampered = _quote();
        tampered.nonce += 1;
        assertFalse(harness.isSignedByMaker(tampered, signature), "nonce");
    }

    function test_rejectsMalleableSignature() public view {
        QuoteLib.Quote memory quote = _quote();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, QuoteLib.digest(quote));
        // The mirror (r, n - s, flipped v) recovers the same signer unless high s is refused.
        bytes memory mirror = abi.encodePacked(r, bytes32(N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        assertFalse(harness.isSignedByMaker(quote, mirror));
    }

    function test_rejectsMalformedSignatures() public view {
        QuoteLib.Quote memory quote = _quote();
        bytes memory good = _sign(signerKey, quote);

        assertFalse(harness.isSignedByMaker(quote, ""), "empty");
        assertFalse(harness.isSignedByMaker(quote, new bytes(64)), "short");
        assertFalse(harness.isSignedByMaker(quote, abi.encodePacked(good, uint8(0))), "long");

        bytes memory badV = good;
        badV[64] = bytes1(uint8(29));
        assertFalse(harness.isSignedByMaker(quote, badV), "v");
    }

    function test_zeroMakerNeverVerifies() public view {
        QuoteLib.Quote memory quote = _quote();
        quote.maker = address(0);
        // ecrecover returns zero for this garbage signature, which must not count as a match.
        bytes memory garbage = abi.encodePacked(bytes32(0), bytes32(0), uint8(27));
        assertFalse(harness.isSignedByMaker(quote, garbage));
    }

    function test_isBoundHereChecksChainAndContract() public {
        QuoteLib.Quote memory quote = _quote();
        assertTrue(harness.isBoundHere(quote));

        quote.settlement = address(0xBAD);
        assertFalse(harness.isBoundHere(quote), "other contract");

        quote = _quote();
        vm.chainId(block.chainid + 1);
        assertFalse(harness.isBoundHere(quote), "other chain");
    }

    /// @dev Regenerate with `pnpm fixture:quote`. The SDK test fails if this file goes stale,
    /// so a change on either side of the TS/Solidity boundary breaks a test.
    function test_verifiesQuoteSignedByTypeScriptSdk() public view {
        string memory json = vm.readFile("test/fixtures/quote.json");

        QuoteLib.Quote memory quote = QuoteLib.Quote({
            maker: json.readAddress(".quote.maker"),
            chainId: json.readUint(".quote.chainId"),
            settlement: json.readAddress(".quote.settlement"),
            token: json.readAddress(".quote.token"),
            maxGas: json.readUint(".quote.maxGas"),
            fee: json.readUint(".quote.fee"),
            validUntil: uint64(json.readUint(".quote.validUntil")),
            nonce: json.readUint(".quote.nonce")
        });

        assertEq(QuoteLib.QUOTE_TYPEHASH, json.readBytes32(".quoteTypeHash"), "type hash");
        assertEq(
            QuoteLib.domainSeparator(quote.chainId, quote.settlement),
            json.readBytes32(".domainSeparator"),
            "domain separator"
        );
        assertEq(QuoteLib.structHash(quote), json.readBytes32(".structHash"), "struct hash");
        assertEq(QuoteLib.digest(quote), json.readBytes32(".digest"), "digest");
        assertEq(quote.maker, maker, "fixture signer");
        assertTrue(harness.isSignedByMaker(quote, json.readBytes(".signature")), "signature");
    }
}
