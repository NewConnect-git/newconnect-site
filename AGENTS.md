This is the NewConnect site (https://www.new-connects.com/), moved from WordPress to EmDash: a CMS on Astro, running on Cloudflare Workers with D1, R2 and KV. Japanese only. The design is a newspaper: the front page carries the newest hand-written post as the top story, then the weekly roundup. Every Saturday at 9:00 JST the in-repo `weekly-digest` plugin publishes one post (slug `weekly-YYYY-MM-DD`) listing the YouTube videos and note / Zenn / Hatena Blog articles posted the previous Saturday to Friday; the front page shows that week's items, or the last 7 days before the first digest.

Infrastructure follows `../emdash-theme-mytimeline` (same worker entry, cache rules and plugins), without its i18n.

## Commands

```bash
npm run dev         # Astro dev server; admin at /_emdash/admin
npm run typecheck   # astro check
npm run deploy      # build and deploy to Cloudflare
npx wrangler types  # after changing wrangler.jsonc
```

Locally, `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin` skips setup.

## Key files

| File | Purpose |
| --- | --- |
| `wrangler.jsonc` | Worker settings; `EMDASH_SITE_URL` is the only place the site address is set |
| `astro.config.mjs` | `emdash()` config, `routeRules` cache, plugins (`rss-feed`, `bluesky-feed`), fonts |
| `src/worker.ts` | workers.dev redirect, purge after setup, 5xx kept out of cache, cron |
| `src/pages/index.astro` | Front page |
| `src/utils/feed.ts` | Reads `feed_items` and `bluesky`; `withinWeek()` is the 7-day window |
| `src/utils/digest.ts` | The digest week (Saturday to Friday, JST) and the `weekly-` slug |
| `src/plugins/weekly-digest/` | Native plugin: Saturday cron writes the digest post; admins can POST `/_emdash/api/plugins/weekly-digest/run` |
| `src/styles/theme.css` | Newspaper tokens (paper, ink, one red). Reset is in `@layer reset` so `prose.css` wins |
| `seed/seed.json` | Schema, menus and sample content |

## Rules

- All pages are server-rendered. No `getStaticPaths()` for CMS content.
- Every new public route needs a `routeRules` entry in `astro.config.mjs`.
- Pass cache hints to `Astro.cache.set()` for everything a cached route reads.
- `feed_items` and `bluesky` may be empty or missing; the site must not break. Empty sidebars are not rendered.
- Dates use `Asia/Tokyo` (`src/utils/format.ts`); the server runs in UTC.
- Text colours keep 4.5:1 on the paper colour in light and dark.
- When testing Japanese from Git Bash, curl sends Shift-JIS. Use a Node script.
