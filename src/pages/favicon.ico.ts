import type { APIRoute } from "astro";
import { getSiteSettings } from "emdash";

/**
 * Browsers and crawlers that skip <link rel="icon"> ask for /favicon.ico.
 * Send them to the favicon set in the admin (Settings > General).
 */
export const GET: APIRoute = async ({ url }) => {
	const settings = await getSiteSettings();
	const favicon = settings.favicon?.url;
	if (!favicon) return new Response(null, { status: 404 });
	return Response.redirect(new URL(favicon, url.origin).href, 302);
};
