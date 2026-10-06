import { describe, expectTypeOf, it } from 'vitest';
import {
  atom,
  atomFamily,
  DefaultValue,
  RecoilState,
  RecoilValue,
  RecoilValueReadOnly,
  selector,
  selectorFamily,
  SetterOrUpdater,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  waitForAll,
} from '../src';

describe('型の互換性', () => {
  it('atom は RecoilState を返し、フックの戻り値の型が Recoil と一致する', () => {
    const countState = atom<number>({ key: 'type-count', default: 0 });

    expectTypeOf(countState).toEqualTypeOf<RecoilState<number>>();
    expectTypeOf(useRecoilState(countState)).toEqualTypeOf<[number, SetterOrUpdater<number>]>();
    expectTypeOf(useRecoilValue(countState)).toEqualTypeOf<number>();
    expectTypeOf(useSetRecoilState(countState)).toEqualTypeOf<SetterOrUpdater<number>>();
  });

  it('useRecoilState に明示的な型引数を渡せる', () => {
    const listState = atom<string[]>({ key: 'type-list', default: [] });

    expectTypeOf(useRecoilState<string[]>(listState)[0]).toEqualTypeOf<string[]>();
  });

  it('set を持たない selector は読み取り専用で、書き込みフックに渡すと型エラーになる', () => {
    const readOnly = selector({ key: 'type-readonly', get: () => 1 });

    expectTypeOf(readOnly).toEqualTypeOf<RecoilValueReadOnly<number>>();
    expectTypeOf(readOnly).toMatchTypeOf<RecoilValue<number>>();
    // @ts-expect-error 読み取り専用 selector は useRecoilState に渡せない
    useRecoilState(readOnly);
    // @ts-expect-error 読み取り専用 selector は useSetRecoilState に渡せない
    useSetRecoilState(readOnly);
  });

  it('set を持つ selector は RecoilState になり、set の newValue は T | DefaultValue', () => {
    const baseState = atom<number>({ key: 'type-base', default: 0 });
    const writable = selector<number>({
      key: 'type-writable',
      get: ({ get }) => get(baseState),
      set: ({ set }, newValue) => {
        expectTypeOf(newValue).toEqualTypeOf<number | DefaultValue>();
        set(baseState, newValue instanceof DefaultValue ? 0 : newValue);
      },
    });

    expectTypeOf(writable).toEqualTypeOf<RecoilState<number>>();
  });

  it('非同期 selector の値は Promise が外れた型になる', () => {
    const asyncSelector = selector({ key: 'type-async', get: async () => 'value' });

    expectTypeOf(useRecoilValue(asyncSelector)).toEqualTypeOf<string>();
  });

  it('atomFamily / selectorFamily はパラメータを受け取って RecoilValue を返す', () => {
    const family = atomFamily<number, string>({ key: 'type-family', default: 0 });
    const readOnlyFamily = selectorFamily<number, { id: string }>({
      key: 'type-selector-family',
      get:
        ({ id }) =>
        ({ get }) =>
          get(family(id)),
    });
    const inferredFamily = selectorFamily({
      key: 'type-inferred-family',
      get:
        ({ id }: { id: string; flags: boolean[] }) =>
        () =>
          id,
    });

    expectTypeOf(family('a')).toEqualTypeOf<RecoilState<number>>();
    expectTypeOf(readOnlyFamily({ id: 'a' })).toEqualTypeOf<RecoilValueReadOnly<number>>();
    expectTypeOf(inferredFamily({ id: 'a', flags: [] })).toEqualTypeOf<RecoilValueReadOnly<string>>();
  });

  it('waitForAll は配列とオブジェクトの各要素の値の型を保持する', () => {
    const numState = atom<number>({ key: 'type-num', default: 0 });
    const strSelector = selector({ key: 'type-str', get: () => 'a' });
    const family = selectorFamily<{ ok: boolean }, string[]>({
      key: 'type-wait-family',
      get: () => () => ({ ok: true }),
    });

    expectTypeOf(useRecoilValue(waitForAll([numState, strSelector]))).toEqualTypeOf<
      [number, string]
    >();
    expectTypeOf(useRecoilValue(waitForAll({ n: numState, s: strSelector }))).toEqualTypeOf<{
      n: number;
      s: string;
    }>();
    expectTypeOf(useRecoilValue(waitForAll([['a']].map((ids) => family(ids))))).toEqualTypeOf<
      { ok: boolean }[]
    >();
  });
});
