import { App, PluginSettingTab, Setting } from 'obsidian';
import type BetterNotebookPlugin from './main';
import { PageFormat, PageOrientation, PageBackground } from './types';
import { SUPPORTED_LANGUAGES, setLanguage, t } from './i18n';

export class BetterNotebookSettingTab extends PluginSettingTab {
	private plugin: BetterNotebookPlugin;

	constructor(app: App, plugin: BetterNotebookPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): unknown[] {
		return [];
	}

	public display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings_language'))
			.setDesc(t('settings_language_desc'))
			.addDropdown((dropdown) => {
				SUPPORTED_LANGUAGES.forEach((lang) => {
					dropdown.addOption(lang.code, lang.nativeName);
				});
				dropdown.setValue(this.plugin.settings.language || 'auto');
				dropdown.onChange(async (val) => {
					this.plugin.settings.language = val;
					setLanguage(val);
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName(t('settings_smoothing'))
			.setDesc(t('settings_smoothing_desc'))
			.addSlider((slider) =>
				slider
					.setLimits(0.1, 0.9, 0.05)
					.setValue(this.plugin.settings.smoothingFactor)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.smoothingFactor = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_pressure'))
			.setDesc(t('settings_pressure_desc'))
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 4.0, 0.1)
					.setValue(this.plugin.settings.pressureSensitivity)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.pressureSensitivity = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_default_format'))
			.setDesc(t('settings_default_format_desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('a4', t('format_a4'))
					.addOption('a5', t('format_a5'))
					.addOption('a3', t('format_a3'))
					.addOption('letter', t('format_letter'))
					.setValue(this.plugin.settings.defaultPageFormat)
					.onChange(async (val) => {
						this.plugin.settings.defaultPageFormat = val as PageFormat;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_default_orientation'))
			.setDesc(t('settings_default_orientation_desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('portrait', t('orientation_portrait'))
					.addOption('landscape', t('orientation_landscape'))
					.setValue(this.plugin.settings.defaultOrientation)
					.onChange(async (val) => {
						this.plugin.settings.defaultOrientation =
							val as PageOrientation;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_default_background'))
			.setDesc(t('settings_default_background_desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('ruled', t('background_ruled'))
					.addOption('grid', t('background_grid'))
					.addOption('dotted', t('background_dotted'))
					.addOption('blank', t('background_blank'))
					.setValue(this.plugin.settings.defaultBackground)
					.onChange(async (val) => {
						this.plugin.settings.defaultBackground =
							val as PageBackground;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_default_width'))
			.setDesc(t('settings_default_width_desc'))
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 0.5)
					.setValue(this.plugin.settings.defaultWidth)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.defaultWidth = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_default_color'))
			.setDesc(t('settings_default_color_desc'))
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.defaultColor)
					.onChange(async (val) => {
						this.plugin.settings.defaultColor = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_shape_recognition'))
			.setDesc(t('settings_shape_recognition_desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.shapeRecognitionEnabled)
					.onChange(async (val) => {
						this.plugin.settings.shapeRecognitionEnabled = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_shape_hold_duration'))
			.setDesc(t('settings_shape_hold_duration_desc'))
			.addSlider((slider) =>
				slider
					.setLimits(250, 800, 50)
					.setValue(this.plugin.settings.shapeHoldDurationMs)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.shapeHoldDurationMs = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_stylus_only'))
			.setDesc(t('settings_stylus_only_desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stylusOnlyMode)
					.onChange(async (val) => {
						this.plugin.settings.stylusOnlyMode = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_zoom_adaptive'))
			.setDesc(t('settings_zoom_adaptive_desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.zoomAdaptiveStrokeWidth)
					.onChange(async (val) => {
						this.plugin.settings.zoomAdaptiveStrokeWidth = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings_notebooks_folder'))
			.setDesc(t('settings_notebooks_folder_desc'))
			.addText((text) =>
				text
					.setPlaceholder('notebooks')
					.setValue(this.plugin.settings.notebooksFolder || 'notebooks')
					.onChange(async (val) => {
						this.plugin.settings.notebooksFolder = val.trim() || 'notebooks';
						await this.plugin.saveSettings();
					}),
			);
	}
}
