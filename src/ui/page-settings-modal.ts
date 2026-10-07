import { App, Modal, Setting } from 'obsidian';
import { NotebookPage, PageFormat, PageOrientation, PageBackground } from '../types';
import { t } from '../i18n';

export class PageSettingsModal extends Modal {
	private page: NotebookPage;
	private availableGroups: string[];
	private onSave: (page: NotebookPage) => void;

	constructor(
		app: App,
		page: NotebookPage,
		availableGroups: string[] = [],
		onSave: (page: NotebookPage) => void,
	) {
		super(app);
		this.page = page;
		this.availableGroups = availableGroups;
		this.onSave = onSave;
	}

	public onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('betternotebook-modal');

		contentEl.createEl('h2', {
			text: `${t('sidebar_change_format_bg')}: ${t('sidebar_page')} ${this.page.pageNumber}`,
		});

		new Setting(contentEl)
			.setName(t('sidebar_rename_page'))
			.setDesc(t('sidebar_rename_page'))
			.addText((text) =>
				text.setValue(this.page.title).onChange((val) => {
					this.page.title = val.trim() || `${t('sidebar_page')} ${this.page.pageNumber}`;
				}),
			);

		let groupInput: HTMLInputElement | null = null;
		new Setting(contentEl)
			.setName(t('sidebar_assign_topic'))
			.setDesc(t('sidebar_assign_topic'))
			.addText((text) => {
				text.setValue(this.page.group || t('sidebar_default_group')).onChange((val) => {
					this.page.group = val.trim() || t('sidebar_default_group');
				});
				groupInput = text.inputEl;
			});

		if (this.availableGroups.length > 0) {
			const suggestionsDiv = contentEl.createDiv({
				cls: 'betternotebook-group-suggestions-chips',
			});
			suggestionsDiv.createSpan({
				cls: 'betternotebook-suggestions-label',
				text: `${t('sidebar_all_topics')}: `,
			});
			for (const grp of this.availableGroups) {
				const chip = suggestionsDiv.createEl('button', {
					cls: `betternotebook-chip ${this.page.group === grp ? 'is-active' : ''}`,
					text: grp,
				});
				chip.addEventListener('click', () => {
					this.page.group = grp;
					if (groupInput) groupInput.value = grp;
					suggestionsDiv
						.querySelectorAll('.betternotebook-chip')
						.forEach((c) => c.removeClass('is-active'));
					chip.addClass('is-active');
				});
			}
		}

		new Setting(contentEl)
			.setName(t('settings_default_format'))
			.setDesc(t('settings_default_format_desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('a4', t('format_a4'))
					.addOption('a5', t('format_a5'))
					.addOption('a3', t('format_a3'))
					.addOption('letter', t('format_letter'))
					.setValue(this.page.format)
					.onChange((val) => {
						this.page.format = val as PageFormat;
					}),
			);

		new Setting(contentEl)
			.setName(t('settings_default_orientation'))
			.setDesc(t('settings_default_orientation_desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('portrait', t('orientation_portrait'))
					.addOption('landscape', t('orientation_landscape'))
					.setValue(this.page.orientation)
					.onChange((val) => {
						this.page.orientation = val as PageOrientation;
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
					.setValue(this.page.background)
					.onChange((val) => {
						this.page.background = val as PageBackground;
					}),
			);

		const footer = contentEl.createDiv({
			cls: 'betternotebook-modal-footer',
		});
		const saveBtn = footer.createEl('button', {
			cls: 'mod-cta',
			text: 'Übernehmen',
		});

		saveBtn.addEventListener('click', () => {
			this.onSave(this.page);
			this.close();
		});
	}

	public onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
