import { type App, type RequestUrlResponse, requestUrl } from "obsidian";
import { compare as compareVersions, coerce as semverCoerce } from "semver";
import { GitLabResponseError } from "../utils/GitLabAPIErrors";
import type { ReleaseVersion } from "./githubUtils";

/**
 * GitLab support.
 *
 * A GitLab repository is identified by its full URL, e.g.
 * `http://gitlab.example.com/group/project`. Any host other than github.com is
 * treated as a GitLab instance — the public gitlab.com as well as any
 * self-hosted instance. All API calls go through the GitLab v4 REST API with a
 * `PRIVATE-TOKEN` header when a personal access token is configured.
 *
 * Works with old GitLab versions (verified against 13.8): no
 * `/releases/permalink/latest` endpoint, no `prerelease` flag on releases, and
 * release asset links may point at either job-artifact web routes
 * (`…/-/jobs/<id>/artifacts/file/<name>`) or generic-package API routes.
 */

export interface GitLabRepoRef {
	/** Instance base URL, e.g. "http://gitlab.example.com" — no trailing slash */
	baseUrl: string;
	/** Full project path including nested namespaces, e.g. "group/subgroup/project" */
	projectPath: string;
}

export interface GitLabRelease {
	tag_name: string;
	name: string;
	released_at: string;
	/** Normalized asset links from the release */
	assets: {
		name: string;
		url: string;
	}[];
}

export interface GitLabTokenInfo {
	validToken: boolean;
	userName?: string;
	error: {
		type: "unauthorized" | "invalid" | "network" | "none";
		message: string;
	};
}

/**
 * A repository is GitLab-backed when it is stored as a full URL.
 * GitHub inputs are always normalized down to the bare `user/repo` form,
 * so anything scheme-prefixed is GitLab.
 */
export const isGitLabRepository = (repo: string): boolean =>
	/^https?:\/\//i.test(repo) && !/^https?:\/\/(?:[^/]*\.)?github\.com\//i.test(repo);

/**
 * Parses a GitLab repository URL into its base URL and project path.
 *
 * @returns null when the repo is not a full URL or has no path segments
 */
export const parseGitLabRepository = (repo: string): GitLabRepoRef | null => {
	if (!isGitLabRepository(repo)) return null;
	try {
		const url = new URL(repo);
		const projectPath = url.pathname.replace(/^\/+|\/+$/g, "");
		if (!projectPath) return null;
		return { baseUrl: `${url.protocol}//${url.host}`, projectPath };
	} catch {
		return null;
	}
};

/**
 * Normalizes a repository address for storage. Idempotent.
 *
 * - GitHub URLs are reduced to the bare `user/repo` form (existing behavior)
 * - GitLab URLs keep the full `scheme://host/group/project` form
 * - Trailing slashes, `.git` suffixes, query strings, fragments and GitLab web
 *   route suffixes (`/-/releases`, `/-/jobs/…/artifacts/file/…`) are stripped
 */
