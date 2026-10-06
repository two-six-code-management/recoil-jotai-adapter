import { atom, type AtomOptions } from './atom';
import type { DefaultValue } from './DefaultValue';
import { selector } from './selector';
import { stableStringify } from './stableStringify';
import type {
  GetRecoilValue,
  RecoilState,
  RecoilValue,
  RecoilValueReadOnly,
  ResetRecoilState,
  SerializableParam,
  SetRecoilState,
} from './types';

/** パラメータを値で比較し、等しいパラメータには同じインスタンスを返す */
const memoizeByParam = <P, R>(create: (param: P, paramKey: string) => R) => {
  const cache = new Map<string, R>();
  return (param: P): R => {
    const paramKey = stableStringify(param);
    let cached = cache.get(paramKey);
    if (cached === undefined) {
      cached = create(param, paramKey);
      cache.set(paramKey, cached);
    }
    return cached;
  };
};

type AtomDefault<T> = NonNullable<AtomOptions<T>['default']> | AtomOptions<T>['default'];

export type AtomFamilyOptions<T, P extends SerializableParam> = {
  key: string;
  default?: AtomDefault<T> | ((param: P) => AtomDefault<T>);
  dangerouslyAllowMutability?: boolean;
};

export function atomFamily<T, P extends SerializableParam>(
  options: AtomFamilyOptions<T, P>,
): (param: P) => RecoilState<T> {
  return memoizeByParam((param: P, paramKey) => {
    const atomOptions: AtomOptions<T> = { key: `${options.key}__${paramKey}` };
    if ('default' in options) {
      atomOptions.default =
        typeof options.default === 'function'
          ? (options.default as (param: P) => AtomDefault<T>)(param)
          : options.default;
    }
    return atom<T>(atomOptions);
  });
}

export type ReadOnlySelectorFamilyOptions<T, P extends SerializableParam> = {
  key: string;
  get: (param: P) => (opts: { get: GetRecoilValue }) => T | Promise<T> | RecoilValue<T>;
  dangerouslyAllowMutability?: boolean;
};

export type ReadWriteSelectorFamilyOptions<
  T,
  P extends SerializableParam,
> = ReadOnlySelectorFamilyOptions<T, P> & {
  set: (
    param: P,
  ) => (
    opts: { get: GetRecoilValue; set: SetRecoilState; reset: ResetRecoilState },
    newValue: T | DefaultValue,
  ) => void;
};

export function selectorFamily<T, P extends SerializableParam>(
  options: ReadWriteSelectorFamilyOptions<T, P>,
): (param: P) => RecoilState<T>;
export function selectorFamily<T, P extends SerializableParam>(
  options: ReadOnlySelectorFamilyOptions<T, P>,
): (param: P) => RecoilValueReadOnly<T>;
export function selectorFamily<T, P extends SerializableParam>(
  options: ReadOnlySelectorFamilyOptions<T, P> | ReadWriteSelectorFamilyOptions<T, P>,
): (param: P) => RecoilValue<T> {
  return memoizeByParam((param: P, paramKey): RecoilValue<T> => {
    const key = `${options.key}__${paramKey}`;
    if ('set' in options) {
      return selector<T>({ key, get: options.get(param), set: options.set(param) });
    }
    return selector<T>({ key, get: options.get(param) });
  });
}
