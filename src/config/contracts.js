// Contract ABIs and Addresses

export const RFLAG_ADDRESS = '0x06436bf6E71964A99bD4078043aa4cDfA0eadEe6';

// Placeholder for deployed RedFlagRadar contract.
// Replace with actual deployed address after deploying 'redflag-contracts/contracts/RedFlagRadar.sol'
export const RADAR_CONTRACT_ADDRESS = import.meta.env.VITE_RADAR_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'; 

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 amount)",
  "event Approval(address indexed owner, address indexed spender, uint256 amount)"
];

export const REDFLAG_RADAR_ABI = [
  "function rflagToken() view returns (address)",
  "function treasury() view returns (address)",
  "function reportCost() view returns (uint256)",
  "function reportRedFlag(string location, string description)",
  "function setReportCost(uint256 _newCost)",
  "function setTreasury(address _newTreasury)",
  "function owner() view returns (address)",
  "function renounceOwnership()",
  "function transferOwnership(address newOwner)",
  "event RedFlagReported(address indexed user, string location, string description, uint256 amount, uint256 timestamp)",
  "event CostUpdated(uint256 newCost)",
  "event TreasuryUpdated(address newTreasury)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
];
