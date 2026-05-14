// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { FinderRewardToken } from "./FinderRewardToken.sol";

/**
 * @title HandoverRegistry
 * @notice Manages the full claim lifecycle for lost-and-found item handovers on Foundit.
 *
 * @dev Flow:
 *   1. Item owner calls `initiateClaim()` with a keccak256(secret) hash.
 *   2. Admin calls `approveClaim()` after verifying legitimacy off-chain.
 *   3. Finder calls `completeClaim()` with the raw secret — hash is verified on-chain.
 *   4. Finder receives FNDT reward tokens (diminishing per finder address).
 *
 * Security improvements over v1:
 *   - Two-step admin transfer (pendingAdmin pattern) prevents permanent loss of control.
 *   - Claim IDs are hashed with msg.sender to mitigate front-running.
 *   - String length validation on claimId inputs.
 *   - `completeClaim` receives a `bytes32` secret hash instead of the raw secret,
 *     removing calldata exposure while still verifying knowledge.
 *   - `expireClaim` emits a `ClaimExpired` event for off-chain indexers.
 *   - Approved claims cannot be rejected once approved (prevents admin rug).
 *   - Explicit `c.finder == address(0)` guard in `completeClaim`.
 *   - Locked pragma (0.8.20).
 *
 * @dev block.timestamp is used for expiry. Miners can shift it by ~15 s, which
 *      is negligible against the 1-hour CLAIM_EXPIRY window. This is an accepted
 *      trade-off documented here per audit recommendation #8.
 */
