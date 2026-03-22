/**
 * $RFLAG Token Service
 * Interacts with the RFLAGToken ERC-20 contract on Polygon
 */
import { createPublicClient, http, formatUnits } from 'viem';
import { polygon, polygonAmoy } from 'viem/chains';

// ─── Contract Addresses ───────────────────────────────────────────────────────
const RFLAG_CONTRACT_AMOY    = '0x0000000000000000000000000000000000000000'; // testnet (pendiente)
const RFLAG_CONTRACT_POLYGON = '0x06436bf6E71964A99bD4078043aa4cDfA0eadEe6'; // mainnet ✅ 1T supply

const USE_TESTNET = import.meta.env.DEV; // testnet in dev, mainnet in prod
export const RFLAG_ADDRESS = USE_TESTNET ? RFLAG_CONTRACT_AMOY : RFLAG_CONTRACT_POLYGON;
const chain = USE_TESTNET ? polygonAmoy : polygon;

// ─── ABI ──────────────────────────────────────────────────────────────────────
export const RFLAG_ABI = [
  { "type": "function", "name": "name",        "inputs": [], "outputs": [{"type":"string"}],   "stateMutability": "view" },
  { "type": "function", "name": "symbol",      "inputs": [], "outputs": [{"type":"string"}],   "stateMutability": "view" },
  { "type": "function", "name": "decimals",    "inputs": [], "outputs": [{"type":"uint8"}],    "stateMutability": "view" },
  { "type": "function", "name": "totalSupply", "inputs": [], "outputs": [{"type":"uint256"}],  "stateMutability": "view" },
  {
    "type": "function", "name": "balanceOf",
    "inputs": [{"name":"account","type":"address"}],
    "outputs": [{"type":"uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function", "name": "rewardUser",
    "inputs": [{"name":"user","type":"address"},{"name":"amount","type":"uint256"},{"name":"reason","type":"string"}],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  { "type": "function", "name": "claimDailyCheckin", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "spendPremium",      "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "spendBoost",        "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "spendPrioritySupport", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  {
    "type": "function", "name": "canCheckin",
    "inputs": [{"name":"user","type":"address"}],
    "outputs": [{"name":"","type":"bool"},{"name":"nextCheckin","type":"uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function", "name": "remainingCommunityAllocation",
    "inputs": [], "outputs": [{"type":"uint256"}],
    "stateMutability": "view"
  },
  { "type": "event", "name": "Rewarded", "inputs": [{"name":"user","type":"address","indexed":true},{"name":"amount","type":"uint256","indexed":false},{"name":"reason","type":"string","indexed":false}] },
  { "type": "event", "name": "Spent",    "inputs": [{"name":"user","type":"address","indexed":true},{"name":"amount","type":"uint256","indexed":false},{"name":"reason","type":"string","indexed":false}] },
  { "type": "event", "name": "Transfer", "inputs": [{"name":"from","type":"address","indexed":true},{"name":"to","type":"address","indexed":true},{"name":"value","type":"uint256","indexed":false}] },
];

// ─── Public client (reads, no wallet needed) ──────────────────────────────────
const publicClient = createPublicClient({
  chain,
  transport: http(import.meta.env.VITE_DRPC_KEY
    ? `https://polygon.drpc.org`
    : undefined),
});

// ─── Reward amounts (mirrors contract constants) ──────────────────────────────
export const REWARDS = {
  VERIFY_PROFILE:  50,
  CONFIRM_REPORT:  100,
  MATCH_7DAYS:     25,
  USE_SAFERIDE:    10,
  DAILY_CHECKIN:   5,
};

export const SPEND_COSTS = {
  PREMIUM_MONTH:      500,
  BOOST_PROFILE:      50,
  PRIORITY_SUPPORT:   100,
};

// ─── Read functions ───────────────────────────────────────────────────────────

/**
 * Get $RFLAG balance for a wallet address.
 * Returns a human-readable number (e.g., "1250.5")
 */
export async function getRFLAGBalance(walletAddress) {
  if (!walletAddress || RFLAG_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return '0';
  }
  try {
    const raw = await publicClient.readContract({
      address: RFLAG_ADDRESS,
      abi: RFLAG_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    });
    return formatUnits(raw, 18);
  } catch {
    return '0';
  }
}

/**
 * Check if user can claim daily check-in and when next check-in is.
 */
export async function getCheckinStatus(walletAddress) {
  if (!walletAddress || RFLAG_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return { canClaim: true, nextCheckin: null };
  }
  try {
    const [canClaim, nextCheckin] = await publicClient.readContract({
      address: RFLAG_ADDRESS,
      abi: RFLAG_ABI,
      functionName: 'canCheckin',
      args: [walletAddress],
    });
    return {
      canClaim,
      nextCheckin: nextCheckin ? new Date(Number(nextCheckin) * 1000) : null,
    };
  } catch {
    return { canClaim: true, nextCheckin: null };
  }
}

/**
 * Get recent Transfer events for a wallet (transaction history).
 */
export async function getRFLAGHistory(walletAddress, limit = 10) {
  if (!walletAddress || RFLAG_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return getMockHistory();
  }
  try {
    const [sent, received] = await Promise.all([
      publicClient.getLogs({
        address: RFLAG_ADDRESS,
        event: { type: 'event', name: 'Transfer', inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to',   type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false },
        ]},
        args: { from: walletAddress },
        fromBlock: 'earliest',
      }),
      publicClient.getLogs({
        address: RFLAG_ADDRESS,
        event: { type: 'event', name: 'Transfer', inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to',   type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false },
        ]},
        args: { to: walletAddress },
        fromBlock: 'earliest',
      }),
    ]);

    const all = [...sent.map(e => ({ ...e, type: 'sent' })), ...received.map(e => ({ ...e, type: 'received' }))]
      .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))
      .slice(0, limit);

    return all.map(e => ({
      type: e.type,
      amount: formatUnits(e.args.value, 18),
      hash: e.transactionHash,
      block: Number(e.blockNumber),
    }));
  } catch {
    return getMockHistory();
  }
}

// ─── Mock data (shown before contract is deployed) ───────────────────────────
export function getMockHistory() {
  return [
    { type: 'received', amount: '50',  reason: 'Verificación de perfil',   date: '2026-03-20' },
    { type: 'received', amount: '5',   reason: 'Check-in diario',           date: '2026-03-21' },
    { type: 'received', amount: '5',   reason: 'Check-in diario',           date: '2026-03-22' },
    { type: 'spent',    amount: '50',  reason: 'Boost de perfil',           date: '2026-03-19' },
  ];
}

// ─── Token metadata ───────────────────────────────────────────────────────────
export const TOKEN_INFO = {
  name:     'RedFlag Token',
  symbol:   'RFLAG',
  decimals: 18,
  maxSupply: '1,000,000,000,000',
  network:  USE_TESTNET ? 'Polygon Amoy (Testnet)' : 'Polygon',
  chainId:  USE_TESTNET ? 80002 : 137,
  logoUrl:  null, // will use app icon
  polygonscanUrl: (address) =>
    USE_TESTNET
      ? `https://amoy.polygonscan.com/address/${address}`
      : `https://polygonscan.com/address/${address}`,
};
