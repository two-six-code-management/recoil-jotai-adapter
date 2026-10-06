# recoil-jotai-adapter

EOL を迎えた [Recoil](https://recoiljs.org/) の API を、[jotai](https://jotai.org/) v2 の上で再現する互換アダプタです。

`package.json` で `recoil` をこのパッケージに差し替えるだけで、**ソースコードを 1 行も変えずに** 内部実装を jotai に切り替えられます。

## 特徴

- `import { atom, useRecoilState } from 'recoil'` のまま動作する
- 生成される atom / selector は **jotai の atom そのもの** なので、`useAtom` など jotai の API と混在できる
  - 一括切替後に、ファイル単位で少しずつ jotai ネイティブの書き方へ移行できる
- family のパラメータは Recoil と同じく値で比較する（毎レンダー新しいオブジェクト・配列を渡しても同じ atom を返す）
- 非同期 selector（Suspense）と、selector 内での非同期依存の `get` に対応

## 導入方法

事前チェック・動作確認・CI 環境の要件・切り戻し・jotai への移行まで含めた詳しい手順は、[組み込みガイド](docs/integration.md) を参照してください。

### 1. パッケージを `recoil` という名前でインストールする

npm レジストリ（社内レジストリ / GitHub Packages 含む）に公開した場合:

```jsonc
// package.json
{
  "dependencies": {
    "jotai": "^2.20.3",
    "recoil": "npm:recoil-jotai-adapter@^0.2.0"
  }
}
```

GitHub リポジトリから直接インストールする場合（`prepare` でビルドされます）:

```jsonc
{
  "dependencies": {
    "jotai": "^2.20.3",
    "recoil": "github:two-six-code-management/recoil-jotai-adapter#v0.2.0"
  }
}
```

`npm i` 後、`node_modules/recoil` の実体がこのアダプタになります。TypeScript の型も Vite のバンドルも自動で切り替わるため、`tsconfig.json` や `vite.config.ts` の変更は不要です。

### 2. （任意）import パスを明示的に変える場合

npm alias を使わず、`recoil-jotai-adapter` として通常インストールして import パスを置換することもできます。

```ts
import { atom, useRecoilState } from 'recoil-jotai-adapter';
```

ただし全ファイルの差分になり他ブランチと競合しやすいため、**npm alias 方式を推奨** します。

## 対応 API

| API | 備考 |
| --- | --- |
| `RecoilRoot` | `initializeState`（`set` / `reset`）、`override` に対応。RecoilRoot ごとに独立した jotai store を持つ |
| `atom` | `default` に値 / Promise / 他の RecoilValue を指定可能。`default` 省略時は set されるまでサスペンド |
| `selector` | `get` / `set`、非同期 `get`、`get` から RecoilValue を返すパターンに対応 |
| `atomFamily` | `default` にパラメータを受け取る関数を指定可能 |
| `selectorFamily` | `get` / `set` に対応 |
| `waitForAll` | 配列・オブジェクトの両形式に対応 |
| `DefaultValue` | reset 時に selector の `set` へ渡される |
| `useRecoilState` / `useRecoilValue` / `useSetRecoilState` / `useResetRecoilState` | |
| `useRecoilCallback` | `snapshot`（`getLoadable` / `getPromise` / `retain`）、`set`、`reset`、`refresh`、`transact_UNSTABLE` に対応 |
| `useRecoilRefresher_UNSTABLE` | 依存している上流の selector も再評価する（Recoil と同じ） |
| `Loadable` | `state` / `contents` と `getValue` / `toPromise` / `valueMaybe` / `valueOrThrow` / `errorMaybe` / `errorOrThrow` / `promiseMaybe` / `promiseOrThrow` |
| 型: `RecoilState` / `RecoilValue` / `RecoilValueReadOnly` / `SetterOrUpdater` / `SerializableParam` など | |

## 非対応 API

以下は未実装です。利用している場合は import 時に型エラー（存在しない export）になるため、切替前に検出できます。

- `useRecoilValueLoadable` / `useRecoilStateLoadable`、`RecoilLoadable`
- `useRecoilCallback` の `gotoSnapshot`、Snapshot の `map` / `asyncMap` / `getID` / `getInfo_UNSTABLE` / `getNodes_UNSTABLE` など
- Snapshot 系（`useRecoilSnapshot`、`useGotoRecoilSnapshot`、`snapshot_UNSTABLE` など）
- atom の `effects`（オプションの型に存在しないため指定すると型エラー）
- `waitForAny` / `waitForNone` / `noWait` / `constSelector` / `errorSelector`
- `RecoilEnv`、`useRecoilBridgeAcrossReactRoots`、`cachePolicy_UNSTABLE`

## Recoil との挙動の違い

| 項目 | Recoil | このアダプタ |
| --- | --- | --- |
| 値の freeze | 開発モードで値を deep freeze し、破壊的変更で例外 | freeze しない（破壊的変更しても例外にならない） |
| 重複した `key` | 同じ key の atom を警告して同一扱い | `key` はデバッグラベルとしてのみ使い、別々の atom になる |
| RecoilRoot 外での利用 | 例外 | jotai のデフォルト store を使って動作する |
| selector の `get` の `getCallback` | 利用可能 | 非対応 |
| `useRecoilCallback` の `snapshot` | コールバックを呼んだ時点の状態で固定される | 固定されず、読むたびに最新の状態を返す |
| `snapshot.retain()` | 呼ばないとコールバック終了後に未解決の非同期評価が打ち切られる | 何もしない（打ち切りも起きない） |

## jotai への段階的移行

アダプタの atom は jotai の atom なので、切替後は次のように混在できます。

```ts
import { useAtom } from 'jotai';
import { countState } from '@/state/count'; // recoil の atom() で定義したもの

const [count, setCount] = useAtom(countState);
```

最終的にすべての import を jotai に置き換えたら、このアダプタを削除してください。

## 開発

```sh
npm i
npm test       # vitest（型テストを含む）
npm run build  # dist に ESM / CJS / 型定義を出力
```