export const normalizeRepositoryUrl = (address: string): string => {
	let cleaned = address.trim();
	// Strip query string and fragment
	cleaned = cleaned.split("#")[0].split("?")[0];
	// Strip GitLab web-app routes (releases pages, artifact links, …)
	const routeIndex = cleaned.indexOf("/-/");
	if (routeIndex !== -1) cleaned = cleaned.slice(0, routeIndex);
	// Strip trailing slashes and .git suffixes ("repo.git/" and "repo/.git" both clean up)
	for (;;) {
		if (cleaned.endsWith("/")) {
			cleaned = cleaned.slice(0, -1);
			continue;
		}
		if (cleaned.length > 4 && cleaned.toLowerCase().endsWith(".git")) {
			cleaned = cleaned.slice(0, -4);
			continue;
		}
		break;
	}

	if (/^https?:\/\//i.test(cleaned)) {
		try {
			const url = new URL(cleaned);
			const host = url.host.toLowerCase();
			const path = url.pathname.replace(/^\/+|\/+$/g, "");
			if (host === "github.com" || host === "www.github.com") {
				return path; // bare user/repo form, existing GitHub behavior
			}
			return `${url.protocol}//${host}${path ? `/${path}` : ""}`;
		} catch {
			return cleaned;
		}
	}

	// Scheme-less host prefixes
	if (/^github\.com\//i.test(cleaned)) return cleaned.replace(/^github\.com\//i, "");
	if (/^gitlab\.com\//i.test(cleaned)) {
		return `https://gitlab.com/${cleaned.replace(/^gitlab\.com\//i, "")}`;
	}
	// Bare `user/repo` stays as-is (GitHub)
	return cleaned;
};

const apiBase = (ref: GitLabRepoRef): string => `${ref.baseUrl}/api/v4/projects/${encodeURIComponent(ref.projectPath)}`;

/**
 * Wrapper around Obsidian's requestUrl that attaches the GitLab
 * `PRIVATE-TOKEN` header and wraps failures in GitLabResponseError.
 */
export const gitLabRequest = async (url: string, token = "", debugLogging = false): Promise<RequestUrlResponse> => {
	const headers: Record<string, string> = { Accept: "application/json" };
	if (token) headers["PRIVATE-TOKEN"] = token;
	try {
		return await requestUrl({ url, headers });
	} catch (error) {
		if (debugLogging) console.error("GitLab request failed:", url, error);
		throw new GitLabResponseError(error as Error);
	}
};

/**
 * Validates a GitLab personal access token against an instance.
 */
export const validateGitLabToken = async (token: string, host: string): Promise<GitLabTokenInfo> => {
	if (!token || !host) {
		return {
			validToken: false,
			error: {
				type: "invalid",
				message: !host
					? "No GitLab host configured. Set the GitLab host in the settings or add a GitLab repository first."
					: "No token provided",
			},
		};
	}
	try {
		const response = await gitLabRequest(`${host}/api/v4/user`, token);
		const json = response.json as { username?: string };
		return {
			validToken: true,
			userName: json?.username,
			error: { type: "none", message: "No error" },
		};
	} catch (error) {
		if (error instanceof GitLabResponseError && (error.status === 401 || error.status === 403)) {
			return {
				validToken: false,
				error: {
					type: "unauthorized",
					message: "GitLab rejected the token. Verify the token and its expiry date.",
				},
			};
		}
		return {
			validToken: false,
			error: {
				type: "network",
				message: `Failed to reach the GitLab instance: ${error instanceof Error ? error.message : String(error)}`,
			},
		};
	}
};

/**
 * Fetches all release versions (tags) of a GitLab project for the version
 * dropdown in the add-plugin modal.
 */
export const fetchGitLabReleaseVersions = async (
	repositoryPath: string,
	token = "",
	debugLogging = false,
): Promise<ReleaseVersion[] | null> => {
	const ref = parseGitLabRepository(repositoryPath);
	if (!ref) return null;
	try {
		const response = await gitLabRequest(`${apiBase(ref)}/releases?per_page=100`, token, debugLogging);
		const data = response.json as unknown;
		if (!Array.isArray(data)) return null;
		return data.map((release: { tag_name: string }) => ({
			version: release.tag_name,
			// GitLab releases have no prerelease flag
			prerelease: false,
		}));
	} catch (error) {
		if (error instanceof GitLabResponseError) {
			throw error; // 401/404 get dedicated messages in the modal
		}
		if (debugLogging) console.error("Error in fetchGitLabReleaseVersions", repositoryPath, error);
		return null;
	}
};

const normalizeRelease = (json: {
	tag_name?: string;
	name?: string;
	released_at?: string;
	assets?: { links?: { name: string; url: string }[] };
}): GitLabRelease => ({
	tag_name: json.tag_name ?? "",
	name: json.name ?? "",
	released_at: json.released_at ?? "",
	assets: (json.assets?.links ?? []).map((link) => ({
		name: link.name,
		url: link.url,
	})),
});

/**
 * Sorts releases newest-first: semver-descending on the tag, falling back to
 * the release date (mirrors the GitHub comparator in githubUtils).
 */
const compareGitLabReleases = (a: GitLabRelease, b: GitLabRelease): number => {
	const aVersion = semverCoerce(a.tag_name, { includePrerelease: true, loose: true });
	const bVersion = semverCoerce(b.tag_name, { includePrerelease: true, loose: true });
	if (aVersion && bVersion) return compareVersions(bVersion.version, aVersion.version);
	if (aVersion && !bVersion) return -1;
	if (!aVersion && bVersion) return 1;
	const aDate = new Date(a.released_at).getTime();
	const bDate = new Date(b.released_at).getTime();
	if (aDate < bDate) return 1;
	if (aDate > bDate) return -1;
	return 0;
};

/**
 * Gets either a specific release or the latest release of a GitLab project.
 *
 * A 404 is rethrown (rather than swallowed into null): on GitLab an internal
 * project is invisible without a valid token, so 404 can mean "check the
 * address OR configure a token" and callers surface a dedicated message.
 */
export const grabGitLabRelease = async (
	repositoryPath: string,
	version?: string,
	token = "",
	debugLogging = false,
): Promise<GitLabRelease | null> => {
	const ref = parseGitLabRepository(repositoryPath);
	if (!ref) return null;
	try {
		if (version && version !== "latest") {
			const url = `${apiBase(ref)}/releases/${encodeURIComponent(version)}`;
			const response = await gitLabRequest(url, token, debugLogging);
			if (debugLogging) {
				console.debug(
					`BRAT GitLab: release fetch ${url} → status ${response.status}, tag ${(response.json as { tag_name?: string })?.tag_name}`,
				);
			}
			const json = response.json as Parameters<typeof normalizeRelease>[0];
			return normalizeRelease(json);
		}
		const response = await gitLabRequest(`${apiBase(ref)}/releases?per_page=100`, token, debugLogging);
		const data = response.json as unknown;
		if (!Array.isArray(data)) return null;
		const releases = data.map((release: Parameters<typeof normalizeRelease>[0]) => normalizeRelease(release));
		return releases.sort(compareGitLabReleases)[0] ?? null;
	} catch (error) {
		if (debugLogging) {
			console.error(`Error in grabGitLabRelease for ${repositoryPath}:`, error);
		}
		throw error;
	}
};

/**
 * Downloads a single file from a GitLab release by matching the asset link name.
 *
 * Asset link URLs come in different shapes and are routed accordingly:
 * - Job-artifact web links (`…/-/jobs/<id>/artifacts/file/<name>`) only work in
 *   a logged-in browser session — they are rewritten to the job artifacts API
 *   route (`/api/v4/projects/<enc>/jobs/<id>/artifacts/<name>`).
 * - Generic-package links (`…/api/v4/projects/<id>/packages/generic/…`) and any
 *   other URL are fetched as-is.
 *
 * The token is only sent to the GitLab instance itself, never to external links.
 */
export const grabGitLabReleaseFile = async (
	release: GitLabRelease,
	fileName: string,
	repositoryPath: string,
	token = "",
	debugLogging = false,
): Promise<string | null> => {
	const asset = release.assets.find((a) => a.name === fileName);
	if (!asset) {
		if (debugLogging)
			console.debug(
				`BRAT GitLab: no asset named "${fileName}" on release ${release.tag_name} (assets: ${release.assets.map((a) => a.name).join(", ")})`,
			);
		return null;
	}
	const ref = parseGitLabRepository(repositoryPath);
	if (!ref) return null;

	const jobArtifactMatch = asset.url.match(/\/-\/jobs\/(\d+)\/artifacts\/file\/(.+)$/);
	const downloadUrl = jobArtifactMatch ? `${apiBase(ref)}/jobs/${jobArtifactMatch[1]}/artifacts/${jobArtifactMatch[2]}` : asset.url;
	// Never leak the token to external asset links
	const onInstance = downloadUrl.startsWith(`${ref.baseUrl}/`);

	try {
		if (debugLogging) console.debug(`BRAT GitLab: downloading "${fileName}" from ${downloadUrl}`);
		const response = await gitLabRequest(downloadUrl, onInstance ? token : "", debugLogging);
		if (debugLogging)
			console.debug(`BRAT GitLab: download "${fileName}" → status ${response.status}, length ${response.text?.length ?? 0}`);
		return response.status !== 200 ? null : response.text;
	} catch (error) {
		if (error instanceof GitLabResponseError && error.status === 404) {
			// Asset missing, or the job artifact has expired on the GitLab side
			if (debugLogging) console.error(`GitLab asset not found: ${fileName} at ${downloadUrl}`);
			return null;
		}
		throw error; // 401/403 → dedicated token error message
	}
};

/**
 * Fetches a raw file from the repository's default branch (or any ref).
 * Used by the theme flow (theme.css / theme-beta.css / manifest.json).
 *
 * Returns null on 404 (an absent theme-beta.css is an expected signal);
 * throws on auth errors.
 */
export const grabGitLabRawFile = async (
	repositoryPath: string,
	filePath: string,
	ref = "HEAD",
	token = "",
	debugLogging = false,
): Promise<string | null> => {
	const repoRef = parseGitLabRepository(repositoryPath);
	if (!repoRef) return null;
	const url = `${apiBase(repoRef)}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(ref)}`;
	try {
		const response = await gitLabRequest(url, token, debugLogging);
		return response.status !== 200 ? null : response.text;
	} catch (error) {
		if (error instanceof GitLabResponseError && error.status === 404) return null;
		throw error;
	}
};

/**
 * Gets the last commit date for a file on the GitLab repository.
 */
export const grabGitLabLastCommitDateForFile = async (repositoryPath: string, filePath: string, token = ""): Promise<string> => {
	const ref = parseGitLabRepository(repositoryPath);
	if (!ref) return "";
	try {
		const response = await gitLabRequest(
			`${apiBase(ref)}/repository/commits?path=${encodeURIComponent(filePath)}&ref_name=HEAD&per_page=1`,
			token,
		);
		const commits = response.json as { created_at?: string }[];
		return commits?.[0]?.created_at ?? "";
	} catch {
		return "";
	}
};

/**
 * Resolves the GitLab token value for a repository: a per-repo secret name
 * takes precedence over the global GitLab token.
 */
export const resolveGitLabTokenValue = (app: App, settings: { gitlabTokenName?: string }, secretName = ""): string => {
	if (secretName.trim() !== "") {
		return app.secretStorage.getSecret(secretName) || "";
	}
	if (settings.gitlabTokenName) {
		return app.secretStorage.getSecret(settings.gitlabTokenName) || "";
	}
	return "";
};

/**
 * Determines the GitLab host to validate the global token against:
 * the configured host setting, else the host of the first tracked GitLab repo.
 */
export const resolveGitLabValidationHost = (settings: { gitlabHost?: string }, pluginList: string[]): string | null => {
	if (settings.gitlabHost?.trim()) return settings.gitlabHost.trim();
	for (const repo of pluginList) {
		if (isGitLabRepository(repo)) {
			return parseGitLabRepository(repo)?.baseUrl ?? null;
		}
	}
	return null;
};
