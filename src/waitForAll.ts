import { atom as jotaiAtom } from 'jotai';
import { isPromiseLike, registerRecoilValue } from './internal';
import type { RecoilValue, RecoilValueReadOnly, UnwrapRecoilValues } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecoilValue = RecoilValue<any>;

const objectIds = new WeakMap<object, number>();
let nextObjectId = 0;

const objectId = (target: object): number => {
  let id = objectIds.get(target);
  if (id === undefined) {
    id = nextObjectId++;
    objectIds.set(target, id);
  }
  return id;
};

// 同じ RecoilValue の組み合わせには同じ atom を返し、毎レンダーの再購読を防ぐ
const cache = new Map<string, RecoilValueReadOnly<unknown>>();

export function waitForAll<RecoilValues extends Array<AnyRecoilValue> | [AnyRecoilValue]>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValues<RecoilValues>>;
export function waitForAll<RecoilValues extends { [key: string]: AnyRecoilValue }>(
  param: RecoilValues,
): RecoilValueReadOnly<UnwrapRecoilValues<RecoilValues>>;
export function waitForAll(
  param: Array<AnyRecoilValue> | { [key: string]: AnyRecoilValue },
): RecoilValueReadOnly<unknown> {
  const isArray = Array.isArray(param);
  const entries = Object.entries(param);
  const cacheKey = `${isArray ? 'array' : 'object'}:${entries
    .map(([name, recoilValue]) => `${JSON.stringify(name)}=${objectId(recoilValue)}`)
    .join(',')}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const toResult = (values: unknown[]) =>
    isArray ? values : Object.fromEntries(entries.map(([name], i) => [name, values[i]]));

  const allAtom = jotaiAtom((get) => {
    const values = entries.map(([, recoilValue]) => get(recoilValue) as unknown);
    return values.some(isPromiseLike) ? Promise.all(values).then(toResult) : toResult(values);
  });

  const recoilValue = registerRecoilValue(allAtom, `waitForAll(${cacheKey})`);
  cache.set(cacheKey, recoilValue as RecoilValueReadOnly<unknown>);
  return recoilValue as RecoilValueReadOnly<unknown>;
}
