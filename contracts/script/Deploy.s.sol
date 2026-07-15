// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {TrackRecordAnchor} from "../TrackRecordAnchor.sol";

// Deploys TrackRecordAnchor. The deployer becomes the owner (the anchoring
// signer). Run against a testnet first:
//   forge script contracts/script/Deploy.s.sol \
//     --rpc-url $ANCHOR_RPC_URL --private-key $ANCHOR_SIGNER_KEY --broadcast
contract Deploy is Script {
    function run() external returns (TrackRecordAnchor anchor) {
        vm.startBroadcast();
        anchor = new TrackRecordAnchor();
        vm.stopBroadcast();
    }
}
