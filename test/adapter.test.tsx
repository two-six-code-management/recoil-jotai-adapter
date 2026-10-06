import { act, render, renderHook, screen } from '@testing-library/react';
import { useAtomValue } from 'jotai';
import { ReactNode, Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import {
  atom,
  atomFamily,
  DefaultValue,
  RecoilRoot,
  selector,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
  waitForAll,
} from '../src';

let seq = 0;
const uniqueKey = (name: string) => `${name}-${seq++}`;

const wrapper = ({ children }: { children: ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe('atom', () => {
  it('default 値を読み取れ、値と updater 関数で更新できる', () => {
    const countState = atom<number>({ key: uniqueKey('count'), default: 1 });
    const { result } = renderHook(() => useRecoilState(countState), { wrapper });

    expect(result.current[0]).toBe(1);

    act(() => result.current[1](10));
    expect(result.current[0]).toBe(10);

    act(() => result.current[1]((prev) => prev + 5));
    expect(result.current[0]).toBe(15);
  });

  it('useRecoilValue と useSetRecoilState で同じ状態を共有する', () => {
    const textState = atom<string>({ key: uniqueKey('text'), default: 'a' });
    const { result } = renderHook(
      () => ({
        value: useRecoilValue(textState),
        setValue: useSetRecoilState(textState),
      }),
      { wrapper },
    );

    act(() => result.current.setValue('b'));
    expect(result.current.value).toBe('b');
  });

  it('useSetRecoilState の setter は再レンダーをまたいで同一参照である', () => {
    const flagState = atom<boolean>({ key: uniqueKey('flag'), default: false });
    const { result } = renderHook(
      () => ({
        value: useRecoilValue(flagState),
        setValue: useSetRecoilState(flagState),
      }),
      { wrapper },
    );
    const firstSetter = result.current.setValue;

    act(() => result.current.setValue(true));
    expect(result.current.setValue).toBe(firstSetter);
  });

  it('useResetRecoilState で default 値に戻る', () => {
    const listState = atom<string[]>({ key: uniqueKey('list'), default: [] });
    const { result } = renderHook(
      () => ({
        state: useRecoilState(listState),
        reset: useResetRecoilState(listState),
      }),
      { wrapper },
    );

    act(() => result.current.state[1](['x']));
    expect(result.current.state[0]).toEqual(['x']);

    act(() => result.current.reset());
    expect(result.current.state[0]).toEqual([]);
  });

  it('default に別の RecoilValue を指定すると、その値を初期値として使う', () => {
    const baseState = atom<number>({ key: uniqueKey('base'), default: 3 });
    const derivedDefaultState = atom<number>({
      key: uniqueKey('derivedDefault'),
      default: selector({
        key: uniqueKey('doubled'),
        get: ({ get }) => get(baseState) * 2,
      }),
    });
    const { result } = renderHook(() => useRecoilState(derivedDefaultState), {
      wrapper,
    });

    expect(result.current[0]).toBe(6);

    act(() => result.current[1](100));
    expect(result.current[0]).toBe(100);
  });
});

describe('RecoilRoot', () => {
  it('RecoilRoot ごとに状態が独立している', () => {
    const countState = atom<number>({ key: uniqueKey('count'), default: 0 });

    const Counter = ({ testId }: { testId: string }) => {
      const [count, setCount] = useRecoilState(countState);
      return (
        <button data-testid={testId} onClick={() => setCount((c) => c + 1)}>
          {count}
        </button>
      );
    };

    render(
      <>
        <RecoilRoot>
          <Counter testId="first" />
        </RecoilRoot>
        <RecoilRoot>
          <Counter testId="second" />
        </RecoilRoot>
      </>,
    );

    act(() => screen.getByTestId('first').click());

    expect(screen.getByTestId('first').textContent).toBe('1');
    expect(screen.getByTestId('second').textContent).toBe('0');
  });

  it('initializeState で初期値を設定できる', () => {
    const nameState = atom<string>({ key: uniqueKey('name'), default: '' });
    const { result } = renderHook(() => useRecoilValue(nameState), {
      wrapper: ({ children }) => (
        <RecoilRoot initializeState={({ set }) => set(nameState, 'init')}>
          {children}
        </RecoilRoot>
      ),
    });

    expect(result.current).toBe('init');
  });

  it('override={false} の入れ子 RecoilRoot は親の状態を共有する', () => {
    const countState = atom<number>({ key: uniqueKey('count'), default: 0 });
    const { result } = renderHook(
      () => ({
        value: useRecoilValue(countState),
        setValue: useSetRecoilState(countState),
      }),
      {
        wrapper: ({ children }) => (
          <RecoilRoot initializeState={({ set }) => set(countState, 7)}>
            <RecoilRoot override={false}>{children}</RecoilRoot>
          </RecoilRoot>
        ),
      },
    );

    expect(result.current.value).toBe(7);
  });
});

describe('selector', () => {
  it('依存する atom の変更に追従する', () => {
    const priceState = atom<number>({ key: uniqueKey('price'), default: 100 });
    const taxIncludedState = selector<number>({
      key: uniqueKey('taxIncluded'),
      get: ({ get }) => get(priceState) * 1.1,
    });
    const { result } = renderHook(
      () => ({
        taxIncluded: useRecoilValue(taxIncludedState),
        setPrice: useSetRecoilState(priceState),
      }),
      { wrapper },
    );

    expect(result.current.taxIncluded).toBeCloseTo(110);

    act(() => result.current.setPrice(200));
    expect(result.current.taxIncluded).toBeCloseTo(220);
  });

  it('set を持つ selector に値と updater 関数で書き込める', () => {
    const celsiusState = atom<number>({ key: uniqueKey('celsius'), default: 0 });
    const fahrenheitState = selector<number>({
      key: uniqueKey('fahrenheit'),
      get: ({ get }) => (get(celsiusState) * 9) / 5 + 32,
      set: ({ set }, newValue) => {
        if (newValue instanceof DefaultValue) {
          return;
        }
        set(celsiusState, ((newValue - 32) * 5) / 9);
      },
    });
    const { result } = renderHook(
      () => ({
        fahrenheit: useRecoilState(fahrenheitState),
        celsius: useRecoilValue(celsiusState),
      }),
      { wrapper },
    );

    act(() => result.current.fahrenheit[1](212));
    expect(result.current.celsius).toBeCloseTo(100);

    act(() => result.current.fahrenheit[1]((prev) => prev - 180));
    expect(result.current.celsius).toBeCloseTo(0);
  });

  it('selector の set では reset でき、reset 時は DefaultValue が渡される', () => {
    const valueState = atom<number>({ key: uniqueKey('value'), default: 1 });
    const received: unknown[] = [];
    const proxyState = selector<number>({
      key: uniqueKey('proxy'),
      get: ({ get }) => get(valueState),
      set: ({ set, reset }, newValue) => {
        received.push(newValue);
        if (newValue instanceof DefaultValue) {
          reset(valueState);
          return;
        }
        set(valueState, newValue);
      },
    });
    const { result } = renderHook(
      () => ({
        state: useRecoilState(proxyState),
        reset: useResetRecoilState(proxyState),
      }),
      { wrapper },
    );

    act(() => result.current.state[1](5));
    expect(result.current.state[0]).toBe(5);

    act(() => result.current.reset());
    expect(received[1]).toBeInstanceOf(DefaultValue);
    expect(result.current.state[0]).toBe(1);
  });

  it('非同期 selector は Suspense で解決後の値を返す', async () => {
    const asyncState = selector<string>({
      key: uniqueKey('async'),
      get: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'resolved';
      },
    });

    const Viewer = () => <span data-testid="async">{useRecoilValue(asyncState)}</span>;

    render(
      <RecoilRoot>
        <Suspense fallback={<span data-testid="loading">loading</span>}>
          <Viewer />
        </Suspense>
      </RecoilRoot>,
    );

    expect(screen.getByTestId('loading')).toBeTruthy();
    expect((await screen.findByTestId('async')).textContent).toBe('resolved');
  });
});

describe('atomFamily', () => {
  it('構造的に等しいパラメータには同じ atom を、異なるパラメータには別の atom を返す', () => {
    const itemState = atomFamily<number, { id: string; tags: string[] }>({
      key: uniqueKey('item'),
      default: 0,
    });

    expect(itemState({ id: 'a', tags: ['x'] })).toBe(itemState({ tags: ['x'], id: 'a' }));
    expect(itemState({ id: 'a', tags: ['x'] })).not.toBe(itemState({ id: 'b', tags: ['x'] }));
  });

  it('パラメータごとに状態が独立し、default に関数を指定できる', () => {
    const labelState = atomFamily<string, string>({
      key: uniqueKey('label'),
      default: (param) => `label-${param}`,
    });
    const { result } = renderHook(
      () => ({
        a: useRecoilState(labelState('a')),
        b: useRecoilValue(labelState('b')),
      }),
      { wrapper },
    );

    expect(result.current.a[0]).toBe('label-a');
    expect(result.current.b).toBe('label-b');

    act(() => result.current.a[1]('changed'));
    expect(result.current.a[0]).toBe('changed');
    expect(result.current.b).toBe('label-b');
  });
});

describe('selectorFamily', () => {
  it('配列パラメータで値を導出し、構造的に等しいパラメータには同じ selector を返す', () => {
    const mapState = atom<Record<string, number>>({
      key: uniqueKey('map'),
      default: { a: 1, b: 2, c: 3 },
    });
    const sumSelector = selectorFamily<number, string[]>({
      key: uniqueKey('sum'),
      get:
        (ids) =>
        ({ get }) =>
          ids.reduce((acc, id) => acc + (get(mapState)[id] ?? 0), 0),
    });

    expect(sumSelector(['a', 'b'])).toBe(sumSelector(['a', 'b']));

    const { result } = renderHook(() => useRecoilValue(sumSelector(['a', 'c'])), {
      wrapper,
    });
    expect(result.current).toBe(4);
  });

  it('オブジェクトパラメータを毎レンダー新規生成しても無限レンダーにならない', () => {
    const baseState = atom<number>({ key: uniqueKey('base'), default: 2 });
    const multiplySelector = selectorFamily<number, { factor: number }>({
      key: uniqueKey('multiply'),
      get:
        ({ factor }) =>
        ({ get }) =>
          get(baseState) * factor,
    });
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return useRecoilValue(multiplySelector({ factor: 3 }));
      },
      { wrapper },
    );

    expect(result.current).toBe(6);
    expect(renderCount).toBeLessThan(5);
  });

  it('set を持つ selectorFamily に値と updater 関数で書き込める', () => {
    type Group = { id: string; count: number };
    const groupsState = atom<Group[]>({ key: uniqueKey('groups'), default: [] });
    const groupSelector = selectorFamily<Group, string>({
      key: uniqueKey('group'),
      get:
        (id) =>
        ({ get }) =>
          get(groupsState).find((g) => g.id === id) ?? { id, count: 0 },
      set:
        (id) =>
        ({ get, set }, newValue) => {
          if (newValue instanceof DefaultValue) {
            return;
          }
          const groups = get(groupsState);
          const exists = groups.some((g) => g.id === id);
          set(
            groupsState,
            exists ? groups.map((g) => (g.id === id ? newValue : g)) : [...groups, newValue],
          );
        },
    });
    const { result } = renderHook(
      () => ({
        group: useRecoilState(groupSelector('g1')),
        groups: useRecoilValue(groupsState),
      }),
      { wrapper },
    );

    act(() => result.current.group[1]({ id: 'g1', count: 1 }));
    act(() => result.current.group[1]((prev) => ({ ...prev, count: prev.count + 1 })));

    expect(result.current.groups).toEqual([{ id: 'g1', count: 2 }]);
  });

  it('selector の get 内で別の selectorFamily を参照できる', () => {
    const permissionsState = atom<Record<string, string[]>>({
      key: uniqueKey('permissions'),
      default: { g1: ['read'], g2: ['write'] },
    });
    const permissionSelector = selectorFamily<string[], string>({
      key: uniqueKey('permission'),
      get:
        (groupId) =>
        ({ get }) =>
          get(permissionsState)[groupId] ?? [],
    });
    const mergedSelector = selector<string[]>({
      key: uniqueKey('merged'),
      get: ({ get }) => ['g1', 'g2'].flatMap((id) => get(permissionSelector(id))),
    });
    const { result } = renderHook(() => useRecoilValue(mergedSelector), { wrapper });

    expect(result.current).toEqual(['read', 'write']);
  });
});

