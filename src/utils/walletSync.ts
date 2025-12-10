type WalletSyncCallbacks = {
  setPlayerCredits: (credits: number) => void;
  setPendingCredits: (credits: number | null) => void;
  setIsWalletSyncing: (isSyncing: boolean) => void;
};

export type WalletSyncHandle = {
  applied: boolean;
  rollback: () => void;
};

type WalletSyncParams = WalletSyncCallbacks & {
  previousCredits: number;
  nextCredits: number;
};

/**
 * Applies an optimistic wallet update and returns a rollback handle so UI state can be restored
 * if the server rejects the transaction.
 */
export const applyOptimisticWallet = ({
  previousCredits,
  nextCredits,
  setPlayerCredits,
  setPendingCredits,
  setIsWalletSyncing
}: WalletSyncParams): WalletSyncHandle => {
  if (previousCredits === nextCredits) {
    return { applied: false, rollback: () => {} };
  }

  let rolledBack = false;

  setPlayerCredits(nextCredits);
  setPendingCredits(nextCredits);
  setIsWalletSyncing(true);

  return {
    applied: true,
    rollback: () => {
      if (rolledBack) return;
      rolledBack = true;
      setPlayerCredits(previousCredits);
      setPendingCredits(null);
      setIsWalletSyncing(false);
    }
  };
};
