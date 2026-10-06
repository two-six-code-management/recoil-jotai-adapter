import { act, render, renderHook, screen } from '@testing-library/react';
import { ReactNode, Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import {
  atom,
  atomFamily,
  DefaultValue,
  RecoilRoot,
  selector,
  selectorFamily,
  useRecoilCallback,
  useRecoilRefresher_UNSTABLE,
  useRecoilValue,
} from '../src';

let seq = 0;
const uniqueKey = (name: string) => `${name}-${seq++}`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const wrapper = ({ children }: { children: ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe('useRecoilCallback', () => {
  it('set に値と updater 関数を渡して更新でき、reset で default に戻る', () => {
    const countState = atom<number>({ key: uniqueKey('count'), default: 0 });
    const { result } = renderHook(
      () => ({
        count: useRecoilValue(countState),
        increment: useRecoilCallback(({ set }) => () => set(countState, (prev) => prev + 1)),
        setTen: useRecoilCallback(({ set }) => () => set(countState, 10)),
        reset: useRecoilCallback(({ reset }) => () => reset(countState)),
      }),
      { wrapper },
    );

    act(() => result.current.setTen());
    act(() => result.current.increment());
    expect(result.current.count).toBe(11);

    act(() => result.current.reset());
    expect(result.current.count).toBe(0);
  });

  it('購読していない値を、再レンダーせずに最新の状態で読める', async () => {
    const nameState = atom<string>({ key: uniqueKey('name'), default: 'a' });
    const upperState = selector<string>({
      key: uniqueKey('upper'),
      get: ({ get }) => get(nameState).toUpperCase(),
    });
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return {
          setName: useRecoilCallback(({ set }) => (name: string) => set(nameState, name)),
          read: useRecoilCallback(({ snapshot }) => async () => ({
            loadable: snapshot.getLoadable(upperState).contents,
            promise: await snapshot.getPromise(nameState),
          })),
        };
      },
      { wrapper },
    );

    act(() => result.current.setName('b'));

    await expect(result.current.read()).resolves.toEqual({ loadable: 'B', promise: 'b' });
    expect(renderCount).toBe(1);
  });

  it('コールバックに渡した引数と戻り値をそのまま扱える', async () => {
    const { result } = renderHook(
      () => useRecoilCallback(() => async (a: number, b: number) => a + b),
      { wrapper },
    );

    await expect(result.current(1, 2)).resolves.toBe(3);
  });

  it('deps が変わらない間は同じ関数を返し、変わると作り直す', () => {
    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) => useRecoilCallback(() => () => dep, [dep]),
      { wrapper, initialProps: { dep: 1 } },
    );
    const first = result.current;

    rerender({ dep: 1 });
    expect(result.current).toBe(first);

    rerender({ dep: 2 });
    expect(result.current).not.toBe(first);
    expect(result.current()).toBe(2);
  });

  it('RecoilRoot ごとの状態を扱う', () => {
    const valueState = atom<string>({ key: uniqueKey('value'), default: 'default' });
    const Reader = ({ testId }: { testId: string }) => {
      const read = useRecoilCallback(({ snapshot }) => () => snapshot.getLoadable(valueState).getValue());
      return (
        <button data-testid={testId} onClick={(e) => (e.currentTarget.textContent = read())}>
          read
        </button>
      );
    };

    render(
      <>
        <RecoilRoot initializeState={({ set }) => set(valueState, 'first')}>
          <Reader testId="first" />
        </RecoilRoot>
        <RecoilRoot>
          <Reader testId="second" />
        </RecoilRoot>
      </>,
    );

    act(() => screen.getByTestId('first').click());
    act(() => screen.getByTestId('second').click());

    expect(screen.getByTestId('first').textContent).toBe('first');
    expect(screen.getByTestId('second').textContent).toBe('default');
  });
});

