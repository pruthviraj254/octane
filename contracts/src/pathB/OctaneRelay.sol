// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {QuoteLib} from "../lib/QuoteLib.sol";

interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;

    function transfer(address to, uint256 value) external returns (bool);
}

/// @title OctaneRelay
/// @notice Settles gasless USDT payments on Whitechain. The payer only signs; the quoted
/// maker submits the transaction, pays the WBT gas and earns its fee in the same transaction.
/// @dev Holds no funds between transactions. Each payer authorisation is bound to one maker
/// through its EIP-3009 nonce, which this contract recomputes rather than accepts, so an
/// authorisation can't be replayed through another maker or for other terms.
contract OctaneRelay {
    using QuoteLib for QuoteLib.Quote;

    struct Payment {
        address payer;
        address merchant;
        uint256 amount;
        address feePayer; // payer, or merchant in merchant-pays mode
        bytes32 salt; // lets the same payment repeat under one quote
        uint256 validAfter;
        uint256 validBefore;
    }

    /// @notice A merchant's agreement to cover the maker's fee on one order.
    struct MerchantOptIn {
        address merchant;
        uint256 amount;
        uint256 maxFee;
        bytes32 orderId;
        uint64 expiry;
    }

    bytes32 public constant MERCHANT_OPT_IN_TYPEHASH =
        keccak256("MerchantOptIn(address merchant,uint256 amount,uint256 maxFee,bytes32 orderId,uint64 expiry)");

    IERC3009 public immutable token;

    /// @notice Stops one opt-in being used to charge the merchant's fee twice.
    mapping(address merchant => mapping(bytes32 orderId => bool)) public optInUsed;

    event Relayed(
        bytes32 indexed quoteHash,
        address indexed maker,
        address indexed payer,
        address merchant,
        uint256 amount,
        uint256 fee,
        address feePayer
    );

    error NotQuoteMaker();
    error WrongSettlement();
    error WrongToken();
    error QuoteExpired();
    error BadQuoteSignature();
    error WrongFeePayer();
    error BadOptInSignature();
    error OptInMismatch();
    error OptInExpired();
    error OptInAlreadyUsed();
    error FeeAboveMax();
    error TransferFailed();

    constructor(IERC3009 token_) {
        token = token_;
    }

    /// @notice Payer covers the fee: the merchant receives `amount`, the maker receives `fee`.
    function relay(QuoteLib.Quote calldata quote, bytes calldata quoteSig, Payment calldata payment, bytes calldata authSig)
        external
    {
        if (payment.feePayer != payment.payer) revert WrongFeePayer();
        bytes32 quoteHash = _checkQuote(quote, quoteSig);
        _pull(quoteHash, quote, payment, payment.amount + quote.fee, authSig);
        _pay(payment.merchant, payment.amount);
        _pay(quote.maker, quote.fee);
        emit Relayed(quoteHash, quote.maker, payment.payer, payment.merchant, payment.amount, quote.fee, payment.feePayer);
    }

    /// @notice Merchant covers the fee: it receives `amount - fee`. Requires its signed opt-in.
    function relayMerchantPays(
        QuoteLib.Quote calldata quote,
        bytes calldata quoteSig,
        Payment calldata payment,
        bytes calldata authSig,
        MerchantOptIn calldata optIn,
        bytes calldata optInSig
    ) external {
        if (payment.feePayer != payment.merchant) revert WrongFeePayer();
        bytes32 quoteHash = _checkQuote(quote, quoteSig);
        _checkOptIn(quote, payment, optIn, optInSig);
        _pull(quoteHash, quote, payment, payment.amount, authSig);
        _pay(payment.merchant, payment.amount - quote.fee);
        _pay(quote.maker, quote.fee);
        emit Relayed(quoteHash, quote.maker, payment.payer, payment.merchant, payment.amount, quote.fee, payment.feePayer);
    }

    /// @notice The EIP-3009 nonce a payer signs. Exposed so anyone can check a binding.
    function bindingNonce(
        bytes32 quoteHash,
        address merchant,
        uint256 amount,
        address maker,
        address feePayer,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(quoteHash, merchant, amount, maker, feePayer, salt));
    }

    /// @notice The EIP-712 digest a merchant signs for its opt-in.
    function optInDigest(MerchantOptIn calldata optIn) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(MERCHANT_OPT_IN_TYPEHASH, optIn.merchant, optIn.amount, optIn.maxFee, optIn.orderId, optIn.expiry)
        );
        return keccak256(abi.encodePacked(hex"1901", QuoteLib.domainSeparator(block.chainid, address(this)), structHash));
    }

    function _checkQuote(QuoteLib.Quote calldata quote, bytes calldata quoteSig) private view returns (bytes32) {
        if (msg.sender != quote.maker) revert NotQuoteMaker();
        QuoteLib.Quote memory q = quote;
        if (!q.isBoundHere()) revert WrongSettlement();
        if (q.token != address(token)) revert WrongToken();
        if (block.timestamp > q.validUntil) revert QuoteExpired();
        if (!q.isSignedByMaker(quoteSig)) revert BadQuoteSignature();
        return q.digest();
    }

    function _checkOptIn(
        QuoteLib.Quote calldata quote,
        Payment calldata payment,
        MerchantOptIn calldata optIn,
        bytes calldata optInSig
    ) private {
        if (optIn.merchant != payment.merchant || optIn.amount != payment.amount) revert OptInMismatch();
        if (block.timestamp > optIn.expiry) revert OptInExpired();
        if (quote.fee > optIn.maxFee || quote.fee > payment.amount) revert FeeAboveMax();
        address signer = QuoteLib.recover(optInDigest(optIn), optInSig);
        if (signer == address(0) || signer != optIn.merchant) revert BadOptInSignature();
        if (optInUsed[optIn.merchant][optIn.orderId]) revert OptInAlreadyUsed();
        optInUsed[optIn.merchant][optIn.orderId] = true;
    }

    function _pull(
        bytes32 quoteHash,
        QuoteLib.Quote calldata quote,
        Payment calldata payment,
        uint256 value,
        bytes calldata authSig
    ) private {
        bytes32 nonce =
            bindingNonce(quoteHash, payment.merchant, payment.amount, quote.maker, payment.feePayer, payment.salt);
        token.receiveWithAuthorization(
            payment.payer, address(this), value, payment.validAfter, payment.validBefore, nonce, authSig
        );
    }

    function _pay(address to, uint256 value) private {
        if (!token.transfer(to, value)) revert TransferFailed();
    }
}
