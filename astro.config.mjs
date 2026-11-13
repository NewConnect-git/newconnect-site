import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import autoThumbnail from "auto-thumbnail";
import blueskyFeed from "bluesky-feed";
import blueskyShare from "bluesky-share";
import notionToEmdash from "notion-to-emdash";
import rssFeed from "rss-feed";
import emdash from "emdash/astro";
import weeklyDigest from "./src/plugins/weekly-digest/index.ts";
import { readFileSync } from "node:fs";

// The site's address, kept in one place: wrangler.jsonc. A commented-out line
// doesn't match, so nothing is set until the owner sets it.
const siteUrl = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8").match(
	/^\s*"EMDASH_SITE_URL":\s*"([^"]+)"/m,
)?.[1];

// Pages that show feed items or Bluesky posts. The plugins publish from cron
// and the purge after that can be missed, so cap staleness at 20 minutes.
const FEED_PAGE_CACHE = { maxAge: 600, swr: 600 };
const LONG_CACHE = { maxAge: 86_400, swr: 604_800 };

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	// The site's CSS is a few KB; inlining it saves a render-blocking request
	// on every first visit, and the HTML is cached at the edge anyway.
	build: { inlineStylesheets: "always" },
	i18n: {
		defaultLocale: "ja",
		locales: ["ja"],
	},
	cache: {
		provider: cacheCloudflare(),
	},
	routeRules: {
		"/": { ...FEED_PAGE_CACHE, tags: ["posts", "pages", "bluesky", "feed_items"] },
		"/posts": { ...LONG_CACHE, tags: ["posts"] },
		"/posts/[slug]": { ...LONG_CACHE, tags: ["posts"] },
		"/pages/[slug]": { ...LONG_CACHE, tags: ["pages"] },
		"/category/[slug]": { ...LONG_CACHE, tags: ["posts"] },
		"/tag/[slug]": { ...LONG_CACHE, tags: ["posts"] },
		"/rss.xml": { ...LONG_CACHE, tags: ["posts"] },
		// Redirects to the admin's favicon; an hour, as a settings change sends no purge
		"/favicon.ico": { maxAge: 3600, swr: 86_400 },
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
		// EmDash only resizes its own media when it knows the site's address.
		remotePatterns: siteUrl
			? [{ hostname: new URL(siteUrl).hostname, pathname: "/_emdash/api/media/file/**" }]
			: [],
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			// Keeps cached HTML identical for visitors and signed-in editors.
			toolbar: "client",
			// Both run in-process, so they need no Worker Loader or paid plan.
			// rss-feed copies YouTube / note / Zenn / Hatena Blog items into
			// `feed_items`; bluesky-feed copies Bluesky posts into `bluesky`.
			// Each does nothing until it is configured in the admin.
			// weekly-digest (in this repo) turns each week's feed_items into one
			// post every Saturday at 9:00 JST.
			// auto-thumbnail keeps the thumbnail design (admin → サムネイル);
			// Post To EmDash and Notion To EmDash read it and draw the image.
			// notion-to-emdash sends the pages ticked as published in a Notion
			// database as posts (admin → Notion To EmDash). Its token is stored
			// encrypted, so the site needs EMDASH_ENCRYPTION_KEY.
			// bluesky-share posts each post to Bluesky once, when it is first
			// published (admin → Bluesky Share). Its app password is encrypted too.
			plugins: [rssFeed, blueskyFeed, weeklyDigest(), autoThumbnail, notionToEmdash, blueskyShare],
		}),
	],
	devToolbar: { enabled: false },
});
