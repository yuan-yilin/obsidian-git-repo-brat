import type { ThemeManifest } from "@obsidian-typings/obsidian-public-1.11.4";
import { Notice, normalizePath } from "obsidian";
import { getTranslations } from "../i18n";
import type BratPlugin from "../main";
import { addBetaThemeToList, updateBetaThemeLastUpdateChecksum } from "../settings";
import { isConnectedToInternet, isHostReachable } from "../utils/internetconnection";
import { toastMessage } from "../utils/notifications";
import { repositoryUrl } from "../utils/utils";
import { checksumForString, grabChecksumOfThemeCssFile, grabCommmunityThemeCssFile, grabCommmunityThemeManifestFile } from "./githubUtils";
import { grabGitLabRawFile, isGitLabRepository, parseGitLabRepository, resolveGitLabTokenValue } from "./gitlabUtils";

/**
 * Installs or updates a theme
 *
 * @param plugin              - ThePlugin
 * @param cssGithubRepository - The repository with the theme (GitHub `user/repo` or GitLab full URL)
 * @param newInstall          - true = New theme install, false update the theme
 *
 * @returns true for succcess
 */
export const themeSave = async (plugin: BratPlugin, cssGithubRepository: string, newInstall: boolean): Promise<boolean> => {
	const text = getTranslations().themeMessages;
	// test for themes-beta.css
	let themeCss: string | null = null;
	let themeManifest: string | null = null;

	if (isGitLabRepository(cssGithubRepository)) {
		// GitLab themes come from the repository's default branch via the raw file API.
		// Themes have no per-repo token mechanism, the global GitLab token is used.
		const token = resolveGitLabTokenValue(plugin.app, plugin.settings);
		try {
			themeCss = await grabGitLabRawFile(cssGithubRepository, "theme-beta.css", "HEAD", token, plugin.settings.debuggingMode);
			// grab theme.css if no beta
			if (!themeCss) themeCss = await grabGitLabRawFile(cssGithubRepository, "theme.css", "HEAD", token, plugin.settings.debuggingMode);

			if (!themeCss) {
				toastMessage(plugin, text.noThemeCssFile);
				return false;
			}

			themeManifest = await grabGitLabRawFile(cssGithubRepository, "manifest.json", "HEAD", token, plugin.settings.debuggingMode);
		} catch (error) {
			// 401/403: the token is missing or rejected — without a valid token an
			// internal/private project simply looks like "file not found", which
			// would produce a misleading "no theme.css" error.
			console.error("BRAT: GitLab theme fetch failed", cssGithubRepository, error);
			toastMessage(plugin, text.gitlabTokenError, 10);
			return false;
		}
	} else {
		themeCss = await grabCommmunityThemeCssFile(cssGithubRepository, true, plugin.settings.debuggingMode);
		// grabe themes.css if no beta
		if (!themeCss) themeCss = await grabCommmunityThemeCssFile(cssGithubRepository, false, plugin.settings.debuggingMode);

		if (!themeCss) {
			toastMessage(plugin, text.noThemeCssFile);
			return false;
		}

		themeManifest = await grabCommmunityThemeManifestFile(cssGithubRepository, plugin.settings.debuggingMode);
	}

	if (!themeManifest) {
		toastMessage(plugin, text.noManifestFile);
		return false;
	}

	const manifestInfo = (await JSON.parse(themeManifest)) as ThemeManifest;

	const themeTargetFolderPath = normalizePath(themesRootPath(plugin) + manifestInfo.name);

	const { adapter } = plugin.app.vault;
	if (!(await adapter.exists(themeTargetFolderPath))) await adapter.mkdir(themeTargetFolderPath);

	await adapter.write(normalizePath(`${themeTargetFolderPath}/theme.css`), themeCss);
	await adapter.write(normalizePath(`${themeTargetFolderPath}/manifest.json`), themeManifest);

	updateBetaThemeLastUpdateChecksum(plugin, cssGithubRepository, checksumForString(themeCss));

	let msg = "";

	if (newInstall) {
		addBetaThemeToList(plugin, cssGithubRepository, themeCss);
		msg = text.installed(manifestInfo.name, cssGithubRepository);
		window.setTimeout(() => {
			plugin.app.customCss.setTheme(manifestInfo.name);
		}, 500);
	} else {
		msg = text.updated(manifestInfo.name, cssGithubRepository);
	}

	void plugin.log(`${msg}[Theme Info](${repositoryUrl(cssGithubRepository)})`, false);
	toastMessage(plugin, msg, 20, (): void => {
		window.open(repositoryUrl(cssGithubRepository));
	});
	return true;
};

