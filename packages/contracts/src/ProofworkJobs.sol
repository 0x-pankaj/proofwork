// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IERC8183} from "./interfaces/IERC8183.sol";
import {IProofworkJobs} from "./interfaces/IProofworkJobs.sol";

/// @title ProofworkJobs
/// @notice Escrow for open-source work paid in USDC on Arc.
///
/// A funder escrows a budget against a task and names an evaluator. When the evaluator
/// confirms the work landed, the escrow pays three parties at once: the contributor who
/// did the work, the maintainer who reviewed it, and the protocol treasury.
///
/// Money rules, fixed at funding time so nobody can move the goalposts afterwards:
///  - the protocol fee is paid by the funder on top of the budget;
///  - the maintainer's review reward comes out of the budget;
///  - a refund always returns budget and fee together, to the funder.
///
/// The contract is deliberately not upgradeable. Ownership starts on the deployer and is
/// intended to move to a multisig once the launch period is over.
contract ProofworkJobs is IERC8183, IProofworkJobs, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS_DENOMINATOR = 10_000;

    /// @notice The protocol fee can never exceed 10% of a budget.
    uint16 public constant MAX_FEE_BPS = 1_000;
    /// @notice A maintainer can never be given more than half of a budget.
    uint16 public constant MAX_MAINTAINER_REWARD_BPS = 5_000;
    /// @notice A job must stay open long enough to be worked on, and cannot lock funds forever.
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 180 days;

    /// @notice USDC. One token, set once, so no job can be funded in something worthless.
    IERC20 public immutable paymentToken;

    uint16 public feeBps;
    address public treasury;
    /// @notice Total jobs ever created. Job ids start at 1.
    uint256 public jobCount;

    mapping(uint256 => IERC8183.Job) private _jobs;
    mapping(uint256 => IProofworkJobs.JobExtra) private _extras;

    error ZeroAddress();
    error FeeTooHigh(uint16 provided, uint16 maximum);
    error RewardTooHigh(uint16 provided, uint16 maximum);
    error RewardWithoutMaintainer();
    error UnknownJob(uint256 jobId);
    error NotClient(uint256 jobId, address caller);
    error NotClientOrProvider(uint256 jobId, address caller);
    error WrongStatus(uint256 jobId, IERC8183.JobStatus actual);
    error ExpiryOutOfRange(uint256 expiredAt);
    error ZeroBudget();
    error HooksNotSupported();
    error ProviderAlreadyAssigned(uint256 jobId);
    error NotYetExpired(uint256 jobId, uint256 expiredAt);
    error NotEvaluator(uint256 jobId, address caller);
    error NotProvider(uint256 jobId, address caller);
    error ProviderNotAssigned(uint256 jobId);

    /// @param token     USDC on the target network.
    /// @param treasury_ Receives protocol fees.
    /// @param feeBps_   Protocol fee in basis points of the budget.
    /// @param owner_    Initial owner, expected to become a multisig.
    constructor(IERC20 token, address treasury_, uint16 feeBps_, address owner_) Ownable(owner_) {
        if (address(token) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh(feeBps_, MAX_FEE_BPS);
        paymentToken = token;
        treasury = treasury_;
        feeBps = feeBps_;
        emit IProofworkJobs.FeeConfigured(feeBps_, treasury_);
    }

    // --- administration -------------------------------------------------------------

    /// @notice Change the fee and its destination.
    /// @dev The two halves behave differently on purpose. The fee *amount* is snapshotted when
    ///      a job is funded, so repricing can never touch money already escrowed. The
    ///      *destination* is read at payout, so rotating the treasury to a multisig redirects
    ///      fees that have not been paid yet, which is the whole point of rotating it.
    function setFeeConfig(uint16 newFeeBps, address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        feeBps = newFeeBps;
        treasury = newTreasury;
        emit IProofworkJobs.FeeConfigured(newFeeBps, newTreasury);
    }

    /// @notice Stop new money entering the contract. Refunds and settlements keep working.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // --- creation and funding -------------------------------------------------------

    /// @notice ERC-8183 job creation. Hooks are accepted by the standard but not used here.
    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external whenNotPaused returns (uint256 jobId) {
        if (hook != address(0)) revert HooksNotSupported();
        jobId = _createJob(provider, evaluator, expiredAt, description);
    }

    /// @notice Assign the account that will do the work, before funding.
    function setProvider(uint256 jobId, address provider_) external {
        IERC8183.Job storage job = _job(jobId);
        if (msg.sender != job.client) revert NotClient(jobId, msg.sender);
        if (job.status != IERC8183.JobStatus.Open) revert WrongStatus(jobId, job.status);
        if (provider_ == address(0)) revert ZeroAddress();
        job.provider = provider_;
        emit IERC8183.ProviderSet(jobId, provider_);
    }

    /// @notice Set the budget of an open job.
    /// @dev Either side may put the number on the table: a funder posting a bounty, or a
    ///      provider quoting for a job addressed to them.
    function setBudget(uint256 jobId, uint256 amount, bytes calldata) external {
        IERC8183.Job storage job = _job(jobId);
        if (msg.sender != job.client && msg.sender != job.provider) {
            revert NotClientOrProvider(jobId, msg.sender);
        }
        if (job.status != IERC8183.JobStatus.Open) revert WrongStatus(jobId, job.status);
        if (amount == 0) revert ZeroBudget();
        job.budget = amount;
        emit IERC8183.BudgetSet(jobId, amount);
    }

    /// @notice Escrow the budget of an open job.
    /// @dev Pulls budget plus fee. The caller must have approved that total first.
    function fund(uint256 jobId, bytes calldata) external nonReentrant whenNotPaused {
        IERC8183.Job storage job = _job(jobId);
        if (msg.sender != job.client) revert NotClient(jobId, msg.sender);
        if (job.status != IERC8183.JobStatus.Open) revert WrongStatus(jobId, job.status);
        if (job.budget == 0) revert ZeroBudget();
        _fund(jobId, job);
    }

    /// @notice Create, budget and fund in one transaction. The path a funder actually uses.
    function createAndFund(
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        uint256 budget,
        address maintainer,
        uint16 maintainerRewardBps
    ) external nonReentrant whenNotPaused returns (uint256 jobId) {
        if (budget == 0) revert ZeroBudget();
        if (maintainerRewardBps > MAX_MAINTAINER_REWARD_BPS) {
            revert RewardTooHigh(maintainerRewardBps, MAX_MAINTAINER_REWARD_BPS);
        }
        if (maintainer == address(0) && maintainerRewardBps != 0) revert RewardWithoutMaintainer();

        jobId = _createJob(address(0), evaluator, expiredAt, description);

        IERC8183.Job storage job = _jobs[jobId];
        job.budget = budget;
        emit IERC8183.BudgetSet(jobId, budget);

        IProofworkJobs.JobExtra storage extra = _extras[jobId];
        extra.maintainer = maintainer;
        extra.maintainerRewardBps = maintainerRewardBps;

        _fund(jobId, job);
    }

    // --- delivery and settlement ----------------------------------------------------

    /// @notice The provider marks the work delivered. `deliverable` is a hash of the proof,
    ///         for Proofwork the pull request and its merge commit.
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata) external {
        IERC8183.Job storage job = _job(jobId);
        if (msg.sender != job.provider) revert NotProvider(jobId, msg.sender);
        if (job.status != IERC8183.JobStatus.Funded) revert WrongStatus(jobId, job.status);

        job.status = IERC8183.JobStatus.Submitted;
        emit IERC8183.JobSubmitted(jobId, msg.sender, deliverable);
    }

    /// @notice The evaluator accepts the work and releases the money.
    function complete(uint256 jobId, bytes32 reason, bytes calldata) external nonReentrant {
        IERC8183.Job storage job = _job(jobId);
        _requireEvaluatorOfFundedJob(jobId, job);
        _release(jobId, job, reason);
    }

    /// @notice Close a job without paying. The funder is made whole.
    /// @dev A funder may withdraw their own job while it is still open and unfunded;
    ///      after that only the evaluator decides, and the refund is automatic.
    function reject(uint256 jobId, bytes32 reason, bytes calldata) external nonReentrant {
        IERC8183.Job storage job = _job(jobId);
        IERC8183.JobStatus status = job.status;

        if (status == IERC8183.JobStatus.Open) {
            if (msg.sender != job.client) revert NotClient(jobId, msg.sender);
            job.status = IERC8183.JobStatus.Rejected;
            emit IERC8183.JobRejected(jobId, msg.sender, reason);
            return;
        }

        _requireEvaluatorOfFundedJob(jobId, job);
        job.status = IERC8183.JobStatus.Rejected;
        uint256 amount = job.budget + _extras[jobId].fee;
        address client = job.client;

        emit IERC8183.JobRejected(jobId, msg.sender, reason);
        emit IERC8183.Refunded(jobId, client, amount);
        paymentToken.safeTransfer(client, amount);
    }

    /// @notice Assign, record and pay in one transaction. This is what a merged pull request
    ///         triggers: the contributor, the reviewing maintainer and the treasury are all
    ///         paid before the transaction returns.
    function settle(uint256 jobId, address provider, bytes32 deliverable, bytes32 reason)
        external
        nonReentrant
    {
        IERC8183.Job storage job = _job(jobId);
        _requireEvaluatorOfFundedJob(jobId, job);
        if (provider == address(0)) revert ZeroAddress();

        job.provider = provider;
        emit IERC8183.ProviderSet(jobId, provider);
        emit IERC8183.JobSubmitted(jobId, provider, deliverable);

        _release(jobId, job, reason);
    }

    // --- unwinding ------------------------------------------------------------------

    /// @notice Take back an unclaimed bounty.
    /// @dev Only while nobody has been assigned. Once someone is working, the funder waits
    ///      for the evaluator or for expiry rather than pulling the money out from under them.
    function cancel(uint256 jobId) external nonReentrant {
        IERC8183.Job storage job = _job(jobId);
        if (msg.sender != job.client) revert NotClient(jobId, msg.sender);
        if (job.status != IERC8183.JobStatus.Funded) revert WrongStatus(jobId, job.status);
        if (job.provider != address(0)) revert ProviderAlreadyAssigned(jobId);

        job.status = IERC8183.JobStatus.Rejected;
        uint256 amount = job.budget + _extras[jobId].fee;
        address client = job.client;

        emit IProofworkJobs.JobCancelled(jobId, client);
        // casting to bytes32 is safe: the literal is 9 bytes, well inside the word.
        // forge-lint: disable-next-line(unsafe-typecast)
        emit IERC8183.JobRejected(jobId, client, bytes32("cancelled"));
        emit IERC8183.Refunded(jobId, client, amount);
        paymentToken.safeTransfer(client, amount);
    }

    /// @notice Refund an expired job to its funder.
    /// @dev Callable by anyone once the deadline passes, so a funder never depends on our
    ///      goodwill to get their money back. Returns budget and fee.
    function claimRefund(uint256 jobId) external nonReentrant {
        IERC8183.Job storage job = _job(jobId);
        IERC8183.JobStatus status = job.status;
        if (status != IERC8183.JobStatus.Funded && status != IERC8183.JobStatus.Submitted) {
            revert WrongStatus(jobId, status);
        }
        // Deadlines here are hours to months long; validator-scale timestamp drift cannot move them.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < job.expiredAt) revert NotYetExpired(jobId, job.expiredAt);

        job.status = IERC8183.JobStatus.Expired;
        uint256 amount = job.budget + _extras[jobId].fee;
        address client = job.client;

        emit IERC8183.JobExpired(jobId);
        emit IERC8183.Refunded(jobId, client, amount);
        paymentToken.safeTransfer(client, amount);
    }

    // --- views ----------------------------------------------------------------------

    /// @notice The standard job record.
    function getJob(uint256 jobId) external view returns (IERC8183.Job memory) {
        return _job(jobId);
    }

    /// @notice The Proofwork-specific part of a job: maintainer, review share, escrowed fee.
    function getJobExtra(uint256 jobId) external view returns (IProofworkJobs.JobExtra memory) {
        _job(jobId);
        return _extras[jobId];
    }

    /// @notice The protocol fee a funder pays on top of a given budget.
    function feeFor(uint256 budget) public view returns (uint256) {
        return (budget * uint256(feeBps)) / BPS_DENOMINATOR;
    }

    /// @notice What each party receives when a job of this shape settles.
    function splitFor(uint256 budget, uint16 maintainerRewardBps)
        public
        view
        returns (uint256 contributorAmount, uint256 maintainerAmount, uint256 feeAmount)
    {
        maintainerAmount = (budget * uint256(maintainerRewardBps)) / BPS_DENOMINATOR;
        contributorAmount = budget - maintainerAmount;
        feeAmount = feeFor(budget);
    }

    // --- internals ------------------------------------------------------------------

    function _createJob(address provider, address evaluator, uint256 expiredAt, string calldata description)
        internal
        returns (uint256 jobId)
    {
        if (evaluator == address(0)) revert ZeroAddress();
        // forge-lint: disable-next-line(block-timestamp)
        if (expiredAt <= block.timestamp + MIN_DURATION || expiredAt >= block.timestamp + MAX_DURATION) {
            revert ExpiryOutOfRange(expiredAt);
        }

        jobId = ++jobCount;
        IERC8183.Job storage job = _jobs[jobId];
        job.id = jobId;
        job.client = msg.sender;
        job.provider = provider;
        job.evaluator = evaluator;
        job.description = description;
        job.expiredAt = expiredAt;
        job.status = IERC8183.JobStatus.Open;

        emit IERC8183.JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, address(0));
    }

    /// @dev Snapshots the fee so a later fee change cannot touch money already escrowed.
    ///      State is written before the transfer; every caller holds the reentrancy guard.
    function _fund(uint256 jobId, IERC8183.Job storage job) internal {
        uint256 budget = job.budget;
        uint256 fee = feeFor(budget);
        _extras[jobId].fee = fee;
        job.status = IERC8183.JobStatus.Funded;

        emit IERC8183.JobFunded(jobId, job.client, budget);
        paymentToken.safeTransferFrom(msg.sender, address(this), budget + fee);
    }

    /// @dev The whole point of the contract: one transaction, three recipients.
    ///      Status is written before any transfer and every caller holds the guard.
    function _release(uint256 jobId, IERC8183.Job storage job, bytes32 reason) internal {
        address provider = job.provider;
        if (provider == address(0)) revert ProviderNotAssigned(jobId);

        IProofworkJobs.JobExtra storage extra = _extras[jobId];
        (uint256 contributorAmount, uint256 maintainerAmount,) =
            splitFor(job.budget, extra.maintainerRewardBps);
        uint256 fee = extra.fee;
        address maintainer = extra.maintainer;

        job.status = IERC8183.JobStatus.Completed;

        emit IERC8183.JobCompleted(jobId, msg.sender, reason);
        emit IERC8183.PaymentReleased(jobId, provider, contributorAmount);
        if (maintainerAmount > 0) {
            emit IProofworkJobs.MaintainerRewardPaid(jobId, maintainer, maintainerAmount);
        }
        if (fee > 0) emit IProofworkJobs.FeeCollected(jobId, fee);

        paymentToken.safeTransfer(provider, contributorAmount);
        if (maintainerAmount > 0) paymentToken.safeTransfer(maintainer, maintainerAmount);
        if (fee > 0) paymentToken.safeTransfer(treasury, fee);
    }

    function _requireEvaluatorOfFundedJob(uint256 jobId, IERC8183.Job storage job) internal view {
        if (msg.sender != job.evaluator) revert NotEvaluator(jobId, msg.sender);
        IERC8183.JobStatus status = job.status;
        if (status != IERC8183.JobStatus.Funded && status != IERC8183.JobStatus.Submitted) {
            revert WrongStatus(jobId, status);
        }
    }

    function _job(uint256 jobId) internal view returns (IERC8183.Job storage job) {
        job = _jobs[jobId];
        if (job.id == 0) revert UnknownJob(jobId);
    }
}
