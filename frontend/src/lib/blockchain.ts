/**
 * Foundit — Blockchain Integration
 * MetaMask wallet connection + HandoverRegistry + FinderRewardToken interaction
 */

import { ethers, BrowserProvider, Contract } from 'ethers';

// ============================================
// CONTRACT ABIs (minimal — only the functions we call)
// ============================================

const HANDOVER_REGISTRY_ABI = [
  "function initiateClaim(string claimId, string itemId, bytes32 secretHash) external",
  "function completeClaim(string claimId, string secret) external",
  "function approveClaim(string claimId) external",
  "function rejectClaim(string claimId) external",
  "function getClaim(string claimId) external view returns (string itemId, address owner, address finder, uint8 status, uint256 createdAt, uint256 expiresAt, uint256 rewardAmount)",
  "function calculateReward(address finder) external view returns (uint256)",
  "function finderClaimCount(address) external view returns (uint256)",
  "event ClaimInitiated(string claimId, string itemId, address indexed owner, bytes32 secretHash, uint256 expiresAt)",
  "event ClaimCompleted(string claimId, string itemId, address indexed owner, address indexed finder, uint256 rewardAmount, uint256 timestamp)",
  "event ClaimApproved(string claimId, address indexed approvedBy)",
  "event ClaimRejected(string claimId, address indexed rejectedBy)",
];

const REWARD_TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
];

// ============================================
// TYPES
// ============================================

export interface BlockchainConfig {
  handover_registry_address: string;
  reward_token_address: string;
  network: string;
  chain_id: number;
}

export interface WalletInfo {
  address: string;
  chainId: number;
  isCorrectNetwork: boolean;
}

// ============================================
// SEPOLIA NETWORK
// ============================================

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CONFIG = {
  chainId: '0xaa36a7',  // 11155111 in hex
  chainName: 'Sepolia Testnet',
  rpcUrls: ['https://rpc2.sepolia.org'],
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
};

// ============================================
// WALLET CONNECTION
// ============================================

export function isMetaMaskInstalled(): boolean {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

export async function connectWallet(): Promise<WalletInfo> {
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new BrowserProvider(window.ethereum as any);
  const accounts = await provider.send('eth_requestAccounts', []);
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts found. Please connect MetaMask.');
  }

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  return {
    address: accounts[0],
    chainId,
    isCorrectNetwork: chainId === SEPOLIA_CHAIN_ID,
  };
}

export async function switchToSepolia(): Promise<void> {
  if (!isMetaMaskInstalled()) throw new Error('MetaMask not installed.');

  try {
    await window.ethereum!.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CONFIG.chainId }],
    });
  } catch (err: unknown) {
    // Chain not added — add it
    if ((err as { code?: number })?.code === 4902) {
      await window.ethereum!.request({
        method: 'wallet_addEthereumChain',
        params: [SEPOLIA_CONFIG],
      });
    } else {
      throw err;
    }
  }
}

// ============================================
// CONTRACT INTERACTIONS
// ============================================

function getProvider(): BrowserProvider {
  if (!isMetaMaskInstalled()) throw new Error('MetaMask not installed.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new BrowserProvider(window.ethereum as any);
}

async function getRegistryContract(config: BlockchainConfig): Promise<Contract> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  return new Contract(config.handover_registry_address, HANDOVER_REGISTRY_ABI, signer);
}

async function getTokenContract(config: BlockchainConfig): Promise<Contract> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  return new Contract(config.reward_token_address, REWARD_TOKEN_ABI, signer);
}

/**
 * Owner initiates a claim on the blockchain.
 * @param config Contract addresses from the backend
 * @param claimId The claim UUID from the backend
 * @param itemId The item UUID
 * @param secretCode The raw secret code (will be hashed with keccak256)
 * @returns Transaction hash
 */
export async function initiateClaimOnChain(
  config: BlockchainConfig,
  claimId: string,
  itemId: string,
  secretCode: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secretCode.toUpperCase()));

  const tx = await registry.initiateClaim(claimId, itemId, secretHash);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Admin approves a claim on the blockchain.
 */
export async function approveClaimOnChain(
  config: BlockchainConfig,
  claimId: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  const tx = await registry.approveClaim(claimId);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Finder completes the claim on the blockchain.
 * Provides the raw secret — contract verifies the hash.
 * On success, FNDT reward tokens are minted to the finder.
 * @returns Transaction hash
 */
export async function completeClaimOnChain(
  config: BlockchainConfig,
  claimId: string,
  secretCode: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  const tx = await registry.completeClaim(claimId, secretCode.toUpperCase());
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Get the FNDT reward token balance for a wallet address.
 * @returns Balance as a formatted string (e.g., "10.0")
 */
export async function getRewardBalance(
  config: BlockchainConfig,
  walletAddress: string,
): Promise<string> {
  const token = await getTokenContract(config);
  const balance = await token.balanceOf(walletAddress);
  return ethers.formatEther(balance);
}

/**
 * Calculate the expected reward for a finder.
 */
export async function calculateExpectedReward(
  config: BlockchainConfig,
  finderAddress: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  const reward = await registry.calculateReward(finderAddress);
  return ethers.formatEther(reward);
}

/**
 * Get Sepolia Etherscan link for a transaction.
 */
export function getEtherscanTxUrl(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

/**
 * Get Sepolia Etherscan link for an address.
 */
export function getEtherscanAddressUrl(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}

// ============================================
// TYPESCRIPT DECLARATIONS FOR window.ethereum
// ============================================

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}
