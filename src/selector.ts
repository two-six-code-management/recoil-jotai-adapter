import { atom as jotaiAtom, type Getter } from 'jotai';
import type { RESET } from 'jotai/utils';
import type { DefaultValue } from './DefaultValue';
import {
  createGetter,
  createResetter,
  createSetter,
  evaluate,
  isRecoilValue,
  registerRecoilValue,
  resolveSetArg,
  trackIfPromise,
} from './internal';
import { createRefreshMeta, registerRefreshMeta } from './refresh';
import type {
  GetRecoilValue,
  RecoilSetArg,
  RecoilState,
  RecoilValue,
  RecoilValueReadOnly,
  ResetRecoilState,
  SetRecoilState,
} from './types';

export type SelectorGet<T> = (opts: { get: GetRecoilValue }) => T | Promise<T> | RecoilValue<T>;

export type SelectorSet<T> = (
  opts: { get: GetRecoilValue; set: SetRecoilState; reset: ResetRecoilState },
  newValue: T | DefaultValue,
) => void;

export type ReadOnlySelectorOptions<T> = {
  key: string;
  get: SelectorGet<T>;
  /** jotai は値を freeze しないため互換性のためだけに受け付ける */
  dangerouslyAllowMutability?: boolean;
};

export type ReadWriteSelectorOptions<T> = ReadOnlySelectorOptions<T> & {
  set: SelectorSet<T>;
};

const createRead =
  <T>(selectorGet: SelectorGet<T>, refreshMeta: ReturnType<typeof createRefreshMeta>) =>
  (get: Getter): T => {
    get(refreshMeta.counter);
    return trackIfPromise(
      evaluate(() => {
        const getRecoilValue = createGetter(get, (dependency) =>
          refreshMeta.dependencies.add(dependency),
        );
        const result = selectorGet({ get: getRecoilValue });
        return isRecoilValue(result) ? getRecoilValue(result as RecoilValue<T>) : result;
      }),
    ) as T;
  };

export function selector<T>(options: ReadWriteSelectorOptions<T>): RecoilState<T>;
export function selector<T>(options: ReadOnlySelectorOptions<T>): RecoilValueReadOnly<T>;
export function selector<T>(
  options: ReadOnlySelectorOptions<T> | ReadWriteSelectorOptions<T>,
): RecoilValue<T> {
  const refreshMeta = createRefreshMeta();
  const read = createRead(options.get, refreshMeta);

  if (!('set' in options)) {
    const readOnlySelector = jotaiAtom(read);
    registerRefreshMeta(readOnlySelector, refreshMeta);
    return registerRecoilValue(readOnlySelector, options.key) as RecoilValueReadOnly<T>;
  }

  const selectorSet = options.set;
  const writableSelector = jotaiAtom(read, (get, set, update: RecoilSetArg<T> | typeof RESET) => {
    const newValue = resolveSetArg(update, () => get(writableSelector));
    selectorSet(
      { get: createGetter(get), set: createSetter(set), reset: createResetter(set) },
      newValue,
    );
  });

  registerRefreshMeta(writableSelector, refreshMeta);
  return registerRecoilValue(writableSelector, options.key) as RecoilState<T>;
}