/**
 * Checks  if there  are theme updates based on the commit date of the obsidian.css file on github in comparison to what is stored in the BRAT theme list
 *
 * @param plugin   - ThePlugin
 * @param showInfo - provide  notices during the update proces
 *
 */
export const themesCheckAndUpdates = async (plugin: BratPlugin, showInfo: boolean): Promise<void> => {
	// Per-host reachability: GitHub relies on the general internet check, GitLab
	// instances are probed directly so intranet-only setups still update.
	const reachability = new Map<string, boolean>();
	const isRepoReachable = async (repo: string): Promise<boolean> => {
		const key = isGitLabRepository(repo) ? (parseGitLabRepository(repo)?.baseUrl ?? "") : "__github__";
		if (!reachability.has(key)) {
			reachability.set(key, key === "__github__" ? await isConnectedToInternet() : await isHostReachable(key));
		}
		return reachability.get(key) ?? false;
	};

	let newNotice: Notice | undefined;
	const msg1 = "Checking for beta theme updates STARTED";
	await plugin.log(msg1, true);
	if (showInfo && plugin.settings.notificationsEnabled) newNotice = new Notice(`BRAT\n${msg1}`, 30000);
	for (const t of plugin.settings.themesList) {
		if (!(await isRepoReachable(t.repo))) {
			console.debug(`BRAT: host unreachable, skipping theme ${t.repo}`);
			continue;
		}
		const lastUpdateOnline = isGitLabRepository(t.repo)
			? await grabGitLabThemeChecksum(plugin, t.repo)
			: await grabGitHubThemeChecksum(plugin, t.repo);
		console.debug("BRAT: lastUpdateOnline", lastUpdateOnline);
		if (lastUpdateOnline !== t.lastUpdate) await themeSave(plugin, t.repo, false);
	}
	const msg2 = "Checking for beta theme updates COMPLETED";
	await plugin.log(msg2, true);
	if (showInfo) {
		if (plugin.settings.notificationsEnabled && newNotice) newNotice.hide();
		toastMessage(plugin, msg2);
	}
};

/**
 * Computes the checksum of a GitHub theme's css file (beta variant first).
 */
const grabGitHubThemeChecksum = async (plugin: BratPlugin, repo: string): Promise<string> => {
	// first test to see if theme-beta.css exists
	let lastUpdateOnline = await grabChecksumOfThemeCssFile(repo, true, plugin.settings.debuggingMode);
	// if theme-beta.css does NOT exist, try to get theme.css
	if (lastUpdateOnline === "0") lastUpdateOnline = await grabChecksumOfThemeCssFile(repo, false, plugin.settings.debuggingMode);
	return lastUpdateOnline;
};

/**
 * Computes the checksum of a GitLab theme's css file (beta variant first).
 */
const grabGitLabThemeChecksum = async (plugin: BratPlugin, repo: string): Promise<string> => {
	const token = resolveGitLabTokenValue(plugin.app, plugin.settings);
	let themeCss = await grabGitLabRawFile(repo, "theme-beta.css", "HEAD", token, plugin.settings.debuggingMode);
	if (!themeCss) themeCss = await grabGitLabRawFile(repo, "theme.css", "HEAD", token, plugin.settings.debuggingMode);
	return themeCss ? checksumForString(themeCss) : "0";
};

/**
 * Deletes a theme from the BRAT list (Does not physically delete the theme)
 *
 * @param plugin              - ThePlugin
 * @param cssGithubRepository - Repository path
 *
 */
export const themeDelete = (plugin: BratPlugin, cssGithubRepository: string): void => {
	const text = getTranslations().themeMessages;
	plugin.settings.themesList = plugin.settings.themesList.filter((t) => t.repo !== cssGithubRepository);
	void plugin.saveSettings();
	const msg = text.removed(cssGithubRepository);
	void plugin.log(msg, true);
	toastMessage(plugin, msg);
};

/**
 * Get the path to the themes folder fo rthis vault
 *
 * @param plugin - ThPlugin
 *
 * @returns path to themes folder
 */
export const themesRootPath = (plugin: BratPlugin): string => {
	return `${normalizePath(`${plugin.app.vault.configDir}/themes`)}/`;
};
