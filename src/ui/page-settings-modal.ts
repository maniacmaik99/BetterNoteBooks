import { App, Modal, Setting } from 'obsidian';
import { NotebookPage, PageFormat, PageOrientation, PageBackground } from '../types';

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
			text: `Seiteneinstellungen: Seite ${this.page.pageNumber}`,
		});

		new Setting(contentEl)
			.setName('Seitentitel')
			.setDesc('Individueller Name für diese Seite.')
			.addText((text) =>
				text.setValue(this.page.title).onChange((val) => {
					this.page.title = val.trim() || `Seite ${this.page.pageNumber}`;
				}),
			);

		let groupInput: HTMLInputElement | null = null;
		new Setting(contentEl)
			.setName('Gruppe / Thema')
			.setDesc('Kategorie zum Filtern und Auffinden.')
			.addText((text) => {
				text.setValue(this.page.group || 'Standard').onChange((val) => {
					this.page.group = val.trim() || 'Standard';
				});
				groupInput = text.inputEl;
			});

		if (this.availableGroups.length > 0) {
			const suggestionsDiv = contentEl.createDiv({
				cls: 'betternotebook-group-suggestions-chips',
			});
			suggestionsDiv.createSpan({
				cls: 'betternotebook-suggestions-label',
				text: 'Vorhandene Gruppen: ',
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
			.setName('Papierformat')
			.setDesc('Wähle DIN A4, A3, A5 oder US-Letter.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('a4', 'DIN A4 (210 × 297 mm)')
					.addOption('a5', 'DIN A5 (148 × 210 mm)')
					.addOption('a3', 'DIN A3 (297 × 420 mm)')
					.addOption('letter', 'US Letter (8.5 × 11 in)')
					.setValue(this.page.format)
					.onChange((val) => {
						this.page.format = val as PageFormat;
					}),
			);

		new Setting(contentEl)
			.setName('Ausrichtung')
			.setDesc('Hochformat oder Querformat.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('portrait', 'Hochformat (Portrait)')
					.addOption('landscape', 'Querformat (Landscape)')
					.setValue(this.page.orientation)
					.onChange((val) => {
						this.page.orientation = val as PageOrientation;
					}),
			);

		new Setting(contentEl)
			.setName('Hintergrundmuster')
			.setDesc('Papierlinie, Gitter, Punkteraster oder Blanko.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('ruled', 'Liniert (Notizlinien)')
					.addOption('grid', 'Kariert (Rechenkästchen)')
					.addOption('dotted', 'Gepunktet (Bullet Journal)')
					.addOption('blank', 'Blanko (Weißes Blatt)')
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
