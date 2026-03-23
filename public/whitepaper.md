# RedFlag App — White Paper

**Version 1.0 | March 2026**

---

## Table of Contents

1. [Abstract](#abstract)
2. [Problem Statement](#problem-statement)
3. [Solution](#solution)
4. [Product Overview](#product-overview)
5. [Technology Stack](#technology-stack)
6. [$RFLAG Token](#rflag-token)
7. [Tokenomics](#tokenomics)
8. [Roadmap](#roadmap)
9. [Team](#team)
10. [Legal Disclaimer](#legal-disclaimer)

---

## 1. Abstract

RedFlag is a Web3-powered dating safety platform that combines identity verification, facial recognition search, community-driven fraud reporting, and encrypted dating — all backed by the native utility token **$RFLAG** on the Polygon blockchain.

The core premise is simple: the internet has made it easy for bad actors to create fake identities on dating apps. RedFlag gives users the tools to verify who they are actually talking to, report suspicious profiles, and interact in a safer environment — while earning $RFLAG tokens for contributing to community safety.

---

## 2. Problem Statement

### 2.1 The Dating Safety Crisis

Online dating fraud costs victims over **$1.3 billion annually** in the United States alone (FTC, 2023). Romance scams, catfishing, and fake profiles are pervasive across all major dating platforms.

Current platforms offer no meaningful identity verification. A person can create unlimited fake accounts with stolen photos and fabricated identities in minutes. Victims have no way to cross-reference a person's identity before meeting in real life.

### 2.2 No Accountability

When users report fake profiles on traditional dating apps, the reports disappear into a black box. There is no community-driven accountability system, no transparency, and no incentive for users to contribute safety information.

### 2.3 Centralized Data Risks

Traditional dating apps store sensitive user data in centralized servers vulnerable to breaches. Messages are unencrypted, profile photos are accessible, and personal data is monetized without user consent.

---

## 3. Solution

RedFlag addresses these problems through four core pillars:

| Pillar | Solution |
|---|---|
| **Identity** | Facial recognition search + gender verification |
| **Community** | Token-incentivized fraud reporting system |
| **Privacy** | AES-256-GCM end-to-end encrypted messaging |
| **Safety** | SafeRide integration + real-time check-ins |

---

## 4. Product Overview

### 4.1 Facial Recognition Search

Users can search for any person by uploading a photo. RedFlag uses advanced facial recognition (FaceCheck.id API + Google Vision) to cross-reference against public profiles across the internet — helping users verify if a person's identity matches their dating profile.

### 4.2 Community Report System

Users can submit reports on suspicious profiles, fake identities, or fraudulent accounts. Each confirmed report is stored immutably and contributes to a community safety database. Reporters earn $RFLAG tokens for verified contributions.

### 4.3 Dating Mode

A dedicated, secure dating section with:
- **Gender Verification** — selfie-based verification to ensure authentic gender identity in gender-specific rooms
- **End-to-End Encrypted Messaging** — AES-256-GCM encryption, keys never leave user devices
- **Match System** — mutual interest matching before messaging
- **Video Calls** — WebRTC peer-to-peer encrypted video

### 4.4 SafeRide

A safety feature that lets users request a safe ride and share their real-time location with trusted contacts during dates. Integrated with Uber deep links for seamless ride booking.

### 4.5 Daily Check-ins

Users can perform daily safety check-ins to confirm their wellbeing. Each check-in earns $RFLAG and can alert emergency contacts if missed.

### 4.6 Web3 Integration

- Connect MetaMask or any WalletConnect-compatible wallet
- View $RFLAG balance and transaction history
- Spend $RFLAG for premium features directly from the app
- All transactions on Polygon for near-zero gas fees

---

## 5. Technology Stack

### 5.1 Frontend

| Component | Technology |
|---|---|
| Framework | React 18 + Vite |
| Styling | TailwindCSS 4 |
| Routing | React Router (HashRouter for IPFS compatibility) |
| Animations | Framer Motion |
| Web3 | Wagmi + ConnectKit + viem |
| PWA | Service Worker + Web App Manifest |

### 5.2 Backend

| Component | Technology |
|---|---|
| Server | Express.js + Node.js |
| Database | PostgreSQL (Render) |
| Real-time | Socket.io |
| Media | Cloudinary |
| Cache | Redis |
| Hosting | Render.com |

### 5.3 Blockchain

| Component | Details |
|---|---|
| Network | Polygon PoS (chainId 137) |
| Token Standard | ERC-20 |
| Smart Contract | OpenZeppelin v5 base |
| DEX | SushiSwap V2 |
| Explorer | Polygonscan |

### 5.4 Security

- **Encryption**: AES-256-GCM for all chat messages (Web Crypto API)
- **Authentication**: JWT with 7-day expiry
- **Passwords**: bcrypt hashing (salt rounds: 12)
- **Reentrancy**: OpenZeppelin ReentrancyGuard on all token functions
- **IPFS**: Decentralized hosting via Pinata (CID: QmZwRJVAKppLYc4VAPtdWi5hMrmE9tzak4wVMhcyVjAE3d)

---

## 6. $RFLAG Token

### 6.1 Overview

| Property | Value |
|---|---|
| **Name** | RedFlag Token |
| **Symbol** | $RFLAG |
| **Network** | Polygon (chainId 137) |
| **Contract** | `0x06436bf6E71964A99bD4078043aa4cDfA0eadEe6` |
| **Total Supply** | 1,000,000,000,000 (1 Trillion) |
| **Decimals** | 18 |
| **Type** | ERC-20 Utility Token |
| **DEX** | SushiSwap V2 |

### 6.2 Earning $RFLAG

Users earn $RFLAG through in-app actions that contribute to community safety:

| Action | Reward |
|---|---|
| Verify profile identity | +50 RFLAG |
| Report confirmed fake profile | +100 RFLAG |
| Match & chat for 7 consecutive days | +25 RFLAG |
| Use SafeRide feature | +10 RFLAG |
| Daily safety check-in | +5 RFLAG |

### 6.3 Spending $RFLAG

$RFLAG tokens are burned (permanently removed from circulation) when spent:

| Feature | Cost |
|---|---|
| Premium subscription (30 days) | 500 RFLAG |
| Boost dating profile | 50 RFLAG |
| Priority support | 100 RFLAG |

The burn mechanism creates **deflationary pressure** over time as the user base grows and tokens are spent.

---

## 7. Tokenomics

### 7.1 Supply Distribution

| Allocation | Amount | Percentage | Purpose |
|---|---|---|---|
| Community Rewards | 400,000,000,000 | 40% | Earned in-app by users |
| Team & Development | 300,000,000,000 | 30% | Project development, maintenance |
| Ecosystem & Partnerships | 200,000,000,000 | 20% | Integrations, exchange listings |
| Liquidity | 100,000,000,000 | 10% | DEX liquidity pools |
| **Total** | **1,000,000,000,000** | **100%** | |

### 7.2 Initial Liquidity

At launch:
- **~1,284 MATIC** paired with **~51B RFLAG** on SushiSwap V2
- LP tokens held by the project treasury
- No liquidity lock period required (community-governed)

### 7.3 Deflationary Mechanics

Every time a user spends $RFLAG for premium features, those tokens are **permanently burned**. As adoption grows, the circulating supply decreases while demand increases — creating natural upward price pressure.

### 7.4 No Presale

There was **no presale, no ICO, no VC allocation**. The token launched directly on SushiSwap with open market access for everyone equally.

---

## 8. Roadmap

### Q1 2026 — Foundation ✅
- [x] RedFlag App launched (PWA + Android + iOS)
- [x] $RFLAG token deployed on Polygon mainnet
- [x] SushiSwap liquidity pool created
- [x] DexScreener & GeckoTerminal indexed
- [x] Trust Wallet Assets PR submitted
- [x] IPFS decentralized hosting live (redflag.web3)
- [x] Gender verification system

### Q2 2026 — Growth
- [ ] CoinGecko listing
- [ ] CoinMarketCap listing
- [ ] Token reward system fully activated in-app
- [ ] $RFLAG spend features live (premium, boost, support)
- [ ] Android Play Store public release
- [ ] iOS App Store submission

### Q3 2026 — Expansion
- [ ] Multi-language support (Spanish, Portuguese, French)
- [ ] Additional DEX listings (QuickSwap, Uniswap V3)
- [ ] DAO governance for community reports
- [ ] NFT-based verified identity badges
- [ ] API for third-party dating app integrations

### Q4 2026 — Scale
- [ ] 100,000 registered users target
- [ ] SafeRide partnerships with ride-sharing companies
- [ ] Cross-chain bridge (Ethereum, BNB Chain)
- [ ] Enterprise API for background check services
- [ ] Series A fundraising round

---

## 9. Team

RedFlag was built by an independent development team passionate about online safety and Web3 technology. The project is community-driven with open-source smart contracts.

- **Smart Contract**: Verified on Polygonscan
- **Frontend**: Open source (GitHub)
- **Backend**: Deployed on Render with 99.9% uptime SLA

---

## 10. Legal Disclaimer

$RFLAG is a **utility token** — it is not a security, investment contract, or financial instrument. It is designed exclusively for use within the RedFlag platform ecosystem.

Purchasing, holding, or trading $RFLAG does not represent an investment in the RedFlag company or entitle holders to equity, dividends, or profit sharing. The value of $RFLAG is determined solely by market forces and platform utility.

Cryptocurrency investments carry significant risk including the potential loss of all invested capital. This whitepaper is for informational purposes only and does not constitute financial advice.

Users are responsible for complying with all applicable laws and regulations in their jurisdiction.

---

## Appendix

### Smart Contract Addresses

| Contract | Address | Network |
|---|---|---|
| $RFLAG Token | `0x06436bf6E71964A99bD4078043aa4cDfA0eadEe6` | Polygon |
| SushiSwap LP Pair | `0x594808dE92386dd407A12C4c021b40e8D24E5E54` | Polygon |
| LP TimeLock (2 years) | `0x3D357741F340C745B0FFe6C4DC25FC42c0CeA1A5` | Polygon |

### Security Locks (Anti-Rug)

| Action | Status | Proof |
|---|---|---|
| Contract Ownership Renounced | ✅ Done (2026-03-23) | [Polygonscan](https://polygonscan.com/tx/0x270309e42241b37d94285dc0c21df6c4df918281c8d3efae2c704a71259f65cb) |
| Liquidity Locked 2 Years | ✅ Done (until 2028-03-23) | [TimeLock Contract](https://polygonscan.com/address/0x3D357741F340C745B0FFe6C4DC25FC42c0CeA1A5) |
| Smart Contract Audited Source | ✅ Verified on Sourcify | [View Source](https://repo.sourcify.dev/contracts/full_match/137/0x3D357741F340C745B0FFe6C4DC25FC42c0CeA1A5/) |

**What this means:**
- **No new tokens can ever be minted** — the owner was renounced, permanently removing all admin control
- **Liquidity cannot be removed until 2028-03-23** — all 8.1M SLP tokens are locked in a verified smart contract
- **The TimeLock source code is public** — anyone can verify there are no backdoors

### Links

| Resource | URL |
|---|---|
| App | https://redflag-source.onrender.com |
| IPFS (Web3) | redflag.web3 |
| Token Explorer | https://polygonscan.com/token/0x06436bf6E71964A99bD4078043aa4cDfA0eadEe6 |
| Chart | https://dexscreener.com/polygon/0x594808de92386dd407a12c4c021b40e8d24e5e54 |
| Buy | https://app.sushi.com/swap?inputCurrency=MATIC&outputCurrency=0x06436bf6E71964A99bD4078043aa4cDfA0eadEe6&chainId=137 |
| GitHub | https://github.com/franklin0000/redflag-source |

---

*© 2026 RedFlag App. All rights reserved.*
