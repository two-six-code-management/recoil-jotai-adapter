import { describe, expect, it } from 'vitest';
import { stableStringify } from '../src/stableStringify';

describe('stableStringify', () => {
  it('オブジェクトのキー順に依存しない', () => {
    expect(stableStringify({ a: 1, b: [1, 2] })).toBe(stableStringify({ b: [1, 2], a: 1 }));
  });

  it('文字列と数値を区別する', () => {
    expect(stableStringify('1')).not.toBe(stableStringify(1));
  });

  it('undefined のプロパティは省略と同一視する', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it('Date は toJSON の結果で比較する', () => {
    expect(stableStringify(new Date('2026-01-01T00:00:00Z'))).toBe(
      stableStringify(new Date('2026-01-01T00:00:00Z')),
    );
  });

  it('Map と Set は要素順に依存しない', () => {
    expect(stableStringify(new Set([1, 2]))).toBe(stableStringify(new Set([2, 1])));
    expect(
      stableStringify(
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ),
    ).toBe(
      stableStringify(
        new Map([
          ['b', 2],
          ['a', 1],
        ]),
      ),
    );
  });
});