describe('waitForAll', () => {
  it('配列で渡した RecoilValue の値を配列で返す', () => {
    const aState = atom<number>({ key: uniqueKey('a'), default: 1 });
    const bSelector = selector<string>({ key: uniqueKey('b'), get: () => 'b' });
    const { result } = renderHook(() => useRecoilValue(waitForAll([aState, bSelector])), {
      wrapper,
    });

    expect(result.current).toEqual([1, 'b']);
  });

  it('オブジェクトで渡した RecoilValue の値をオブジェクトで返す', () => {
    const aState = atom<number>({ key: uniqueKey('a'), default: 1 });
    const bSelector = selector<string>({ key: uniqueKey('b'), get: () => 'b' });
    const { result } = renderHook(
      () => useRecoilValue(waitForAll({ a: aState, b: bSelector })),
      { wrapper },
    );

    expect(result.current).toEqual({ a: 1, b: 'b' });
  });

  it('レンダー毎に新しい配列を渡しても無限レンダーにならず、依存の変更に追従する', () => {
    const mapState = atom<Record<string, number>>({
      key: uniqueKey('map'),
      default: { a: 1, b: 2 },
    });
    const valueSelector = selectorFamily<number, string[]>({
      key: uniqueKey('value'),
      get:
        (ids) =>
        ({ get }) =>
          ids.reduce((acc, id) => acc + get(mapState)[id], 0),
    });
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return {
          list: useRecoilValue(waitForAll([['a'], ['a', 'b']].map((ids) => valueSelector(ids)))),
          setMap: useSetRecoilState(mapState),
        };
      },
      { wrapper },
    );

    expect(result.current.list).toEqual([1, 3]);
    expect(renderCount).toBeLessThan(5);

    act(() => result.current.setMap({ a: 10, b: 20 }));
    expect(result.current.list).toEqual([10, 30]);
  });

  it('空配列を渡すと空配列を返す', () => {
    const { result } = renderHook(() => useRecoilValue(waitForAll([])), { wrapper });

    expect(result.current).toEqual([]);
  });

  it('非同期 selector を含む場合は全て解決するまでサスペンドする', async () => {
    const syncState = atom<number>({ key: uniqueKey('sync'), default: 1 });
    const asyncState = selector<number>({
      key: uniqueKey('async'),
      get: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 2;
      },
    });

    const Viewer = () => {
      const [a, b] = useRecoilValue(waitForAll([syncState, asyncState]));
      return <span data-testid="all">{a + b}</span>;
    };

    render(
      <RecoilRoot>
        <Suspense fallback={<span>loading</span>}>
          <Viewer />
        </Suspense>
      </RecoilRoot>,
    );

    expect((await screen.findByTestId('all')).textContent).toBe('3');
  });
});

describe('jotai との相互運用', () => {
  it('アダプタで定義した atom を jotai のフックから直接読める', () => {
    const sharedState = atom<string>({ key: uniqueKey('shared'), default: 'from-adapter' });
    const { result } = renderHook(
      () => ({
        jotaiValue: useAtomValue(sharedState),
        setByRecoilApi: useSetRecoilState(sharedState),
      }),
      { wrapper },
    );

    expect(result.current.jotaiValue).toBe('from-adapter');

    act(() => result.current.setByRecoilApi('updated'));
    expect(result.current.jotaiValue).toBe('updated');
  });
});
