import { useStore } from 'jotai';
import { useCallback } from 'react';
import { DefaultValue } from './DefaultValue';
import { toLoadable, type Loadable } from './Loadable';
import { refreshRecoilValue } from './refresh';
import type { RecoilState, RecoilValue, ResetRecoilState, SetRecoilState } from './types';

type Store = ReturnType<typeof useStore>;

/**
 * Recoil の Snapshot 互換。
 * Recoil と異なり呼び出し時点の状態で固定されず、読み取るたびに最新の状態を返す。
 */
export type Snapshot = Readonly<{
  getLoadable: <T>(recoilValue: RecoilValue<T>) => Loadable<T>;
  getPromise: <T>(recoilValue: RecoilValue<T>) => Promise<T>;
  /** jotai は値を保持し続けるため、互換性のためだけに提供する */
  retain: () => () => void;
}>;

export type TransactionInterface_UNSTABLE = Readonly<{
  get: <T>(recoilValue: RecoilValue<T>) => T;
  set: SetRecoilState;
  reset: ResetRecoilState;
}>;

export type CallbackInterface = Readonly<{
  snapshot: Snapshot;
  set: SetRecoilState;
  reset: ResetRecoilState;
  // Recoil の型定義に合わせて any を許容する
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refresh: (recoilValue: RecoilValue<any>) => void;
  transact_UNSTABLE: (callback: (transaction: TransactionInterface_UNSTABLE) => void) => void;
}>;

const createSnapshot = (store: Store): Snapshot => ({
  getLoadable: <T>(recoilValue: RecoilValue<T>) => toLoadable<T>(() => store.get(recoilValue)),
  getPromise: <T>(recoilValue: RecoilValue<T>) => {
    try {
      return Promise.resolve(store.get(recoilValue));
    } catch (error) {
      return Promise.reject(error);
    }
  },
  retain: () => () => {},
});

const createCallbackInterface = (store: Store): CallbackInterface => {
  const set: SetRecoilState = <T>(recoilState: RecoilState<T>, newValue: Parameters<SetRecoilState>[1]) =>
    store.set(recoilState, newValue as T);
  const reset: ResetRecoilState = (recoilState) => store.set(recoilState, new DefaultValue());
  return {
    snapshot: createSnapshot(store),
    set,
    reset,
    refresh: (recoilValue) => refreshRecoilValue(store.set, recoilValue),
    transact_UNSTABLE: (callback) =>
      callback({ get: (recoilValue) => store.get(recoilValue), set, reset }),
  };
};

export function useRecoilCallback<Args extends ReadonlyArray<unknown>, Return>(
  fn: (callbackInterface: CallbackInterface) => (...args: Args) => Return,
  deps?: ReadonlyArray<unknown>,
): (...args: Args) => Return {
  const store = useStore();
  return useCallback(
    (...args: Args) => fn(createCallbackInterface(store))(...args),
    // Recoil と同様、deps 省略時は毎レンダー作り直す（fn は通常毎レンダー新しい関数になる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps === undefined ? [store, fn] : [store, ...deps],
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRecoilRefresher_UNSTABLE(recoilValue: RecoilValue<any>): () => void {
  const store = useStore();
  return useCallback(() => refreshRecoilValue(store.set, recoilValue), [store, recoilValue]);
}
