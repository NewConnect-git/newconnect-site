/**
 * Dates are shown in Japan time. The server runs in UTC, so without this a
 * post written before 9am would show the day before.
 */
export const TIME_ZONE = "Asia/Tokyo";

/** "2026年11月6日" */
export function formatDate(date: Date): string {
	return date.toLocaleDateString("ja-JP", {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: TIME_ZONE,
	});
}

/** "2026年11月6日（金）", for the masthead. */
export function formatIssueDate(date: Date): string {
	const day = date.toLocaleDateString("ja-JP", { weekday: "short", timeZone: TIME_ZONE });
	return `${formatDate(date)}（${day}）`;
}

/** "11月6日" */
export function formatShortDate(date: Date): string {
	return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", timeZone: TIME_ZONE });
}

/**
 * "11/6 14:05", or "2025/11/6 14:05" for a date outside the current year,
 * so an old post shown below a newer one does not look out of order.
 */
export function formatStamp(date: Date, now = new Date()): string {
	const year = (d: Date) => d.toLocaleDateString("ja-JP", { year: "numeric", timeZone: TIME_ZONE });
	const md = date.toLocaleDateString("ja-JP", {
		...(year(date) === year(now) ? {} : { year: "numeric" }),
		month: "numeric",
		day: "numeric",
		timeZone: TIME_ZONE,
	});
	const hm = date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
	return `${md} ${hm}`;
}

/** Text cut to a length, with an ellipsis when it was longer. */
export function truncate(text: string | null | undefined, length: number): string {
	if (!text) return "";
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}
