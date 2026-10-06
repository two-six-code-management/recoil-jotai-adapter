import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { DefaultValue } from './DefaultValue';
import type { RecoilState, RecoilValue, Resetter, SetterOrUpdater } from './types';

export function useRecoilValue<T>(recoilValue: RecoilValue<T>): T {
  return useAtomValue(recoilValue) as T;
}

export function useSetRecoilState<T>(recoilState: RecoilState<T>): SetterOrUpdater<T> {
  return useSetAtom(recoilState) as SetterOrUpdater<T>;
}

export function useRecoilState<T>(recoilState: RecoilState<T>): [T, SetterOrUpdater<T>] {
  return [useRecoilValue(recoilState), useSetRecoilState(recoilState)];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useResetRecoilState(recoilState: RecoilState<any>): Resetter {
  const setAtom = useSetAtom(recoilState);
  return useCallback(() => setAtom(new DefaultValue()), [setAtom]);
}
