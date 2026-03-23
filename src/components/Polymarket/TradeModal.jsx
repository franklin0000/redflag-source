import React, { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';

// The public address of our backend operator wallet that executes proxy trades
// We read this from the frontend environment variables so you can update it without changing code.
const PROXY_OPERATOR_WALLET = import.meta.env.VITE_PROXY_WALLET_ADDRESS || "0xYourBackendOperatorAddress";
// Standard USDC address on Polygon
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

export default function TradeModal({ market, yesPrice, noPrice, onClose }) {
  const { address } = useAccount();
  const [side, setSide] = useState('BUY'); // or SELL
  const [outcome, setOutcome] = useState('YES'); // YES or NO
  const [size, setSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hashResult, setHashResult] = useState(null);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const activePrice = outcome === 'YES' ? yesPrice : noPrice;
  const markupFee = 0.015; // 1.5% transparency
  const totalCost = side === 'BUY' ? size * activePrice : size * activePrice; // simpler logic

  const handleExecute = async () => {
    if (!address) {
      setError("Please connect your wallet first.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      // Step 1: Transfer USDC to backend proxy wallet
      const usdcAmount = parseUnits(totalCost.toFixed(6), 6);

      // writeContractAsync returns a tx hash after wallet confirms
      const txHash = await writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [PROXY_OPERATOR_WALLET, usdcAmount],
      });

      if (!txHash) throw new Error("USDC transfer was rejected or failed.");

      // Step 2: Call proxy API — pass txHash so server can verify on-chain
      const proxyUrl = import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api/polymarket/proxy-trade`
        : '/api/polymarket/proxy-trade';

      const token = localStorage.getItem('token');
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tokenId: market?.tokenId || "mock-token-id-1234",
          price: activePrice,
          size: size,
          side: side,
          txHash: txHash,
          userAddress: address
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Trade execution failed");
      }

      setHashResult(data.hash);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
        
        <h2 className="text-2xl font-bold text-white mb-1">Trade Market</h2>
        <p className="text-gray-400 text-sm mb-6 max-w-[90%] truncate leading-tight">
          {market?.title || "Will Taylor Swift & Travis Kelce engage in 2026?"}
        </p>

        <div className="flex gap-2 mb-6">
          <button 
            className={`flex-1 py-2 rounded-lg font-bold ${outcome === 'YES' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}
            onClick={() => setOutcome('YES')}
          >
            YES {Math.round(yesPrice * 100)}¢
          </button>
          <button 
            className={`flex-1 py-2 rounded-lg font-bold ${outcome === 'NO' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'}`}
            onClick={() => setOutcome('NO')}
          >
            NO {Math.round(noPrice * 100)}¢
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-gray-400 text-sm mb-2">Number of Shares (Size)</label>
          <input 
            type="number" 
            min="1"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full bg-gray-800 text-white rounded-lg p-3 outline-none focus:ring-2 focus:ring-pink-500 border border-gray-700" 
          />
        </div>

        <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-yellow-500/30">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Average Price</span>
            <span className="text-white">${activePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Est. Total Cost</span>
            <span className="text-white font-bold">${totalCost.toFixed(2)}</span>
          </div>
          <hr className="border-gray-700 my-2" />
          <div className="flex justify-between text-xs text-yellow-500/80">
            <span>Platform Proxy Fee (Included)</span>
            <span>1.5%</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            Trades are executed securely via our proxy node on the Polygon network. A 1.5% markup is applied to the market odds.
          </p>
        </div>

        {error && <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg mb-4">{error}</div>}
        {hashResult && (
          <div className="text-green-400 text-sm bg-green-900/20 p-3 rounded-lg mb-4 flex flex-col gap-1">
            <b>Trade Successful!</b>
            <span className="text-xs break-all">Hash: {hashResult}</span>
          </div>
        )}

        <button 
          onClick={handleExecute}
          disabled={loading || isPending || hashResult}
          className="w-full bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
        >
          {loading || isPending ? (
            <>Processing <span className="animate-spin text-xl">↻</span></>
          ) : hashResult ? 'Completed' : 'Approve & Execute Trade'}
        </button>
      </div>
    </div>
  );
}
