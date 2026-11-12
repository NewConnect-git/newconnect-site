import { getTaxonomyTermsWithCacheHint } from "emdash";

export interface TermLink {
	slug: string;
	label: string;
	count: number;
}

export interface SiteTerms {
	categories: TermLink[];
	tags: TermLink[];
	cacheHints: Array<Awaited<ReturnType<typeof getTaxonomyTermsWithCacheHint>>["cacheHint"]>;
}

type Term = Awaited<ReturnType<typeof getTaxonomyTermsWithCacheHint>>["data"][number];

/** Every term in the tree, parents before their children. */
function flatten(terms: Term[]): Term[] {
	return terms.flatMap((term) => [term, ...flatten(term.children ?? [])]);
}

async function load(taxonomy: string) {
	try {
		const { data, cacheHint } = await getTaxonomyTermsWithCacheHint(taxonomy);
		const links = flatten(data)
			.filter((term) => (term.count ?? 0) > 0)
			.map((term) => ({ slug: term.slug, label: term.label, count: term.count ?? 0 }));
		return { links, cacheHint };
	} catch {
		// A site without the taxonomy shows no list rather than an error.
		return { links: [], cacheHint: null };
	}
}

/** Categories and tags that have at least one published post, for the menus. */
export async function loadSiteTerms(): Promise<SiteTerms> {
	const [categories, tags] = await Promise.all([load("category"), load("tag")]);
	return {
		categories: categories.links,
		// Tags with more posts first, then by name.
		tags: tags.links.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja")),
		cacheHints: [categories.cacheHint, tags.cacheHint].filter((hint) => hint !== null),
	};
}
