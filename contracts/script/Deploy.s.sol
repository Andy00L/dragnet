// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {DragnetMarket} from "../src/DragnetMarket.sol";

/// @notice Deploys DragnetMarket. Run against Monad testnet with:
///   forge script script/Deploy.s.sol --rpc-url $DRAGNET_RPC_URL --broadcast
/// with PRIVATE_KEY set in the environment.
contract Deploy is Script {
    function run() external returns (DragnetMarket market) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        market = new DragnetMarket();
        vm.stopBroadcast();
        console2.log("DragnetMarket deployed at:", address(market));
    }
}
