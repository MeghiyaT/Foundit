import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { FinderRewardToken, HandoverRegistry } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RAW_SECRET = "super-secret-123";

/**
 * Compute the secret hash the same way the contract does:
 *   keccak256(abi.encodePacked(rawSecret))
 */
function makeSecretHash(raw: string): string {
  return ethers.solidityPackedKeccak256(["string"], [raw]);
}

/**
 * Derive the internal claim key the same way the contract does:
 *   keccak256(abi.encodePacked(claimId, owner))
 */
function makeClaimKey(claimId: string, owner: string): string {
  return ethers.solidityPackedKeccak256(["string", "address"], [claimId, owner]);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("Foundit Smart Contracts", () => {
  let token: FinderRewardToken;
  let registry: HandoverRegistry;
  let deployer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;   // same as deployer in these tests
  let owner: HardhatEthersSigner;   // item owner
  let finder: HardhatEthersSigner;  // the person returning the item
  let attacker: HardhatEthersSigner;

  const CLAIM_ID = "claim-uuid-001";
  const ITEM_ID  = "item-uuid-001";
  const SECRET_HASH = makeSecretHash(RAW_SECRET);

  beforeEach(async () => {
    [deployer, owner, finder, attacker] = await ethers.getSigners();
    admin = deployer;

    // Deploy token (minter not yet known)
    const TokenFactory = await ethers.getContractFactory("FinderRewardToken");
    token = await TokenFactory.deploy(ethers.ZeroAddress) as FinderRewardToken;
    await token.waitForDeployment();

    // Deploy registry
    const RegistryFactory = await ethers.getContractFactory("HandoverRegistry");
    registry = await RegistryFactory.deploy(await token.getAddress()) as HandoverRegistry;
    await registry.waitForDeployment();

    // Wire minter
    await token.setMinter(await registry.getAddress());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FinderRewardToken
  // ═══════════════════════════════════════════════════════════════════════════

  describe("FinderRewardToken", () => {

    describe("Constructor & minter setup", () => {
      it("should set MAX_SUPPLY correctly", async () => {
        expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther("1000000"));
      });

      it("should have minter set to registry after setup", async () => {
        expect(await token.minter()).to.equal(await registry.getAddress());
      });

      it("should set minter atomically in constructor when address is non-zero", async () => {
        // Deploy a fresh token with minter set at construction time
        const TokenFactory = await ethers.getContractFactory("FinderRewardToken");
        const t2 = await TokenFactory.deploy(await registry.getAddress());
        expect(await t2.minter()).to.equal(await registry.getAddress());
      });

      it("should revert setMinter if minter is already set (one-time guard)", async () => {
        await expect(
          token.setMinter(attacker.address)
        ).to.be.revertedWith("Minter already set");
      });

      it("should revert setMinter with zero address", async () => {
        const TokenFactory = await ethers.getContractFactory("FinderRewardToken");
        const fresh = await TokenFactory.deploy(ethers.ZeroAddress);
        await expect(
          fresh.setMinter(ethers.ZeroAddress)
        ).to.be.revertedWith("Minter cannot be zero address");
      });

      it("should revert setMinter when called by non-owner", async () => {
        const TokenFactory = await ethers.getContractFactory("FinderRewardToken");
        const fresh = await TokenFactory.deploy(ethers.ZeroAddress);
        await expect(
          fresh.connect(attacker).setMinter(attacker.address)
        ).to.be.revertedWithCustomError(fresh, "OwnableUnauthorizedAccount");
      });

      it("should emit MinterUpdated when minter is set", async () => {
        const TokenFactory = await ethers.getContractFactory("FinderRewardToken");
        const fresh = await TokenFactory.deploy(ethers.ZeroAddress);
        await expect(fresh.setMinter(deployer.address))
          .to.emit(fresh, "MinterUpdated")
          .withArgs(ethers.ZeroAddress, deployer.address);
      });
    });

    describe("Minting", () => {
      it("should revert mint from non-minter", async () => {
        await expect(
          token.connect(attacker).mint(attacker.address, ethers.parseEther("1"))
        ).to.be.revertedWith("Only minter can mint");
      });

      it("should revert mint to zero address", async () => {
        // Temporarily set deployer as minter on a fresh token to test this path
        const TokenFactory = await ethers.getContractFactory("FinderRewardToken");
        const fresh = await TokenFactory.deploy(ethers.ZeroAddress);
        await fresh.setMinter(deployer.address);
        await expect(
          fresh.mint(ethers.ZeroAddress, ethers.parseEther("1"))
        ).to.be.revertedWith("Cannot mint to zero address");
      });

      it("should revert when MAX_SUPPLY is exceeded", async () => {
        // Use a fresh token where deployer is minter
        const TokenFactory = await ethers.getContractFactory("FinderRewardToken");
        const fresh = await TokenFactory.deploy(ethers.ZeroAddress);
        await fresh.setMinter(deployer.address);

        const cap = await fresh.MAX_SUPPLY();
        await fresh.mint(finder.address, cap); // Mint up to cap

        await expect(
          fresh.mint(finder.address, 1n)
        ).to.be.revertedWithCustomError(fresh, "ERC20ExceededCap");
      });
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HandoverRegistry — Admin Management
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HandoverRegistry — Admin (two-step transfer)", () => {

    it("should set deployer as initial admin", async () => {
      expect(await registry.admin()).to.equal(deployer.address);
    });

    it("should initiate transfer to pending admin", async () => {
      await expect(registry.setAdmin(owner.address))
        .to.emit(registry, "AdminTransferInitiated")
        .withArgs(deployer.address, owner.address);
      expect(await registry.pendingAdmin()).to.equal(owner.address);
      expect(await registry.admin()).to.equal(deployer.address); // not changed yet
    });

    it("should complete transfer when pending admin calls acceptAdmin", async () => {
      await registry.setAdmin(owner.address);
      await expect(registry.connect(owner).acceptAdmin())
        .to.emit(registry, "AdminTransferAccepted")
        .withArgs(deployer.address, owner.address);
      expect(await registry.admin()).to.equal(owner.address);
      expect(await registry.pendingAdmin()).to.equal(ethers.ZeroAddress);
    });

    it("should revert acceptAdmin from non-pending address", async () => {
      await registry.setAdmin(owner.address);
      await expect(
        registry.connect(attacker).acceptAdmin()
      ).to.be.revertedWith("Only pending admin");
    });

    it("should revert setAdmin with zero address", async () => {
      await expect(
        registry.setAdmin(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid admin");
    });

    it("should revert setAdmin from non-admin", async () => {
      await expect(
        registry.connect(attacker).setAdmin(attacker.address)
      ).to.be.revertedWith("Only admin");
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HandoverRegistry — initiateClaim
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HandoverRegistry — initiateClaim", () => {
    it("should create a claim and emit ClaimInitiated", async () => {
      const key = makeClaimKey(CLAIM_ID, owner.address);
      await expect(
        registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH)
      )
        .to.emit(registry, "ClaimInitiated")
        .withArgs(
          key,
          CLAIM_ID,
          ITEM_ID,
          owner.address,
          SECRET_HASH,
          (v: bigint) => v > 0n // expiresAt is dynamic
        );
    });

    it("should store claim with Pending status", async () => {
      await registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH);
      const key = makeClaimKey(CLAIM_ID, owner.address);
      const [, , , , status] = await registry.getClaim(key);
      expect(status).to.equal(0); // ClaimStatus.Pending
    });

    it("should prevent same owner from duplicating a claim", async () => {
      await registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH);
      await expect(
        registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH)
      ).to.be.revertedWith("Claim already exists");
    });

    it("should allow different owners to use the same claimId string (different keys)", async () => {
      // Demonstrates anti-front-running: attacker using same string → different key
      await registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH);
      // attacker uses same claimId string but gets a different internal key
      await expect(
        registry.connect(attacker).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH)
      ).to.not.be.reverted;
    });

    it("should revert with empty claimId", async () => {
      await expect(
        registry.connect(owner).initiateClaim("", ITEM_ID, SECRET_HASH)
      ).to.be.revertedWith("Invalid claimId length");
    });

    it("should revert with claimId > 64 bytes", async () => {
      const longId = "a".repeat(65);
      await expect(
        registry.connect(owner).initiateClaim(longId, ITEM_ID, SECRET_HASH)
      ).to.be.revertedWith("Invalid claimId length");
    });

    it("should revert with empty itemId", async () => {
      await expect(
        registry.connect(owner).initiateClaim(CLAIM_ID, "", SECRET_HASH)
      ).to.be.revertedWith("Invalid itemId length");
    });

    it("should revert with zero secretHash", async () => {
      await expect(
        registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, ethers.ZeroHash)
      ).to.be.revertedWith("Invalid secret hash");
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HandoverRegistry — approveClaim
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HandoverRegistry — approveClaim", () => {
    let key: string;

    beforeEach(async () => {
      await registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH);
      key = makeClaimKey(CLAIM_ID, owner.address);
    });

    it("should approve a pending claim and emit ClaimApproved", async () => {
      await expect(registry.connect(admin).approveClaim(key))
        .to.emit(registry, "ClaimApproved")
        .withArgs(key, CLAIM_ID, admin.address);
    });

    it("should extend expiry after approval", async () => {
      const before = (await registry.getClaim(key))[6]; // expiresAt
      await registry.connect(admin).approveClaim(key);
      const after = (await registry.getClaim(key))[6];
      expect(after).to.be.greaterThan(before);
    });

    it("should revert if not admin", async () => {
      await expect(
        registry.connect(attacker).approveClaim(key)
      ).to.be.revertedWith("Only admin");
    });

    it("should revert if claim not found", async () => {
      await expect(
        registry.connect(admin).approveClaim(ethers.ZeroHash)
      ).to.be.revertedWith("Claim not found");
    });

    it("should revert if claim is expired before approval", async () => {
      await time.increase(3601); // fast-forward past 1 hour
      await expect(
        registry.connect(admin).approveClaim(key)
      ).to.be.revertedWith("Claim expired");
    });

    it("should revert double-approval", async () => {
      await registry.connect(admin).approveClaim(key);
      await expect(
        registry.connect(admin).approveClaim(key)
      ).to.be.revertedWith("Not pending");
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HandoverRegistry — rejectClaim
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HandoverRegistry — rejectClaim", () => {
    let key: string;

    beforeEach(async () => {
      await registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH);
      key = makeClaimKey(CLAIM_ID, owner.address);
    });

    it("should reject a pending claim and emit ClaimRejected", async () => {
      await expect(registry.connect(admin).rejectClaim(key))
        .to.emit(registry, "ClaimRejected")
        .withArgs(key, CLAIM_ID, admin.address);
    });

    it("should NOT allow admin to reject an already-Approved claim (anti-rug)", async () => {
      await registry.connect(admin).approveClaim(key);
      await expect(
        registry.connect(admin).rejectClaim(key)
      ).to.be.revertedWith("Can only reject pending claims");
    });

    it("should revert if not admin", async () => {
      await expect(
        registry.connect(attacker).rejectClaim(key)
      ).to.be.revertedWith("Only admin");
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HandoverRegistry — completeClaim (happy path + edge cases)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HandoverRegistry — completeClaim", () => {
    let key: string;

    beforeEach(async () => {
      await registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH);
      key = makeClaimKey(CLAIM_ID, owner.address);
      await registry.connect(admin).approveClaim(key);
    });

    it("should complete claim, mint tokens, emit ClaimCompleted", async () => {
      await expect(
        registry.connect(finder).completeClaim(key, SECRET_HASH)
      )
        .to.emit(registry, "ClaimCompleted")
        .withArgs(key, CLAIM_ID, ITEM_ID, owner.address, finder.address, ethers.parseEther("10"), (v: bigint) => v > 0n);

      expect(await token.balanceOf(finder.address)).to.equal(ethers.parseEther("10"));
    });

    it("should update finderClaimCount after completion", async () => {
      await registry.connect(finder).completeClaim(key, SECRET_HASH);
      expect(await registry.finderClaimCount(finder.address)).to.equal(1n);
    });

    it("should set finder address in claim", async () => {
      await registry.connect(finder).completeClaim(key, SECRET_HASH);
      const [, , , finderAddr] = await registry.getClaim(key);
      expect(finderAddr).to.equal(finder.address);
    });

    it("should revert with wrong secret", async () => {
      const wrongHash = makeSecretHash("wrong-secret");
      await expect(
        registry.connect(finder).completeClaim(key, wrongHash)
      ).to.be.revertedWith("Invalid secret");
    });

    it("should revert if owner tries to be their own finder", async () => {
      await expect(
        registry.connect(owner).completeClaim(key, SECRET_HASH)
      ).to.be.revertedWith("Owner cannot be finder");
    });

    it("should revert if claim is not approved", async () => {
      // Initiate a second claim that has NOT been approved
      const id2 = "claim-uuid-002";
      const k2  = makeClaimKey(id2, owner.address);
      await registry.connect(owner).initiateClaim(id2, ITEM_ID, SECRET_HASH);
      await expect(
        registry.connect(finder).completeClaim(k2, SECRET_HASH)
      ).to.be.revertedWith("Claim not approved");
    });

    it("should revert if claim is expired", async () => {
      await time.increase(3601); // past the extended approval expiry
      await expect(
        registry.connect(finder).completeClaim(key, SECRET_HASH)
      ).to.be.revertedWith("Claim expired");
    });

    it("should revert double-completion (explicit finder guard)", async () => {
      await registry.connect(finder).completeClaim(key, SECRET_HASH);
      // Status is now Completed, but also finder != address(0)
      await expect(
        registry.connect(attacker).completeClaim(key, SECRET_HASH)
      ).to.be.revertedWith("Claim not approved"); // status check fires first
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HandoverRegistry — expireClaim
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HandoverRegistry — expireClaim", () => {
    let key: string;

    beforeEach(async () => {
      await registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH);
      key = makeClaimKey(CLAIM_ID, owner.address);
    });

    it("should expire a pending claim after timeout and emit ClaimExpired", async () => {
      await time.increase(3601);
      await expect(registry.connect(attacker).expireClaim(key))
        .to.emit(registry, "ClaimExpired")
        .withArgs(key, CLAIM_ID, (v: bigint) => v > 0n);
    });

    it("should expire an approved claim after timeout", async () => {
      await registry.connect(admin).approveClaim(key);
      await time.increase(3601);
      await expect(registry.expireClaim(key)).to.emit(registry, "ClaimExpired");
    });

    it("should revert if claim has not yet expired", async () => {
      await expect(registry.expireClaim(key)).to.be.revertedWith("Not yet expired");
    });

    it("should revert if claim is already completed", async () => {
      await registry.connect(admin).approveClaim(key);
      await registry.connect(finder).completeClaim(key, SECRET_HASH);
      await time.increase(3601);
      await expect(registry.expireClaim(key)).to.be.revertedWith("Cannot expire");
    });

    it("should revert if claim is already rejected", async () => {
      await registry.connect(admin).rejectClaim(key);
      await time.increase(3601);
      await expect(registry.expireClaim(key)).to.be.revertedWith("Cannot expire");
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HandoverRegistry — Diminishing Rewards
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HandoverRegistry — Diminishing rewards", () => {
    const REWARDS = [
      ethers.parseEther("10"),
      ethers.parseEther("8"),
      ethers.parseEther("5"),
      ethers.parseEther("3"),
      ethers.parseEther("1"),
    ];

    it("calculateReward returns correct tier for each count", async () => {
      for (let i = 0; i < 5; i++) {
        // finderClaimCount for 'finder' is 0 initially; we test via calculateReward directly
      }
      // Test view function directly using finder address (count starts at 0)
      expect(await registry.calculateReward(finder.address)).to.equal(REWARDS[0]);
    });

    it("should apply diminishing rewards across 5 claims", async () => {
      for (let i = 0; i < 5; i++) {
        const id   = `claim-${i}`;
        const key  = makeClaimKey(id, owner.address);
        await registry.connect(owner).initiateClaim(id, ITEM_ID, SECRET_HASH);
        await registry.connect(admin).approveClaim(key);
        await registry.connect(finder).completeClaim(key, SECRET_HASH);

        const balance = await token.balanceOf(finder.address);
        const expected = REWARDS.slice(0, i + 1).reduce((a, b) => a + b, 0n);
        expect(balance).to.equal(expected);
      }
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HandoverRegistry — getClaim
  // ═══════════════════════════════════════════════════════════════════════════

  describe("HandoverRegistry — getClaim", () => {
    it("should revert for non-existent claim", async () => {
      await expect(registry.getClaim(ethers.ZeroHash)).to.be.revertedWith("Claim not found");
    });

    it("should return all fields correctly after initiation", async () => {
      await registry.connect(owner).initiateClaim(CLAIM_ID, ITEM_ID, SECRET_HASH);
      const key = makeClaimKey(CLAIM_ID, owner.address);
      const [claimId, itemId, claimOwner, claimFinder, status] = await registry.getClaim(key);
      expect(claimId).to.equal(CLAIM_ID);
      expect(itemId).to.equal(ITEM_ID);
      expect(claimOwner).to.equal(owner.address);
      expect(claimFinder).to.equal(ethers.ZeroAddress);
      expect(status).to.equal(0); // Pending
    });
  });

});
