import { getSettled, isPromiseLike, trackPromise } from './internal';

const unexpectedState = (expected: string, actual: string) =>
  new Error(`Loadable expected ${expected}, but in "${actual}" state`);

export class ValueLoadable<T> {
  readonly state = 'hasValue' as const;

  constructor(readonly contents: T) {}

  getValue(): T {
    return this.contents;
  }

  toPromise(): Promise<T> {
    return Promise.resolve(this.contents);
  }

  valueMaybe(): T {
    return this.contents;
  }

  valueOrThrow(): T {
    return this.contents;
  }

  errorMaybe(): undefined {
    return undefined;
  }

  errorOrThrow(): never {
    throw unexpectedState('error', this.state);
  }

  promiseMaybe(): undefined {
    return undefined;
  }

  promiseOrThrow(): never {
    throw unexpectedState('promise', this.state);
  }
}

export class LoadingLoadable<T> {
  readonly state = 'loading' as const;

  constructor(readonly contents: Promise<T>) {}

  /** Recoil と同様に Promise を投げ、Suspense で待てるようにする */
  getValue(): T {
    throw this.contents;
  }

  toPromise(): Promise<T> {
    return this.contents;
  }

  valueMaybe(): undefined {
    return undefined;
  }

  valueOrThrow(): never {
    throw unexpectedState('value', this.state);
  }

  errorMaybe(): undefined {
    return undefined;
  }

  errorOrThrow(): never {
    throw unexpectedState('error', this.state);
  }

  promiseMaybe(): Promise<T> {
    return this.contents;
  }

  promiseOrThrow(): Promise<T> {
    return this.contents;
  }
}

export class ErrorLoadable<T> {
  readonly state = 'hasError' as const;

  constructor(readonly contents: unknown) {}

  getValue(): T {
    throw this.contents;
  }

  toPromise(): Promise<T> {
    return Promise.reject(this.contents);
  }

  valueMaybe(): undefined {
    return undefined;
  }

  valueOrThrow(): never {
    throw unexpectedState('value', this.state);
  }

  errorMaybe(): unknown {
    return this.contents;
  }

  errorOrThrow(): unknown {
    return this.contents;
  }

  promiseMaybe(): undefined {
    return undefined;
  }

  promiseOrThrow(): never {
    throw unexpectedState('promise', this.state);
  }
}

export type Loadable<T> = ValueLoadable<T> | LoadingLoadable<T> | ErrorLoadable<T>;

/** 値の読み取りを Loadable に変換する（未解決の Promise は解決結果を追跡しておく） */
export const toLoadable = <T>(read: () => unknown): Loadable<T> => {
  let value: unknown;
  try {
    value = read();
  } catch (error) {
    return new ErrorLoadable<T>(error);
  }
  if (!isPromiseLike(value)) {
    return new ValueLoadable(value as T);
  }
  const settled = getSettled(value);
  if (settled?.status === 'fulfilled') {
    return new ValueLoadable(settled.value as T);
  }
  if (settled?.status === 'rejected') {
    return new ErrorLoadable<T>(settled.reason);
  }
  void trackPromise(value);
  return new LoadingLoadable(Promise.resolve(value) as Promise<T>);
};
