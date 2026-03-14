import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { reportsApi, uploadFile } from '../services/api';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { toHex } from 'viem';

export default function ReportUser({ targetUser, onClose }) {
    const { user } = useAuth();
    const toast = useToast();
    const { isConnected } = useAccount();
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');
    const [evidence, setEvidence] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [step, setStep] = useState('form'); // 'form'|'uploading'|'signing'|'confirming'|'done'

    // Registry address — on-chain anchor target
    const REGISTRY_ADDRESS = import.meta.env.VITE_DONATION_ADDRESS || "0xFE301CEa21E1f95dB1B3530eF0539DdBeF84F261";

    // Store pending data to save after TX confirms
    const pendingRef = useRef(null);

    const reportReasons = [
        "Fake Profile / Catfish",
        "Harassment / Bullying",
        "Scam / Fraud",
        "Inappropriate Content",
        "Ghosting (Chronic)",
        "Other"
    ];

    // Wagmi: send native token tx with report hash in calldata
    const {
        sendTransaction,
        data: txHash,
        isPending: isSending,
        error: sendError,
        reset: resetTx,
    } = useSendTransaction();

    // Wagmi: wait for block confirmation
    const {
        isLoading: isConfirming,
        isSuccess: isConfirmed,
    } = useWaitForTransactionReceipt({ hash: txHash });

    useEffect(() => {
        if (txHash) setStep('confirming');
    }, [txHash]);

    // TX confirmed: save to DB with real txHash
    useEffect(() => {
        if (!isConfirmed || !pendingRef.current) return;
        const { evidenceUrl, metadataHash } = pendingRef.current;
        reportsApi.createReport({
            reported_id: targetUser.id,
            reason,
            description,
            evidence_url: evidenceUrl,
            ipfs_hash: metadataHash,
            tx_hash: txHash,
            status: 'confirmed',
        }).catch(err => console.error('Report save failed:', err));
        setStep('done');
        toast.success("Red Flag anchored on Polygon! 🛡️");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConfirmed]);

    // Wallet rejected: save off-chain anyway
    useEffect(() => {
        if (!sendError) return;
        if (pendingRef.current) {
            const { evidenceUrl, metadataHash } = pendingRef.current;
            reportsApi.createReport({
                reported_id: targetUser.id,
                reason,
                description,
                evidence_url: evidenceUrl,
                ipfs_hash: metadataHash,
                tx_hash: null,
                status: 'pending',
            }).catch(err => console.error('Report save failed:', err));
            toast.warning("Wallet rejected — report saved off-chain.");
            setStep('done');
        } else {
            toast.error(sendError.shortMessage || "Wallet error.");
            setStep('form');
            setIsSubmitting(false);
        }
        resetTx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sendError]);

    const handleEvidenceUpload = (e) => {
        if (e.target.files && e.target.files[0]) setEvidence(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason || !description) {
            toast.error("Please provide a reason and description.");
            return;
        }
        setIsSubmitting(true);
        setStep('uploading');
        try {
            // 1. Upload evidence to Express backend
            let evidenceUrl = "";
            if (evidence) {
                evidenceUrl = await uploadFile(evidence, 'evidence') || "";
            }

            // 2. Generate a metadata hash for on-chain anchoring (simplified)
            const metadataHash = `rf-${Date.now()}-${targetUser.id}`;
            pendingRef.current = { evidenceUrl, metadataHash };

            // 3a. Wallet connected: anchor on-chain
            if (isConnected) {
                setStep('signing');
                sendTransaction({
                    to: REGISTRY_ADDRESS,
                    value: BigInt(1_000_000_000_000_000), // 0.001 MATIC
                    data: toHex(`redflag:${metadataHash}`),
                });
            } else {
                // 3b. No wallet: save off-chain only
                await reportsApi.createReport({
                    reported_id: targetUser.id,
                    reason,
                    description,
                    evidence_url: evidenceUrl,
                    ipfs_hash: metadataHash,
                    tx_hash: null,
                    status: 'pending',
                });
                setStep('done');
                toast.success("Report submitted!");
            }
        } catch (error) {
            console.error("Report failed:", error);
            toast.error("Failed to submit report.");
            setStep('form');
            setIsSubmitting(false);
        }
    };

    const polygonscanUrl = txHash ? `https://polygonscan.com/tx/${txHash}` : null;

    if (step === 'done') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-[#1a202c] w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden p-8 text-center">
                    <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-icons text-green-400 text-4xl">verified</span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Report Submitted</h2>
                    {txHash ? (
                        <>
                            <p className="text-sm text-gray-400 mb-3">Anchored on Polygon Blockchain</p>
                            <a
                                href={polygonscanUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-purple-400 hover:underline"
                            >
                                <span className="material-icons text-sm">open_in_new</span>
                                View on Polygonscan
                            </a>
                        </>
                    ) : (
                        <p className="text-sm text-gray-400 mb-3">Saved to database. Connect a wallet next time to anchor on-chain.</p>
                    )}
                    <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-[#1a202c] w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-red-50 dark:bg-red-900/10">
                    <h2 className="text-lg font-bold text-red-600 flex items-center gap-2">
                        <span className="material-icons">report_problem</span>
                        Report User
                    </h2>
                    {!isSubmitting && (
                        <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                            <span className="material-icons text-gray-500">close</span>
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        File a report against <span className="font-bold">{targetUser.name || 'this user'}</span>.{' '}
                        {isConnected
                            ? 'The report will be anchored on Polygon for permanence.'
                            : 'Connect wallet to also anchor on-chain.'}
                    </p>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reason</label>
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={isSubmitting}
                            className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 disabled:opacity-50"
                        >
                            <option value="">Select a reason</option>
                            {reportReasons.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Provide details about the incident..."
                            rows={3}
                            disabled={isSubmitting}
                            className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 resize-none disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Evidence (Optional)</label>
                        <div className="relative">
                            <input
                                type="file"
                                onChange={handleEvidenceUpload}
                                disabled={isSubmitting}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <div className="w-full bg-gray-50 dark:bg-black/20 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm flex items-center justify-center gap-2 text-gray-500 hover:border-red-500 transition-colors">
                                <span className="material-icons text-base">attach_file</span>
                                {evidence ? evidence.name : "Upload Screenshots / Proof"}
                            </div>
                        </div>
                    </div>

                    {/* Step progress */}
                    {isSubmitting && (
                        <div className="bg-black/10 dark:bg-white/5 rounded-xl p-3 space-y-1.5">
                            {[
                                { key: 'uploading', label: 'Uploading evidence...' },
                                { key: 'signing', label: 'Sign in wallet (0.001 MATIC)' },
                                { key: 'confirming', label: 'Confirming on Polygon...' },
                            ].map(({ key, label }, i) => {
                                const steps = ['uploading', 'signing', 'confirming'];
                                const ci = steps.indexOf(step);
                                const done = i < ci;
                                const active = key === step;
                                return (
                                    <div key={key} className={`flex items-center gap-2 text-xs transition-colors ${done ? 'text-green-400' : active ? 'text-white animate-pulse' : 'text-gray-600'}`}>
                                        <span className="material-icons text-sm">{done ? 'check_circle' : active ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
                                        {label}
                                    </div>
                                );
                            })}
                            {txHash && (
                                <a href={polygonscanUrl} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-purple-400 hover:underline font-mono truncate mt-1">
                                    TX: {txHash}
                                </a>
                            )}
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isSubmitting || isSending || isConfirming}
                            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    {step === 'uploading' ? 'Uploading...' : step === 'signing' ? 'Check Wallet...' : 'Confirming...'}
                                </>
                            ) : (
                                <>
                                    <span className="material-icons">gavel</span>
                                    {isConnected ? 'SUBMIT & ANCHOR ON-CHAIN' : 'SUBMIT REPORT'}
                                </>
                            )}
                        </button>
                        <p className="text-center text-[10px] text-gray-400 mt-2">
                            {isConnected ? 'Cost: 0.001 MATIC • Anchored on Polygon' : 'Connect wallet for on-chain anchoring'}
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
