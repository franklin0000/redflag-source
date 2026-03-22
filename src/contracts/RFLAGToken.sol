// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RFLAGToken
 * @dev $RFLAG — The native utility token of RedFlag App
 *
 * Tokenomics:
 *   Total Supply: 100,000,000 RFLAG (100 million)
 *   - 40% Community rewards (minted on demand via rewardUser)
 *   - 30% Team/Development (minted at deploy to owner)
 *   - 20% Ecosystem/Partnerships (minted at deploy to owner)
 *   - 10% Liquidity (minted at deploy to owner)
 *
 * Earning $RFLAG in-app:
 *   - Verify profile:           +50 RFLAG
 *   - Report confirmed fake:    +100 RFLAG
 *   - Match & chat 7 days:      +25 RFLAG
 *   - Use SafeRide:             +10 RFLAG
 *   - Daily check-in:           +5 RFLAG
 *
 * Spending $RFLAG:
 *   - Premium subscription:     burn 500 RFLAG/month
 *   - Boost profile:            burn 50 RFLAG
 *   - Priority support:         burn 100 RFLAG
 */
contract RFLAGToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {

    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18; // 100M tokens
    uint256 public constant COMMUNITY_ALLOCATION = 40_000_000 * 10**18; // 40M for rewards

    // Reward amounts (in RFLAG, 18 decimals)
    uint256 public constant REWARD_VERIFY_PROFILE    = 50  * 10**18;
    uint256 public constant REWARD_CONFIRM_REPORT    = 100 * 10**18;
    uint256 public constant REWARD_MATCH_7DAYS       = 25  * 10**18;
    uint256 public constant REWARD_USE_SAFERIDE      = 10  * 10**18;
    uint256 public constant REWARD_DAILY_CHECKIN     = 5   * 10**18;

    // Spend amounts
    uint256 public constant SPEND_PREMIUM_MONTH      = 500 * 10**18;
    uint256 public constant SPEND_BOOST_PROFILE      = 50  * 10**18;
    uint256 public constant SPEND_PRIORITY_SUPPORT   = 100 * 10**18;

    // Track total community rewards minted
    uint256 public communityMinted;

    // Addresses authorized to call rewardUser (our backend wallet)
    mapping(address => bool) public rewarders;

    // Daily check-in cooldown
    mapping(address => uint256) public lastCheckin;
    uint256 public constant CHECKIN_COOLDOWN = 24 hours;

    // Track if user already claimed profile verification reward
    mapping(address => bool) public hasClaimedVerifyReward;

    // Events
    event Rewarded(address indexed user, uint256 amount, string reason);
    event Spent(address indexed user, uint256 amount, string reason);
    event RewarderSet(address indexed addr, bool authorized);

    modifier onlyRewarder() {
        require(rewarders[msg.sender] || msg.sender == owner(), "Not authorized rewarder");
        _;
    }

    constructor() ERC20("RedFlag Token", "RFLAG") Ownable(msg.sender) {
        // Mint 60% to owner at deploy (team + ecosystem + liquidity)
        uint256 initialMint = MAX_SUPPLY - COMMUNITY_ALLOCATION;
        _mint(msg.sender, initialMint);
    }

    // ─── ADMIN ────────────────────────────────────────────────

    function setRewarder(address addr, bool authorized) external onlyOwner {
        rewarders[addr] = authorized;
        emit RewarderSet(addr, authorized);
    }

    // ─── REWARD ENGINE ────────────────────────────────────────

    /**
     * @dev Reward a user from the community allocation.
     * Called by our backend wallet (rewarder) when user completes an action.
     */
    function rewardUser(address user, uint256 amount, string calldata reason)
        external onlyRewarder nonReentrant
    {
        require(communityMinted + amount <= COMMUNITY_ALLOCATION, "Community allocation exhausted");
        communityMinted += amount;
        _mint(user, amount);
        emit Rewarded(user, amount, reason);
    }

    /**
     * @dev User claims daily check-in reward themselves.
     */
    function claimDailyCheckin() external nonReentrant {
        require(
            block.timestamp >= lastCheckin[msg.sender] + CHECKIN_COOLDOWN,
            "Already checked in today"
        );
        require(
            communityMinted + REWARD_DAILY_CHECKIN <= COMMUNITY_ALLOCATION,
            "Community allocation exhausted"
        );
        lastCheckin[msg.sender] = block.timestamp;
        communityMinted += REWARD_DAILY_CHECKIN;
        _mint(msg.sender, REWARD_DAILY_CHECKIN);
        emit Rewarded(msg.sender, REWARD_DAILY_CHECKIN, "daily_checkin");
    }

    // ─── SPEND / BURN FUNCTIONS ──────────────────────────────

    /**
     * @dev User burns RFLAG to activate premium for 30 days.
     */
    function spendPremium() external nonReentrant {
        _spendTokens(msg.sender, SPEND_PREMIUM_MONTH, "premium_monthly");
    }

    /**
     * @dev User burns RFLAG to boost their dating profile.
     */
    function spendBoost() external nonReentrant {
        _spendTokens(msg.sender, SPEND_BOOST_PROFILE, "profile_boost");
    }

    /**
     * @dev User burns RFLAG for priority support.
     */
    function spendPrioritySupport() external nonReentrant {
        _spendTokens(msg.sender, SPEND_PRIORITY_SUPPORT, "priority_support");
    }

    function _spendTokens(address user, uint256 amount, string memory reason) internal {
        require(balanceOf(user) >= amount, "Insufficient RFLAG balance");
        _burn(user, amount);
        emit Spent(user, amount, reason);
    }

    // ─── VIEW ─────────────────────────────────────────────────

    function remainingCommunityAllocation() external view returns (uint256) {
        return COMMUNITY_ALLOCATION - communityMinted;
    }

    function canCheckin(address user) external view returns (bool, uint256 nextCheckin) {
        nextCheckin = lastCheckin[user] + CHECKIN_COOLDOWN;
        return (block.timestamp >= nextCheckin, nextCheckin);
    }
}
