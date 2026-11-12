# 計画書：Notion To EmDash を EmDash のプラグインにして、公開レジストリに出す

作成日：2026-11-12

## 1. やりたいこと

- Notion のデータベースから記事を取りこむ部分を、EmDash のサンドボックス型プラグインにする。管理画面のレジストリから入れるだけで使えるようにする。
- 今の GitHub Actions 版も残す。プラグインでは描けない自動サムネイルを受け持つ。
- NewConnect は、プラグインを GitHub から入れて `astro.config.mjs` の `plugins` で動かす（Bluesky To EmDash と同じ。Workers の無料プランのまま使える）。

## 2. 決まっていること

| 項目 | 決定 |
| --- | --- |
| 形 | EmDash のプラグイン版（レジストリに出す）と GitHub Actions 版の 2 つにする（2026-11-12 決定） |
| Notion Workers | 使わない。無料プランでは使えないため（2026-11-12 決定。[料金の説明](https://www.notion.com/ja/help/understand-pricing-for-workers)） |
| プラグインの形 | サンドボックス型（`emdash-plugin.jsonc` と `src/plugin.ts`）。Bluesky To EmDash と同じ作り |
| サムネイル | プラグインでは描かない。1 枚に CPU を 30〜150 ms 使い、サンドボックスの上限（1 回 50 ms）と Workers 無料プランの上限（10 ms）を超える。`@napi-rs/canvas` も Workers では動かない |
| Notion のデータベースの項目 | 今の GitHub Actions 版と同じ（タイトル、公開、スラッグ、抜粋、カテゴリ、タグ、アイキャッチ、EmDash URL、送信日時）。どちらで送っても同じ印が残るので、あとから乗りかえられる |

## 3. 役割の分け方

```
Notion のデータベース（記事を書き、「公開」に印を付ける）
      │
      ▼
EmDash のプラグイン（サイトの中、数分ごとの cron）
      │  ① 「公開」に印があり、まだ送っていない・送ったあとに直したページを探す
      │  ② 本文を Portable Text に変える
      │  ③ 本文の画像とアイキャッチを取ってきて、メディアにアップロードする
      │  ④ 記事を作る・更新して、公開する
      │  ⑤ Notion に EmDash URL と送信日時を書き戻す
      ▼
EmDash のサイト
      ▲
      │  （あってもなくてもよい）
GitHub Actions 版（30 分ごと）
         アイキャッチのない記事を探し、Auto Thumbnail Design のデザインで
         1200×630 の PNG を描いて、アイキャッチに付ける
```

## 4. プラグインの中身（案）

**権限（`capabilities`）**

| 権限 | 使い道 |
| --- | --- |
| `network:request` | Notion の API と、Notion に置いた画像を読む |
| `schema:read` | `posts` に必要な項目があるかを確かめる |
| `content:read` / `content:write` / `content:publish` | 記事を探す・作る・直す・公開する |
| `taxonomies:write` | カテゴリとタグを作り、記事に付ける |
| `media:write` | 画像をアップロードする |

**通信してよい相手（`allowedHosts`）**：`api.notion.com`、`prod-files-secure.s3.us-west-2.amazonaws.com`（Notion に置いた画像。2026-11-10 の本物のページで確かめた置き場所）。ほかの場所から届いた画像は、外のサイトの画像と同じくリンクのまま残す。

**設定（管理画面）**：Notion のインテグレーションのトークン（暗号化して保存）、データベースの ID、項目名（初期値は 2 章のとおり）、公開で送るか下書きで送るか。

**記録（`storage`）**：送ったページ（Notion のページ ID → EmDash の記事 ID、送った日時）。途中で止まった処理の続き（6 章）。

## 5. GitHub Actions 版の変更（案）

- 今の動き（Notion から送り、サムネイルも描く）はそのまま残す。プラグインを使わない人はこれまでどおり使える。
- 新しく「サムネイルだけ」の動かし方を足す。EmDash の記事のうち、アイキャッチがないものを探して描く。Notion は読まないので、Notion のトークンは要らない。
- プラグインと Actions 版の両方で Notion から送ると記事が二重になるので、README に「どちらか一方で送る」と書く。

## 6. 気をつけること

- **1 回に使える量が少ない**：サンドボックスでは 1 回の実行で CPU 50 ms、外への呼び出し 30 回、30 秒まで。設定の読み込み、記録の読み書き、記事の作成もこの 30 回に数える。Bluesky To EmDash と同じく、**1 回に 1 ページ**だけ処理する。画像が多いページは、記録に続きを残して次の回に回す（例：1 回に画像 5 枚まで）。
- **Notion の画像の URL は約 1 時間で使えなくなる**。続きを次の回に回すときは、URL を取り直す。
- **外のサイトの画像**：Notion に「埋め込みリンク」で貼った画像は、どこのサイトにあるか決まっていない。`network:request:unrestricted` は同意画面が広すぎるので使わず、取りこまずにリンクのまま残す（案。7 章で決める）。
- **一度に取れる大きさ**：`ctx.http.fetch()` は 8 MiB まで。それより大きい画像は送らず、Notion に知らせる方法を考える。
- **送り直しの判定**：今と同じく、ページを最後に編集した人がインテグレーション自身でなければ、送ったあとに人が直したとみなす。
- **NewConnect の乗りかえ**：プラグインを入れる前に、Notion-To-EmDash の定期実行を止める（両方動くと同じ記事を取り合う）。
- **レジストリはまだ実験段階**：`@emdash-cms/plugin-cli` の版を固定する。
- **公開する名前**：Bluesky To EmDash と同じ publisher（`did:plc:myrtyr2rsjiivzlp5m6qevv5`）で出す。

## 7. 決まったこと（2026-11-12）

| 項目 | 決定 |
| --- | --- |
| リポジトリ | 今の Notion-To-EmDash に入れる。Notion を読む部分と本文を変える部分を、プラグインと Actions 版で共有できる |
| slug と表示名 | slug `notion-to-emdash`、表示名 Notion To EmDash |
| 見に行く間隔 | 初期値は 5 分ごと（1 回 1 ページなので、10 ページなら約 50 分で送り終わる）。管理画面の設定で変えられるようにしたい（できるかは手順 2 で調べる） |
| 外のサイトの画像 | 取りこまず、リンクのまま残す（6 章） |
| Actions 版の名前 | 今のリポジトリ名のまま。README で「サムネイル担当」と「単体で送る」の 2 つの使い方を説明する |

**同じリポジトリに入れるときに気をつけること**
- リポジトリの一番上を、プラグインとして入れられる形にする（`emdash-plugin.jsonc`、`package.json` の `main` と `exports`、入れたときにビルドする）。NewConnect は `github:RieTamura/Notion-To-EmDash` で入れる。
- `@napi-rs/canvas` などの Actions 版だけが使う部品は、サイトに入らないようにする（`devDependencies` に移すなど）。ワークフローの `npm ci` は `devDependencies` も入れるので、Actions 版は動く。
- フォルダの分け方（案）：共有する部分は `src/shared/`、プラグインは `src/plugin.ts`、Actions 版は `src/action/`。
- `"private": true` を外し、版を `0.1.0` から始める。

## 8. 進める順番

| # | やること | 確認方法 |
| --- | --- | --- |
| 1 | 7 章を決める | 2026-11-12 済（7 章） |
| 2 | 調べる：カテゴリとタグを作る API と権限、`content:publish` の有無、Notion の画像の置き場所のホスト名、設定に暗号化して入れる方法、`ctx.media.upload()` の上限、cron の間隔を設定から変える方法（設定を保存したときに `ctx.cron.schedule` をかけ直せるか） | 2026-11-12 済（EmDash 1.3.1 の型と実装、ドキュメント、Bluesky To EmDash のコードで確かめた）。結果は下の「手順 2 で分かったこと」 |
| 3 | 今のリポジトリをプラグインも入れられる形に組みかえる（`emdash-plugin.jsonc`、`src/plugin.ts`、フォルダの分け方、`@napi-rs/canvas` を `devDependencies` へ、テストの準備） | `npm test`（`emdash-plugin validate` とテスト）が通る。Actions 版の手動実行（dry-run）も今までどおり動く |
| 4 | Notion を読む部分と、本文を変える部分を今のコードから移す（`notion.ts`、`convert.ts`、`portable-text.ts`。`fetch` を `ctx.http.fetch` に替える） | 今のテストがそのまま通る |
| 5 | 送る部分を `ctx.content` と `ctx.media` で書き直す。1 回 1 ページ、続きを記録に残す | 呼び出しの回数を数えるテストで、30 回を超えないことを確かめる |
| 6 | Notion への書き戻しと、送り直しの判定 | 二重にならない。直した記事が更新される |
| 7 | 管理画面の設定（Block Kit）。トークンが未設定・誤り、データベースの項目が足りないときの表示 | 開発環境で設定して動かす |
| 8 | 開発環境（NewConnect の `npm run dev`）でテスト用の Notion ページを送る | 記事が出て、画像がメディアに入り、Notion に印が付く |
| 9 | GitHub Actions 版に「サムネイルだけ」の動かし方を足す | アイキャッチのない記事にだけ描かれる |
| 10 | NewConnect に入れる：Actions 版の定期実行をサムネイルだけにし、プラグインを `plugins` に足す | 本番でテスト記事を 1 件送り、サムネイルまで付く。テスト記事は消す |
| 11 | README（英語と日本語）、レジストリ用のアイコンとバナー | ほかの人が手順どおりに入れられる |
| 12 | レジストリに出す（`emdash-plugin publish`、または GitHub Actions からの自動リリース） | plugins.emdashcms.com に出る |

## 9. 手順 2 で分かったこと（2026-11-12）

| 調べたこと | 分かったこと |
| --- | --- |
| カテゴリとタグ | `taxonomies:write` で `ctx.taxonomies.createTerm()`（作る）、`addEntryTerms()` / `removeEntryTerms()`（記事に付ける・外す）が使える。読むだけなら `getTerms()`（`taxonomies:read`） |
| 公開 | `content:publish` で `ctx.content.publish(collection, id, { _rev })` が使える。作るのは `create()`、直すのは `update()`（`content:write`）。公開には直前の `_rev` が要るので、`update()` の戻り値か `getVersioned()` で取る |
| Notion の画像の置き場所 | 本物のページでは `prod-files-secure.s3.us-west-2.amazonaws.com` だった。`allowedHosts` に入れる。リダイレクト先も毎回確かめられるので、ほかの場所に飛ぶ画像は取れずにエラーになる。そのときはリンクのまま残す |
| 外のサイトの画像 | 7 章のとおりリンクのまま残す。`network:request:unrestricted` は使わない |
| トークンの保存 | `admin.settingsSchema` で `type: "secret"` にした項目は、EmDash が AES-GCM で暗号化して保存する（サイトに `EMDASH_ENCRYPTION_KEY` が要る）。管理画面には値を返さず、`ctx.log` に出たときも伏せ字になる。設定画面は Block Kit の `secret_input` を使う。空のまま保存したときは消さない（別の「消す」ボタンを付ける） |
| 画像のアップロード | `ctx.media.upload(filename, contentType, bytes)`。PNG・JPEG・GIF・WebP・AVIF を受け付ける。`ctx.http.fetch()` で取れるのは 1 回 8 MiB まで。それより大きい画像はリンクのまま残し、ログに書く |
| 見に行く間隔 | `ctx.cron.schedule(name, { schedule })` は同じ名前で呼ぶと上書きされる（`ON CONFLICT … DO UPDATE`）。設定の保存時か、毎回の実行の初めに設定と比べて、違えばかけ直せばよい。cron の書き方（`*/5 * * * *` など）を設定に入れる。ただしサイトの Cron Trigger より細かくはできない（NewConnect は毎分なので、最短 1 分） |
| 1 回に使える量 | ドキュメントでは、サンドボックスは 1 回に CPU 50 ms、呼び出し 30 回、30 秒。Bluesky To EmDash のコードの説明には「10 回」と書いてあり、古い上限の可能性がある。少ないほうの 10 回でも止まらないよう、1 回の仕事を小さく区切る（6 章）。サイトの中で動かすとき（NewConnect）はこの上限がないが、時間の上限は Bluesky To EmDash と同じく長めにする（`timeout`） |
| 呼び出しの数え方 | 設定の読み込み、記録（storage・kv）の読み書き、記事やメディアの操作、外への通信が、どれも 1 回ずつ数えられる。設定は `ctx.settings.list()` で一度に読む（Bluesky To EmDash と同じ） |

**これで決まったこと**：1 回の実行を「ページを探す」「画像を 1 枚上げる」「記事を作る・直して公開する」「Notion に書き戻す」のような小さな段に分け、どこまで進んだかを `ctx.kv` に残して次の回に続ける。10 回の上限でも、1 回で必ずどれか 1 段は終わるようにする。
