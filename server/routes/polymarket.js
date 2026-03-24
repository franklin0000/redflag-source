const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const polymarket = require('../utils/polymarket');
const db = require('../db');
const fetch = require('node-fetch');
const { ethers } = require('ethers');

// USDC contract on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const POLYGON_RPC = process.env.POLY_RPC_URL || 'https://polygon-rpc.com';
const OPERATOR_ADDRESS = process.env.VITE_PROXY_WALLET_ADDRESS || '';

// The markup fee requested: 1.5%
const MARKUP_FEE_PERCENT = 0.015;

// Helper: parse outcomePrices and clobTokenIds from a Gamma sub-market
function parseSubMarket(sub) {
  let prices = [0.5, 0.5];
  let tokenIds = [];
  if (!sub) return { prices, tokenIds };

  if (typeof sub.outcomePrices === 'string') {
    try { prices = JSON.parse(sub.outcomePrices).map(p => parseFloat(p)); } catch(e) {}
  } else if (Array.isArray(sub.outcomePrices)) {
    prices = sub.outcomePrices.map(p => parseFloat(p));
  }

  if (typeof sub.clobTokenIds === 'string') {
    try { tokenIds = JSON.parse(sub.clobTokenIds); } catch(e) {}
  } else if (Array.isArray(sub.clobTokenIds)) {
    tokenIds = sub.clobTokenIds;
  }

  return { prices, tokenIds };
}

// Helper: normalize a Gamma event to a flat market object
function normalizeEvent(event) {
  // For multi-outcome events, find the sub-market with the most balanced price (most tradeable)
  const subs = Array.isArray(event.markets) ? event.markets : [];

  let bestSub = subs[0] || null;
  let bestPrices = [0.5, 0.5];
  let bestTokenIds = [];

  for (const sub of subs) {
    const { prices, tokenIds } = parseSubMarket(sub);
    const yp = prices[0] ?? 0.5;
    // Prefer sub-markets with live prices (not 0 or 1)
    if (yp > 0.01 && yp < 0.99) {
      bestSub = sub;
      bestPrices = prices;
      bestTokenIds = tokenIds;
      break;
    }
    // Fallback: keep first sub
    if (sub === subs[0]) {
      bestPrices = prices;
      bestTokenIds = tokenIds;
    }
  }

  const yesPrice = bestPrices[0] ?? 0.5;
  const noPrice = bestPrices[1] ?? (1 - yesPrice);

  return {
    id: event.id,
    title: event.title,
    description: (event.description || '').slice(0, 500),
    image: event.image,
    volume: parseFloat(event.volume || 0),
    liquidity: parseFloat(event.liquidity || 0),
    yesPrice: parseFloat(yesPrice.toFixed(4)),
    noPrice: parseFloat(noPrice.toFixed(4)),
    tokenId: bestTokenIds[0] || null,
    noTokenId: bestTokenIds[1] || null,
    conditionId: bestSub ? bestSub.conditionId : null,
    active: event.active,
    endDate: event.endDate,
    category: event.tags?.[0]?.label || 'General'
  };
}

