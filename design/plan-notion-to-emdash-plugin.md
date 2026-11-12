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
- 版を `0.1.0` から始める。`"private": true` は残す（npm に誤って出さないため。GitHub から入れるのにもレジストリに出すのにも影響しない。Bluesky To EmDash と同じ）。

## 8. 進める順番

| # | やること | 確認方法 |
| --- | --- | --- |
| 1 | 7 章を決める | 2026-11-12 済（7 章） |
| 2 | 調べる：カテゴリとタグを作る API と権限、`content:publish` の有無、Notion の画像の置き場所のホスト名、設定に暗号化して入れる方法、`ctx.media.upload()` の上限、cron の間隔を設定から変える方法（設定を保存したときに `ctx.cron.schedule` をかけ直せるか） | 2026-11-12 済（EmDash 1.3.1 の型と実装、ドキュメント、Bluesky To EmDash のコードで確かめた）。結果は下の「手順 2 で分かったこと」 |
| 3 | 今のリポジトリをプラグインも入れられる形に組みかえる（`emdash-plugin.jsonc`、`src/plugin.ts`、フォルダの分け方、`@napi-rs/canvas` を `devDependencies` へ、テストの準備） | `npm test`（`emdash-plugin validate` とテスト）が通る。Actions 版の手動実行（dry-run）も今までどおり動く。2026-11-12 手元で済んだ：`src/shared/`（notion、convert、portable-text、新しく分けた properties）、`src/action/`（今までのツール）、`src/plugin.ts`（設定を読み、cron を登録するだけのひな形）。テストは `tests/action/`（Node）と `tests/plugin/`（EmDash のテスト用ホスト）の 2 つに分け、vitest は 4 に下げた（`@emdash-cms/plugin-test` が vitest 4 を求めるため）。`@napi-rs/canvas` は `devDependencies` へ。`emdash-plugin.jsonc` に権限、通信先、記録、設定（Notion のトークン〔secret〕、データベース、公開か下書きか、間隔）を書いた。`npm test` で型チェック、manifest の確認、テスト 106 件が通る。`npm start`（送らずに一覧を出す）も手元で今までどおり動いた。GitHub Actions での確認は push のあと |
| 4 | Notion を読む部分と、本文を変える部分を今のコードから移す（`notion.ts`、`convert.ts`、`portable-text.ts`。`fetch` を `ctx.http.fetch` に替える） | 今のテストがそのまま通る。2026-11-12 済：`NotionClient` はもともと `fetch` を外から渡せたので、共有の部分は書き換えずに済んだ。`src/plugin/source.ts` で `ctx.http.fetch` を渡し、「次に送るページを探して本文を変換する」`readNextPage()` を作った。管理者だけが呼べる `preview` ルート（送らずに、次に送るページ、ブロック数、画像数、送らないブロックを返す）を足した。EmDash のテスト用ホスト（workerd の中）で、Notion の応答を用意して確かめた：入れ子の箇条書き、画像、送らないブロック、送ったあと直していないページは飛ばす、項目が足りないとき、トークンが違うとき（401）。テストは全部で 110 件。1 ページを読むのに、設定 1 回と Notion 5 回（自分の ID、データベース、data source、一覧、本文）、子を持つブロック 1 つごとに 1 回の呼び出しが要る。手順 5 では、自分の ID と data source の ID を `ctx.kv` に覚えて減らす |
| 5 | 送る部分を `ctx.content` と `ctx.media` で書き直す。1 回 1 ページ、続きを記録に残す | 呼び出しの回数を数えるテストで、30 回を超えないことを確かめる。2026-11-12 手元で済んだ：`src/plugin/job.ts` が 1 ページを「探す → 本文を読む（子を持つブロック 1 つにつき 1 回）→ 画像を 1 枚ずつ上げる → カテゴリとタグ → 記事を作る・直して公開する」の段に分けて進め、途中の状態を `ctx.kv` の `state:job` に残す。`src/plugin/budget.ts` で 1 回の呼び出しを 24 回までに数えて止める（上限 30 の手前）。書き込みは先に残りを確かめてから始めるので、途中で止まっても二重にならない。ボットの ID と data source の ID は `ctx.kv` に覚える。送ったページは `storage.pages`（ページ ID → 記事 ID）に記録し、次からは同じ記事を直す。Actions 版で送ったページ（記録がなく EmDash URL がある）は、スラッグで記事を探して直す。カテゴリがない、別のサイトの URL などで送れないページは、そのときの最終編集日時を記録して、直されるまで飛ばし、次のページへ進む。Notion が返さなくなった画像は外して送る。画像の読み始めから 50 分を過ぎたら読み直す。テスト 120 件（送る部分 10 件）。例：画像 2 枚、入れ子 1 つ、カテゴリとタグ 2 つのページは、1 回目 23 回（保存の手前まで）、2 回目 9 回で送り終わった。**分かった制約**：プラグインの `ctx.content.create()` と `update()` にはスラッグを渡す場所がなく、スラッグはタイトルから作られる。Notion の「スラッグ」はプラグイン版では使えない（日本語のタイトルは日本語のスラッグになる）。10 章を参照 |
| 6 | Notion への書き戻しと、送り直しの判定 | 二重にならない。直した記事が更新される。2026-11-12 手元で済んだ：保存のあとに「書き戻し」の段を足した。ページを読み直し、送り始めてから誰も直していなければ、`EmDash URL`（`<サイト>/posts/<スラッグ>`、Actions 版と同じ形）と `送信日時` を書き込む。これでプラグインが最後の編集者になり、次からは送らない（判定は Actions 版と同じ `needsSending`）。人が直すと、同じ記事に送り直す。送っている間に直されていたら書き戻さず、次の回にその変更も送る。Notion が書き込みを断ったとき（権限がないなど）は、記事は残し、手で URL を入れるよう知らせて、ページが直されるまで飛ばす（毎回送り直さないため）。保存と書き戻しの間で止まっても、状態は KV に残るので、記事が二重にできない。テスト 124 件（書き戻し 4 件） |
| 7 | 管理画面の設定（Block Kit）。トークンが未設定・誤り、データベースの項目が足りないときの表示 | 開発環境で設定して動かす。2026-11-12 手元で済んだ（開発環境での確認は手順 8）：管理画面に 1 枚のページ（`/settings`、名前は「Notion To EmDash」）を足した。上から、知らせ（未設定、トークン違い〔401〕、データベースが見えない〔404〕、権限がない〔403〕、項目が足りない、送れなかった理由）、最後の実行と結果、送っている途中のページ、送れなかったページの表、「接続を確かめる」「今すぐ送る」ボタン、設定のフォーム（トークン〔`secret_input`、保存した値はブラウザに返さない〕、データベース、公開か下書きか、間隔）、「トークンを消す」（確認つき）。管理画面が日本語なら日本語、ほかは英語。保存のとき、データベースのリンクと cron の書き方を確かめ、間隔を変えたら cron をかけ直す。トークンかデータベースが変わったら、覚えた ID を捨てる。`preview` ルートは、呼び出しの少ない `check` ルート（接続、項目、送るページの数を確かめる）に替えた。各回の結果は `ctx.kv` の `state:last` に残す。**トークンを暗号化して保存するには、サイトに `EMDASH_ENCRYPTION_KEY` が要る**（ないと保存できないので、そう知らせる）。NewConnect にはまだない（`wrangler secret list` が空）。手順 8 で `.dev.vars` に、手順 10 で本番の secret に入れる（`npx emdash secrets generate` で作る）。テスト 135 件（プラグイン 33 件） |
| 8 | 開発環境（NewConnect の `npm run dev`）でテスト用の Notion ページを送る | 記事が出て、画像がメディアに入り、Notion に印が付く。2026-11-12 済：NewConnect に `github:RieTamura/Notion-To-EmDash` を入れ（`@napi-rs/canvas` は入らない）、`astro.config.mjs` の `plugins` に足した。`.dev.vars` に `EMDASH_ENCRYPTION_KEY` を作った（`npx emdash secrets generate --write .dev.vars`）。管理画面でテスト用データベース（rietamura.com のテストと同じ）とトークンを保存し、「接続を確かめる」で 1 件と出た。利用者が作った「テスト4」（見出し、画像、段落）を「今すぐ送る」で送ると、2 回目で送り終わった（1 回目は保存の手前まで）。下書きの記事ができ、スラッグは「テスト4」、画像はメディアに入り（1500×600）、アイキャッチにもなった。Notion には EmDash URL と送信日時が書き込まれ、最後の編集者がインテグレーションになり、次の回は「送るページはありません」。管理画面は Edge で表示を確かめた。**注意**：書き戻す URL は `EMDASH_SITE_URL`（本番のアドレス）を使うので、開発サーバーから送っても `https://www.new-connects.com/posts/…` になる。テストのページは、試したあと EmDash URL を消すか「公開」を外す（そのままだと本番のプラグインが「記事がない」として飛ばす） |
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

