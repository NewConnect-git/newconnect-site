import { getEmDashCollection, type CacheHint } from "emdash";

/** How far back the front page looks: one week. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface FeedCard {
	id: string;
	title: string;
	summary: string;
	url: string;
	thumbnail: string | null;
	source: string;
	kind: "video" | "article";
	postedAt: Date;
}

export interface BlueskyPost {
	id: string;
	text: string;
	url: string;
	postedAt: Date;
}

function toDate(value: unknown, fallback: Date): Date {
	const date = value ? new Date(value as string) : null;
	return date && !Number.isNaN(date.getTime()) ? date : fallback;
}

/**
 * Items the rss-feed plugin copied in (YouTube videos and note / Zenn /
 * Hatena Blog posts), newest first. Shorts are left out. A site without the
 * collection, or a failed read, gives an empty list rather than an error.
 */
export async function loadFeedItems(): Promise<{ items: FeedCard[]; cacheHints: CacheHint[] }> {
	const { entries, cacheHint, error } = await getEmDashCollection("feed_items", {
		orderBy: { created_at: "desc" },
		limit: 200,
	});
	if (error) return { items: [], cacheHints: [] };
	const items = entries
		.filter((entry) => entry.data.kind === "video" || entry.data.kind === "article")
		.map((entry) => {
			const data = entry.data;
			const thumbnail = data.thumbnail as { url?: string } | null | undefined;
			return {
				id: data.id,
				title: data.title || "無題",
				summary: data.summary || "",
				url: data.item_url || "#",
				thumbnail: thumbnail?.url ?? null,
				source: data.source || "",
				kind: data.kind as "video" | "article",
				postedAt: toDate(data.posted_at, data.createdAt),
			};
		})
		.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
	return { items, cacheHints: [cacheHint] };
}

/** Only the items posted within the last week. */
export function withinWeek<T extends { postedAt: Date }>(items: T[], now = new Date()): T[] {
	const since = now.getTime() - WEEK_MS;
	return items.filter((item) => item.postedAt.getTime() >= since);
}

/** The video ID in a YouTube watch URL, for thumbnails and embeds. */
export function youtubeId(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1) || null;
		return parsed.searchParams.get("v") ?? parsed.pathname.match(/\/(?:shorts|embed)\/([\w-]+)/)?.[1] ?? null;
	} catch {
		return null;
	}
}

/** Bluesky posts copied in by the bluesky-feed plugin, newest first. */
export async function loadBluesky(limit = 5): Promise<{ posts: BlueskyPost[]; cacheHints: CacheHint[] }> {
	const { entries, cacheHint, error } = await getEmDashCollection("bluesky", {
		orderBy: { created_at: "desc" },
		limit: 30,
	});
	if (error) return { posts: [], cacheHints: [] };
	const posts = entries
		.map((entry) => {
			const data = entry.data;
			return {
				id: data.id,
				text: data.text || data.title || "",
				url: data.post_url || "#",
				postedAt: toDate(data.posted_at, new Date(0)),
			};
		})
		.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
		.slice(0, limit);
	return { posts, cacheHints: [cacheHint] };
}
