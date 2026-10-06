import { atom as jotaiAtom, type PrimitiveAtom, type Setter } from 'jotai';
import type { RecoilValue } from './types';

type RefreshMeta = {
  /** 値を変えると selector が再評価される */
  counter: PrimitiveAtom<number>;
  /** これまでの評価で読んだ依存（上流の selector も再評価させるため） */
  dependencies: Set<RecoilValue<unknown>>;
};

const refreshMetas = new WeakMap<object, RefreshMeta>();

export const createRefreshMeta = (): RefreshMeta => {
  const counter = jotaiAtom(0);
  counter.debugPrivate = true;
  return { counter, dependencies: new Set() };
};

export const registerRefreshMeta = (recoilValue: object, meta: RefreshMeta): void => {
  refreshMetas.set(recoilValue, meta);
};

/**
 * selector のキャッシュを破棄して再評価させる。依存している上流の selector も再評価させる。
 * atom に対しては何もしない（Recoil と同じ）。
 */
export const refreshRecoilValue = (
  set: Setter,
  recoilValue: RecoilValue<unknown>,
  visited: Set<object> = new Set(),
): void => {
  const meta = refreshMetas.get(recoilValue);
  if (!meta || visited.has(recoilValue)) {
    return;
  }
  visited.add(recoilValue);
  meta.dependencies.forEach((dependency) => refreshRecoilValue(set, dependency, visited));
  set(meta.counter, (count) => count + 1);
};
