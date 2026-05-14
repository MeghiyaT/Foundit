/**
 * Foundit — Blockchain Integration
 * MetaMask wallet connection + HandoverRegistry + FinderRewardToken interaction
 *
 * Contract ABI updated to match v2 of the smart contracts:
 *  - initiateClaim / approveClaim / rejectClaim / getClaim / expireClaim now
 *    operate on `bytes32 internalKey` (keccak256(claimId, ownerAddress)) instead
 *    of raw `string claimId`.
 *  - completeClaim now takes `bytes32 secretHashProof` (keccak256 of the raw
 *    secret, computed client-side) instead of the raw secret string.
 */

import { ethers, BrowserProvider, Contract } from 'ethers';

// ============================================
// CONTRACT ABIs (minimal — only the functions we call)
// ============================================

const HANDOVER_REGISTRY_ABI = [
  // Lifecycle
  "function initiateClaim(string claimId, string itemId, bytes32 secretHash) external",
  "function approveClaim(bytes32 internalKey) external",
  "function rejectClaim(bytes32 internalKey) external",
  "function completeClaim(bytes32 internalKey, bytes32 secretHashProof) external",
  "function expireClaim(bytes32 internalKey) external",

  // Views
  "function getClaim(bytes32 internalKey) external view returns (string claimId, string itemId, address owner, address finder, uint8 status, uint256 createdAt, uint256 expiresAt, uint256 rewardAmount)",
  "function getClaimKey(string claimId, address owner) external pure returns (bytes32)",
  "function calculateReward(address finder) external view returns (uint256)",
  "function finderClaimCount(address) external view returns (uint256)",

  // Admin
  "function setAdmin(address _newAdmin) external",
  "function acceptAdmin() external",
  "function admin() external view returns (address)",
  "function pendingAdmin() external view returns (address)",

  // Events
  "event ClaimInitiated(bytes32 indexed internalKey, string claimId, string itemId, address indexed owner, bytes32 secretHash, uint256 expiresAt)",
  "event ClaimCompleted(bytes32 indexed internalKey, string claimId, string itemId, address indexed owner, address indexed finder, uint256 rewardAmount, uint256 timestamp)",
  "event ClaimApproved(bytes32 indexed internalKey, string claimId, address indexed approvedBy)",
  "event ClaimRejected(bytes32 indexed internalKey, string claimId, address indexed rejectedBy)",
  "event ClaimExpired(bytes32 indexed internalKey, string claimId, uint256 expiredAt)",
  "event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin)",
  "event AdminTransferAccepted(address indexed previousAdmin, address indexed newAdmin)",
];

const REWARD_TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function cap() external view returns (uint256)",
  "function minter() external view returns (address)",
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

function getSepoliaRpcUrls(): string[] {
  const customRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
  const fallbacks = [
    'https://rpc2.sepolia.org',
    'https://sepolia.gateway.tenderly.co',
    'https://ethereum-sepolia-rpc.publicnode.com',
  ];
  return customRpc ? [customRpc, ...fallbacks] : fallbacks;
}

const SEPOLIA_CONFIG = {
  chainId: '0xaa36a7',  // 11155111 in hex
  chainName: 'Sepolia Testnet',
  rpcUrls: getSepoliaRpcUrls(),
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
// HELPERS
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
 * Compute the on-chain internal claim key:
 *   keccak256(abi.encodePacked(claimId, ownerAddress))
 *
 * This mirrors the `getClaimKey()` pure function on the contract and must be
 * used everywhere the contract expects a `bytes32 internalKey`.
 */
export function computeClaimKey(claimId: string, ownerAddress: string): string {
  return ethers.solidityPackedKeccak256(
    ['string', 'address'],
    [claimId, ownerAddress]
  );
}

/**
 * Compute the secret hash that the contract compares against the stored
 * secretHash during `completeClaim`:
 *   keccak256(abi.encodePacked(rawSecret))
 *
 * The frontend hashes the secret before sending it on-chain so the raw
 * secret is never exposed in calldata/mempool.
 */
export function computeSecretHash(rawSecret: string): string {
  return ethers.solidityPackedKeccak256(['string'], [rawSecret.toUpperCase()]);
}

// ============================================
// CONTRACT INTERACTIONS
// ============================================

/**
 * Owner initiates a claim on the blockchain.
 *
 * @param config      Contract addresses from the backend.
 * @param claimId     The claim UUID from the backend (≤ 64 chars).
 * @param itemId      The item UUID (≤ 64 chars).
 * @param secretCode  The raw secret code — hashed to bytes32 before submission.
 * @returns           Transaction hash.
 */
export async function initiateClaimOnChain(
  config: BlockchainConfig,
  claimId: string,
  itemId: string,
  secretCode: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  // Hash the secret: keccak256(abi.encodePacked(secret.toUpperCase()))
  const secretHash = computeSecretHash(secretCode);
  const tx = await registry.initiateClaim(claimId, itemId, secretHash);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Admin approves a claim on the blockchain.
 *
 * @param config       Contract addresses.
 * @param internalKey  bytes32 key from `computeClaimKey(claimId, ownerAddress)`.
 * @returns            Transaction hash.
 */
export async function approveClaimOnChain(
  config: BlockchainConfig,
  internalKey: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  const tx = await registry.approveClaim(internalKey);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Admin rejects a *pending* claim on the blockchain.
 * NOTE: Only pending claims can be rejected (not approved ones).
 *
 * @param config       Contract addresses.
 * @param internalKey  bytes32 key from `computeClaimKey(claimId, ownerAddress)`.
 * @returns            Transaction hash.
 */
export async function rejectClaimOnChain(
  config: BlockchainConfig,
  internalKey: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  const tx = await registry.rejectClaim(internalKey);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Finder completes the claim by proving knowledge of the secret.
 *
 * The raw secret is hashed client-side (keccak256) before being sent on-chain,
 * so the plaintext is never exposed in calldata or the mempool.
 *
 * @param config       Contract addresses.
 * @param internalKey  bytes32 key from `computeClaimKey(claimId, ownerAddress)`.
 * @param secretCode   The raw secret code the owner shared in person.
 * @returns            Transaction hash.
 */
export async function completeClaimOnChain(
  config: BlockchainConfig,
  internalKey: string,
  secretCode: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  // Hash the secret client-side — never send the raw string on-chain
  const secretHashProof = computeSecretHash(secretCode);
  const tx = await registry.completeClaim(internalKey, secretHashProof);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Trigger expiry of a claim whose timestamp has passed (anyone can call this).
 *
 * @param config       Contract addresses.
 * @param internalKey  bytes32 key from `computeClaimKey(claimId, ownerAddress)`.
 * @returns            Transaction hash.
 */
export async function expireClaimOnChain(
  config: BlockchainConfig,
  internalKey: string,
): Promise<string> {
  const registry = await getRegistryContract(config);
  const tx = await registry.expireClaim(internalKey);
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
 * Calculate the expected reward for a finder based on their past claim count.
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
