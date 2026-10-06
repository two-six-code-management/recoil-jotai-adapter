import { createStore, Provider } from 'jotai';
import { createContext, createElement, Fragment, useContext, useRef, type ReactNode } from 'react';
import { DefaultValue } from './DefaultValue';
import type { ResetRecoilState, SetRecoilState } from './types';

export type MutableSnapshot = {
  set: SetRecoilState;
  reset: ResetRecoilState;
};

export type RecoilRootProps = {
  children?: ReactNode;
  initializeState?: (mutableSnapshot: MutableSnapshot) => void;
  /** false の場合、祖先に RecoilRoot があればその状態を共有する */
  override?: boolean;
};

const InsideRecoilRootContext = createContext(false);

type Store = ReturnType<typeof createStore>;

const createInitializedStore = (initializeState: RecoilRootProps['initializeState']): Store => {
  const store = createStore();
  initializeState?.({
    set: (recoilState, newValue) => store.set(recoilState, newValue),
    reset: (recoilState) => store.set(recoilState, new DefaultValue()),
  });
  return store;
};

/** RecoilRoot 互換コンポーネント。RecoilRoot ごとに独立した jotai の store を持つ */
export function RecoilRoot({ children, initializeState, override = true }: RecoilRootProps) {
  const isInsideRecoilRoot = useContext(InsideRecoilRootContext);
  const storeRef = useRef<Store | null>(null);

  if (!override && isInsideRecoilRoot) {
    return createElement(Fragment, null, children);
  }

  if (storeRef.current === null) {
    storeRef.current = createInitializedStore(initializeState);
  }

  return createElement(
    InsideRecoilRootContext.Provider,
    { value: true },
    createElement(Provider, { store: storeRef.current }, children),
  );
}