describe('snapshot.getLoadable', () => {
  it('同期の値は hasValue になり、getValue / valueMaybe / toPromise で取り出せる', async () => {
    const countState = atom<number>({ key: uniqueKey('count'), default: 3 });
    const { result } = renderHook(
      () => useRecoilCallback(({ snapshot }) => () => snapshot.getLoadable(countState)),
      { wrapper },
    );

    const loadable = result.current();

    expect(loadable.state).toBe('hasValue');
    expect(loadable.contents).toBe(3);
    expect(loadable.getValue()).toBe(3);
    expect(loadable.valueMaybe()).toBe(3);
    expect(loadable.valueOrThrow()).toBe(3);
    expect(loadable.errorMaybe()).toBeUndefined();
    expect(loadable.promiseMaybe()).toBeUndefined();
    await expect(loadable.toPromise()).resolves.toBe(3);
  });

  it('未解決の非同期 selector は loading になり、解決後に読み直すと hasValue になる', async () => {
    const asyncState = selector<string>({
      key: uniqueKey('async'),
      get: async () => {
        await delay(10);
        return 'done';
      },
    });
    const { result } = renderHook(
      () => useRecoilCallback(({ snapshot }) => () => snapshot.getLoadable(asyncState)),
      { wrapper },
    );

    const loading = result.current();
    expect(loading.state).toBe('loading');
    expect(loading.valueMaybe()).toBeUndefined();
    expect(() => loading.valueOrThrow()).toThrow();
    await expect(loading.contents).resolves.toBe('done');
    await expect(loading.toPromise()).resolves.toBe('done');

    // then のコールバックで解決済みとして記録されるまで待つ
    await delay(0);
    const loaded = result.current();
    expect(loaded.state).toBe('hasValue');
    expect(loaded.contents).toBe('done');
  });

  it('get で例外を投げる selector は hasError になり、getValue で例外を投げる', () => {
    const error = new Error('broken');
    const brokenState = selector<number>({
      key: uniqueKey('broken'),
      get: () => {
        throw error;
      },
    });
    const { result } = renderHook(
      () => useRecoilCallback(({ snapshot }) => () => snapshot.getLoadable(brokenState)),
      { wrapper },
    );

    const loadable = result.current();

    expect(loadable.state).toBe('hasError');
    expect(loadable.contents).toBe(error);
    expect(loadable.errorMaybe()).toBe(error);
    expect(() => loadable.getValue()).toThrow(error);
  });

  it('reject した非同期 selector は、解決後に読み直すと hasError になる', async () => {
    const error = new Error('failed');
    const failingState = selector<string>({
      key: uniqueKey('failing'),
      get: async () => {
        await delay(10);
        throw error;
      },
    });
    const { result } = renderHook(
      () => useRecoilCallback(({ snapshot }) => () => snapshot.getLoadable(failingState)),
      { wrapper },
    );

    await expect(result.current().contents).rejects.toBe(error);
    await delay(0);

    const loadable = result.current();
    expect(loadable.state).toBe('hasError');
    expect(loadable.contents).toBe(error);
  });
});

describe('snapshot.getPromise', () => {
  it('同期・非同期どちらの値も Promise で受け取れる', async () => {
    const syncState = atom<number>({ key: uniqueKey('sync'), default: 1 });
    const asyncState = selector<number>({
      key: uniqueKey('async'),
      get: async () => {
        await delay(10);
        return 2;
      },
    });
    const { result } = renderHook(
      () =>
        useRecoilCallback(({ snapshot }) => async () => [
          await snapshot.getPromise(syncState),
          await snapshot.getPromise<number>(asyncState),
        ]),
      { wrapper },
    );

    await expect(result.current()).resolves.toEqual([1, 2]);
  });

  it('get で例外を投げる selector は reject される', async () => {
    const brokenState = selector<number>({
      key: uniqueKey('broken'),
      get: () => {
        throw new Error('broken');
      },
    });
    const { result } = renderHook(
      () => useRecoilCallback(({ snapshot }) => () => snapshot.getPromise(brokenState)),
      { wrapper },
    );

    await expect(result.current()).rejects.toThrow('broken');
  });

  it('依存のない非同期 selectorFamily は、何度読んでも・後でマウントしても 1 回しか評価されない', async () => {
    let fetchCount = 0;
    const imageQuery = selectorFamily<string, [page: number, documentId: string]>({
      key: uniqueKey('image'),
      get:
        ([page, documentId]) =>
        async () => {
          fetchCount++;
          await delay(10);
          return `${documentId}-${page}`;
        },
    });

    const Prefetcher = ({ children }: { children: ReactNode }) => {
      const prefetch = useRecoilCallback(({ snapshot }) => async () => {
        snapshot.getLoadable(imageQuery([1, 'doc']));
        return snapshot.getPromise(imageQuery([1, 'doc']));
      });
      return (
        <>
          <button data-testid="prefetch" onClick={() => void prefetch()} />
          {children}
        </>
      );
    };
    const Viewer = () => <span data-testid="image">{useRecoilValue(imageQuery([1, 'doc']))}</span>;

    const { rerender } = render(
      <RecoilRoot>
        <Prefetcher>{null}</Prefetcher>
      </RecoilRoot>,
    );
    act(() => screen.getByTestId('prefetch').click());
    await delay(20);

    rerender(
      <RecoilRoot>
        <Prefetcher>
          <Suspense fallback={<span>loading</span>}>
            <Viewer />
          </Suspense>
        </Prefetcher>
      </RecoilRoot>,
    );

    expect((await screen.findByTestId('image')).textContent).toBe('doc-1');
    expect(fetchCount).toBe(1);
  });
});

describe('snapshot.retain', () => {
  it('解放用の関数を返す', () => {
    const { result } = renderHook(
      () =>
        useRecoilCallback(({ snapshot }) => () => {
          const release = snapshot.retain();
          release();
          return typeof release;
        }),
      { wrapper },
    );

    expect(result.current()).toBe('function');
  });
});

