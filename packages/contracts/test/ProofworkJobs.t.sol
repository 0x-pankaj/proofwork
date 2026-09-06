// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Test} from "forge-std/Test.sol";

import {ProofworkJobs} from "../src/ProofworkJobs.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";
import {IProofworkJobs} from "../src/interfaces/IProofworkJobs.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {ReenteringToken} from "./mocks/ReenteringToken.sol";

contract ProofworkJobsTest is Test {
    MockUSDC internal usdc;
    ProofworkJobs internal jobs;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal funder = makeAddr("funder");
    address internal maintainer = makeAddr("maintainer");
    address internal contributor = makeAddr("contributor");
    address internal evaluator = makeAddr("evaluator");
    address internal stranger = makeAddr("stranger");

    uint16 internal constant FEE_BPS = 300;
    uint16 internal constant REVIEW_BPS = 1500;
    uint256 internal constant BUDGET = 200e6;
    string internal constant DESCRIPTION = "proofwork/arc-tech#12";
    bytes32 internal constant DELIVERABLE = keccak256("proofwork/v1:owner/repo#7@sha");
    bytes32 internal constant REASON = keccak256("merged:sha");

    function setUp() public {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        jobs = new ProofworkJobs(IERC20(address(usdc)), treasury, FEE_BPS, owner);
        // Comfortably above the fuzz ceiling of 1e12 units plus the fee charged on top.
        usdc.mint(funder, 1_000_000_000e6);
        vm.prank(funder);
        usdc.approve(address(jobs), type(uint256).max);
    }

    function _expiry() internal view returns (uint256) {
        return block.timestamp + 7 days;
    }

    function _fundJob(uint256 budget, uint16 reviewBps, address maintainer_)
        internal
        returns (uint256 jobId)
    {
        vm.prank(funder);
        jobId = jobs.createAndFund(evaluator, _expiry(), DESCRIPTION, budget, maintainer_, reviewBps);
    }

    // --- funding ---------------------------------------------------------------------

    function test_CreateAndFund_EscrowsBudgetPlusFee() public {
        uint256 before = usdc.balanceOf(funder);
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);

        uint256 fee = jobs.feeFor(BUDGET);
        assertEq(fee, 6e6, "3% of 200 is 6");
        assertEq(usdc.balanceOf(address(jobs)), BUDGET + fee, "escrow holds budget and fee");
        assertEq(before - usdc.balanceOf(funder), BUDGET + fee, "funder paid budget and fee");

        IERC8183.Job memory job = jobs.getJob(jobId);
        assertEq(job.id, jobId);
        assertEq(job.client, funder);
        assertEq(job.provider, address(0), "nobody is assigned yet");
        assertEq(job.evaluator, evaluator);
        assertEq(job.budget, BUDGET);
        assertEq(uint8(job.status), uint8(IERC8183.JobStatus.Funded));
        assertEq(job.hook, address(0));

        IProofworkJobs.JobExtra memory extra = jobs.getJobExtra(jobId);
        assertEq(extra.maintainer, maintainer);
        assertEq(extra.maintainerRewardBps, REVIEW_BPS);
        assertEq(extra.fee, fee, "fee is snapshotted at funding time");
    }

    function test_Fund_RevertsWithoutApproval() public {
        address poorFunder = makeAddr("poorFunder");
        usdc.mint(poorFunder, 1_000e6);

        vm.prank(poorFunder);
        vm.expectRevert();
        jobs.createAndFund(evaluator, _expiry(), DESCRIPTION, BUDGET, maintainer, REVIEW_BPS);
    }

    function test_CreateAndFund_RevertsOnZeroBudget() public {
        vm.prank(funder);
        vm.expectRevert(ProofworkJobs.ZeroBudget.selector);
        jobs.createAndFund(evaluator, _expiry(), DESCRIPTION, 0, maintainer, REVIEW_BPS);
    }

    function test_CreateAndFund_RevertsWhenReviewShareTooHigh() public {
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.RewardTooHigh.selector, 5001, 5000));
        jobs.createAndFund(evaluator, _expiry(), DESCRIPTION, BUDGET, maintainer, 5001);
    }

    function test_CreateAndFund_RevertsWhenPayingAMaintainerThatDoesNotExist() public {
        vm.prank(funder);
        vm.expectRevert(ProofworkJobs.RewardWithoutMaintainer.selector);
        jobs.createAndFund(evaluator, _expiry(), DESCRIPTION, BUDGET, address(0), REVIEW_BPS);
    }

    function test_CreateAndFund_RevertsOnExpiryOutOfRange() public {
        vm.startPrank(funder);
        uint256 tooSoon = block.timestamp + 30 minutes;
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.ExpiryOutOfRange.selector, tooSoon));
        jobs.createAndFund(evaluator, tooSoon, DESCRIPTION, BUDGET, maintainer, REVIEW_BPS);

        uint256 tooFar = block.timestamp + 181 days;
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.ExpiryOutOfRange.selector, tooFar));
        jobs.createAndFund(evaluator, tooFar, DESCRIPTION, BUDGET, maintainer, REVIEW_BPS);
        vm.stopPrank();
    }

    function test_CreateAndFund_RevertsWithoutAnEvaluator() public {
        vm.prank(funder);
        vm.expectRevert(ProofworkJobs.ZeroAddress.selector);
        jobs.createAndFund(address(0), _expiry(), DESCRIPTION, BUDGET, maintainer, REVIEW_BPS);
    }

    function test_CreateJob_RejectsHooks() public {
        vm.prank(funder);
        vm.expectRevert(ProofworkJobs.HooksNotSupported.selector);
        jobs.createJob(contributor, evaluator, _expiry(), DESCRIPTION, address(0xdead));
    }

    // --- settlement ------------------------------------------------------------------

    function _assertSettlementSplit(uint16 reviewBps, address maintainer_) internal {
        uint256 jobId = _fundJob(BUDGET, reviewBps, maintainer_);
        uint256 fee = jobs.feeFor(BUDGET);
        (uint256 expectedContributor, uint256 expectedMaintainer,) =
            jobs.splitFor(BUDGET, reviewBps);

        vm.prank(evaluator);
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);

        assertEq(usdc.balanceOf(contributor), expectedContributor, "contributor paid");
        if (maintainer_ != address(0)) {
            assertEq(usdc.balanceOf(maintainer_), expectedMaintainer, "maintainer paid for review");
        }
        assertEq(usdc.balanceOf(treasury), fee, "treasury took the fee");
        assertEq(expectedContributor + expectedMaintainer, BUDGET, "budget split leaves no dust");
        assertEq(usdc.balanceOf(address(jobs)), 0, "escrow is emptied");
        assertEq(uint8(jobs.getJob(jobId).status), uint8(IERC8183.JobStatus.Completed));
        assertEq(jobs.getJob(jobId).provider, contributor);
    }

    function test_Settle_PaysAllThreeParties() public {
        _assertSettlementSplit(REVIEW_BPS, maintainer);
        assertEq(usdc.balanceOf(contributor), 170e6, "200 minus the 30 review reward");
        assertEq(usdc.balanceOf(maintainer), 30e6, "15% of 200");
        assertEq(usdc.balanceOf(treasury), 6e6, "3% of 200, paid on top by the funder");
    }

    function test_Settle_WithoutAMaintainerPaysContributorInFull() public {
        _assertSettlementSplit(0, address(0));
        assertEq(usdc.balanceOf(contributor), BUDGET);
        assertEq(usdc.balanceOf(maintainer), 0);
    }

    function test_Settle_AtTheMaximumReviewShare() public {
        _assertSettlementSplit(5000, maintainer);
        assertEq(usdc.balanceOf(contributor), 100e6);
        assertEq(usdc.balanceOf(maintainer), 100e6);
    }

    function test_Settle_EmitsTheStandardEventsInOrder() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);

        vm.expectEmit(true, true, false, true, address(jobs));
        emit IERC8183.ProviderSet(jobId, contributor);
        vm.expectEmit(true, true, false, true, address(jobs));
        emit IERC8183.JobSubmitted(jobId, contributor, DELIVERABLE);
        vm.expectEmit(true, true, false, true, address(jobs));
        emit IERC8183.JobCompleted(jobId, evaluator, REASON);
        vm.expectEmit(true, true, false, true, address(jobs));
        emit IERC8183.PaymentReleased(jobId, contributor, 170e6);
        vm.expectEmit(true, true, false, true, address(jobs));
        emit IProofworkJobs.MaintainerRewardPaid(jobId, maintainer, 30e6);
        vm.expectEmit(true, false, false, true, address(jobs));
        emit IProofworkJobs.FeeCollected(jobId, 6e6);

        vm.prank(evaluator);
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);
    }

    function test_Settle_RevertsForAnyoneButTheEvaluator() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.NotEvaluator.selector, jobId, stranger));
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);

        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.NotEvaluator.selector, jobId, funder));
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);
    }

    function test_Settle_CannotPayTwice() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);

        vm.startPrank(evaluator);
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofworkJobs.WrongStatus.selector, jobId, IERC8183.JobStatus.Completed
            )
        );
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);
        vm.stopPrank();
    }

    function test_Settle_RevertsWithoutAProvider() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);

        vm.prank(evaluator);
        vm.expectRevert(ProofworkJobs.ZeroAddress.selector);
        jobs.settle(jobId, address(0), DELIVERABLE, REASON);
    }

    function test_Settle_RevertsOnUnknownJob() public {
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.UnknownJob.selector, 42));
        jobs.settle(42, contributor, DELIVERABLE, REASON);
    }

    // --- the standard ERC-8183 path --------------------------------------------------

    function test_StandardFlow_CreateSetBudgetFundSubmitComplete() public {
        vm.prank(funder);
        uint256 jobId = jobs.createJob(contributor, evaluator, _expiry(), DESCRIPTION, address(0));

        vm.prank(contributor);
        jobs.setBudget(jobId, BUDGET, "");

        vm.prank(funder);
        jobs.fund(jobId, "");
        assertEq(usdc.balanceOf(address(jobs)), BUDGET + jobs.feeFor(BUDGET));

        vm.prank(contributor);
        jobs.submit(jobId, DELIVERABLE, "");
        assertEq(uint8(jobs.getJob(jobId).status), uint8(IERC8183.JobStatus.Submitted));

        vm.prank(evaluator);
        jobs.complete(jobId, REASON, "");

        assertEq(usdc.balanceOf(contributor), BUDGET, "no maintainer on the standard path");
        assertEq(usdc.balanceOf(treasury), jobs.feeFor(BUDGET));
        assertEq(usdc.balanceOf(address(jobs)), 0);
    }

    function test_Submit_OnlyByTheProvider() public {
        vm.prank(funder);
        uint256 jobId = jobs.createJob(contributor, evaluator, _expiry(), DESCRIPTION, address(0));
        vm.prank(funder);
        jobs.setBudget(jobId, BUDGET, "");
        vm.prank(funder);
        jobs.fund(jobId, "");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.NotProvider.selector, jobId, stranger));
        jobs.submit(jobId, DELIVERABLE, "");
    }

    function test_Reject_RefundsTheFunderInFull() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);
        uint256 before = usdc.balanceOf(funder);

        vm.prank(evaluator);
        jobs.reject(jobId, keccak256("closed unmerged"), "");

        assertEq(usdc.balanceOf(funder) - before, BUDGET + jobs.feeFor(BUDGET), "budget and fee back");
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(uint8(jobs.getJob(jobId).status), uint8(IERC8183.JobStatus.Rejected));
    }

    function test_Reject_ByTheFunderWhileStillOpen() public {
        vm.prank(funder);
        uint256 jobId = jobs.createJob(contributor, evaluator, _expiry(), DESCRIPTION, address(0));

        vm.prank(funder);
        jobs.reject(jobId, keccak256("never mind"), "");
        assertEq(uint8(jobs.getJob(jobId).status), uint8(IERC8183.JobStatus.Rejected));
    }

    // --- cancellation and expiry -----------------------------------------------------

    function test_Cancel_ReturnsBudgetAndFee() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);
        uint256 before = usdc.balanceOf(funder);

        vm.prank(funder);
        jobs.cancel(jobId);

        assertEq(usdc.balanceOf(funder) - before, BUDGET + jobs.feeFor(BUDGET));
        assertEq(usdc.balanceOf(address(jobs)), 0);
    }

    function test_Cancel_OnlyByTheFunder() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.NotClient.selector, jobId, stranger));
        jobs.cancel(jobId);
    }

    function test_Cancel_RefusedOnceSomeoneIsWorking() public {
        vm.prank(funder);
        uint256 jobId = jobs.createJob(contributor, evaluator, _expiry(), DESCRIPTION, address(0));
        vm.prank(funder);
        jobs.setBudget(jobId, BUDGET, "");
        vm.prank(funder);
        jobs.fund(jobId, "");

        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(ProofworkJobs.ProviderAlreadyAssigned.selector, jobId)
        );
        jobs.cancel(jobId);
    }

    function test_ClaimRefund_RevertsBeforeTheDeadline() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);
        uint256 expiredAt = jobs.getJob(jobId).expiredAt;

        vm.expectRevert(
            abi.encodeWithSelector(ProofworkJobs.NotYetExpired.selector, jobId, expiredAt)
        );
        jobs.claimRefund(jobId);
    }

    function test_ClaimRefund_AfterTheDeadlineByAnyone() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);
        uint256 before = usdc.balanceOf(funder);

        vm.warp(jobs.getJob(jobId).expiredAt);
        vm.prank(stranger);
        jobs.claimRefund(jobId);

        assertEq(usdc.balanceOf(funder) - before, BUDGET + jobs.feeFor(BUDGET));
        assertEq(uint8(jobs.getJob(jobId).status), uint8(IERC8183.JobStatus.Expired));
        assertEq(usdc.balanceOf(address(jobs)), 0);
    }

    function test_ClaimRefund_WorksOnSubmittedWork() public {
        vm.prank(funder);
        uint256 jobId = jobs.createJob(contributor, evaluator, _expiry(), DESCRIPTION, address(0));
        vm.prank(funder);
        jobs.setBudget(jobId, BUDGET, "");
        vm.prank(funder);
        jobs.fund(jobId, "");
        vm.prank(contributor);
        jobs.submit(jobId, DELIVERABLE, "");

        vm.warp(jobs.getJob(jobId).expiredAt + 1);
        jobs.claimRefund(jobId);
        assertEq(uint8(jobs.getJob(jobId).status), uint8(IERC8183.JobStatus.Expired));
    }

    function test_ClaimRefund_CannotBeTakenTwice() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);
        vm.warp(jobs.getJob(jobId).expiredAt);
        jobs.claimRefund(jobId);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofworkJobs.WrongStatus.selector, jobId, IERC8183.JobStatus.Expired
            )
        );
        jobs.claimRefund(jobId);
    }

    // --- fees ------------------------------------------------------------------------

    function test_FeeFor_Math() public {
        assertEq(jobs.feeFor(BUDGET), 6e6);
        assertEq(jobs.feeFor(0), 0);
        assertEq(jobs.feeFor(1), 0, "rounds down, dust stays with the funder");
        assertEq(jobs.feeFor(34), 1, "3% of 34 is 1.02");

        vm.prank(owner);
        jobs.setFeeConfig(0, treasury);
        assertEq(jobs.feeFor(BUDGET), 0, "the platform can waive its fee entirely");

        vm.prank(owner);
        jobs.setFeeConfig(1000, treasury);
        assertEq(jobs.feeFor(BUDGET), 20e6, "10% is the ceiling");
    }

    function test_SetFeeConfig_RefusesAboveTheCeiling() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ProofworkJobs.FeeTooHigh.selector, 1001, 1000));
        jobs.setFeeConfig(1001, treasury);
    }

    function test_SetFeeConfig_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        jobs.setFeeConfig(100, treasury);
    }

    function test_SetFeeConfig_CannotRepriceMoneyAlreadyEscrowed() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);
        address newTreasury = makeAddr("newTreasury");

        vm.prank(owner);
        jobs.setFeeConfig(1000, newTreasury);

        vm.prank(evaluator);
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);

        assertEq(usdc.balanceOf(newTreasury), 6e6, "the 3% agreed at funding time, not the new 10%");
        assertEq(usdc.balanceOf(treasury), 0, "rotating the treasury redirects where fees land");
        assertEq(usdc.balanceOf(contributor), 170e6, "the contributor is untouched either way");
        assertEq(usdc.balanceOf(maintainer), 30e6, "so is the maintainer");
    }

    // --- pausing ---------------------------------------------------------------------

    function test_Paused_StopsNewMoneyButNeverTrapsIt() public {
        uint256 jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);

        vm.prank(owner);
        jobs.pause();

        vm.prank(funder);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        jobs.createAndFund(evaluator, _expiry(), DESCRIPTION, BUDGET, maintainer, REVIEW_BPS);

        // Settlement and refunds keep working while paused.
        vm.prank(evaluator);
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);
        assertEq(usdc.balanceOf(contributor), 170e6);

        uint256 second = _pausedRefundPath();
        assertEq(uint8(jobs.getJob(second).status), uint8(IERC8183.JobStatus.Expired));
    }

    function _pausedRefundPath() internal returns (uint256 jobId) {
        vm.prank(owner);
        jobs.unpause();
        jobId = _fundJob(BUDGET, REVIEW_BPS, maintainer);
        vm.prank(owner);
        jobs.pause();
        vm.warp(jobs.getJob(jobId).expiredAt);
        jobs.claimRefund(jobId);
    }

    // --- reentrancy ------------------------------------------------------------------

    function test_Reentrancy_HostileTokenCannotDrainTheEscrow() public {
        ReenteringToken evil = new ReenteringToken();
        ProofworkJobs hostileJobs =
            new ProofworkJobs(IERC20(address(evil)), treasury, FEE_BPS, owner);

        evil.mint(funder, 1_000e6);
        vm.prank(funder);
        evil.approve(address(hostileJobs), type(uint256).max);
        vm.prank(funder);
        uint256 jobId =
            hostileJobs.createAndFund(evaluator, _expiry(), DESCRIPTION, BUDGET, maintainer, 0);

        evil.arm(hostileJobs, jobId);
        vm.warp(hostileJobs.getJob(jobId).expiredAt);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        hostileJobs.claimRefund(jobId);
    }

    // --- invariants ------------------------------------------------------------------

    function testFuzz_SettlementConservesEveryUnit(uint256 budget, uint16 reviewBps) public {
        budget = bound(budget, 1, 1e12);
        reviewBps = uint16(bound(reviewBps, 0, jobs.MAX_MAINTAINER_REWARD_BPS()));

        uint256 jobId = _fundJob(budget, reviewBps, maintainer);
        uint256 escrowed = budget + jobs.feeFor(budget);
        assertEq(usdc.balanceOf(address(jobs)), escrowed);

        vm.prank(evaluator);
        jobs.settle(jobId, contributor, DELIVERABLE, REASON);

        uint256 paidOut = usdc.balanceOf(contributor) + usdc.balanceOf(maintainer)
            + usdc.balanceOf(treasury);
        assertEq(paidOut, escrowed, "everything escrowed is paid out, to the unit");
        assertEq(usdc.balanceOf(address(jobs)), 0, "nothing is left behind");
        assertGe(usdc.balanceOf(contributor), budget / 2, "the contributor keeps at least half");
    }

    function testFuzz_RefundAlwaysReturnsTheFullAmount(uint256 budget) public {
        budget = bound(budget, 1, 1e12);
        uint256 before = usdc.balanceOf(funder);

        uint256 jobId = _fundJob(budget, REVIEW_BPS, maintainer);
        vm.warp(jobs.getJob(jobId).expiredAt);
        jobs.claimRefund(jobId);

        assertEq(usdc.balanceOf(funder), before, "the funder is exactly whole again");
    }
}
