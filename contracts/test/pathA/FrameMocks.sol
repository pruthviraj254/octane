// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Foundry's EVM has no frame opcodes. This stands in for the read helpers: it answers each
/// exact operand list with a value the test set, and fails on any read the test didn't expect.
contract MockFrameHelper {
    mapping(bytes32 operands => uint256) private answers;
    mapping(bytes32 operands => bool) private known;

    function setAnswer(bytes calldata operands, uint256 value) external {
        answers[keccak256(operands)] = value;
        known[keccak256(operands)] = true;
    }

    fallback() external {
        bytes32 key = keccak256(msg.data);
        require(known[key], "unexpected frame read");
        uint256 value = answers[key];
        assembly {
            mstore(0, value)
            return(0, 32)
        }
    }
}

/// @dev Runs by delegatecall, so the event comes from the account that approved.
contract MockApprove {
    event Approved(uint256 scope);

    fallback() external {
        emit Approved(abi.decode(msg.data, (uint256)));
    }
}

contract MockStakingRegistry {
    mapping(address => uint256) public staked;
    mapping(address => uint32) public delay;
    mapping(address => bool) public unlocked;

    function addStake(uint32 unstakeDelaySec) external payable {
        staked[msg.sender] += msg.value;
        delay[msg.sender] = unstakeDelaySec;
    }

    function unlockStake() external {
        unlocked[msg.sender] = true;
    }

    function withdrawStake(address payable to) external {
        uint256 amount = staked[msg.sender];
        staked[msg.sender] = 0;
        to.transfer(amount);
    }
}

contract MockBalances {
    mapping(address => uint256) public balanceOf;

    function setBalance(address account, uint256 value) external {
        balanceOf[account] = value;
    }
}
