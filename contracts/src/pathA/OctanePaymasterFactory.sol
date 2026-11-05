// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title OctanePaymasterFactory
/// @notice Creates one EIP-1167 paymaster clone per maker, so no maker's funds touch another's.
/// @dev The maker and gas price cap are appended to the clone's runtime code. Clients check a
/// quote's settlement against isClone, because anyone can write a quote naming any contract.
contract OctanePaymasterFactory {
    address public immutable implementation;

    mapping(address clone => bool) public isClone;
    mapping(address maker => address) public cloneOf;

    event CloneCreated(address indexed maker, address clone, uint256 maxGasPrice);

    error AlreadyCreated();
    error CreateFailed();

    constructor(address implementation_) {
        implementation = implementation_;
    }

    /// @notice Creates the caller's clone. Only a maker can create its own.
    function createClone(uint256 maxGasPrice) external returns (address clone) {
        address maker = msg.sender;
        if (cloneOf[maker] != address(0)) revert AlreadyCreated();

        bytes memory creationCode = _creationCode(maker, maxGasPrice);
        assembly ("memory-safe") {
            clone := create2(0, add(creationCode, 0x20), mload(creationCode), maker)
        }
        if (clone == address(0)) revert CreateFailed();

        isClone[clone] = true;
        cloneOf[maker] = clone;
        emit CloneCreated(maker, clone, maxGasPrice);
    }

    function predictClone(address maker, uint256 maxGasPrice) external view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff), address(this), bytes32(uint256(uint160(maker))), keccak256(_creationCode(maker, maxGasPrice))
            )
        );
        return address(uint160(uint256(hash)));
    }

    function _creationCode(address maker, uint256 maxGasPrice) private view returns (bytes memory) {
        bytes memory runtime = abi.encodePacked(
            hex"363d3d373d3d3d363d73", implementation, hex"5af43d82803e903d91602b57fd5bf3", maker, maxGasPrice
        );
        return abi.encodePacked(hex"61", uint16(runtime.length), hex"3d81600a3d39f3", runtime);
    }
}
