/**
 * Recoil の DefaultValue 互換クラス。
 * reset 時に selector の set へ渡され、`instanceof DefaultValue` で判定する。
 */
export class DefaultValue {
  // 固有のタグを持たせ、instanceof の絞り込みで T 側が消えないようにする（Recoil と同じ定義）
  readonly _tag = 'DefaultValue' as const;
}
