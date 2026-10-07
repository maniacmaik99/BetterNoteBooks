import { App, Modal, Setting } from 'obsidian';
import type BetterNotebookPlugin from '../main';
import { PageFormat, PageOrientation, PageBackground } from '../types';

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
			text: 'Standard-Layout für neue Seiten anpassen',
		});
		contentEl.createEl('p', {
			cls: 'betternotebook-modal-desc',
			text: 'Dieses Basislayout wird automatisch angewendet, wenn du in der Toolbar auf "+ Seite" klickst.',
		});

		new Setting(contentEl)
			.setName('Standard-Papierformat')
			.setDesc('Papierformat für neue Seiten.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('a4', 'DIN A4 (210 × 297 mm)')
					.addOption('a5', 'DIN A5 (148 × 210 mm)')
					.addOption('a3', 'DIN A3 (297 × 420 mm)')
					.addOption('letter', 'US Letter (8.5 × 11 in)')
					.setValue(this.plugin.settings.defaultPageFormat)
					.onChange(async (val) => {
						this.plugin.settings.defaultPageFormat = val as PageFormat;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(contentEl)
			.setName('Standard-Seitenausrichtung')
			.setDesc('Hochformat oder Querformat.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('portrait', 'Hochformat (Portrait)')
					.addOption('landscape', 'Querformat (Landscape)')
					.setValue(this.plugin.settings.defaultOrientation)
					.onChange(async (val) => {
						this.plugin.settings.defaultOrientation =
							val as PageOrientation;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(contentEl)
			.setName('Standard-Hintergrundmuster')
			.setDesc('Liniert, Kariert, Gepunktet oder Blanko.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('ruled', 'Liniert (Notizlinien)')
					.addOption('grid', 'Kariert (Rechenkästchen)')
					.addOption('dotted', 'Gepunktet (Bullet Journal)')
					.addOption('blank', 'Blanko (Weißes Blatt)')
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
