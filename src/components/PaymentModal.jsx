import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usersApi } from '../services/api';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { resolveUDDomain } from '../services/udResolve';

const UD_DOMAIN = 'redflag.web3';
const FALLBACK_ADDRESS = import.meta.env.VITE_DONATION_ADDRESS || "0xFE301CEa21E1f95dB1B3530eF0539DdBeF84F261";

// eslint-disable-next-line no-unused-vars
export default function PaymentModal({ featureName, onClose }) {
    const { user } = useAuth();
    const toast = useToast();
    const { isConnected } = useAccount();
    const [selectedAmount, setSelectedAmount] = useState(5);
    const [isProcessing, setIsProcessing] = useState(false);
    const [txStatus, setTxStatus] = useState(null); // null | 'pending' | 'confirming' | 'confirmed'

    // Resolve redflag.web3 → Polygon wallet address at runtime
    const [DONATION_ADDRESS, setDonationAddress] = useState(FALLBACK_ADDRESS);
    const [resolving, setResolving] = useState(true);

    useEffect(() => {
        resolveUDDomain(UD_DOMAIN).then(addr => {
            if (addr) setDonationAddress(addr);
        }).finally(() => setResolving(false));
    }, []);

    const donationOptions = [
        { id: 'coffee', name: 'Buy us a Coffee', price: '5 MATIC', value: 5 },
        { id: 'lunch', name: 'Buy us Lunch', price: '15 MATIC', value: 15, popular: true },
        { id: 'love', name: 'Show Some Love', price: '50 MATIC', value: 50 }
    ];

    // Wagmi: send native MATIC transfer
    const {
        sendTransaction,
        data: txHash,
        isPending: isSending,
        error: sendError,
        reset: resetTx,
    } = useSendTransaction();

    // Wagmi: wait for confirmation
    const {
        isLoading: isConfirming,
        isSuccess: isConfirmed,
    } = useWaitForTransactionReceipt({ hash: txHash });

    // Update UI when TX is broadcast
    useEffect(() => {
        if (txHash) setTxStatus('confirming');
    }, [txHash]);

    // On confirmation: save to DB and show success
    useEffect(() => {
        if (!isConfirmed || !txHash) return;
        setTxStatus('confirmed');

        usersApi.updateMe({ is_paid: true, is_verified_web3: true })
            .catch(err => console.error('Update failed:', err));

        toast.success("Donation confirmed on Polygon! Thank you 💖");
        setTimeout(onClose, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConfirmed]);

    // On wallet rejection or error
    useEffect(() => {
        if (!sendError) return;
        toast.error(sendError.shortMessage || "Transaction rejected.");
        setIsProcessing(false);
        setTxStatus(null);
        resetTx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sendError]);

    const handleDonation = () => {
        if (!isConnected) {
            toast.error("Please connect your wallet first!");
            return;
        }
        setIsProcessing(true);
        setTxStatus('pending');
        sendTransaction({
            to: DONATION_ADDRESS,
            value: parseEther(String(selectedAmount)),
        });
    };

    const polygonscanUrl = txHash
        ? `https://polygonscan.com/tx/${txHash}`
        : null;

    const buttonLabel = () => {
        if (txStatus === 'pending' || isSending) return 'Waiting for wallet...';
        if (txStatus === 'confirming' || isConfirming) return 'Confirming on Polygon...';
        if (txStatus === 'confirmed') return 'Confirmed! ✓';
        return `DONATE ${selectedAmount} MATIC`;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-[#1a202c] w-full max-w-md rounded-3xl overflow-hidden border border-pink-500/30 shadow-[0_0_50px_rgba(236,72,153,0.2)]">

                {/* Header */}
                <div className="bg-gradient-to-r from-pink-900 to-purple-900 p-6 text-center relative overflow-hidden">
                    {!isProcessing && (
                        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
                            <span className="material-icons">close</span>
                        </button>
                    )}
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm border border-white/20">
                        <span className="material-icons text-3xl text-pink-400">volunteer_activism</span>
                    </div>
                    <h2 className="text-2xl font-black text-white italic tracking-wider">SUPPORT REDFLAG</h2>
                    <p className="text-pink-200 text-sm mt-1">Keep the platform free & safe for everyone</p>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Donation Options */}
                    <div className="space-y-3">
                        {donationOptions.map(option => (
                            <div
                                key={option.id}
                                onClick={() => !isProcessing && setSelectedAmount(option.value)}
                                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedAmount === option.value
                                    ? 'border-pink-500 bg-pink-500/10'
                                    : 'border-white/5 bg-white/5 hover:bg-white/10'} ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
                            >
                                {option.popular && (
                                    <span className="absolute -top-3 right-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shadow-lg">
                                        Most Common
                                    </span>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className={`font-bold ${selectedAmount === option.value ? 'text-white' : 'text-gray-400'}`}>{option.name}</span>
                                    <span className="text-pink-400 font-mono font-bold">{option.price}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="text-center">
                        <p className="text-xs text-gray-500 mb-1">Donations go to:</p>
                        <div className="inline-flex flex-col items-center gap-0.5">
                            {resolving ? (
                                <span className="text-xs text-gray-500 animate-pulse">Resolving redflag.web3...</span>
                            ) : (
                                <>
                                    <span className="text-sm font-bold text-purple-400">{UD_DOMAIN}</span>
                                    <span className="font-mono text-gray-500 text-[10px] break-all">
                                        {DONATION_ADDRESS.slice(0, 8)}...{DONATION_ADDRESS.slice(-6)}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* TX Status */}
                    {txHash && (
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                            <p className="text-xs text-gray-400 mb-1">Transaction Hash</p>
                            <a
                                href={polygonscanUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-[10px] text-pink-400 hover:underline break-all"
                            >
                                {txHash}
                            </a>
                            {isConfirming && (
                                <p className="text-xs text-yellow-400 mt-1 animate-pulse">Waiting for block confirmation...</p>
                            )}
                            {isConfirmed && (
                                <p className="text-xs text-green-400 mt-1">✓ Confirmed on Polygon!</p>
                            )}
                        </div>
                    )}

                    {/* Action */}
                    <div className="pt-2 space-y-3">
                        {!isConnected ? (
                            <div className="flex justify-center">
                                <ConnectKitButton theme="midnight" />
                            </div>
                        ) : (
                            <button
                                onClick={handleDonation}
                                disabled={isProcessing || isSending || isConfirming || isConfirmed}
                                className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-pink-600/30 transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {(isProcessing || isSending || isConfirming) && (
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                )}
                                {buttonLabel()}
                            </button>
                        )}
                        <p className="text-center text-[10px] text-gray-500">
                            Real transaction on Polygon Blockchain
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
