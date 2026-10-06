/**
 * family のパラメータを値で比較するためのキャッシュキーを生成する。
 * オブジェクトのキー順に依存しない文字列を返す（Recoil の stableStringify 相当）。
 */
export const stableStringify = (value: unknown): string => {
  if (value === undefined) {
    return '';
  }
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
    case 'boolean':
      return String(value);
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return value.toString();
    case 'function':
      return `__FUNCTION(${value.name})__`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.toJSON === 'function') {
    return stableStringify((record.toJSON as () => unknown)());
  }
  if (value instanceof Map) {
    const entries = [...value.entries()].map(
      ([k, v]) => `${stableStringify(k)}:${stableStringify(v)}`,
    );
    return `__MAP{${entries.sort().join(',')}}`;
  }
  if (value instanceof Set) {
    return `__SET[${[...value].map(stableStringify).sort().join(',')}]`;
  }
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
};
