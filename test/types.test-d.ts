import { describe, expectTypeOf, it } from 'vitest';
import {
  atom,
  atomFamily,
  CallbackInterface,
  DefaultValue,
  Loadable,
  RecoilState,
  RecoilValue,
  RecoilValueReadOnly,
  selector,
  selectorFamily,
  SetterOrUpdater,
  useRecoilCallback,
  useRecoilRefresher_UNSTABLE,
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

describe('useRecoilCallback の型', () => {
  it('コールバックの引数と戻り値の型を保持する', () => {
    const callback = useRecoilCallback(() => async (id: string, page: number) => ({ id, page }));

    expectTypeOf(callback).toEqualTypeOf<
      (id: string, page: number) => Promise<{ id: string; page: number }>
    >();
  });

  it('getLoadable の state で contents の型が絞り込まれる', () => {
    const countState = atom<number>({ key: 'type-callback-count', default: 0 });

    useRecoilCallback(({ snapshot }) => () => {
      const loadable = snapshot.getLoadable(countState);
      expectTypeOf(loadable).toEqualTypeOf<Loadable<number>>();
      expectTypeOf(loadable.getValue()).toEqualTypeOf<number>();
      if (loadable.state === 'hasValue') {
        expectTypeOf(loadable.contents).toEqualTypeOf<number>();
      }
      if (loadable.state === 'loading') {
        expectTypeOf(loadable.contents).toEqualTypeOf<Promise<number>>();
      }
    });
  });

  it('getPromise に型引数を明示できる', () => {
    const urlSelector = selector({ key: 'type-callback-url', get: async () => 'url' });

    useRecoilCallback(({ snapshot }) => async () => {
      expectTypeOf(await snapshot.getPromise<string>(urlSelector)).toEqualTypeOf<string>();
    });
  });

  it('set / reset / refresh は書き込み可能・読み取り専用の値を正しく受け付ける', () => {
    const countState = atom<number>({ key: 'type-callback-set', default: 0 });
    const readOnly = selector({ key: 'type-callback-readonly', get: () => 1 });

    useRecoilCallback(({ set, reset, refresh }: CallbackInterface) => () => {
      set(countState, 1);
      set(countState, (prev) => prev + 1);
      reset(countState);
      refresh(readOnly);
      // @ts-expect-error 読み取り専用 selector には set できない
      set(readOnly, 1);
    });
    expectTypeOf(useRecoilRefresher_UNSTABLE(readOnly)).toEqualTypeOf<() => void>();
  });

  it('非対応の gotoSnapshot は型エラーになる', () => {
    // @ts-expect-error gotoSnapshot は提供しない
    useRecoilCallback(({ gotoSnapshot }) => () => gotoSnapshot);
  });
});
