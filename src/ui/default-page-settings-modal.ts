import { App, Modal, Setting } from 'obsidian';
import type BetterNotebookPlugin from '../main';
import { PageFormat, PageOrientation, PageBackground } from '../types';
import { t } from '../i18n';

export class DefaultPageSettingsModal extends Modal {
	private plugin: BetterNotebookPlugin;
	private onSave: () => void;

	constructor(app: App, plugin: BetterNotebookPlugin, onSave: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
	}

	public onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('betternotebook-modal');

		contentEl.createEl('h2', {
			text: t('settings_default_format'),
		});
		contentEl.createEl('p', {
			cls: 'betternotebook-modal-desc',
			text: t('settings_default_format_desc'),
		});

		new Setting(contentEl)
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

		new Setting(contentEl)
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

		new Setting(contentEl)
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

		const footer = contentEl.createDiv({
			cls: 'betternotebook-modal-footer',
		});
		const okBtn = footer.createEl('button', {
			cls: 'mod-cta',
			text: 'Fertig',
		});
		okBtn.addEventListener('click', () => {
			this.onSave();
			this.close();
		});
	}

	public onClose(): void {
		this.contentEl.empty();
	}
}
