// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title QuoteLib
/// @notice The EIP-712 signed gas quote shared by both settlement paths.
/// @dev Must stay identical to packages/sdk/src/quotes.ts. The fixture test in
/// test/QuoteLib.t.sol fails if the two drift apart.
///
/// This library reads no time and no storage, so OctanePaymaster can call digest()
/// during VERIFY. isSignedByMaker() uses ecrecover and is for Path B only: on Path A
/// the maker's signature travels as a frame transaction signature entry instead, and
/// the paymaster reads the protocol's result with SIGPARAM.
/// Callers enforce the rest themselves:
/// - validUntil: Path B checks block.timestamp; Path A relies on the EXPIRY_VERIFIER
///   frame, because TIMESTAMP is banned elsewhere during validation.
/// - nonce: identifies a quote version. A quote can settle many payments until
///   validUntil; each payment's replay protection comes from its own authorisation.
library QuoteLib {
    struct Quote {
        address maker; // who gets paid and whose funds back the quote
        uint256 chainId; // settlement chain
        address settlement; // OctaneRelay or the maker's paymaster clone
        address token; // USDT (Path B) or USDC (Path A)
        uint256 maxGas; // gas units covered
        uint256 fee; // Path B: flat fee in token units. Path A: token per unit of gas cost
        uint64 validUntil; // unix time, enforced onchain by the caller
        uint256 nonce; // per maker, prevents replay
    }

    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant NAME_HASH = keccak256("Octane");
    bytes32 internal constant VERSION_HASH = keccak256("1");
    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(address maker,uint256 chainId,address settlement,address token,uint256 maxGas,uint256 fee,uint64 validUntil,uint256 nonce)"
    );

    /// @dev secp256k1 order / 2. Signatures above it are malleable copies.
    uint256 private constant MAX_S = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    function structHash(Quote memory quote) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                quote.maker,
                quote.chainId,
                quote.settlement,
                quote.token,
                quote.maxGas,
                quote.fee,
                quote.validUntil,
                quote.nonce
            )
        );
    }

    function domainSeparator(uint256 chainId, address settlement) internal pure returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, chainId, settlement));
    }

    /// @notice The EIP-712 digest. This is the `quoteHash` used across Octane.
    /// @dev The domain comes from the quote itself. Pair it with isBoundHere so a
    /// quote signed for another chain or contract can't be settled here.
    function digest(Quote memory quote) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(hex"1901", domainSeparator(quote.chainId, quote.settlement), structHash(quote))
        );
    }

    /// @notice Recovers a signer, returning address(0) for anything malformed or malleable.
    function recover(bytes32 hash, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (uint256(s) > MAX_S) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }

    /// @notice True when the quote carries a valid signature from its own maker.
    function isSignedByMaker(Quote memory quote, bytes calldata signature) internal pure returns (bool) {
        address signer = recover(digest(quote), signature);
        return signer != address(0) && signer == quote.maker;
    }

    /// @notice True when the quote names this chain and this contract as its settlement.
    function isBoundHere(Quote memory quote) internal view returns (bool) {
        return quote.chainId == block.chainid && quote.settlement == address(this);
    }
}