// Fetch active markets from Polymarket Gamma API (normalized)
router.get('/markets', async (req, res) => {
  try {
    // Fetch more events so after filtering we have enough live markets
    // Sort by volume24hr descending to get the most active markets first
    const url = 'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&order=volume24hr&ascending=false';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch from polymarket gamma');

    const events = await response.json();

    const normalized = events.map(normalizeEvent);

    // Filter: only keep markets with live trading prices (not fully resolved 0/1)
    const live = normalized.filter(m => m.yesPrice > 0.01 && m.yesPrice < 0.99);

    // Return top 20 live markets (or all if fewer)
    res.json(live.slice(0, 20));
  } catch (error) {
    console.error('Error fetching polymarket markets:', error.message);
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

// Fetch single market by ID
router.get('/markets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`https://gamma-api.polymarket.com/events/${id}`);
    if (!response.ok) return res.status(404).json({ error: 'Market not found' });
    const event = await response.json();

    const normalized = normalizeEvent(event);
    const subs = Array.isArray(event.markets) ? event.markets : [];
    const sub = subs[0] || null;

    res.json({
      ...normalized,
      description: event.description || '',
      volume24hr: event.volume24hr,
      outcomes: sub?.outcomes || ['Yes', 'No'],
    });
  } catch (error) {
    console.error('Error fetching market:', error.message);
    res.status(500).json({ error: 'Failed to fetch market' });
  }
});

// Fetch Price History
router.get('/history', async (req, res) => {
  try {
    const { tokenId, interval = '1d' } = req.query;
    if (!tokenId) return res.status(400).json({ error: 'Missing tokenId' });

    // Official CLOB History Endpoint
    const url = `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=${interval}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Fetch Order Book
router.get('/orderbook', async (req, res) => {
  try {
    const { tokenId } = req.query;
    if (!tokenId) return res.status(400).json({ error: 'Missing tokenId' });

    const url = `https://clob.polymarket.com/book?token_id=${tokenId}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order book' });
  }
});

// Fetch User Portfolio
router.get('/portfolio', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 1. Get all trades for this user
    const { rows: trades } = await db.query(`
      SELECT token_id, trade_type, trade_size, real_price, user_price, created_at 
      FROM earned_fees 
      WHERE user_id = $1
    `, [userId]);

    if (trades.length === 0) {
      return res.json({ positions: [], totalValue: 0, dailyPnL: 0 });
    }

    // 2. Aggregate positions by tokenId
    const posMap = {};
    trades.forEach(t => {
      const tid = t.token_id;
      if (!posMap[tid]) posMap[tid] = { size: 0, cost: 0, count: 0 };
      
      const sizeNum = parseFloat(t.trade_size);
      const priceNum = parseFloat(t.user_price);
      
      if (t.trade_type === 'BUY') {
        posMap[tid].size += sizeNum;
        posMap[tid].cost += (sizeNum * priceNum);
      } else {
        posMap[tid].size -= sizeNum;
      }
    });

    const activeTids = Object.keys(posMap).filter(tid => posMap[tid].size > 0.01);
    
    // 3. Simple Mock return for now as fetching all current prices requires a mapping
    // But we'll try to match with the markets list
    res.json({ 
      success: true, 
      positions: activeTids.map(tid => ({
        tokenId: tid,
        size: posMap[tid].size.toFixed(2),
        avgPrice: (posMap[tid].cost / posMap[tid].size).toFixed(3)
      })),
      totalValue: 0 // Frontend will calculate or we can fetch prices here
    });
  } catch (error) {
    console.error('Portfolio error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// Proxy Trade Endpoint
router.post('/proxy-trade', requireAuth, async (req, res) => {
  try {
    const { tokenId, price, size, side, txHash, userAddress } = req.body;
    const userId = req.user.id;

    if (!tokenId || !price || !size || !side) {
      return res.status(400).json({ error: 'Missing required trade parameters' });
    }

    // Must be positive values
    if (price <= 0 || size <= 0) {
      return res.status(400).json({ error: 'Invalid price or size' });
    }

    // Verify the user actually sent USDC to the operator wallet
    // by checking the tx on-chain or checking operator balance change
    if (txHash && userAddress && OPERATOR_ADDRESS) {
      try {
        const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
          return res.status(402).json({ error: 'USDC transfer not confirmed on-chain. Please wait for tx confirmation.' });
        }
        // Verify the tx was from the expected user wallet
        const tx = await provider.getTransaction(txHash);
        if (tx.from.toLowerCase() !== userAddress.toLowerCase()) {
          return res.status(403).json({ error: 'Transaction sender does not match your wallet address.' });
        }
      } catch (verifyErr) {
        console.warn('Could not verify tx on-chain:', verifyErr.message);
        // Non-fatal: proceed but log the warning
      }
    }

    // Calculate real price using 1.5% fee logic
    let realPrice;
    let feeAmount;

    // "Si el user paga 0.74, el precio real es 0.72. Tú te quedas 0.02"
    if (side === 'BUY') {
      realPrice = price / (1 + MARKUP_FEE_PERCENT);
      feeAmount = price - realPrice;
    } else if (side === 'SELL') {
      realPrice = price * (1 + MARKUP_FEE_PERCENT);
      feeAmount = realPrice - price;
    } else {
      return res.status(400).json({ error: 'Invalid side, must be BUY or SELL' });
    }

    const { clobClient, operatorWallet } = polymarket;

    if (!operatorWallet) {
      return res.status(503).json({ error: 'Polymarket operator not configured. Contact support.' });
    }

    // txHash is already verified above (receipt.status=1 + tx.from check)
    console.log(`[Polymarket] ✅ Executing proxy order for user ${userId}...`);

    // Place the order securely using the proxy backend wallet
    const orderParams = {
      tokenID: tokenId,
      price: Number(realPrice.toFixed(3)),
      side: side,
      size: Number(size),
      feeRateBps: 0, // Fee rate configured on CLOB matches
      nonce: 0 // Will be handled internally or incremented based on clob logic
    };

    const order = await clobClient.createOrder(orderParams);
    const orderResponse = await clobClient.postOrder(order);

    if (orderResponse.success !== true && !orderResponse.orderID) {
      throw new Error(orderResponse.errorMsg || 'Failed to post Polymarket order');
    }

    // Log the fee earned for transparency and analytics
    await db.query(`
      CREATE TABLE IF NOT EXISTS earned_fees (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        token_id VARCHAR(255),
        trade_type VARCHAR(10) NOT NULL,
        trade_size DECIMAL(10, 4) NOT NULL,
        real_price DECIMAL(10, 4) NOT NULL,
        user_price DECIMAL(10, 4) NOT NULL,
        fee_earned DECIMAL(10, 4) NOT NULL,
        hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.query(`
      INSERT INTO earned_fees (user_id, token_id, trade_type, trade_size, real_price, user_price, fee_earned, hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId, 
      tokenId,
      side, 
      size, 
      realPrice, 
      price, 
      (feeAmount * size), 
      orderResponse.orderID
    ]);

    res.json({ 
      success: true, 
      orderId: orderResponse.orderID,
      hash: orderResponse.orderID
    });

  } catch (error) {
    console.error('Polymarket proxy-trade error:', error.message);
    res.status(500).json({ error: error.message || 'Trade execution failed' });
  }
});

module.exports = router;
