import type { Atom, WritableAtom } from 'jotai';
import type { DefaultValue } from './DefaultValue';

type Primitive = undefined | null | boolean | number | symbol | string;

export type SerializableParam =
  | Primitive
  | { toJSON: () => string }
  | ReadonlyArray<SerializableParam>
  | ReadonlySet<SerializableParam>
  | ReadonlyMap<SerializableParam, SerializableParam>
  | Readonly<{ [key: string]: SerializableParam }>;

export type RecoilSetArg<T> = T | DefaultValue | ((prevValue: T) => T | DefaultValue);

/** 読み取り専用の Recoil 値。実体は jotai の Atom なので jotai のフックからも利用できる */
export type RecoilValueReadOnly<T> = Atom<T> & { readonly key: string };

/** 書き込み可能な Recoil 値。実体は jotai の WritableAtom */
export type RecoilState<T> = WritableAtom<T, [RecoilSetArg<T>], void> & {
  readonly key: string;
};

export type RecoilValue<T> = RecoilValueReadOnly<T> | RecoilState<T>;

export type SetterOrUpdater<T> = (valOrUpdater: ((currVal: T) => T) | T) => void;

export type Resetter = () => void;

export type GetRecoilValue = <T>(recoilVal: RecoilValue<T>) => T;

export type SetRecoilState = <T>(
  recoilVal: RecoilState<T>,
  newVal: T | DefaultValue | ((prevValue: T) => T | DefaultValue),
) => void;

// Recoil の型定義に合わせて any を許容する
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResetRecoilState = (recoilVal: RecoilState<any>) => void;

export type UnwrapRecoilValue<T> = T extends RecoilValueReadOnly<infer R> ? R : never;

export type UnwrapRecoilValues<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ReadonlyArray<RecoilValue<any>> | { [key: string]: RecoilValue<any> },
> = {
  [P in keyof T]: UnwrapRecoilValue<T[P]>;
};
