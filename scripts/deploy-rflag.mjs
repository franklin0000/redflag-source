/**
 * Deploy $RFLAG Token to Polygon
 *
 * Usage:
 *   Testnet (Amoy):  node scripts/deploy-rflag.mjs --network amoy
 *   Mainnet:         node scripts/deploy-rflag.mjs --network polygon
 *
 * Requires in .env:
 *   DEPLOY_PRIVATE_KEY=0x...  (wallet with MATIC for gas)
 *   POLYGONSCAN_API_KEY=...   (for contract verification)
 */

import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon, polygonAmoy } from 'viem/chains';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const networkArg = args.find(a => a.startsWith('--network=') || args[args.indexOf('--network') + 1])?.replace('--network=', '')
  || args[args.indexOf('--network') + 1]
  || 'amoy';

const isMainnet = networkArg === 'polygon';
const chain = isMainnet ? polygon : polygonAmoy;
const rpcUrl = isMainnet
  ? `https://polygon-mainnet.g.alchemy.com/v2/${process.env.VITE_DRPC_KEY || ''}`
  : 'https://rpc-amoy.polygon.technology';

console.log(`\n🚀 Deploying $RFLAG to ${isMainnet ? 'Polygon MAINNET' : 'Polygon Amoy Testnet'}`);
console.log(`   RPC: ${rpcUrl}\n`);

// ─── ABI + Bytecode (compile with: npx hardhat compile) ──────────────────────
// This is a simplified deploy using viem directly.
// For production, use Hardhat or Foundry for full compile + verify.

const RFLAG_ABI = [
  { "type": "constructor", "inputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "name", "inputs": [], "outputs": [{"type":"string"}], "stateMutability": "view" },
  { "type": "function", "name": "symbol", "inputs": [], "outputs": [{"type":"string"}], "stateMutability": "view" },
  { "type": "function", "name": "decimals", "inputs": [], "outputs": [{"type":"uint8"}], "stateMutability": "view" },
  { "type": "function", "name": "totalSupply", "inputs": [], "outputs": [{"type":"uint256"}], "stateMutability": "view" },
  { "type": "function", "name": "balanceOf", "inputs": [{"name":"account","type":"address"}], "outputs": [{"type":"uint256"}], "stateMutability": "view" },
  { "type": "function", "name": "transfer", "inputs": [{"name":"to","type":"address"},{"name":"value","type":"uint256"}], "outputs": [{"type":"bool"}], "stateMutability": "nonpayable" },
  { "type": "function", "name": "rewardUser", "inputs": [{"name":"user","type":"address"},{"name":"amount","type":"uint256"},{"name":"reason","type":"string"}], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "claimDailyCheckin", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "spendPremium", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "spendBoost", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "canCheckin", "inputs": [{"name":"user","type":"address"}], "outputs": [{"name":"","type":"bool"},{"name":"nextCheckin","type":"uint256"}], "stateMutability": "view" },
  { "type": "function", "name": "remainingCommunityAllocation", "inputs": [], "outputs": [{"type":"uint256"}], "stateMutability": "view" },
  { "type": "function", "name": "setRewarder", "inputs": [{"name":"addr","type":"address"},{"name":"authorized","type":"bool"}], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "event", "name": "Rewarded", "inputs": [{"name":"user","type":"address","indexed":true},{"name":"amount","type":"uint256","indexed":false},{"name":"reason","type":"string","indexed":false}] },
  { "type": "event", "name": "Spent", "inputs": [{"name":"user","type":"address","indexed":true},{"name":"amount","type":"uint256","indexed":false},{"name":"reason","type":"string","indexed":false}] },
];

// Instructions for full deployment
console.log('📋 DEPLOYMENT INSTRUCTIONS');
console.log('═══════════════════════════════════════════════════════');
console.log('');
console.log('1. Install Hardhat in the project root:');
console.log('   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox');
console.log('');
console.log('2. Initialize Hardhat:');
console.log('   npx hardhat init  (choose "TypeScript project")');
console.log('');
console.log('3. Copy src/contracts/RFLAGToken.sol to contracts/');
console.log('');
console.log('4. Create hardhat.config.ts with Polygon networks:');
console.log(`
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    amoy: {
      url: "https://rpc-amoy.polygon.technology",
      accounts: [process.env.DEPLOY_PRIVATE_KEY!],
      chainId: 80002,
    },
    polygon: {
      url: "https://polygon-rpc.com",
      accounts: [process.env.DEPLOY_PRIVATE_KEY!],
      chainId: 137,
    },
  },
  etherscan: {
    apiKey: { polygon: process.env.POLYGONSCAN_API_KEY! }
  },
};
export default config;
`);
console.log('5. Create scripts/deploy.ts:');
console.log(`
import { ethers } from "hardhat";
async function main() {
  const Token = await ethers.getContractFactory("RFLAGToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  console.log("$RFLAG deployed to:", await token.getAddress());
}
main();
`);
console.log('6. Deploy:');
console.log('   npx hardhat run scripts/deploy.ts --network amoy');
console.log('');
console.log('7. Verify on Polygonscan:');
console.log('   npx hardhat verify --network amoy CONTRACT_ADDRESS');
console.log('');
console.log('8. Copy the contract address to src/services/rflagToken.js');
console.log('═══════════════════════════════════════════════════════');
console.log('');
console.log('📄 ABI exported for frontend use:');
console.log(JSON.stringify(RFLAG_ABI, null, 2));

export { RFLAG_ABI };
