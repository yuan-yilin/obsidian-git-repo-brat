import type {
	App,
	ButtonComponent,
	ExtraButtonComponent,
	SecretComponent,
	SettingDefinition,
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingDefinitionList,
	SettingGroupItem,
	ToggleComponent,
} from "obsidian";
import { PluginSettingTab, requireApiVersion, SecretComponent as SecretComponentClass, Setting, SettingGroup } from "obsidian";
import { type GitHubTokenInfo, validateGitHubToken } from "../features/githubUtils";
import { resolveGitLabValidationHost, validateGitLabToken } from "../features/gitlabUtils";
import { themeDelete } from "../features/themes";
import { getTranslations } from "../i18n";
import type BratPlugin from "../main";
import type { Settings as BratPluginSettings, PluginVersion, ThemeInforamtion } from "../settings";
import { toastMessage } from "../utils/notifications";
import { createLink, createRepositoryLink } from "../utils/utils";
import AddNewTheme from "./AddNewTheme";

type BratSettingsKey = Extract<keyof BratPluginSettings, string>;
type TokenPlatform = "github" | "gitlab";

export class BratSettingsTab extends PluginSettingTab {
	plugin: BratPlugin;
	private tokenSettings: Map<TokenPlatform, SecretComponent | null> = new Map();
	private tokenButtons: Map<TokenPlatform, ButtonComponent | null> = new Map();

