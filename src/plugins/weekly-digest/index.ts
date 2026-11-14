import { fileURLToPath } from "node:url";
import type { PluginDescriptor } from "emdash";

/**
 * Descriptor for astro.config.mjs. The plugin lives in this repo, so its
 * entrypoint is the file itself (forward slashes, since the path is written
 * into a generated import on Windows too).
 */
export default function weeklyDigest(): PluginDescriptor {
	return {
		id: "weekly-digest",
		version: "0.1.0",
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)).replaceAll("\\", "/"),
		capabilities: ["content:read", "content:write", "content:publish", "taxonomies:write"],
	};
}
