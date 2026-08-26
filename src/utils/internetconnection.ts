import { requestUrl } from "obsidian";

/**
 * Tests whether a host is reachable. Any HTTP response — including error
 * statuses like 404 or 401 — proves the host is up; only a network-level
 * failure (no status on the thrown error) counts as unreachable.
 */
export async function isHostReachable(url: string): Promise<boolean> {
	try {
		await requestUrl(`${url}${url.includes("?") ? "&" : "?"}brat=${Math.random()}`);
		return true;
	} catch (error) {
		return (error as { status?: number }).status !== undefined;
	}
}

/**
 * Tests if there is an internet connection
 * @returns true if connected, false if no internet
 */
export async function isConnectedToInternet(): Promise<boolean> {
	return isHostReachable("https://obsidian.md");
}
