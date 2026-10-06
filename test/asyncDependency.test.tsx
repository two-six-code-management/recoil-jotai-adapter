import { render, screen } from '@testing-library/react';
import { Component, ReactNode, Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { atom, RecoilRoot, selector, useRecoilValue } from '../src';

let seq = 0;
const uniqueKey = (name: string) => `${name}-${seq++}`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    return this.state.message !== null ? (
      <span data-testid="error">{this.state.message}</span>
    ) : (
      this.props.children
    );
  }
}

const renderInRoot = (children: ReactNode) =>
  render(
    <RecoilRoot>
      <ErrorBoundary>
        <Suspense fallback={<span>loading</span>}>{children}</Suspense>
      </ErrorBoundary>
    </RecoilRoot>,
  );

describe('非同期の依存', () => {
  it('同期 selector から非同期 selector を get すると解決済みの値を受け取れる', async () => {
    const userState = selector<{ name: string }>({
      key: uniqueKey('user'),
      get: async () => {
        await delay(10);
        return { name: 'taro' };
      },
    });
    const greetingState = selector<string>({
      key: uniqueKey('greeting'),
      get: ({ get }) => `hello ${get(userState).name}`,
    });

    const Viewer = () => <span data-testid="value">{useRecoilValue(greetingState)}</span>;
    renderInRoot(<Viewer />);

    expect((await screen.findByTestId('value')).textContent).toBe('hello taro');
  });

  it('async な get の中で await 後に別の値を get できる', async () => {
    const suffixState = atom<string>({ key: uniqueKey('suffix'), default: '!' });
    const asyncState = selector<string>({
      key: uniqueKey('async'),
      get: async ({ get }) => {
        await delay(10);
        return `done${get(suffixState)}`;
      },
    });

    const Viewer = () => <span data-testid="value">{useRecoilValue(asyncState)}</span>;
    renderInRoot(<Viewer />);

    expect((await screen.findByTestId('value')).textContent).toBe('done!');
  });

  it('非同期の依存が reject した場合はエラーとして伝播する', async () => {
    const failingState = selector<string>({
      key: uniqueKey('failing'),
      get: async () => {
        await delay(10);
        throw new Error('failed');
      },
    });
    const dependentState = selector<string>({
      key: uniqueKey('dependent'),
      get: ({ get }) => get(failingState).toUpperCase(),
    });

    const Viewer = () => <span>{useRecoilValue(dependentState)}</span>;
    renderInRoot(<Viewer />);

    expect((await screen.findByTestId('error')).textContent).toBe('failed');
  });
});
