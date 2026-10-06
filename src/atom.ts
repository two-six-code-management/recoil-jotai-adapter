import { atom as jotaiAtom, type Getter } from 'jotai';
import type { RESET } from 'jotai/utils';
import {
  createGetter,
  isRecoilValue,
  isResetSignal,
  registerRecoilValue,
  resolveSetArg,
} from './internal';
import type { RecoilSetArg, RecoilState, RecoilValue } from './types';

export type AtomOptions<T> = {
  key: string;
  default?: T | Promise<T> | RecoilValue<T>;
  /** jotai は値を freeze しないため互換性のためだけに受け付ける */
  dangerouslyAllowMutability?: boolean;
};

const EMPTY: unique symbol = Symbol('EMPTY');

const NEVER_RESOLVE = new Promise<never>(() => {});

export function atom<T>(options: AtomOptions<T>): RecoilState<T> {
  const readDefault = (get: Getter): T | Promise<T> => {
    if (!('default' in options)) {
      // Recoil と同様、default 未指定の atom は値がセットされるまでサスペンドする
      return NEVER_RESOLVE;
    }
    const defaultValue = options.default;
    return isRecoilValue(defaultValue)
      ? createGetter(get)(defaultValue as RecoilValue<T>)
      : (defaultValue as T | Promise<T>);
  };

  // 一度でも set されたら default ではなくこちらの値を使う（reset で EMPTY に戻す）
  const overwrittenAtom = jotaiAtom<T | typeof EMPTY>(EMPTY);
  overwrittenAtom.debugPrivate = true;

  const recoilAtom = jotaiAtom(
    (get) => {
      const overwritten = get(overwrittenAtom);
      return (overwritten === EMPTY ? readDefault(get) : overwritten) as T;
    },
    (get, set, update: RecoilSetArg<T> | typeof RESET) => {
      const next = resolveSetArg(update, () => get(recoilAtom));
      set(overwrittenAtom, isResetSignal(next) ? EMPTY : (next as T));
    },
  );

  return registerRecoilValue(recoilAtom, options.key) as RecoilState<T>;
}
