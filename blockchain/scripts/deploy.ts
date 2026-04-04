import { ethers } from "hardhat";

async function main() {
  console.log("Deploying HandoverRegistry...");

  const registry = await ethers.deployContract("HandoverRegistry");

  await registry.waitForDeployment();

  console.log(`HandoverRegistry deployed to: ${await registry.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
