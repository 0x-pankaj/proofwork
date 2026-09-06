// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ProofworkJobs} from "../src/ProofworkJobs.sol";

/// @notice Deploys the escrow and records the address for the rest of the monorepo.
///
/// Testnet:
///   cast wallet import proofwork-deployer --interactive     # once, stores an encrypted keystore
///   TREASURY=0x... bun run --cwd packages/contracts deploy:testnet
///
/// The deployer never appears on a command line. `deployments/<chainId>.json` is read by
/// packages/chain, so no address is ever pasted into application code.
contract Deploy is Script {
    /// @dev USDC on Arc, the ERC-20 view of the native gas token. Same address on both networks
    ///      so far; override with USDC_ADDRESS if mainnet publishes a different one.
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    uint16 internal constant DEFAULT_FEE_BPS = 300;

    function run() external returns (ProofworkJobs jobs) {
        address usdc = vm.envOr("USDC_ADDRESS", ARC_USDC);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(DEFAULT_FEE_BPS)));
        address treasury = vm.envAddress("TREASURY");
        address deployer = msg.sender;
        address owner = vm.envOr("OWNER", deployer);

        require(treasury != address(0), "TREASURY is required");

        vm.startBroadcast();
        jobs = new ProofworkJobs(IERC20(usdc), treasury, feeBps, owner);
        vm.stopBroadcast();

        console2.log("ProofworkJobs", address(jobs));
        console2.log("chainId      ", block.chainid);
        console2.log("paymentToken ", usdc);
        console2.log("treasury     ", treasury);
        console2.log("owner        ", owner);
        console2.log("feeBps       ", feeBps);

        _record(address(jobs), usdc, treasury, owner, feeBps, deployer);
    }

    function _record(
        address jobs,
        address usdc,
        address treasury,
        address owner,
        uint16 feeBps,
        address deployer
    ) internal {
        string memory key = "deployment";
        vm.serializeAddress(key, "ProofworkJobs", jobs);
        vm.serializeAddress(key, "paymentToken", usdc);
        vm.serializeAddress(key, "treasury", treasury);
        vm.serializeAddress(key, "owner", owner);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "feeBps", feeBps);
        string memory out = vm.serializeUint(key, "block", block.number);

        vm.writeJson(out, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
