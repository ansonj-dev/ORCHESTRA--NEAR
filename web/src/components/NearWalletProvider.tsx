'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type NearWalletContextValue = {
  near: any;
  connector: any;
  accountId: string;
  initializing: boolean;
  connecting: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const NearWalletContext = createContext<NearWalletContextValue>({
  near: null,
  connector: null,
  accountId: '',
  initializing: true,
  connecting: false,
  error: '',
  connect: async () => {},
  disconnect: async () => {},
});

export function useNearWallet() {
  return useContext(NearWalletContext);
}

export default function NearWalletProvider({ children }: { children: ReactNode }) {
  const [near, setNear] = useState<any>(null);
  const [connector, setConnector] = useState<any>(null);
  const [accountId, setAccountId] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let instance: any;

    (async () => {
      try {
        const [{ Near, fromHotConnect }, { NearConnector }] = await Promise.all([
          import('near-kit'),
          import('@hot-labs/near-connect'),
        ]);
        instance = new NearConnector({ network: 'testnet' });
        instance.on('wallet:signIn', (event: any) => {
          if (!active) return;
          const id = event?.accounts?.[0]?.accountId || event?.accountId || '';
          setAccountId(id);
          setNear(new Near({ network: 'testnet', wallet: fromHotConnect(instance) }));
          setError('');
          setConnecting(false);
        });
        instance.on('wallet:signOut', () => {
          if (!active) return;
          setAccountId('');
          setNear(new Near({ network: 'testnet' }));
          setConnecting(false);
        });

        let restoredAccountId = '';
        try {
          const wallet = await instance.wallet();
          const accounts = await wallet.getAccounts();
          restoredAccountId = accounts?.[0]?.accountId || '';
        } catch {
          // No saved wallet session. Public registry browsing remains available.
        }

        if (active) {
          setAccountId(restoredAccountId);
          setNear(restoredAccountId
            ? new Near({ network: 'testnet', wallet: fromHotConnect(instance) })
            : new Near({ network: 'testnet' }));
          setConnector(instance);
          setInitializing(false);
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Could not initialize the NEAR testnet wallet.');
          setInitializing(false);
        }
      }
    })();

    return () => { active = false; };
  }, []);

  const connect = useCallback(async () => {
    setError('');
    if (!connector) {
      setError('Wallet connection is still initializing. Try again in a moment.');
      return;
    }
    setConnecting(true);
    try {
      await connector.connect();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet connection was not completed.');
      setConnecting(false);
    }
  }, [connector]);

  const disconnect = useCallback(async () => {
    setError('');
    try {
      await connector?.disconnect();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect the NEAR wallet.');
    }
  }, [connector]);

  const value = useMemo(() => ({ near, connector, accountId, initializing, connecting, error, connect, disconnect }), [
    near, connector, accountId, initializing, connecting, error, connect, disconnect,
  ]);

  return <NearWalletContext.Provider value={value}>{children}</NearWalletContext.Provider>;
}
