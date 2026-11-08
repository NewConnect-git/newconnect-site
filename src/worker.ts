import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";

export { PluginBridge };

// Built files stay reachable on the old address; everything else, the admin
// included, moves to EMDASH_SITE_URL (passkeys only work on that address).
const KEEP_PREFIXES = ["/_astro"];

// Pages opened before setup get cached with no content, and finishing setup
// purges nothing, so a new site would look empty for up to a day.
const SETUP_API = "/_emdash/api/setup";
const ALL_PAGE_TAGS = ["posts", "pages", "bluesky", "feed_items"];

// A page opened while the database is still migrating answers 503; without
// this the cache keeps serving that error after the database is ready.
function keepErrorsOutOfCache(response: Response): Response {
	if (response.status < 500) return response;
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");
	headers.set("Cloudflare-CDN-Cache-Control", "no-store");
	return new Response(response.body, { status: response.status, headers });
}

async function purgeTags(tags: string[]): Promise<void> {
	// Imported here because a top-level import of this module breaks the build.
	const { cache } = (await import("cloudflare:workers")) as unknown as {
		cache?: { purge?: (options: { tags: string[] }) => Promise<unknown> };
	};
	await cache?.purge?.({ tags });
}

export default {
	...handler,
	fetch(request, env, ctx) {
		const url = new URL(request.url);
		// Once EMDASH_SITE_URL is set, send visitors on workers.dev, and on the
		// bare domain when the site lives on www, to it.
		const { EMDASH_SITE_URL: siteUrl } = env as { EMDASH_SITE_URL?: string };
		const site = siteUrl ? new URL(siteUrl) : null;
		const siteOrigin = site?.origin ?? null;
		const bareHost = site?.hostname.replace(/^www\./, "");
		if (
			siteOrigin &&
			siteOrigin !== url.origin &&
			(url.hostname.endsWith(".workers.dev") || url.hostname === bareHost) &&
			!KEEP_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
		) {
			// Never cache this: the Cloudflare cache keys by path whatever the
			// host, so a cached redirect would loop on the real domain.
			return new Response(null, {
				status: 301,
				headers: {
					Location: `${siteOrigin}${url.pathname}${url.search}`,
					"Cache-Control": "no-store",
					"Cloudflare-CDN-Cache-Control": "no-store",
				},
			});
		}
		return Promise.resolve(handler.fetch!(request, env, ctx)).then((response: Response) => {
			if (request.method === "POST" && url.pathname.startsWith(SETUP_API) && response.ok) {
				ctx.waitUntil(purgeTags(ALL_PAGE_TAGS).catch((error) => console.error("setup purge", error)));
			}
			return keepErrorsOutOfCache(response);
		});
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
