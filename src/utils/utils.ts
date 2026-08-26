import { isGitLabRepository } from "../features/gitlabUtils";

/**
 * Web URL of a repository: the stored URL itself for GitLab repos,
 * `https://github.com/user/repo` for GitHub repos.
 */
export function repositoryUrl(repo: string): string {
	return isGitLabRepository(repo) ? repo : `https://github.com/${repo}`;
}

/**
 * Releases page URL for update notifications: the tag page on GitHub
 * (unchanged existing behavior), the project releases page on GitLab
 * (tags there usually carry a `v` prefix that is not available here).
 */
export function releasePageUrl(repo: string, version?: string): string {
	if (isGitLabRepository(repo)) return `${repo}/-/releases`;
	return version ? `https://github.com/${repo}/releases/tag/${version}` : `https://github.com/${repo}/releases`;
}

/**
 * Platform-aware repository link (GitHub `user/repo` or GitLab full URL).
 */
export function createRepositoryLink(repository: string, optionalText?: string): DocumentFragment {
	return createLinkFragment(repositoryUrl(repository), repository, optionalText);
}

export function createGitHubResourceLink(githubResource: string, optionalText?: string): DocumentFragment {
	return createLinkFragment(`https://github.com/${githubResource}`, githubResource, optionalText);
}

function createLinkFragment(href: string, text: string, optionalText?: string): DocumentFragment {
	const newLink = new DocumentFragment();
	// eslint-disable-next-line obsidianmd/prefer-active-doc -- BRAT compatibility: activeDocument breaks utility rendering call sites
	const linkElement = document.createElement("a");
	linkElement.textContent = text;
	linkElement.href = href;
	linkElement.target = "_blank";
	newLink.appendChild(linkElement);
	if (optionalText) {
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- BRAT compatibility: activeDocument breaks utility rendering call sites
		const textNode = document.createTextNode(optionalText);
		newLink.appendChild(textNode);
	}
	return newLink;
}

export function createLink({
	prependText,
	url,
	text,
	appendText,
}: {
	prependText?: string;
	url: string;
	text: string;
	appendText?: string;
}): DocumentFragment {
	const newLink = new DocumentFragment();
	// eslint-disable-next-line obsidianmd/prefer-active-doc -- BRAT compatibility: activeDocument breaks utility rendering call sites
	const linkElement = document.createElement("a");
	linkElement.textContent = text;
	linkElement.href = url;
	if (prependText) {
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- BRAT compatibility: activeDocument breaks utility rendering call sites
		const textNode = document.createTextNode(prependText);
		newLink.appendChild(textNode);
	}
	newLink.appendChild(linkElement);
	if (appendText) {
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- BRAT compatibility: activeDocument breaks utility rendering call sites
		const textNode = document.createTextNode(appendText);
		newLink.appendChild(textNode);
	}
	return newLink;
}