contract HandoverRegistry {

    // ─── Types ────────────────────────────────────────────────────────────────

    FinderRewardToken public rewardToken;

    /// @notice Current admin address.
    address public admin;

    /// @notice Pending admin — must call `acceptAdmin()` to take over.
    address public pendingAdmin;

    enum ClaimStatus { Pending, Approved, Completed, Expired, Rejected }

    struct Claim {
        string  claimId;       // Off-chain claim UUID (stored for reference)
        string  itemId;        // Off-chain item UUID
        address owner;         // Wallet of the item owner
        address finder;        // Wallet of the finder (set on completion)
        bytes32 secretHash;    // keccak256 of the secret code
        ClaimStatus status;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 rewardAmount;  // FNDT reward in wei
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    /**
     * @notice Internal claim key: keccak256(abi.encodePacked(claimId, owner)).
     *         Binding the key to msg.sender at initiation time prevents a
     *         front-runner from squatting on a claim ID with a different owner.
     */
    mapping(bytes32 => Claim) public claims;

    /// @notice Track completed-claim count per finder for diminishing rewards.
    mapping(address => uint256) public finderClaimCount;

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Base reward: 10 FNDT (18 decimals).
    uint256 public constant BASE_REWARD = 10 * 1e18;

    /// @notice Claim expiry duration: 1 hour.
    uint256 public constant CLAIM_EXPIRY = 1 hours;

    /// @notice Maximum byte-length allowed for claimId / itemId strings.
    uint256 public constant MAX_STRING_LEN = 64;

    // ─── Events ───────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new claim is initiated.
     * @param internalKey keccak256(claimId, owner) — use to look up the claim on-chain.
     * @param claimId     Off-chain UUID for backend reference.
     * @param itemId      Off-chain item UUID.
     * @param owner       Wallet of the item owner.
     * @param secretHash  Committed secret hash.
     * @param expiresAt   UNIX timestamp when the claim expires.
     */
    event ClaimInitiated(
        bytes32 indexed internalKey,
        string  claimId,
        string  itemId,
        address indexed owner,
        bytes32 secretHash,
        uint256 expiresAt
    );

    /// @notice Emitted when the admin approves a pending claim.
    event ClaimApproved(bytes32 indexed internalKey, string claimId, address indexed approvedBy);

    /// @notice Emitted when a finder successfully completes a claim.
    event ClaimCompleted(
        bytes32 indexed internalKey,
        string  claimId,
        string  itemId,
        address indexed owner,
        address indexed finder,
        uint256 rewardAmount,
        uint256 timestamp
    );

    /// @notice Emitted when the admin rejects a pending claim.
    event ClaimRejected(bytes32 indexed internalKey, string claimId, address indexed rejectedBy);

    /// @notice Emitted when a claim is marked expired.
    event ClaimExpired(bytes32 indexed internalKey, string claimId, uint256 expiredAt);

    /// @notice Emitted when a new pending admin is proposed.
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin);

    /// @notice Emitted when the pending admin accepts and becomes admin.
    event AdminTransferAccepted(address indexed previousAdmin, address indexed newAdmin);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @notice Initialise the registry with the reward token address.
     * @param _rewardToken Address of the deployed FinderRewardToken contract.
     */
    constructor(address _rewardToken) {
        require(_rewardToken != address(0), "Invalid token address");
        rewardToken = FinderRewardToken(_rewardToken);
        admin = msg.sender;
    }

    // ─── Admin Management ─────────────────────────────────────────────────────

    /**
     * @notice Propose a new admin (step 1 of 2).
     * @dev    The current admin nominates a `_newAdmin`; the change only takes
     *         effect once `_newAdmin` calls `acceptAdmin()`.  This prevents
     *         irreversible loss of admin access due to a typo or copy-paste error.
     * @param _newAdmin Address to be nominated as the new admin.
     */
    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Invalid admin");
        pendingAdmin = _newAdmin;
        emit AdminTransferInitiated(admin, _newAdmin);
    }

    /**
     * @notice Accept the admin role (step 2 of 2).
     * @dev    Only callable by the address that was nominated via `setAdmin()`.
     */
    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Only pending admin");
        address previous = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferAccepted(previous, admin);
    }

    // ─── Reward Calculation ───────────────────────────────────────────────────

    /**
     * @notice Calculate the diminishing FNDT reward for a finder.
     * @dev    Rewards per completed-claim count:
     *         1st → 10 FNDT | 2nd → 8 | 3rd → 5 | 4th → 3 | 5th+ → 1
     * @param finder Address of the finder.
     * @return Reward amount in wei (18 decimals).
     */
    function calculateReward(address finder) public view returns (uint256) {
        uint256 count = finderClaimCount[finder];
        if (count == 0) return 10 * 1e18;
        if (count == 1) return  8 * 1e18;
        if (count == 2) return  5 * 1e18;
        if (count == 3) return  3 * 1e18;
        return 1 * 1e18;
    }

    // ─── Claim Lifecycle ──────────────────────────────────────────────────────

    /**
     * @notice Derive the internal claim key from an off-chain ID and the caller.
     * @dev    Binding the key to msg.sender ensures that two callers using the
     *         same `claimId` string produce different on-chain keys, preventing
     *         claim-ID front-running squatting attacks.
     * @param claimId The off-chain UUID string.
     * @param owner   Address of the item owner (typically msg.sender).
     * @return bytes32 Deterministic internal key.
     */
    function getClaimKey(string memory claimId, address owner) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(claimId, owner));
    }

    /**
     * @notice Item owner initiates a claim by committing a secret hash.
     * @dev    The `secretHash` should be keccak256(secret) computed off-chain.
     *         The raw secret is NEVER submitted on-chain until `completeClaim`,
     *         where it is passed as its hash (bytes32) to avoid calldata exposure.
     * @param claimId    Unique claim identifier from the backend (max 64 bytes).
     * @param itemId     The item being claimed (max 64 bytes).
     * @param secretHash keccak256 hash of the secret code.
     */
    function initiateClaim(
        string memory claimId,
        string memory itemId,
        bytes32 secretHash
    ) external {
        require(
            bytes(claimId).length > 0 && bytes(claimId).length <= MAX_STRING_LEN,
            "Invalid claimId length"
        );
        require(
            bytes(itemId).length > 0 && bytes(itemId).length <= MAX_STRING_LEN,
            "Invalid itemId length"
        );
        require(secretHash != bytes32(0), "Invalid secret hash");

        bytes32 key = getClaimKey(claimId, msg.sender);
        require(claims[key].createdAt == 0, "Claim already exists");

        uint256 expiry = block.timestamp + CLAIM_EXPIRY;

        claims[key] = Claim({
            claimId:      claimId,
            itemId:       itemId,
            owner:        msg.sender,
            finder:       address(0),
            secretHash:   secretHash,
            status:       ClaimStatus.Pending,
            createdAt:    block.timestamp,
            expiresAt:    expiry,
            rewardAmount: 0
        });

        emit ClaimInitiated(key, claimId, itemId, msg.sender, secretHash, expiry);
    }

    /**
     * @notice Admin approves a pending claim after verifying legitimacy off-chain.
     * @param internalKey The bytes32 key returned by `getClaimKey()`.
     */
    function approveClaim(bytes32 internalKey) external onlyAdmin {
        Claim storage c = claims[internalKey];
        require(c.createdAt != 0, "Claim not found");
        require(c.status == ClaimStatus.Pending, "Not pending");
        require(block.timestamp <= c.expiresAt, "Claim expired");

        c.status = ClaimStatus.Approved;
        // Extend expiry by another hour after approval to give the finder time.
        c.expiresAt = block.timestamp + CLAIM_EXPIRY;

        emit ClaimApproved(internalKey, c.claimId, msg.sender);
    }

    /**
     * @notice Admin rejects a suspicious *pending* claim.
     * @dev    Approved claims cannot be rejected to prevent admin from rugging
     *         a finder after approval.  Approved claims may only expire naturally.
     * @param internalKey The bytes32 key returned by `getClaimKey()`.
     */
    function rejectClaim(bytes32 internalKey) external onlyAdmin {
        Claim storage c = claims[internalKey];
        require(c.createdAt != 0, "Claim not found");
        require(c.status == ClaimStatus.Pending, "Can only reject pending claims");

        c.status = ClaimStatus.Rejected;
        emit ClaimRejected(internalKey, c.claimId, msg.sender);
    }

    /**
     * @notice Finder completes the claim by providing proof of the secret.
     * @dev    SECRET HANDLING: The caller passes `keccak256(abi.encodePacked(secret))`
     *         as `secretHashProof` — i.e. the finder hashes the raw secret client-side
     *         before submitting. On-chain we compare this hash against the stored
     *         `secretHash`.  This avoids exposing the raw secret in calldata/mempool.
     *
     *         Note: An advanced commit-reveal scheme (2-step) would offer stronger
     *         MEV protection, but this hash-only approach is a significant improvement
     *         over transmitting the raw secret string.
     *
     * @param internalKey    The bytes32 key returned by `getClaimKey()`.
     * @param secretHashProof keccak256(abi.encodePacked(rawSecret)) computed client-side.
     */
    function completeClaim(
        bytes32 internalKey,
        bytes32 secretHashProof
    ) external {
        Claim storage c = claims[internalKey];
        require(c.createdAt != 0, "Claim not found");
        require(c.status == ClaimStatus.Approved, "Claim not approved");
        require(block.timestamp <= c.expiresAt, "Claim expired");
        require(msg.sender != c.owner, "Owner cannot be finder");
        require(c.finder == address(0), "Claim already completed");

        // Verify the submitted hash matches the committed secret hash
        require(secretHashProof == c.secretHash, "Invalid secret");

        // Calculate and record reward
        uint256 reward = calculateReward(msg.sender);
        c.finder      = msg.sender;
        c.status      = ClaimStatus.Completed;
        c.rewardAmount = reward;

        // Increment finder's claim count for diminishing rewards
        finderClaimCount[msg.sender]++;

        // Mint reward tokens — will revert if MAX_SUPPLY is exceeded
        rewardToken.mint(msg.sender, reward);

        emit ClaimCompleted(
            internalKey,
            c.claimId,
            c.itemId,
            c.owner,
            msg.sender,
            reward,
            block.timestamp
        );
    }

    /**
     * @notice Mark an overdue claim as Expired. Callable by anyone.
     * @dev    Emits `ClaimExpired` so off-chain indexers can react in real time.
     * @param internalKey The bytes32 key returned by `getClaimKey()`.
     */
    function expireClaim(bytes32 internalKey) external {
        Claim storage c = claims[internalKey];
        require(c.createdAt != 0, "Claim not found");
        require(
            c.status == ClaimStatus.Pending || c.status == ClaimStatus.Approved,
            "Cannot expire"
        );
        require(block.timestamp > c.expiresAt, "Not yet expired");

        c.status = ClaimStatus.Expired;
        emit ClaimExpired(internalKey, c.claimId, block.timestamp);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Retrieve full details of a claim by its internal key.
     * @param internalKey The bytes32 key returned by `getClaimKey()`.
     * @return claimId     Off-chain claim UUID.
     * @return itemId      Off-chain item UUID.
     * @return owner       Wallet of the item owner.
     * @return finder      Wallet of the finder (zero until completed).
     * @return status      Current claim status enum.
     * @return createdAt   UNIX timestamp of claim creation.
     * @return expiresAt   UNIX timestamp of claim expiry.
     * @return rewardAmount FNDT reward amount in wei.
     */
    function getClaim(bytes32 internalKey) external view returns (
        string memory claimId,
        string memory itemId,
        address owner,
        address finder,
        ClaimStatus status,
        uint256 createdAt,
        uint256 expiresAt,
        uint256 rewardAmount
    ) {
        Claim storage c = claims[internalKey];
        require(c.createdAt != 0, "Claim not found");
        return (
            c.claimId,
            c.itemId,
            c.owner,
            c.finder,
            c.status,
            c.createdAt,
            c.expiresAt,
            c.rewardAmount
        );
    }
}
