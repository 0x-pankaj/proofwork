// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ProofworkJobs} from "../../src/ProofworkJobs.sol";

/// @dev A hostile payment token that calls back into the escrow while it is paying out.
///      Used to prove the reentrancy guard holds on the money-moving paths.
contract ReenteringToken is ERC20 {
    ProofworkJobs public target;
    uint256 public jobId;
    bool public armed;

    constructor() ERC20("Hostile", "EVIL") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(ProofworkJobs target_, uint256 jobId_) external {
        target = target_;
        jobId = jobId_;
        armed = true;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (armed) {
            armed = false;
            target.claimRefund(jobId);
        }
        return super.transfer(to, value);
    }
}
