// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC3009, OctaneRelay} from "../src/pathB/OctaneRelay.sol";

contract DeployRelay is Script {
    function run() external returns (OctaneRelay relay) {
        require(block.chainid == 1874, "not Whitechain Sepolia");
        vm.startBroadcast();
        relay = new OctaneRelay(IERC3009(vm.envAddress("WHITECHAIN_USDT")));
        vm.stopBroadcast();
        console2.log("OctaneRelay", address(relay));
    }
}
