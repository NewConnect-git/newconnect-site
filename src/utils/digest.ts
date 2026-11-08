/**
 * The weekly digest: every Saturday at 9:00 Japan time, one post gathers the
 * YouTube videos and note / Zenn / Hatena Blog articles posted from the
 * previous Saturday to Friday. Shared by the weekly-digest plugin, which
 * writes the post, and the front page, which shows its items.
 */

/** Digest posts have the slug `weekly-YYYY-MM-DD`, the Saturday they came out. */
export const DIGEST_SLUG_PREFIX = "weekly-";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Japan has no daylight saving time, so this offset is fixed. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SATURDAY = 6;

export interface DigestWeek {
	/** The Saturday the digest comes out, "2026-11-14" */
	issue: string;
	/** Previous Saturday 00:00 JST, inclusive */
	start: Date;
	/** Issue day 00:00 JST, exclusive */
	end: Date;
	/** Friday, the last day covered, for labels */
	lastDay: Date;
}

/** `utcMidnight` is the issue date at 00:00 UTC, standing for that date in JST. */
function weekOf(utcMidnight: number): DigestWeek {
	const end = new Date(utcMidnight - JST_OFFSET_MS);
	return {
		issue: new Date(utcMidnight).toISOString().slice(0, 10),
		start: new Date(end.getTime() - 7 * DAY_MS),
		end,
		lastDay: new Date(end.getTime() - DAY_MS),
	};
}

/** The week whose digest comes out on the latest Saturday (JST) on or before `now`. */
export function digestWeekFor(now: Date): DigestWeek {
	const jst = new Date(now.getTime() + JST_OFFSET_MS);
	const daysBack = (jst.getUTCDay() - SATURDAY + 7) % 7;
	return weekOf(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - daysBack));
}

/** The week a digest post covers, read from its slug; null for any other post. */
export function digestWeekFromSlug(slug: string | null | undefined): DigestWeek | null {
	const match = slug?.match(/^weekly-(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const utcMidnight = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return Number.isNaN(utcMidnight) ? null : weekOf(utcMidnight);
}

export function isDigestSlug(slug: string | null | undefined): boolean {
	return digestWeekFromSlug(slug) !== null;
}

export function inWeek(date: Date, week: DigestWeek): boolean {
	const time = date.getTime();
	return time >= week.start.getTime() && time < week.end.getTime();
}
