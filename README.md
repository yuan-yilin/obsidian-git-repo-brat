![](media/brat.jpg)

# GitLab BRAT - Beta Reviewers Auto-update Tester

This is a fork of [TfTHacker's BRAT](https://github.com/TfTHacker/obsidian42-brat) with GitLab support: it installs and updates Obsidian **plugins and themes from both GitHub and GitLab**.

The **Beta Reviewers Auto-update Tool** or **BRAT** for short is a plugin that makes it easier for you to assist other developers with reviewing and testing their plugins and themes.

Simply add the repository for the beta Obsidian plugin to the list for testing and now you can just check for updates. Updates are downloaded and the plugin is reloaded. No more having to create folders, download files, copy them to the right place, and so on. This plugin takes care of all that for you.

## Adding a repository

- **GitHub**: enter the repository as `user/repo` (or paste the full `https://github.com/user/repo` URL).
- **GitLab**: paste the full repository URL, e.g. `http://gitlab.example.com/group/project`. Any GitLab instance works — the public [gitlab.com](https://gitlab.com) as well as self-hosted instances.

## GitLab setup (personal access token)

GitLab projects that are internal or private require a personal access token:

1. Create a token in your GitLab instance under **User Settings → Access Tokens** with the `read_api` scope.
2. In Obsidian, add the token to Obsidian's secrets (Settings → Secrets / or via the plugin's token picker).
3. In **Settings → GitLab BRAT**, set the **GitLab host** (e.g. `http://gitlab.example.com`) and select the token, then click **Validate**.

Tokens are stored in Obsidian's per-device secret storage, so each device needs to be configured once. Publicly visible projects work without a token.

Notes for self-hosted instances:

- Release assets are downloaded through the GitLab API. If a release's asset links point at CI job artifacts, those artifacts must not have expired on the GitLab side — if an install fails with "main.js is missing from the Release", check whether the release's artifacts still exist.
- Updates are checked per host: GitHub plugins are skipped when the general internet is unreachable, while GitLab plugins only need the GitLab instance itself to be reachable (works on intranet-only setups).

Learn more about BRAT in the DOCUMENTATION found at: https://tfthacker.com/BRAT or follow me at https://twitter.com/tfthacker for updates.

You might also be interested in a few products I have made for Obsidian:

- [JournalCraft](https://tfthacker.com/jco) - A curated collection of 10 powerful journaling templates designed to enhance your journaling experience. Whether new to journaling or looking to step up your game, JournalCraft has something for you.
- [Cornell Notes Learning Vault](https://tfthacker.com/cornell-notes) - This vault teaches you to use the Cornell Note-Taking System in your Obsidian vault. It includes learning material, samples, and Obsidian configuration files to enable Cornell Notes in your vault.
