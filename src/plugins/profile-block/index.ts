import { fileURLToPath } from "node:url";
import type { PluginDescriptor } from "emdash";

/** Absolute path with forward slashes: it is written into a generated import on Windows too. */
const local = (file: string) => fileURLToPath(new URL(file, import.meta.url)).replaceAll("\\", "/");

/**
 * Descriptor for astro.config.mjs. Adds a 「プロフィール」 block to the
 * Portable Text editor; `componentsEntry` gives the site its renderer.
 */
export default function profileBlock(): PluginDescriptor {
	return {
		id: "profile-block",
		version: "0.2.0",
		format: "native",
		entrypoint: local("./plugin.ts"),
		componentsEntry: local("./components/index.ts"),
	};
}
