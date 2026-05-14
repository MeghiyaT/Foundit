import { ethers } from "hardhat";

/**
 * Deployment script for Foundit smart contracts.
 *
 * Deployment order:
 *   1. Deploy FinderRewardToken — passing the (yet unknown) registry address as
 *      address(0). The token accepts this and leaves minter unset.
 *   2. Deploy HandoverRegistry — passing the token address.
 *   3. Call token.setMinter(registryAddr) atomically in the same script run.
 *      setMinter is a one-time function; it reverts if called again.
 *
 * Alternatively, you can pass the registry address directly to the token
 * constructor once CREATE2 / deterministic addresses are used.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy FinderRewardToken (minter not yet known → pass address(0))
  console.log("\n1. Deploying FinderRewardToken (FNDT)...");
  const token = await ethers.deployContract("FinderRewardToken", [
    ethers.ZeroAddress, // minter will be set in step 3
  ]);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`   FinderRewardToken deployed to: ${tokenAddr}`);

  // 2. Deploy HandoverRegistry (pass token address)
  console.log("\n2. Deploying HandoverRegistry...");
  const registry = await ethers.deployContract("HandoverRegistry", [tokenAddr]);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`   HandoverRegistry deployed to: ${registryAddr}`);

  // 3. Atomically set HandoverRegistry as the sole minter (one-time)
  console.log("\n3. Setting HandoverRegistry as token minter (one-time)...");
  const tx = await token.setMinter(registryAddr);
  await tx.wait();
  console.log("   Minter set successfully.");

  // 4. Verify minter was set correctly
  const onChainMinter = await token.minter();
  if (onChainMinter.toLowerCase() !== registryAddr.toLowerCase()) {
    throw new Error("Minter verification failed! Do NOT proceed.");
  }
  console.log("   Minter verified on-chain ✓");

  console.log("\n=== Deployment Complete ===");
  console.log(`REWARD_TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`HANDOVER_REGISTRY_ADDRESS=${registryAddr}`);
  console.log("\nAdd these to your backend .env file.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