describe('refresh', () => {
  const createCountingSelector = () => {
    let evaluateCount = 0;
    const baseState = atom<number>({ key: uniqueKey('base'), default: 1 });
    const countingSelector = selector<string>({
      key: uniqueKey('counting'),
      get: ({ get }) => {
        evaluateCount++;
        return `${get(baseState)}-${evaluateCount}`;
      },
    });
    return { countingSelector, getEvaluateCount: () => evaluateCount };
  };

  it('useRecoilCallback の refresh で selector を再評価させる', () => {
    const { countingSelector, getEvaluateCount } = createCountingSelector();
    const { result } = renderHook(
      () => ({
        value: useRecoilValue(countingSelector),
        refresh: useRecoilCallback(({ refresh }) => () => refresh(countingSelector)),
      }),
      { wrapper },
    );
    const before = getEvaluateCount();

    act(() => result.current.refresh());

    expect(getEvaluateCount()).toBe(before + 1);
    expect(result.current.value).toBe(`1-${before + 1}`);
  });

  it('useRecoilRefresher_UNSTABLE で selector を再評価させる', () => {
    const { countingSelector, getEvaluateCount } = createCountingSelector();
    const { result } = renderHook(
      () => ({
        value: useRecoilValue(countingSelector),
        refresh: useRecoilRefresher_UNSTABLE(countingSelector),
      }),
      { wrapper },
    );
    const before = getEvaluateCount();

    act(() => result.current.refresh());

    expect(getEvaluateCount()).toBe(before + 1);
  });

  it('atom の refresh は何もしない', () => {
    const countState = atom<number>({ key: uniqueKey('count'), default: 0 });
    const { result } = renderHook(
      () => ({
        count: useRecoilValue(countState),
        setOne: useRecoilCallback(({ set }) => () => set(countState, 1)),
        refresh: useRecoilCallback(({ refresh }) => () => refresh(countState)),
      }),
      { wrapper },
    );

    act(() => result.current.setOne());
    act(() => result.current.refresh());

    expect(result.current.count).toBe(1);
  });
});

describe('transact_UNSTABLE', () => {
  it('get / set / reset を同期的に実行できる', () => {
    const aState = atom<number>({ key: uniqueKey('a'), default: 1 });
    const bState = atom<number>({ key: uniqueKey('b'), default: 0 });
    const { result } = renderHook(
      () => ({
        a: useRecoilValue(aState),
        b: useRecoilValue(bState),
        run: useRecoilCallback(({ transact_UNSTABLE }) => () =>
          transact_UNSTABLE(({ get, set, reset }) => {
            set(aState, 10);
            set(bState, get(aState) * 2);
            reset(aState);
          }),
        ),
      }),
      { wrapper },
    );

    act(() => result.current.run());

    expect(result.current.a).toBe(1);
    expect(result.current.b).toBe(20);
  });

  it('set に DefaultValue を渡すと reset になる', () => {
    const aState = atom<number>({ key: uniqueKey('a'), default: 1 });
    const { result } = renderHook(
      () => ({
        a: useRecoilValue(aState),
        setTwo: useRecoilCallback(({ set }) => () => set(aState, 2)),
        resetBySet: useRecoilCallback(({ set }) => () => set(aState, new DefaultValue())),
      }),
      { wrapper },
    );

    act(() => result.current.setTwo());
    act(() => result.current.resetBySet());

    expect(result.current.a).toBe(1);
  });
});

describe('Suspense で解決済みになった非同期の値', () => {
  const renderResolved = async (target: Parameters<typeof useRecoilValue>[0]) => {
    let read: () => { state: string; contents: unknown } = () => ({ state: '', contents: null });
    const Viewer = () => {
      const value = useRecoilValue(target);
      read = useRecoilCallback(({ snapshot }) => () => {
        const loadable = snapshot.getLoadable(target);
        return { state: loadable.state, contents: loadable.contents };
      });
      return <span data-testid="resolved">{String(value)}</span>;
    };
    render(
      <RecoilRoot>
        <Suspense fallback={<span>loading</span>}>
          <Viewer />
        </Suspense>
      </RecoilRoot>,
    );
    await screen.findByTestId('resolved');
    return () => read();
  };

  it('default が Promise の atom は、画面に表示された後の getLoadable で hasValue になる', async () => {
    const pageInfoFamily = atomFamily<number, [documentId: string]>({
      key: uniqueKey('pageInfo'),
      default: async ([documentId]) => {
        await delay(10);
        return documentId.length;
      },
    });

    const read = await renderResolved(pageInfoFamily(['doc']));

    expect(read()).toEqual({ state: 'hasValue', contents: 3 });
  });

  it('非同期 selector は、画面に表示された後の getLoadable で hasValue になる', async () => {
    const asyncSelector = selector<string>({
      key: uniqueKey('async'),
      get: async () => {
        await delay(10);
        return 'done';
      },
    });

    const read = await renderResolved(asyncSelector);

    expect(read()).toEqual({ state: 'hasValue', contents: 'done' });
  });
});
