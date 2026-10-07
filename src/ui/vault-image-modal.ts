import { App, FuzzySuggestModal, TFile } from 'obsidian';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);

export class VaultImageModal extends FuzzySuggestModal<TFile> {
	private onSelectFile: (file: TFile) => void;

	constructor(app: App, onSelectFile: (file: TFile) => void) {
		super(app);
		this.onSelectFile = onSelectFile;
		this.setPlaceholder('Bild aus dem Vault suchen & auswählen...');
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((file) => {
			return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
		});
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.onSelectFile(item);
	}
}
