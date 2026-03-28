
import React from 'react';
import { WagmiProvider, createConfig } from 'wagmi';
import { polygon, mainnet } from 'wagmi/chains';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const chains = [polygon, mainnet];

const config = createConfig(
    getDefaultConfig({
        // Required API Keys
        alchemyId: import.meta.env.VITE_ALCHEMY_ID, // or infuraId
        walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,

        // Required
        appName: "RedFlag Dating",
        appDescription: "Secure Dating on Blockchain",
        appUrl: "https://redflag-source.onrender.com",
        appIcon: "https://redflag-source.onrender.com/vite.svg",
        chains,
    }),
);

const queryClient = new QueryClient();

export const Web3Provider = ({ children }) => {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <ConnectKitProvider
                    mode="dark"
                    customTheme={{
                        "--ck-font-family": "Inter, sans-serif",
                        "--ck-border-radius": "16px",
                        "--ck-overlay-backdrop-filter": "blur(10px)",
                        "--ck-primary-button-background": "linear-gradient(to right, #9333ea, #db2777)",
                        "--ck-primary-button-hover-background": "linear-gradient(to right, #7e22ce, #be185d)",
                    }}
                >
                    {children}
                </ConnectKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
};
