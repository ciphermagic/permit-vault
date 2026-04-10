'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { foundry, sepolia } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import type { AppKitNetwork } from '@reown/appkit/networks';

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID!;

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [foundry, sepolia];

const wagmiAdapter = new WagmiAdapter({ networks, projectId });

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  themeMode: 'dark',
  features: { analytics: false },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}