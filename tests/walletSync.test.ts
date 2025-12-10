import assert from 'node:assert';
import test from 'node:test';
import { applyOptimisticWallet } from '../src/utils/walletSync';

type CallLog = {
  credits: number[];
  pending: Array<number | null>;
  syncing: boolean[];
};

const createCallLog = (): CallLog & {
  setPlayerCredits: (value: number) => void;
  setPendingCredits: (value: number | null) => void;
  setIsWalletSyncing: (value: boolean) => void;
} => {
  const log: CallLog & {
    setPlayerCredits: (value: number) => void;
    setPendingCredits: (value: number | null) => void;
    setIsWalletSyncing: (value: boolean) => void;
  } = {
    credits: [],
    pending: [],
    syncing: [],
    setPlayerCredits: (value: number) => {
      log.credits.push(value);
    },
    setPendingCredits: (value: number | null) => {
      log.pending.push(value);
    },
    setIsWalletSyncing: (value: boolean) => {
      log.syncing.push(value);
    }
  };

  return log;
};

test('optimistic wallet updates can be rolled back safely', () => {
  const log = createCallLog();

  const handle = applyOptimisticWallet({
    previousCredits: 120,
    nextCredits: 90,
    setPlayerCredits: log.setPlayerCredits,
    setPendingCredits: log.setPendingCredits,
    setIsWalletSyncing: log.setIsWalletSyncing
  });

  assert.ok(handle.applied, 'wallet handle should record it applied changes');
  assert.deepStrictEqual(log.credits, [90]);
  assert.deepStrictEqual(log.pending, [90]);
  assert.deepStrictEqual(log.syncing, [true]);

  handle.rollback();
  handle.rollback(); // second call should be ignored

  assert.deepStrictEqual(log.credits, [90, 120]);
  assert.deepStrictEqual(log.pending, [90, null]);
  assert.deepStrictEqual(log.syncing, [true, false]);
});

test('no-op when next credits equal current credits', () => {
  const log = createCallLog();

  const handle = applyOptimisticWallet({
    previousCredits: 75,
    nextCredits: 75,
    setPlayerCredits: log.setPlayerCredits,
    setPendingCredits: log.setPendingCredits,
    setIsWalletSyncing: log.setIsWalletSyncing
  });

  assert.strictEqual(handle.applied, false);
  handle.rollback();
  assert.deepStrictEqual(log.credits, []);
  assert.deepStrictEqual(log.pending, []);
  assert.deepStrictEqual(log.syncing, []);
});
