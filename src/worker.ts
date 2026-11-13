import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";

export { PluginBridge };

// Built files stay reachable on the old address; everything else, the admin
// included, moves to EMDASH_SITE_URL (passkeys only work on that address).
const KEEP_PREFIXES = ["/_astro"];

// Pages opened before setup get cached with no content, and finishing setup
// purges nothing, so a new site would look empty for up to a day.
const SETUP_API = "/_emdash/api/setup";
const ALL_PAGE_TAGS = ["posts", "pages", "bluesky", "feed_items"];

// EmDash sends media with `max-age=0, must-revalidate`, because "Replace
// original" may overwrite a file under the same key, and the Worker answers
// every image request by reading R2 (and `/_image` resizes it again each time).
// Cache them at the Cloudflare edge instead, tagged so that any media change in
// the admin purges them; browsers keep EmDash's header and revalidate.
const MEDIA_PREFIX = "/_emdash/api/media";
const MEDIA_FILE_PREFIX = `${MEDIA_PREFIX}/file/`;
const IMAGE_ENDPOINT = "/_image";
const MEDIA_TAG = "media";
const MEDIA_EDGE_CACHE = "public, max-age=2592000";

function isCacheableMedia(request: Request, url: URL, response: Response): boolean {
	return (
		(request.method === "GET" || request.method === "HEAD") &&
		response.status === 200 &&
		!request.headers.has("Range") &&
		(url.pathname.startsWith(MEDIA_FILE_PREFIX) || url.pathname === IMAGE_ENDPOINT) &&
		(response.headers.get("Content-Type") ?? "").startsWith("image/")
	);
}

function cacheMediaAtEdge(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("Cloudflare-CDN-Cache-Control", MEDIA_EDGE_CACHE);
	headers.set("Cache-Tag", MEDIA_TAG);
	return new Response(response.body, { status: response.status, headers });
}

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
			// Upload, replace, edit or delete in the media library.
			if (request.method !== "GET" && request.method !== "HEAD" && url.pathname.startsWith(MEDIA_PREFIX) && response.ok) {
				ctx.waitUntil(purgeTags([MEDIA_TAG]).catch((error) => console.error("media purge", error)));
			}
			if (isCacheableMedia(request, url, response)) return cacheMediaAtEdge(response);
			return keepErrorsOutOfCache(response);
		});
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
