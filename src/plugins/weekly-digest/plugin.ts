import { definePlugin, type PluginContext } from "emdash";
import { DIGEST_CATEGORY, digestWeekFor, DIGEST_SLUG_PREFIX, inWeek, type DigestWeek } from "../../utils/digest";
import { formatShortDate, truncate } from "../../utils/format";

/**
 * Every Saturday at 9:00 Japan time, publishes one post that lists the
 * YouTube videos and note / Zenn / Hatena Blog articles the rss-feed plugin
 * saved for the previous Saturday to Friday. A week with no items gets no post.
 */

const TASK = "weekly-digest";
/** Saturday 00:00 UTC = Saturday 09:00 JST */
const SCHEDULE = "0 0 * * 6";
const FEED_COLLECTION = "feed_items";
const POST_COLLECTION = "posts";
/** Every digest goes in this category (/category/weekly), made on first use. */
const CATEGORY = DIGEST_CATEGORY;
/** Feed items are read newest first, this many at a time, until the week is passed. */
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

interface DigestItem {
	title: string;
	summary: string;
	url: string;
	source: string;
	kind: "video" | "article";
	postedAt: Date;
}

export type DigestResult =
	| { status: "published"; issue: string; id: string; videos: number; articles: number }
	| { status: "already_published"; issue: string; id: string }
	| { status: "empty"; issue: string }
	| { status: "unavailable"; reason: string };

async function schedule(ctx: PluginContext): Promise<void> {
	await ctx.cron?.schedule(TASK, { schedule: SCHEDULE });
}

async function itemsOfWeek(ctx: PluginContext, week: DigestWeek): Promise<DigestItem[]> {
	const items: DigestItem[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < MAX_PAGES; page++) {
		const result = await ctx.content!.list(FEED_COLLECTION, {
			limit: PAGE_SIZE,
			cursor,
			orderBy: { createdAt: "desc" },
			where: { status: "published" },
		});
		for (const entry of result.items) {
			const data = entry.data;
			const postedAt = new Date(String(data.posted_at ?? entry.createdAt));
			if (Number.isNaN(postedAt.getTime()) || !inWeek(postedAt, week)) continue;
			if (data.kind !== "video" && data.kind !== "article") continue;
			if (typeof data.item_url !== "string" || !data.item_url) continue;
			items.push({
				title: typeof data.title === "string" && data.title ? data.title : "無題",
				summary: typeof data.summary === "string" ? data.summary : "",
				url: data.item_url,
				source: typeof data.source === "string" ? data.source : "",
				kind: data.kind,
				postedAt,
			});
		}
		// An item is saved after it is posted, so once the saved times are older
		// than the week, nothing further down can belong to it.
		const oldest = result.items.at(-1);
		if (!result.cursor || !oldest || new Date(oldest.createdAt) < week.start) break;
		cursor = result.cursor;
	}
	return items.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
}

let keyCount = 0;
const key = () => `d${Date.now().toString(36)}${(keyCount++).toString(36)}`;

function textBlock(style: string, text: string) {
	return { _type: "block", _key: key(), style, markDefs: [], children: [{ _type: "span", _key: key(), text, marks: [] }] };
}

function linkBlock(style: string, text: string, href: string) {
	const linkKey = key();
	return {
		_type: "block",
		_key: key(),
		style,
		markDefs: [{ _type: "link", _key: linkKey, href }],
		children: [{ _type: "span", _key: key(), text, marks: [linkKey] }],
	};
}

function itemBlocks(item: DigestItem) {
	return [
		linkBlock("h3", item.title, item.url),
		textBlock("normal", formatShortDate(item.postedAt)),
		...(item.summary ? [textBlock("normal", truncate(item.summary, 200))] : []),
	];
}

export function digestRange(week: DigestWeek): string {
	return `${formatShortDate(week.start)}〜${formatShortDate(week.lastDay)}`;
}

