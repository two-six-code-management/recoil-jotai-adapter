import type { Getter, Setter } from 'jotai';
import { RESET } from 'jotai/utils';
import { DefaultValue } from './DefaultValue';
import type {
  GetRecoilValue,
  RecoilSetArg,
  RecoilValue,
  ResetRecoilState,
  SetRecoilState,
} from './types';

const recoilValues = new WeakSet<object>();

/** jotai の atom に Recoil の key を付与し、Recoil 値として登録する */
export const registerRecoilValue = <A extends { debugLabel?: string }>(
  anAtom: A,
  key: string,
): A & { readonly key: string } => {
  anAtom.debugLabel = key;
  recoilValues.add(anAtom);
  return Object.assign(anAtom, { key });
};

export const isRecoilValue = (value: unknown): value is RecoilValue<unknown> =>
  typeof value === 'object' && value !== null && recoilValues.has(value);

export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null | undefined)?.then === 'function';

/** reset 指示（DefaultValue / jotai の RESET）かどうか */
export const isResetSignal = (value: unknown): boolean =>
  value instanceof DefaultValue || value === RESET;

/** 値・updater 関数のどちらで渡されても次の値を求める */
export const resolveSetArg = <T>(
  update: RecoilSetArg<T> | typeof RESET,
  getCurrent: () => T,
): T | DefaultValue =>
  update === RESET
    ? new DefaultValue()
    : typeof update === 'function'
      ? (update as (prev: T) => T | DefaultValue)(getCurrent())
      : (update as T | DefaultValue);

export type Settled =
  | { status: 'fulfilled'; value: unknown }
  | { status: 'rejected'; reason: unknown };

const settledPromises = new WeakMap<PromiseLike<unknown>, Settled>();

/** 解決済みの Promise ならその結果を返す（未解決・未追跡なら undefined） */
export const getSettled = (promise: PromiseLike<unknown>): Settled | undefined =>
  settledPromises.get(promise);

const trackedPromises = new WeakMap<PromiseLike<unknown>, Promise<void>>();

/** Promise の解決結果を記録し、後から同期的に参照できるようにする */
export const trackPromise = (promise: PromiseLike<unknown>): Promise<void> => {
  let tracking = trackedPromises.get(promise);
  if (tracking === undefined) {
    tracking = Promise.resolve(promise).then(
      (value) => {
        settledPromises.set(promise, { status: 'fulfilled', value });
      },
      (reason) => {
        settledPromises.set(promise, { status: 'rejected', reason });
      },
    );
    trackedPromises.set(promise, tracking);
  }
  return tracking;
};

/**
 * atom / selector が返す値が Promise なら、生成した時点で解決結果の追跡を始める。
 * Suspense で解決を待った後に、getLoadable などから同期的に解決済みの値を読めるようにするため。
 */
export const trackIfPromise = <V>(value: V): V => {
  if (isPromiseLike(value)) {
    void trackPromise(value);
  }
  return value;
};

/** 非同期の依存がまだ解決していないことを evaluate に伝えるためのシグナル */
class PendingDependency {
  constructor(readonly promise: PromiseLike<unknown>) {}
}

/**
 * selector の get に渡す getter。
 * Recoil と同様に、非同期の依存は解決済みの値として返す（未解決なら解決を待って再評価する）。
 */
export const createGetter =
  (get: Getter, onRead?: (recoilValue: RecoilValue<unknown>) => void): GetRecoilValue =>
  <T>(recoilValue: RecoilValue<T>): T => {
    onRead?.(recoilValue as RecoilValue<unknown>);
    const value: unknown = get(recoilValue);
    if (!isPromiseLike(value)) {
      return value as T;
    }
    const settled = getSettled(value);
    if (!settled) {
      throw new PendingDependency(value);
    }
    if (settled.status === 'rejected') {
      throw settled.reason;
    }
    return settled.value as T;
  };

const waitAndRetry = <T>(error: unknown, compute: () => T | Promise<T>): Promise<T> => {
  if (!(error instanceof PendingDependency)) {
    throw error;
  }
  return trackPromise(error.promise).then(() => evaluate(compute));
};

/** 非同期の依存が解決するまで待ってから compute を再評価する */
export const evaluate = <T>(compute: () => T | Promise<T>): T | Promise<T> => {
  let result: T | Promise<T>;
  try {
    result = compute();
  } catch (error) {
    return waitAndRetry(error, compute);
  }
  if (isPromiseLike(result)) {
    return Promise.resolve(result).catch((error: unknown) => waitAndRetry(error, compute));
  }
  return result;
};

export const createSetter =
  (set: Setter): SetRecoilState =>
  (recoilState, newValue) =>
    set(recoilState, newValue);

export const createResetter =
  (set: Setter): ResetRecoilState =>
  (recoilState) =>
    set(recoilState, new DefaultValue());