## 10. スラッグの問題（2026-11-12、手順 5 で分かった）

EmDash 1.3.1 のプラグイン API では、記事を作るとき（`ctx.content.create()`）も直すとき（`update()`）も、スラッグを渡せない。作るときはタイトルからスラッグが作られる（`getSlugSource` → `generateUniqueSlug`）。REST API（Actions 版）はスラッグを渡せる。

**影響**：Notion の「スラッグ」の列は、プラグイン版では使えない。日本語のタイトルは、日本語のスラッグ（URL）になる。

**考えられる道**
1. このままにして、README に書く。スラッグを決めたい人は、管理画面で直すか Actions 版を使う。
2. EmDash に、プラグインからスラッグを渡せるようにしてほしいと issue を出す。
3. Notion で「スラッグ」に書いたら、タイトルの代わりに一時的にスラッグをタイトルにして作り、すぐにタイトルを直す（スラッグは作ったときのまま残る）。呼び出しが 1 回増える。仕組みに頼った回避策で、EmDash の動きが変わると壊れる。

**決まったこと（2026-11-12）**：1 と 2 を一緒に進める。
- README（手順 11）に、プラグイン版ではスラッグを指定できず、タイトルから作られることを書く。スラッグを決めたいときは、管理画面で直すか Actions 版を使う。
- EmDash への要望は、issue ではなく Discussions の「Ideas」に出す決まり（issue のテンプレートは不具合用）。2026-11-12 に同じ要望がないことを確かめた。文面の下書きを作った。投稿は利用者が確かめてから。
- EmDash が対応したら、プラグインで Notion の「スラッグ」を使うようにする。
