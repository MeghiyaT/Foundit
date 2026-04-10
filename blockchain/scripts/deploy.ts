import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy FinderRewardToken
  console.log("\n1. Deploying FinderRewardToken (FNDT)...");
  const token = await ethers.deployContract("FinderRewardToken");
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`   FinderRewardToken deployed to: ${tokenAddr}`);

  // 2. Deploy HandoverRegistry (pass token address)
  console.log("\n2. Deploying HandoverRegistry...");
  const registry = await ethers.deployContract("HandoverRegistry", [tokenAddr]);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`   HandoverRegistry deployed to: ${registryAddr}`);

  // 3. Set the registry as the minter on the token
  console.log("\n3. Setting HandoverRegistry as token minter...");
  const tx = await token.setMinter(registryAddr);
  await tx.wait();
  console.log("   Minter set successfully.");

  console.log("\n=== Deployment Complete ===");
  console.log(`REWARD_TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`HANDOVER_REGISTRY_ADDRESS=${registryAddr}`);
  console.log("\nAdd these to your backend .env file.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
