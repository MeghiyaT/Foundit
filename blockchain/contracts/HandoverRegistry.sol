// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FinderRewardToken.sol";

/**
 * @title HandoverRegistry
 * @dev Manages the full claim lifecycle for lost-and-found item handovers.
 *
 * Flow:
 *   1. Owner calls initiateClaim() with a keccak256(secret) hash
 *   2. Admin calls approveClaim() after verifying legitimacy
 *   3. Finder calls completeClaim() with the raw secret — hash is verified on-chain
 *   4. Finder receives FNDT reward tokens
 *
 * Anti-scam measures:
 *   - Admin approval gate before any tokens are minted
 *   - Secret-hash commitment (only someone with the real code can claim)
 *   - 1-hour expiry on claims
 *   - Diminishing rewards per user (10 → 8 → 5 → 3 → 1 FNDT)
 */
contract HandoverRegistry {
    FinderRewardToken public rewardToken;
    address public admin;

    enum ClaimStatus { Pending, Approved, Completed, Expired, Rejected }

    struct Claim {
        string claimId;       // Off-chain claim UUID
        string itemId;        // Off-chain item UUID
        address owner;        // Wallet of the item owner
        address finder;       // Wallet of the finder (set on completion)
        bytes32 secretHash;   // keccak256 of the secret code
        ClaimStatus status;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 rewardAmount; // FNDT reward in wei
    }

    // claimId (string) => Claim
    mapping(string => Claim) public claims;

    // Track claim count per finder for diminishing rewards
    mapping(address => uint256) public finderClaimCount;

    // Base reward: 10 FNDT (18 decimals)
    uint256 public constant BASE_REWARD = 10 * 1e18;

    // Claim expiry duration: 1 hour
    uint256 public constant CLAIM_EXPIRY = 1 hours;

    // Events
    event ClaimInitiated(
        string claimId,
        string itemId,
        address indexed owner,
        bytes32 secretHash,
        uint256 expiresAt
    );

    event ClaimApproved(string claimId, address indexed approvedBy);

    event ClaimCompleted(
        string claimId,
        string itemId,
        address indexed owner,
        address indexed finder,
        uint256 rewardAmount,
        uint256 timestamp
    );

    event ClaimRejected(string claimId, address indexed rejectedBy);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(address _rewardToken) {
        rewardToken = FinderRewardToken(_rewardToken);
        admin = msg.sender;
    }

    /**
     * @dev Set a new admin address.
     */
    function setAdmin(address _admin) external onlyAdmin {
        require(_admin != address(0), "Invalid admin");
        admin = _admin;
    }

    /**
     * @dev Calculate diminishing reward based on finder's past claim count.
     *      1st claim: 10 FNDT, 2nd: 8, 3rd: 5, 4th: 3, 5th+: 1
     */
    function calculateReward(address finder) public view returns (uint256) {
        uint256 count = finderClaimCount[finder];
        if (count == 0) return 10 * 1e18;
        if (count == 1) return 8 * 1e18;
        if (count == 2) return 5 * 1e18;
        if (count == 3) return 3 * 1e18;
        return 1 * 1e18; // 5th+ claims
    }

    /**
     * @dev Owner initiates a claim by committing a secret hash.
     * @param claimId Unique claim identifier from the backend.
     * @param itemId The item being claimed.
     * @param secretHash keccak256 hash of the secret code.
     */
    function initiateClaim(
        string memory claimId,
        string memory itemId,
        bytes32 secretHash
    ) external {
        require(claims[claimId].createdAt == 0, "Claim already exists");
        require(secretHash != bytes32(0), "Invalid secret hash");

        claims[claimId] = Claim({
            claimId: claimId,
            itemId: itemId,
            owner: msg.sender,
            finder: address(0),
            secretHash: secretHash,
            status: ClaimStatus.Pending,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + CLAIM_EXPIRY,
            rewardAmount: 0
        });

        emit ClaimInitiated(claimId, itemId, msg.sender, secretHash, block.timestamp + CLAIM_EXPIRY);
    }

    /**
     * @dev Admin approves a pending claim after verifying legitimacy.
     */
    function approveClaim(string memory claimId) external onlyAdmin {
        Claim storage c = claims[claimId];
        require(c.createdAt != 0, "Claim not found");
        require(c.status == ClaimStatus.Pending, "Not pending");
        require(block.timestamp <= c.expiresAt, "Claim expired");

        c.status = ClaimStatus.Approved;
        // Extend expiry by another hour after approval
        c.expiresAt = block.timestamp + CLAIM_EXPIRY;

        emit ClaimApproved(claimId, msg.sender);
    }

    /**
     * @dev Admin rejects a suspicious claim.
     */
    function rejectClaim(string memory claimId) external onlyAdmin {
        Claim storage c = claims[claimId];
        require(c.createdAt != 0, "Claim not found");
        require(c.status == ClaimStatus.Pending || c.status == ClaimStatus.Approved, "Cannot reject");

        c.status = ClaimStatus.Rejected;
        emit ClaimRejected(claimId, msg.sender);
    }

    /**
     * @dev Finder completes the claim by providing the raw secret.
     *      The secret is hashed on-chain and compared to the stored hash.
     *      On success, FNDT reward tokens are minted to the finder.
     * @param claimId The claim to complete.
     * @param secret The raw secret code (shared in person by the owner).
     */
    function completeClaim(
        string memory claimId,
        string memory secret
    ) external {
        Claim storage c = claims[claimId];
        require(c.createdAt != 0, "Claim not found");
        require(c.status == ClaimStatus.Approved, "Claim not approved");
        require(block.timestamp <= c.expiresAt, "Claim expired");
        require(msg.sender != c.owner, "Owner cannot be finder");

        // Verify the secret matches the committed hash
        bytes32 computedHash = keccak256(abi.encodePacked(secret));
        require(computedHash == c.secretHash, "Invalid secret");

        // Calculate and record reward
        uint256 reward = calculateReward(msg.sender);
        c.finder = msg.sender;
        c.status = ClaimStatus.Completed;
        c.rewardAmount = reward;

        // Increment finder's claim count (for diminishing rewards)
        finderClaimCount[msg.sender]++;

        // Mint reward tokens to finder
        rewardToken.mint(msg.sender, reward);

        emit ClaimCompleted(
            claimId,
            c.itemId,
            c.owner,
            msg.sender,
            reward,
            block.timestamp
        );
    }

    /**
     * @dev Check if a claim has expired and mark it accordingly.
     */
    function expireClaim(string memory claimId) external {
        Claim storage c = claims[claimId];
        require(c.createdAt != 0, "Claim not found");
        require(
            c.status == ClaimStatus.Pending || c.status == ClaimStatus.Approved,
            "Cannot expire"
        );
        require(block.timestamp > c.expiresAt, "Not yet expired");

        c.status = ClaimStatus.Expired;
    }

    /**
     * @dev Get claim details.
     */
    function getClaim(string memory claimId) external view returns (
        string memory itemId,
        address owner,
        address finder,
        ClaimStatus status,
        uint256 createdAt,
        uint256 expiresAt,
        uint256 rewardAmount
    ) {
        Claim storage c = claims[claimId];
        require(c.createdAt != 0, "Claim not found");
        return (c.itemId, c.owner, c.finder, c.status, c.createdAt, c.expiresAt, c.rewardAmount);
    }
}