function buildPost(week: DigestWeek, items: DigestItem[]) {
	const videos = items.filter((item) => item.kind === "video");
	const articles = items.filter((item) => item.kind === "article");
	const counts = [videos.length && `動画 ${videos.length} 本`, articles.length && `記事 ${articles.length} 本`]
		.filter(Boolean)
		.join("と");
	const intro = `${digestRange(week)}に届いた${counts}をまとめました。`;
	const content = [
		textBlock("normal", intro),
		...(videos.length ? [textBlock("h2", "動画"), ...videos.flatMap(itemBlocks)] : []),
		...(articles.length ? [textBlock("h2", "記事"), ...articles.flatMap(itemBlocks)] : []),
	];
	// The excerpt is the meta description in search results and shares, so it
	// names the first two items, e.g. …をまとめました。「A」「B」ほか。
	const highlights = [...videos, ...articles]
		.slice(0, 2)
		.map((item) => `「${truncate(item.title, 32)}」`)
		.join("");
	const excerpt = `${intro}${highlights}${items.length > 2 ? "ほか。" : ""}`;
	return {
		title: `週刊まとめ ${digestRange(week)}`,
		excerpt,
		content,
		videos: videos.length,
		articles: articles.length,
	};
}

/**
 * Puts the post in the 週刊まとめ category, creating the term the first time.
 * A failure is only logged: the digest still goes out, without the category.
 */
async function addCategory(ctx: PluginContext, postId: string): Promise<void> {
	const taxonomies = ctx.taxonomies;
	if (!taxonomies?.createTerm || !taxonomies.addEntryTerms) {
		ctx.log.warn("taxonomies:write missing; digest has no category", { postId });
		return;
	}
	try {
		const terms = await taxonomies.getTerms(CATEGORY.taxonomy);
		const term =
			terms.find((t) => t.slug === CATEGORY.slug) ??
			(await taxonomies.createTerm(CATEGORY.taxonomy, { label: CATEGORY.label, slug: CATEGORY.slug }));
		await taxonomies.addEntryTerms(POST_COLLECTION, postId, CATEGORY.taxonomy, [term.id]);
	} catch (error) {
		ctx.log.warn("Could not add the digest category", { postId, error: String(error) });
	}
}

/** Writes and publishes the digest for the week that ends on the Saturday on or before `now`. */
export async function publishDigest(ctx: PluginContext, now = new Date()): Promise<DigestResult> {
	const content = ctx.content;
	if (!content?.create || !content.update || !content.getVersioned || !content.publish) {
		return { status: "unavailable", reason: "content capabilities missing" };
	}
	const week = digestWeekFor(now);
	const doneKey = `issued:${week.issue}`;
	const done = await ctx.kv.get<string>(doneKey);
	if (done) return { status: "already_published", issue: week.issue, id: done };

	const items = await itemsOfWeek(ctx, week);
	if (items.length === 0) {
		ctx.log.info("No feed items this week; no digest", { issue: week.issue });
		return { status: "empty", issue: week.issue };
	}

	const post = buildPost(week, items);
	// The slug is made from the title when the entry is created and kept after,
	// so create with the ASCII slug as the title, then set the real title.
	const created = await content.create(POST_COLLECTION, {
		title: `${DIGEST_SLUG_PREFIX}${week.issue}`,
		excerpt: post.excerpt,
		content: post.content,
	});
	await content.update(POST_COLLECTION, created.id, { title: post.title });
	await addCategory(ctx, created.id);
	// Remember it before publishing, so a failed publish never makes a second post.
	await ctx.kv.set(doneKey, created.id);
	const versioned = await content.getVersioned(POST_COLLECTION, created.id);
	if (versioned) await content.publish(POST_COLLECTION, created.id, { _rev: versioned._rev });

	ctx.log.info("Published the weekly digest", { issue: week.issue, id: created.id, slug: created.slug });
	return { status: "published", issue: week.issue, id: created.id, videos: post.videos, articles: post.articles };
}

export function createPlugin() {
	return definePlugin({
		id: "weekly-digest",
		version: "0.1.0",
		capabilities: ["content:read", "content:write", "content:publish", "taxonomies:write"],
		hooks: {
			"plugin:install": async (_event, ctx) => schedule(ctx),
			"plugin:activate": async (_event, ctx) => schedule(ctx),
			cron: {
				timeout: 120_000,
				handler: async (event, ctx) => {
					if (event.name === TASK) await publishDigest(ctx);
				},
			},
		},
		routes: {
			// Signed-in admins can make this week's digest now:
			// POST /_emdash/api/plugins/weekly-digest/run
			run: {
				handler: async (ctx) => publishDigest(ctx),
			},
		},
	});
}