	constructor(app: App, plugin: BratPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private async copyRepoIdentifier(identifier: string): Promise<void> {
		if (!identifier) return;

		const t = getTranslations().settings.copyIdentifier;
		try {
			if (!navigator.clipboard?.writeText) {
				throw new Error("Clipboard API unavailable");
			}
			await navigator.clipboard.writeText(identifier);
			toastMessage(this.plugin, t.copied(identifier), 3);
		} catch (error) {
			console.error("Failed to copy repository identifier", identifier, error);
			toastMessage(this.plugin, t.failed, 5);
		}
	}

	override getSettingDefinitions(): SettingDefinitionItem<BratSettingsKey>[] {
		const text = getTranslations().settings;

		return [
			{
				name: text.general.autoEnablePluginsAfterInstallation.name,
				desc: text.general.autoEnablePluginsAfterInstallation.desc,
				control: { type: "toggle", key: "enableAfterInstall" },
			},
			{
				name: text.general.autoUpdatePluginsAtStartup.name,
				desc: text.general.autoUpdatePluginsAtStartup.desc,
				control: { type: "toggle", key: "updateAtStartup" },
			},
			{
				name: text.general.autoUpdateThemesAtStartup.name,
				desc: text.general.autoUpdateThemesAtStartup.desc,
				control: { type: "toggle", key: "updateThemesAtStartup" },
			},
			{
				name: text.general.selectLatestPluginVersionByDefault.name,
				desc: text.general.selectLatestPluginVersionByDefault.desc,
				control: {
					type: "toggle",
					key: "selectLatestPluginVersionByDefault",
				},
			},
			{
				name: text.general.allowIncompatiblePlugins.name,
				desc: text.general.allowIncompatiblePlugins.desc,
				control: { type: "toggle", key: "allowIncompatiblePlugins" },
			},
			this.createPluginListDefinition(),
			this.createThemeListDefinition(),
			{
				type: "group",
				heading: text.monitoring.heading,
				items: [
					{
						name: text.monitoring.enableNotifications.name,
						desc: text.monitoring.enableNotifications.desc,
						control: { type: "toggle", key: "notificationsEnabled" },
					},
					{
						name: text.monitoring.enableLogging.name,
						desc: text.monitoring.enableLogging.desc,
						control: { type: "toggle", key: "loggingEnabled" },
					},
					{
						name: text.monitoring.bratLogFileLocation.name,
						desc: text.monitoring.bratLogFileLocation.desc,
						control: {
							type: "text",
							key: "loggingPath",
							placeholder: text.monitoring.bratLogFileLocation.placeholder,
						},
					},
					{
						name: text.monitoring.enableVerboseLogging.name,
						desc: text.monitoring.enableVerboseLogging.desc,
						control: { type: "toggle", key: "loggingVerboseEnabled" },
					},
					{
						name: text.monitoring.debuggingMode.name,
						desc: text.monitoring.debuggingMode.desc,
						control: { type: "toggle", key: "debuggingMode" },
					},
				],
			},
			{
				type: "group",
				heading: text.githubPersonalAccessToken.heading,
				items: [
					{
						name: text.githubPersonalAccessToken.personalAccessToken.name,
						desc: createLink({
							prependText: text.githubPersonalAccessToken.personalAccessToken.desc.prependText,
							url: "https://github.com/settings/tokens/new?scopes=public_repo",
							text: text.githubPersonalAccessToken.personalAccessToken.desc.linkText,
							appendText: text.githubPersonalAccessToken.personalAccessToken.desc.appendText,
						}),
						render: (setting) => this.renderTokenSetting(setting, "github"),
					},
				],
			},
			{
				type: "group",
				heading: text.gitlabSection.heading,
				items: [
					{
						name: text.gitlabSection.host.name,
						desc: text.gitlabSection.host.desc,
						control: {
							type: "text",
							key: "gitlabHost",
							placeholder: text.gitlabSection.host.placeholder,
						},
					},
					{
						name: text.gitlabSection.personalAccessToken.name,
						desc: createLink({
							prependText: text.gitlabSection.personalAccessToken.desc.prependText,
							url: "https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html",
							text: text.gitlabSection.personalAccessToken.desc.linkText,
							appendText: text.gitlabSection.personalAccessToken.desc.appendText,
						}),
						render: (setting) => this.renderTokenSetting(setting, "gitlab"),
					},
				],
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("brat-settings");
		const text = getTranslations().settings;

		new Setting(containerEl)
			.setName(text.general.autoEnablePluginsAfterInstallation.name)
			.setDesc(text.general.autoEnablePluginsAfterInstallation.desc)
			.addToggle((cb: ToggleComponent) => {
				cb.setValue(this.plugin.settings.enableAfterInstall).onChange(async (value: boolean) => {
					this.plugin.settings.enableAfterInstall = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(text.general.autoUpdatePluginsAtStartup.name)
			.setDesc(text.general.autoUpdatePluginsAtStartup.desc)
			.addToggle((cb: ToggleComponent) => {
				cb.setValue(this.plugin.settings.updateAtStartup).onChange(async (value: boolean) => {
					this.plugin.settings.updateAtStartup = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(text.general.autoUpdateThemesAtStartup.name)
			.setDesc(text.general.autoUpdateThemesAtStartup.desc)
			.addToggle((cb: ToggleComponent) => {
				cb.setValue(this.plugin.settings.updateThemesAtStartup).onChange(async (value: boolean) => {
					this.plugin.settings.updateThemesAtStartup = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(text.general.selectLatestPluginVersionByDefault.name)
			.setDesc(text.general.selectLatestPluginVersionByDefault.desc)
			.addToggle((cb: ToggleComponent) => {
				cb.setValue(this.plugin.settings.selectLatestPluginVersionByDefault).onChange(async (value: boolean) => {
					this.plugin.settings.selectLatestPluginVersionByDefault = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(text.general.allowIncompatiblePlugins.name)
			.setDesc(text.general.allowIncompatiblePlugins.desc)
			.addToggle((cb: ToggleComponent) => {
				cb.setValue(this.plugin.settings.allowIncompatiblePlugins).onChange(async (value: boolean) => {
					this.plugin.settings.allowIncompatiblePlugins = value;
					await this.plugin.saveSettings();
				});
			});

		const frozenVersions = new Map(this.plugin.settings.pluginSubListFrozenVersion.map((f) => [f.repo, f]));
		const pluginContainers = new Map<string, { container: HTMLElement; pluginName: string }>();

		const betaPluginGroup = new SettingGroup(containerEl).setHeading(text.betaPluginList.heading);

		betaPluginGroup.addSearch((cb) => {
			cb.setPlaceholder(text.betaPluginList.filterPlaceholder);

			cb.onChange((value: string) => {
				const filterValue = value.toLowerCase().trim();
				pluginContainers.forEach(({ container, pluginName }) => {
					if (filterValue === "") {
						container.removeAttribute("hidden");
					} else {
						if (pluginName.includes(filterValue)) {
							container.removeAttribute("hidden");
						} else {
							container.setAttribute("hidden", "true");
						}
					}
				});
			});
		});

		betaPluginGroup.addSetting((setting) => {
			setting.setDesc(this.createPluginListDescriptionFragment());
			setting.addButton((cb: ButtonComponent) => {
				cb.setButtonText(text.betaPluginList.addBetaPlugin)
					.setCta()
					.onClick(() => {
						this.plugin.betaPlugins.displayAddNewPluginModal(true);
					});
			});
		});

		for (const p of this.plugin.settings.pluginList) {
			const bp = frozenVersions.get(p);
			betaPluginGroup.addSetting((pluginSettingContainer) => {
				const secretName = bp?.tokenName || "";
				const secretValue = secretName ? this.plugin.app.secretStorage.getSecret(secretName) : "";
				const isSecretMissing = Boolean(secretName && !secretValue);

				// eslint-disable-next-line obsidianmd/prefer-active-doc -- BRAT compatibility: activeDocument breaks settings description rendering
				const pluginDescription = document.createDocumentFragment();
				const trackedVersionText = bp?.version ? text.betaPluginList.trackedVersion(bp.version, bp.version !== "latest") : "";
				const incompatibleText = bp?.isIncompatible ? text.betaPluginList.incompatible : "";
				pluginDescription.createDiv({
					text: `${trackedVersionText}${incompatibleText}`,
				});
				if (isSecretMissing) {
					pluginDescription.createDiv({
						text: text.betaPluginList.secretMissing(secretName),
						cls: "mod-warning",
						title: text.betaPluginList.secretMissingTitle,
					});
				}

				pluginSettingContainer.setName(createRepositoryLink(p)).setDesc(pluginDescription);

				const containerElement = pluginSettingContainer.settingEl;
				containerElement.addClass("brat-plugin-item");
				pluginContainers.set(p, {
					container: containerElement,
					pluginName: p.toLowerCase(),
				});

				pluginSettingContainer.addExtraButton((btn: ExtraButtonComponent) => {
					btn
						.setIcon("copy")
						.setTooltip(text.betaPluginList.copyPluginIdentifier)
						.onClick(async () => {
							await this.copyRepoIdentifier(p);
						});
				});

				if (!bp?.version || bp.version === "latest") {
					// Only show update button for plugins tracking latest version
					pluginSettingContainer.addButton((btn: ButtonComponent) => {
						if (isSecretMissing) {
							// Token name configured but secret missing: make button red, disabled, and show informative tooltip
							btn.setIcon("sync").setTooltip(text.betaPluginList.secretMissingTooltip(secretName)).setWarning().setDisabled(true);
						} else {
							btn
								.setIcon("sync")
								.setTooltip(text.betaPluginList.checkAndUpdatePlugin)
								.onClick(async () => {
									await this.plugin.betaPlugins.updatePlugin(p, false, true, false, bp?.tokenName || "");
								});
						}
					});
				}

				// Container for the edit and removal buttons
				pluginSettingContainer
					.addButton((btn: ButtonComponent) => {
						btn.setIcon("edit").setTooltip(text.betaPluginList.changeVersionAndUpdateSettings);

						if (isSecretMissing) {
							btn.setWarning();
						}

						btn.onClick(() => {
							this.plugin.betaPlugins.displayAddNewPluginModal(
								true,
								true,
								p,
								bp?.version,
								bp?.tokenName || "", // Pass secret name, not token value
							);
							this.plugin.app.setting.updatePluginSection();
						});
					})
					.addButton((btn: ButtonComponent) => {
						btn
							.setIcon("cross")
							.setTooltip(text.betaPluginList.removeThisBetaPlugin)
							.setWarning()
							.onClick(() => {
								if (btn.buttonEl.textContent === "") {
									btn.setButtonText(text.betaPluginList.confirmRemoval);
								} else {
									const { buttonEl } = btn;
									const { parentElement } = buttonEl;
									if (parentElement?.parentElement) {
										parentElement.parentElement.remove();
										this.plugin.betaPlugins.deletePlugin(p);
									}
								}
							});
					});
			});
		}

		const themeContainers = new Map<string, { container: HTMLElement; themeName: string }>();
		const betaThemeGroup = new SettingGroup(containerEl).setHeading(text.betaThemeList.heading);

		betaThemeGroup.addSetting((setting) => {
			setting.addButton((cb: ButtonComponent) => {
				cb.setButtonText(text.betaThemeList.addBetaTheme)
					.setCta()
					.onClick(() => {
						this.plugin.app.setting.close();
						new AddNewTheme(this.plugin).open();
					});
			});
		});

		betaThemeGroup.addSearch((cb) => {
			cb.setPlaceholder(text.betaThemeList.filterPlaceholder);

			cb.onChange((value: string) => {
				const filterValue = value.toLowerCase().trim();
				themeContainers.forEach(({ container, themeName }) => {
					if (filterValue === "") {
						container.removeAttribute("hidden");
					} else {
						if (themeName.includes(filterValue)) {
							container.removeAttribute("hidden");
						} else {
							container.setAttribute("hidden", "true");
						}
					}
				});
			});
		});

		for (const bp of this.plugin.settings.themesList) {
			betaThemeGroup.addSetting((themeSettingContainer) => {
				themeSettingContainer.setName(createRepositoryLink(bp.repo));

				const containerElement = themeSettingContainer.settingEl;
				containerElement.addClass("brat-theme-item");
				themeContainers.set(bp.repo, {
					container: containerElement,
					themeName: bp.repo.toLowerCase(),
				});

				themeSettingContainer.addExtraButton((btn: ExtraButtonComponent) => {
					btn
						.setIcon("copy")
						.setTooltip(text.betaThemeList.copyThemeIdentifier)
						.onClick(async () => {
							await this.copyRepoIdentifier(bp.repo);
						});
				});

				themeSettingContainer.addButton((btn: ButtonComponent) => {
					btn
						.setIcon("cross")
						.setTooltip(text.betaThemeList.deleteThisBetaTheme)
						.onClick(() => {
							if (btn.buttonEl.textContent === "") btn.setButtonText(text.betaThemeList.confirmRemoval);
							else {
								const { buttonEl } = btn;
								const { parentElement } = buttonEl;
								if (parentElement?.parentElement) {
									parentElement.parentElement.remove();
									themeDelete(this.plugin, bp.repo);
								}
							}
						});
				});
			});
		}

		const monitoringGroup = new SettingGroup(containerEl).setHeading(text.monitoring.heading);

		monitoringGroup.addSetting((setting) => {
			setting
				.setName(text.monitoring.enableNotifications.name)
				.setDesc(text.monitoring.enableNotifications.desc)
				.addToggle((cb: ToggleComponent) => {
					cb.setValue(this.plugin.settings.notificationsEnabled);
					cb.onChange((value: boolean) => {
						this.plugin.settings.notificationsEnabled = value;
						void this.plugin.saveSettings();
					});
				});
		});

		monitoringGroup.addSetting((setting) => {
			setting
				.setName(text.monitoring.enableLogging.name)
				.setDesc(text.monitoring.enableLogging.desc)
				.addToggle((cb: ToggleComponent) => {
					cb.setValue(this.plugin.settings.loggingEnabled).onChange((value: boolean) => {
						this.plugin.settings.loggingEnabled = value;
						void this.plugin.saveSettings();
					});
				});
		});

		monitoringGroup.addSetting((setting) => {
			setting
				.setName(text.monitoring.bratLogFileLocation.name)
				.setDesc(text.monitoring.bratLogFileLocation.desc)
				.addSearch((cb) => {
					cb.setPlaceholder(text.monitoring.bratLogFileLocation.placeholder)
						.setValue(this.plugin.settings.loggingPath)
						.onChange((newFolder) => {
							this.plugin.settings.loggingPath = newFolder;
							void this.plugin.saveSettings();
						});
				});
		});

		monitoringGroup.addSetting((setting) => {
			setting
				.setName(text.monitoring.enableVerboseLogging.name)
				.setDesc(text.monitoring.enableVerboseLogging.desc)
				.addToggle((cb: ToggleComponent) => {
					cb.setValue(this.plugin.settings.loggingVerboseEnabled).onChange((value: boolean) => {
						this.plugin.settings.loggingVerboseEnabled = value;
						void this.plugin.saveSettings();
					});
				});
		});

		monitoringGroup.addSetting((setting) => {
			setting
				.setName(text.monitoring.debuggingMode.name)
				.setDesc(text.monitoring.debuggingMode.desc)
				.addToggle((cb: ToggleComponent) => {
					cb.setValue(this.plugin.settings.debuggingMode).onChange((value: boolean) => {
						this.plugin.settings.debuggingMode = value;
						void this.plugin.saveSettings();
					});
				});
		});

		// Personal access token setting
		const tokenSection = new SettingGroup(containerEl).setHeading(text.githubPersonalAccessToken.heading);
		tokenSection.addSetting((tokenSetting) => {
			tokenSetting.setName(text.githubPersonalAccessToken.personalAccessToken.name).setDesc(
				createLink({
					prependText: text.githubPersonalAccessToken.personalAccessToken.desc.prependText,
					url: "https://github.com/settings/tokens/new?scopes=public_repo",
					text: text.githubPersonalAccessToken.personalAccessToken.desc.linkText,
					appendText: text.githubPersonalAccessToken.personalAccessToken.desc.appendText,
				}),
			);
			this.attachTokenSettingControls(tokenSetting, "github");
		});

		// GitLab host + token setting
		const gitlabSection = new SettingGroup(containerEl).setHeading(text.gitlabSection.heading);
		gitlabSection.addSetting((hostSetting) => {
			hostSetting
				.setName(text.gitlabSection.host.name)
				.setDesc(text.gitlabSection.host.desc)
				.addSearch((cb) => {
					cb.setPlaceholder(text.gitlabSection.host.placeholder)
						.setValue(this.plugin.settings.gitlabHost || "")
						.onChange((newHost: string) => {
							this.plugin.settings.gitlabHost = newHost.trim();
							void this.plugin.saveSettings();
						});
				});
		});
		gitlabSection.addSetting((gitlabTokenSetting) => {
			gitlabTokenSetting.setName(text.gitlabSection.personalAccessToken.name).setDesc(
				createLink({
					prependText: text.gitlabSection.personalAccessToken.desc.prependText,
					url: "https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html",
					text: text.gitlabSection.personalAccessToken.desc.linkText,
					appendText: text.gitlabSection.personalAccessToken.desc.appendText,
				}),
			);
			this.attachTokenSettingControls(gitlabTokenSetting, "gitlab");
		});
	}

	private createPluginListDefinition(): SettingDefinitionList<BratSettingsKey> {
		const text = getTranslations().settings;
		const frozenVersions = new Map(this.plugin.settings.pluginSubListFrozenVersion.map((f) => [f.repo, f]));

		return {
			type: "list",
			heading: text.betaPluginList.heading,
			search: this.createListSearch(text.betaPluginList.filterPlaceholder),
			addItem: {
				name: text.betaPluginList.addBetaPlugin,
				action: () => {
					this.plugin.betaPlugins.displayAddNewPluginModal(true, false, "", "", "", () => this.update());
				},
			},
			items: [
				this.createPluginListDescriptionItem(),
				...this.plugin.settings.pluginList.map((repository) => {
					const trackedPlugin = frozenVersions.get(repository);
					return {
						name: repository,
						desc: this.createTrackedPluginDescriptionText(trackedPlugin),
						render: (setting: Setting) => {
							this.renderTrackedPluginSetting(setting, repository, trackedPlugin);
						},
					};
				}),
			],
		};
	}

	private createThemeListDefinition(): SettingDefinitionList<BratSettingsKey> {
		const text = getTranslations().settings;

		return {
			type: "list",
			heading: text.betaThemeList.heading,
			search: this.createListSearch(text.betaThemeList.filterPlaceholder),
			addItem: {
				name: text.betaThemeList.addBetaTheme,
				action: () => {
					this.plugin.app.setting.close();
					new AddNewTheme(this.plugin, true, () => this.update()).open();
				},
			},
			items: this.plugin.settings.themesList.map((theme) => ({
				name: theme.repo,
				render: (setting) => {
					this.renderTrackedThemeSetting(setting, theme);
				},
			})),
		};
	}

	private createPluginListDescriptionItem(): SettingGroupItem<BratSettingsKey> {
		const guideUrl =
			"https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md#managing-beta-plugin-and-theme-lists-in-settings";

		return {
			name: "",
			searchable: false,
			render: (setting) => {
				setting.settingEl.empty();
				const line = setting.settingEl.createDiv();
				line.createSpan({
					text: getTranslations().settings.betaPluginList.description.editAndRemove,
				});
				line.appendText(" ");
				line.createEl("a", {
					href: guideUrl,
					text: "Learn more",
				});
			},
		};
	}

	private createPluginListDescriptionFragment(): DocumentFragment {
		const guideUrl =
			"https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md#managing-beta-plugin-and-theme-lists-in-settings";
		const text = getTranslations().settings.betaPluginList.description;
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- BRAT compatibility: activeDocument breaks settings description rendering
		const fragment = document.createDocumentFragment();
		const line = fragment.createEl("div");
		line.createSpan({ text: text.editAndRemove });
		line.appendText(" ");
		line.createEl("a", {
			href: guideUrl,
			text: "Learn more",
		});
		return fragment;
	}

	private createTrackedPluginDescriptionFragment(trackedPlugin?: PluginVersion): DocumentFragment {
		const text = getTranslations().settings.betaPluginList;
		const secretName = trackedPlugin?.tokenName || "";
		const secretValue = secretName ? this.plugin.app.secretStorage.getSecret(secretName) : "";
		const isSecretMissing = Boolean(secretName && !secretValue);
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- BRAT compatibility: activeDocument breaks settings description rendering
		const pluginDescription = document.createDocumentFragment();
		const trackedVersionText = trackedPlugin?.version ? text.trackedVersion(trackedPlugin.version, trackedPlugin.version !== "latest") : "";
		const incompatibleText = trackedPlugin?.isIncompatible ? text.incompatible : "";
		pluginDescription.createDiv({
			text: `${trackedVersionText}${incompatibleText}`,
		});
		if (isSecretMissing) {
			pluginDescription.createDiv({
				text: text.secretMissing(secretName),
				cls: "mod-warning",
				title: text.secretMissingTitle,
			});
		}
		return pluginDescription;
	}

	private createTrackedPluginDescriptionText(trackedPlugin?: PluginVersion): string {
		const text = getTranslations().settings.betaPluginList;
		const trackedVersionText = trackedPlugin?.version ? text.trackedVersion(trackedPlugin.version, trackedPlugin.version !== "latest") : "";
		const incompatibleText = trackedPlugin?.isIncompatible ? text.incompatible : "";
		const secretName = trackedPlugin?.tokenName || "";
		const secretValue = secretName ? this.plugin.app.secretStorage.getSecret(secretName) : "";
		const secretText = secretName && !secretValue ? text.secretMissing(secretName) : "";
		return `${trackedVersionText}${incompatibleText}${secretText}`.trim();
	}

	private renderTrackedPluginSetting(setting: Setting, repository: string, trackedPlugin?: PluginVersion): void {
		const text = getTranslations().settings.betaPluginList;
		const secretName = trackedPlugin?.tokenName || "";
		const secretValue = secretName ? this.plugin.app.secretStorage.getSecret(secretName) : "";
		const isSecretMissing = Boolean(secretName && !secretValue);

		setting.setName(createRepositoryLink(repository)).setDesc(this.createTrackedPluginDescriptionFragment(trackedPlugin));
		setting.settingEl.addClass("brat-plugin-item");

		setting.addExtraButton((btn: ExtraButtonComponent) => {
			btn
				.setIcon("copy")
				.setTooltip(text.copyPluginIdentifier)
				.onClick(async () => {
					await this.copyRepoIdentifier(repository);
				});
		});

		if (!trackedPlugin?.version || trackedPlugin.version === "latest") {
			setting.addButton((btn: ButtonComponent) => {
				if (isSecretMissing) {
					btn.setIcon("sync").setTooltip(text.secretMissingTooltip(secretName)).setWarning().setDisabled(true);
				} else {
					btn
						.setIcon("sync")
						.setTooltip(text.checkAndUpdatePlugin)
						.onClick(async () => {
							await this.plugin.betaPlugins.updatePlugin(repository, false, true, false, trackedPlugin?.tokenName || "");
						});
				}
			});
		}

		setting.addButton((btn: ButtonComponent) => {
			btn.setIcon("edit").setTooltip(text.changeVersionAndUpdateSettings);

			if (isSecretMissing) {
				btn.setWarning();
			}

			btn.onClick(() => {
				this.plugin.betaPlugins.displayAddNewPluginModal(
					true,
					true,
					repository,
					trackedPlugin?.version,
					trackedPlugin?.tokenName || "",
					() => this.update(),
				);
			});
		});

		setting.addButton((btn: ButtonComponent) => {
			btn
				.setIcon("cross")
				.setTooltip(text.removeThisBetaPlugin)
				.setWarning()
				.onClick(() => {
					if (btn.buttonEl.textContent === "") {
						btn.setButtonText(text.confirmRemoval);
					} else {
						this.plugin.betaPlugins.deletePlugin(repository);
						this.update();
					}
				});
		});
	}

	private renderTrackedThemeSetting(setting: Setting, theme: ThemeInforamtion): void {
		const text = getTranslations().settings.betaThemeList;
		setting.setName(createRepositoryLink(theme.repo));
		setting.settingEl.addClass("brat-theme-item");
		setting.addExtraButton((btn: ExtraButtonComponent) => {
			btn
				.setIcon("copy")
				.setTooltip(text.copyThemeIdentifier)
				.onClick(async () => {
					await this.copyRepoIdentifier(theme.repo);
				});
		});

		setting.addButton((btn: ButtonComponent) => {
			btn
				.setIcon("cross")
				.setTooltip(text.deleteThisBetaTheme)
				.setWarning()
				.onClick(() => {
					if (btn.buttonEl.textContent === "") {
						btn.setButtonText(text.confirmRemoval);
					} else {
						themeDelete(this.plugin, theme.repo);
						this.update();
					}
				});
		});
	}

	private renderTokenSetting(setting: Setting, platform: TokenPlatform): () => void {
		this.attachTokenSettingControls(setting, platform);
		return () => {
			this.tokenSettings.set(platform, null);
			this.tokenButtons.set(platform, null);
		};
	}

	private tokenSettingKey(platform: TokenPlatform): "globalTokenName" | "gitlabTokenName" {
		return platform === "gitlab" ? "gitlabTokenName" : "globalTokenName";
	}

	private tokenSettingText(platform: TokenPlatform) {
		return platform === "gitlab" ? getTranslations().settings.gitlabSection : getTranslations().settings.githubPersonalAccessToken;
	}

	/**
	 * Attaches the secret-selector, clear and validate controls for a platform
	 * token to the given setting. Used by both the declarative and legacy paths.
	 */
	private attachTokenSettingControls(setting: Setting, platform: TokenPlatform): void {
		const text = this.tokenSettingText(platform);
		const settingKey = this.tokenSettingKey(platform);
		let currentTokenValue = "";

		// Create SecretComponent - displays secret NAME selector
		const secretComponent = new SecretComponentClass(this.plugin.app, setting.controlEl);
		this.tokenSettings.set(platform, secretComponent);

		secretComponent.setValue(this.plugin.settings[settingKey] || "").onChange((secretName: string | null) => {
			void (async () => {
				// secretName is the NAME of the secret, not the value (can be null when cleared)
				const normalizedName = secretName?.trim() || "";
				this.plugin.settings[settingKey] = normalizedName;
				await this.plugin.saveSettings();

				// Get the actual token value for validation
				if (normalizedName) {
					currentTokenValue = this.plugin.app.secretStorage.getSecret(normalizedName) || "";
					await this.validateTokenAndUpdateButton(currentTokenValue, platform);
				} else {
					currentTokenValue = "";
					await this.validateTokenAndUpdateButton("", platform);
				}
			})();
		});

		// Get initial token value for validation
		if (this.plugin.settings[settingKey]) {
			currentTokenValue = this.plugin.app.secretStorage.getSecret(this.plugin.settings[settingKey]) || "";
		}

		setting
			.addExtraButton((cb: ExtraButtonComponent) => {
				cb.setIcon("cross")
					.setTooltip(text.clearPersonalAccessToken)
					.onClick(async () => {
						this.plugin.settings[settingKey] = "";
						await this.plugin.saveSettings();
						secretComponent.setValue("");
						currentTokenValue = "";
						await this.validateTokenAndUpdateButton("", platform);
					});
			})
			.addButton((btn: ButtonComponent) => {
				this.tokenButtons.set(platform, btn);

				btn
					.setButtonText(text.validate)
					.setCta()
					.onClick(async () => {
						if (currentTokenValue) {
							await this.validateTokenAndUpdateButton(currentTokenValue, platform);
						}
					});
			})
			.then(() => {
				void this.validateTokenAndUpdateButton(currentTokenValue, platform);
			});
	}

	private createListSearch(placeholder: string): SettingDefinitionGroup<BratSettingsKey>["search"] | undefined {
		if (!requireApiVersion("1.13.1")) {
			return undefined;
		}

		return {
			placeholder,
			match: (def: SettingDefinition, query: string) => {
				const normalizedQuery = query.toLowerCase().trim();
				if (normalizedQuery === "") {
					return true;
				}

				const descriptionText = typeof def.desc === "string" ? def.desc : def.desc?.textContent || "";
				const searchText = [def.name, descriptionText, ...(def.aliases || [])].join(" ").toLowerCase();
				return searchText.includes(normalizedQuery);
			},
		};
	}

	private async validateTokenAndUpdateButton(token: string, platform: TokenPlatform): Promise<boolean> {
		const validateButton = this.tokenButtons.get(platform);
		if (!validateButton) {
			return false;
		}

		const text = getTranslations();
		const platformText = this.tokenSettingText(platform);
		validateButton.buttonEl.removeClass("mod-warning");
		validateButton.setTooltip("");

		if (!token) {
			validateButton.setButtonText(platformText.validate);
			validateButton.setDisabled(true);
			return false;
		}

		if (platform === "gitlab") {
			const host = resolveGitLabValidationHost(this.plugin.settings, this.plugin.settings.pluginList);
			if (!host) {
				validateButton.setButtonText(text.addBetaPluginModal.buttons.invalid);
				validateButton.buttonEl.addClass("mod-warning");
				validateButton.setDisabled(false);
				validateButton.setTooltip(getTranslations().settings.gitlabSection.noHostConfigured);
				return false;
			}
			try {
				const tokenInfo = await validateGitLabToken(token, host);
				if (tokenInfo.validToken) {
					validateButton.setButtonText(text.addBetaPluginModal.buttons.valid).setCta();
					validateButton.setDisabled(true);
					validateButton.setTooltip(tokenInfo.userName ? `Valid token — user: ${tokenInfo.userName}` : "Valid token");
					return true;
				}

				validateButton.setButtonText(text.addBetaPluginModal.buttons.invalid);
				validateButton.buttonEl.addClass("mod-warning");
				validateButton.setDisabled(false);
				validateButton.setTooltip(tokenInfo.error.message);
				return false;
			} catch (error) {
				console.error("GitLab token validation error:", error);
				validateButton.setButtonText(text.addBetaPluginModal.buttons.invalid);
				validateButton.buttonEl.addClass("mod-warning");
				validateButton.setDisabled(false);
				validateButton.setTooltip("Failed to validate token");
				return false;
			}
		}

		try {
			const tokenInfo = await validateGitHubToken(token);
			if (tokenInfo.validToken) {
				validateButton.setButtonText(text.addBetaPluginModal.buttons.valid).setCta();
				validateButton.setDisabled(true);
				validateButton.setTooltip(this.buildTokenValidationTooltip(tokenInfo));
				return true;
			}

			validateButton.setButtonText(text.addBetaPluginModal.buttons.invalid);
			validateButton.buttonEl.addClass("mod-warning");
			validateButton.setDisabled(false);
			validateButton.setTooltip(tokenInfo.error.message);
			return false;
		} catch (error) {
			console.error("Token validation error:", error);
			validateButton.setButtonText(text.addBetaPluginModal.buttons.invalid);
			validateButton.buttonEl.addClass("mod-warning");
			validateButton.setDisabled(false);
			validateButton.setTooltip("Failed to validate token");
			return false;
		}
	}

	private buildTokenValidationTooltip(tokenInfo: GitHubTokenInfo): string {
		const tooltipLines: string[] = [];

		if (tokenInfo.currentScopes?.length) {
			tooltipLines.push(`Scopes: ${tokenInfo.currentScopes.join(", ")}`);
		}

		if (tokenInfo.rateLimit) {
			tooltipLines.push(`Rate Limit: ${tokenInfo.rateLimit.remaining}/${tokenInfo.rateLimit.limit}`);
		}

		return tooltipLines.join("\n");
	}
}
