// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC8183} from "./IERC8183.sol";

/// @title IProofworkJobs — ERC-8183 plus the three-way settlement Proofwork needs
/// @notice Two things the standard does not model:
///         a maintainer who is paid out of the budget for reviewing the work, and a
///         protocol fee the funder pays on top. Both are fixed when the job is funded.
interface IProofworkJobs is IERC8183 {
    /// @param maintainer            Paid for reviewing and merging. May be address(0).
    /// @param maintainerRewardBps   Share of the budget the maintainer receives.
    /// @param fee                   Protocol fee, escrowed on top of the budget.
    struct JobExtra {
        address maintainer;
        uint16 maintainerRewardBps;
        uint256 fee;
    }

    event FeeConfigured(uint16 feeBps, address treasury);
    event FeeCollected(uint256 indexed jobId, uint256 amount);
    event MaintainerRewardPaid(uint256 indexed jobId, address indexed maintainer, uint256 amount);
    event JobCancelled(uint256 indexed jobId, address indexed client);

    /// @notice Create, budget and fund in one transaction. Pulls `budget + feeFor(budget)`
    ///         from the caller, who must have approved this contract for that amount.
    /// @dev The funder is rarely the maintainer. When they are the same account, pass
    ///      maintainerRewardBps = 0 rather than paying oneself out of one's own escrow.
    function createAndFund(
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        uint256 budget,
        address maintainer,
        uint16 maintainerRewardBps
    ) external returns (uint256 jobId);

    /// @notice Evaluator-only. Records the provider and deliverable, completes the job and
    ///         releases all three payments in one transaction. This is what a merged pull
    ///         request triggers.
    function settle(uint256 jobId, address provider, bytes32 deliverable, bytes32 reason) external;

    /// @notice Client-only, while the job is funded and nobody has been assigned.
    ///         Refunds budget and fee.
    function cancel(uint256 jobId) external;

    function getJobExtra(uint256 jobId) external view returns (JobExtra memory);

    function feeBps() external view returns (uint16);

    function treasury() external view returns (address);

    function paymentToken() external view returns (IERC20);

    function feeFor(uint256 budget) external view returns (uint256);
}
