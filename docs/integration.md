# 組み込みガイド

Recoil を使っている既存の React プロジェクトに recoil-jotai-adapter を組み込み、内部実装を jotai に切り替えるまでの手順です。

## 全体の流れ

1. [前提条件を確認する](#1-前提条件)
2. [非対応 API を使っていないか確認する](#2-非対応-api-の事前チェック)
3. [依存を差し替える](#3-依存の差し替え)
4. [動作を確認する](#4-動作確認)
5. [CI / デプロイ環境を確認する](#5-ci--デプロイ環境)
6. [本番に出す](#6-リリースと切り戻し)
7. （任意）[jotai ネイティブの書き方へ段階的に移行する](#7-jotai-への段階的移行)

切替そのものは `package.json` の変更だけで完結し、ソースコードは変更しません。そのため切替の PR は他の機能開発と独立してリリース・切り戻しができます。

## 1. 前提条件

| 項目 | 条件 |
| --- | --- |
| React | 17 以上（17.0.2 / 18.3.1 で動作確認済み） |
| jotai | 2 系（`^2.12.0` 以上）。jotai 3 系は Node.js 22.12 以上と TypeScript 5.5 以上が必要なため対象外 |
| TypeScript | 4.6.4 / 5.5.4 で動作確認済み。4.8 未満では jotai に同梱の旧 TypeScript 向け型定義が使われる |
| 置き換え元の Recoil | 0.4 系 / 0.7 系で動作確認済み |

## 2. 非対応 API の事前チェック

アダプタが対応していない API を使っていると、切替後に型エラーやビルドエラーになります。切替前にプロジェクトのルートで次のコマンドを実行し、**何も出力されないこと**を確認してください。

```sh
grep -rnE "\b(useRecoilValueLoadable|useRecoilStateLoadable|useRecoilSnapshot|useGotoRecoilSnapshot|useRecoilTransaction_UNSTABLE|snapshot_UNSTABLE|waitForAny|waitForNone|waitForAllSettled|noWait|constSelector|errorSelector|RecoilEnv|useRecoilBridgeAcrossReactRoots_UNSTABLE|RecoilLoadable|effects_UNSTABLE|gotoSnapshot|getInfo_UNSTABLE|getNodes_UNSTABLE)\b|\beffects\s*:|cachePolicy_UNSTABLE|getCallback" \
  --include='*.ts' --include='*.tsx' src
```

`effects:` は Recoil 以外のコードにも一致することがあります。ヒットした場合は、atom のオプションとして使っているかを目で確認してください。

非対応 API が見つかった場合は、切替前に対応 API で書き換えるか、[Issue](https://github.com/two-six-code-management/recoil-jotai-adapter/issues) で相談してください。

### 対応している API

`RecoilRoot` / `atom` / `selector` / `atomFamily` / `selectorFamily` / `waitForAll` / `DefaultValue` / `useRecoilState` / `useRecoilValue` / `useSetRecoilState` / `useResetRecoilState` / `useRecoilCallback` / `useRecoilRefresher_UNSTABLE` / `isRecoilValue`

`useRecoilCallback` に渡される機能のうち `snapshot`（`getLoadable` / `getPromise` / `retain`）、`set`、`reset`、`refresh`、`transact_UNSTABLE` に対応しています。`gotoSnapshot` は非対応です。

型: `RecoilState` / `RecoilValue` / `RecoilValueReadOnly` / `SetterOrUpdater` / `Resetter` / `GetRecoilValue` / `SetRecoilState` / `ResetRecoilState` / `SerializableParam` / `MutableSnapshot` / `Loadable` / `Snapshot` / `CallbackInterface`

## 3. 依存の差し替え

`recoil` という名前のままアダプタをインストールします。こうすると `node_modules/recoil` の実体がアダプタになり、`import ... from 'recoil'` は書き換えずに動きます。TypeScript の型解決も Vite / webpack のバンドルも自動で切り替わるため、`tsconfig.json` やバンドラの設定変更は不要です。

### 方法 A: GitHub のタグを指定する（推奨）

```sh
npm i "recoil@github:two-six-code-management/recoil-jotai-adapter#v0.2.0" jotai@^2.20.3
```

`package.json` は次のようになります。

```jsonc
{
  "dependencies": {
    "jotai": "^2.20.3",
    "recoil": "github:two-six-code-management/recoil-jotai-adapter#v0.2.0"
  }
}
```

- タグ（`#v0.2.0`）は必ず指定してください。省略するとインストールのたびに `main` の最新が入り、ビルド結果が変わる恐れがあります。
- インストール時に `prepare` スクリプトでビルドされます。そのため `npm install` / `npm ci` を実行する環境にはネットワーク接続が必要です。

### 方法 B: npm レジストリから入れる

npm レジストリ（社内レジストリや GitHub Packages を含む）に公開している場合は、npm の alias を使います。

```jsonc
{
  "dependencies": {
    "jotai": "^2.20.3",
    "recoil": "npm:recoil-jotai-adapter@^0.2.0"
  }
}
```

### 方法 C: import パスを書き換える（非推奨）

通常の名前でインストールし、import 文を書き換えることもできます。

```sh
npm i "recoil-jotai-adapter@github:two-six-code-management/recoil-jotai-adapter#v0.2.0" jotai@^2.20.3
npm uninstall recoil
```

```ts
import { atom, useRecoilState } from 'recoil-jotai-adapter';
```

この方法では Recoil を使う全ファイルが差分になり、他のブランチと競合しやすくなります。特に「マージ済みの中から一部だけをリリースする」運用とは相性が悪いため、方法 A か B を使ってください。

### インストール結果の確認

```sh
node -p "require('recoil/package.json').name"
# => recoil-jotai-adapter と表示されれば成功

npm ls jotai
# => jotai が 1 つだけ（重複なし）であること
```

`package-lock.json` も必ずコミットしてください。方法 A の場合、lock には `git+ssh://git@github.com/...#<コミットハッシュ>` の形で記録されます。リポジトリは public なので、SSH 鍵のない環境でも HTTPS 経由で取得できます。

## 4. 動作確認

| 確認項目 | コマンド例 | 期待結果 |
| --- | --- | --- |
| 型チェック | `npx tsc --noEmit` | エラーなし |
| ユニットテスト | `npm test` | 切替前と同じ結果 |
| 本番ビルド | `npm run build` | 成功 |
| 画面の動作 | 開発サーバ / STG 環境 | 状態の共有・更新・リセットを使う主要な画面が正常に動く |

型チェック・テスト・ビルドは切替前にも実行して、結果を比較できるようにしておくと安心です。

### 画面確認で特に見るべき箇所

[Recoil との挙動の違い](#recoil-との挙動の違い)に関係する箇所を重点的に確認してください。

- 書き込みできる selector / selectorFamily（`set` を持つもの）を使っている画面
- `useResetRecoilState` で状態をリセットしている画面
- 非同期 selector と `<Suspense>` を使っている画面
- 同じ `key` の atom を複数のファイルで定義している箇所（下記参照）
- `useRecoilCallback` の中で `set` した後に、同じ `snapshot` を読み直している箇所（下記参照）

### テストコードについて

`<RecoilRoot>` で囲んで `renderHook` / `render` しているテストは、そのまま動きます。`initializeState` の `set` / `reset` にも対応しています。

アダプタは ESM と CommonJS の両方を同梱しているため、Vitest だけでなく Jest（ts-jest）でも追加設定なしで動きます。

## 5. CI / デプロイ環境

`npm install` / `npm ci` を実行するすべての環境で、次の 2 点を満たしている必要があります。

- `github.com` と `codeload.github.com` に HTTPS で接続できる
- `registry.npmjs.org` に接続できる（`prepare` でのビルドに必要な devDependencies を取得するため）

確認が必要な環境の例:

- GitHub Actions などの CI
- AWS CodeBuild などのビルド環境
- Elastic Beanstalk のように、デプロイ先で `npm install` が走る環境

認証情報のない環境での動作は、次のように再現して確認できます。

```sh
mkdir -p /tmp/ci-sim/home /tmp/ci-sim/app
cp package.json package-lock.json /tmp/ci-sim/app/
cd /tmp/ci-sim/app
env -i PATH="$PATH" HOME=/tmp/ci-sim/home npm_config_cache=/tmp/ci-sim/home/.npm \
  GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -F /dev/null -i /dev/null -o IdentitiesOnly=yes" \
  npm ci
node -p "require('recoil/package.json').name"
```

## 6. リリースと切り戻し

### リリース時の注意

- **切替がリリースされるまでは、jotai の API（`useAtom` など）を直接使うコードを他の変更に混ぜないでください。** 本物の Recoil で定義した atom は jotai のフックでは読めないため、切替より先にリリースされると動きません。
- 切替の PR は `package.json` と `package-lock.json` だけの変更になるため、他の機能開発とは独立してリリースできます。

### 切り戻し

切替の PR（またはコミット）を revert して再ビルド・再デプロイするだけです。ソースコードは変えていないので、元の Recoil でそのまま動きます。

```sh
git revert <切替コミット>
```

### アダプタの更新

新しいタグが出たら、タグを変えてインストールし直します。

```sh
npm i "recoil@github:two-six-code-management/recoil-jotai-adapter#v0.2.0"
```

## 7. jotai への段階的移行

アダプタが作る atom / selector は jotai の atom そのものです。切替がリリースされた後は、jotai の書き方を少しずつ混ぜられます。

```ts
import { useAtom, useAtomValue } from 'jotai';
import { countState, totalSelector } from '@/state/count'; // 'recoil' の atom() / selector() で定義したもの

const [count, setCount] = useAtom(countState);
const total = useAtomValue(totalSelector);
```

### 書き換えの対応表

| Recoil（アダプタ） | jotai |
| --- | --- |
| `<RecoilRoot>` | `<Provider>` |
| `atom({ key, default })` | `atom(default)` |
| `selector({ key, get })` | `atom((get) => ...)` |
| `selector({ key, get, set })` | `atom((get) => ..., (get, set, newValue) => ...)` |
| `atomFamily` / `selectorFamily` | `jotai-family` パッケージの `atomFamily` |
| `useRecoilState` | `useAtom` |
| `useRecoilValue` | `useAtomValue` |
| `useSetRecoilState` | `useSetAtom` |
| `useResetRecoilState` | `jotai/utils` の `atomWithReset` + `useResetAtom` |
| `useRecoilCallback` | `jotai/utils` の `useAtomCallback`、または `useStore()` で取得した store の `get` / `set` |
| `useRecoilRefresher_UNSTABLE` | `jotai/utils` の `atomWithRefresh` |
| `waitForAll([a, b])` | `atom((get) => [get(a), get(b)])`（非同期なら `Promise.all`） |

### 移行時の注意

- **family のパラメータ比較が変わります。** アダプタは Recoil と同じく、パラメータを値で比較します。`jotai-family` の `atomFamily` は既定で参照で比較するため、毎レンダー新しいオブジェクトや配列を渡すと、そのたびに別の atom が作られます。第 2 引数に比較関数（例: `lodash` の `isEqual`）を渡してください。
- **atom の定義と利用箇所は同時に移行しなくて構いません。** たとえば定義を `recoil` の `atom()` のまま、利用側だけを `useAtom` に変えられます。逆に、jotai の `atom()` で定義した atom を `useRecoilValue` で読むこともできます。
- jotai の `atomFamily`（`jotai/utils`）は非推奨で、jotai 3 で削除予定です。`jotai-family` を使ってください。

すべての import を `jotai` に置き換えたら、`package.json` から `recoil`（アダプタ）を削除して移行完了です。

## Recoil との挙動の違い

| 項目 | Recoil | アダプタ | 影響と対処 |
| --- | --- | --- | --- |
| 値の freeze | 開発モードで deep freeze し、直接書き換えると例外 | freeze しない | 直接書き換えるバグが例外にならず見逃されやすくなる。更新は必ず新しいオブジェクトで行う |
| 重複した `key` | 警告を出して同じ atom として扱う | 別々の atom になる | 同じ key を別ファイルで定義し、状態の共有を期待しているコードは動かなくなる。定義を 1 か所にまとめる |
| `<RecoilRoot>` の外での利用 | 例外 | jotai の既定 store で動く | 囲み忘れがエラーにならない |
| selector の `getCallback` | 利用できる | 非対応 | 事前チェックで検出される |
| `useRecoilCallback` の `snapshot` | コールバックを呼んだ時点の状態で固定される | 固定されず、読むたびに最新の状態を返す | `set` の後に同じ `snapshot` を読み直すと、Recoil では変更前、アダプタでは変更後の値になる。`set` する前に読んだ値を変数に保持しておけば違いは出ない |
| `snapshot.retain()` | 呼ばないと、コールバック終了後に未解決の非同期評価が打ち切られる | 何もしない（打ち切りも起きない） | 呼んだままでも問題ない |

## トラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| `Cannot find module 'jotai'` | jotai は peer dependency なので、アプリ側に `jotai` をインストールする |
| `Module '"recoil"' has no exported member 'xxx'` | 非対応 API を使っている。[事前チェック](#2-非対応-api-の事前チェック)を参照 |
| 状態が画面間で共有されない | jotai が重複してインストールされている可能性がある。`npm ls jotai` で 1 つだけか確認し、`npm dedupe` を実行する |
| CI で `npm ci` が失敗する | [CI / デプロイ環境](#5-ci--デプロイ環境)の接続要件を確認する |
| family の atom が毎回作り直されて値が保持されない | jotai ネイティブの `atomFamily` に移行した箇所で、パラメータが参照で比較されている。[移行時の注意](#移行時の注意)を参照 |
