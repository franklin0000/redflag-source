import React, { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';

// IMPORTANTE: Sustituir por la dirección del RedFlagSwapProxy cuando se despliegue en Polygon
const PROXY_CONTRACT_ADDRESS = import.meta.env.VITE_SWAP_PROXY_ADDRESS || '0x0000000000000000000000000000000000000000';

const PROXY_ABI = [
  {
    "type": "function",
    "name": "buyRFLAG",
    "inputs": [{ "name": "amountOutMin", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "payable"
  }
];

export default function SwapRflagWidget() {
  const { address } = useAccount();
  const [maticAmount, setMaticAmount] = useState('');
  
  const { writeContract, data: txHash, error, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleSwap = () => {
    if (!maticAmount || isNaN(maticAmount)) return;
    
    // Al llamar a buyRFLAG se transfiere el MATIC. 
    // El proxy tomará su % de comisión y usará el resto en SushiSwap para comprar $RFLAG.
    // Usamos amountOutMin = 0 por simplicidad (Slippage ilimitado). En prod usar oráculo para calcular min.
    writeContract({
      address: PROXY_CONTRACT_ADDRESS,
      abi: PROXY_ABI,
      functionName: 'buyRFLAG',
      args: [0], // amountOutMin
      value: parseEther(maticAmount), // MATIC a gastar
    });
  };

  return (
    <div className="bg-[#1a0c17] border border-[#d411b4]/30 rounded-2xl p-5 mt-4">
      <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2">
        <span>🔄</span> Compra Nátiva $RFLAG
      </h3>
      <p className="text-white/50 text-xs mb-4">
        Intercambia tus MATIC por $RFLAG directamente dentro de la app instantáneamente.
      </p>

      <div className="bg-black/30 rounded-xl p-3 border border-white/10 mb-4 focus-within:border-[#d411b4]/50 transition-colors">
        <label className="block text-white/40 text-[10px] font-bold uppercase tracking-wider mb-1">
          Pagas (MATIC)
        </label>
        <div className="flex items-center gap-2">
          <input 
            type="number" 
            value={maticAmount}
            onChange={(e) => setMaticAmount(e.target.value)}
            placeholder="0.0" 
            className="flex-1 bg-transparent text-white text-2xl font-black outline-none w-full"
          />
          <div className="bg-[#8247e5]/20 text-[#8247e5] font-bold px-3 py-1 rounded-lg text-sm">
            MATIC
          </div>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-3 bg-red-400/10 p-2 rounded break-all">
          Error: {error.shortMessage || error.message}
        </p>
      )}

      {isSuccess && (
        <p className="text-green-400 text-xs mb-3 bg-green-400/10 p-2 rounded">
          ¡Compra Exitosa! Los $RFLAG están en tu wallet.
        </p>
      )}

      <button
        onClick={handleSwap}
        disabled={!address || !maticAmount || isPending || isConfirming}
        className={`w-full py-3.5 rounded-xl font-bold transition-all text-sm ${
          (!address || !maticAmount || isPending || isConfirming)
            ? 'bg-white/10 text-white/30 cursor-not-allowed'
            : 'bg-gradient-to-r from-[#d411b4] to-[#8247e5] text-white hover:scale-[0.98] shadow-lg shadow-[#d411b4]/20'
        }`}
      >
        {!address 
          ? 'Conecta tu Wallet para Comprar'
          : isPending
          ? 'Autorizando en Wallet...'
          : isConfirming
          ? 'Confirmando en Blockchain...'
          : 'Comprar $RFLAG Ahora'}
      </button>

      <p className="text-center text-[10px] text-white/30 mt-3 font-light">
        Powered by SushiSwap Routing. Se aplica una pequeña comisión de red.
      </p>
    </div>
  );
}
