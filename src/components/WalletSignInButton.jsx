import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useModal } from 'connectkit';
import { authApi, setToken } from '../services/api';

const SIGN_TIMEOUT_MS = 60_000;

function withTimeout(promise, ms, msg) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
    ]);
}

function friendlyError(err) {
    const code = err?.code;
    const msg = (err?.message || '').toLowerCase();
    if (code === 4001 || msg.includes('reject') || msg.includes('denied') || msg.includes('user rejected')) {
        return 'Cancelled — please approve the signature request in your wallet.';
    }
    if (msg.includes('rate limit') || msg.includes('too many')) {
        return 'Too many attempts. Please wait a few minutes and try again.';
    }
    if (msg === 'wallet timed out.') {
        return 'Wallet did not respond. Open your wallet app and try again.';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
        return 'Request timed out. Please try again.';
    }
    return err?.message || 'Sign-in failed. Please try again.';
}

export default function WalletSignInButton({ onSuccess, onError, label = 'Sign in with Wallet' }) {
    const { address, isConnected, chainId, connector } = useAccount();
    const { mutateAsync: wagmiSign } = useSignMessage();
    const { setOpen } = useModal();
    const [pending, setPending] = useState(false);
    const [step, setStep] = useState(0); // 0=idle, 1=connect, 2=sign, 3=auth

    const awaitingRef = useRef(false);
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);
    useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
    useEffect(() => { onErrorRef.current = onError; }, [onError]);

    const runSignFlow = useCallback(async (addr) => {
        setPending(true);
        setStep(2);
        try {
            // 1. Request wallet signature (proof of ownership)
            const message = `Sign in to RedFlag Dating App.\nWallet Address: ${addr}\n\nDo not share this signature, it acts as your secure password.`;
            await withTimeout(
                wagmiSign({ message }),
                SIGN_TIMEOUT_MS,
                'Wallet timed out.'
            );

            setStep(3);

            // 2. Authenticate with Express backend using wallet address
            const data = await authApi.walletLogin(addr);
            if (data?.token) {
                setToken(data.token);
                if (data.refresh_token) localStorage.setItem('rf_refresh', data.refresh_token);
            }

            onSuccessRef.current?.(data);
        } catch (err) {
            console.error('[WalletSignIn] Error:', {
                message: err?.message,
                name: err?.name,
                code: err?.code,
            });
            onErrorRef.current?.(friendlyError(err));
        } finally {
            setPending(false);
            setStep(0);
        }
    }, [wagmiSign]);

    // After wallet connects via ConnectKit modal, auto-trigger sign-in
    useEffect(() => {
        if (!isConnected || !awaitingRef.current || !address) return;
        awaitingRef.current = false;
        runSignFlow(address);
    }, [isConnected, address, chainId, connector, runSignFlow]);

    const handleClick = async () => {
        if (pending) return;
        if (!isConnected) {
            awaitingRef.current = true;
            setStep(1);
            setOpen(true);
            return;
        }
        await runSignFlow(address);
    };

    const stepLabels = [
        '',
        'Select your wallet...',
        'Check your wallet — approve the signature request...',
        'Authenticating...',
    ];

    return (
        <div className="w-full space-y-2">
            <button
                onClick={handleClick}
                disabled={pending}
                type="button"
                className="w-full flex justify-center items-center gap-3 px-4 py-3 border border-purple-500/50 text-sm font-medium rounded-xl text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all disabled:opacity-60"
            >
                {pending ? (
                    <>
                        <span className="material-icons animate-spin text-sm">refresh</span>
                        {stepLabels[step] || 'Processing...'}
                    </>
                ) : (
                    <>
                        <svg viewBox="0 0 784.37 1277.39" className="h-5 w-5 flex-shrink-0" fill="currentColor">
                            <polygon fillOpacity="0.9" points="392.07,0 383.5,29.11 383.5,873.74 392.07,882.29 784.13,650.54" />
                            <polygon fillOpacity="0.7" points="392.07,0 0,650.54 392.07,882.29 392.07,472.33" />
                            <polygon fillOpacity="0.6" points="392.07,956.52 387.24,962.41 387.24,1263.28 392.07,1277.38 784.37,724.89" />
                            <polygon fillOpacity="0.45" points="392.07,1277.38 392.07,956.52 0,724.89" />
                            <polygon fillOpacity="0.8" points="392.07,882.29 784.13,650.54 392.07,472.33" />
                            <polygon fillOpacity="0.5" points="0,650.54 392.07,882.29 392.07,472.33" />
                        </svg>
                        {label}
                    </>
                )}
            </button>
            {step > 0 && stepLabels[step] && (
                <p className="text-xs text-center text-purple-300 animate-pulse">{stepLabels[step]}</p>
            )}
        </div>
    );
}
