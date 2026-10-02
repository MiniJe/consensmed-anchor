// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {ConsensMedVerify} from "../src/ConsensMedVerify.sol";

/// @notice Deploys ConsensMedVerify and authorizes the deployer as the first submitter.
contract Deploy is Script {
    function run() external returns (ConsensMedVerify registry) {
        uint256 signer = vm.envUint("ARB_SUBMITTER_KEY");
        address deployer = vm.addr(signer);

        vm.startBroadcast(signer);
        registry = new ConsensMedVerify(deployer);
        registry.setSubmitter(deployer, true);
        vm.stopBroadcast();
    }
}
