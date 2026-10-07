import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { VIEW_TYPE_DRAWING, DrawingView } from './ui/drawing-view';
import { BetterNotebookSettings, DEFAULT_SETTINGS } from './types';
import { BetterNotebookSettingTab } from './settings';
import { NotebookStore } from './storage/notebook-store';

export { VIEW_TYPE_DRAWING };

export default class BetterNotebookPlugin extends Plugin {
	settings!: BetterNotebookSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_DRAWING,
			(leaf) => new DrawingView(leaf, this),
		);

		this.registerExtensions(['bnp'], VIEW_TYPE_DRAWING);

		this.addRibbonIcon('pencil', 'BetterNoteBooks öffnen', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-drawing-view',
			name: 'BetterNoteBooks: Zeichenfläche öffnen',
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: 'create-new-notebook',
			name: 'BetterNoteBooks: Neues Notizbuch erstellen',
			callback: () => {
				void (async () => {
					const leaf = await this.activateView();
					if (leaf?.view instanceof DrawingView) {
						leaf.view.promptCreateNewNotebook();
					}
				})();
			},
		});

		this.addCommand({
			id: 'open-notebook-file',
			name: 'BetterNoteBooks: Notizbuch aus Vault öffnen',
			callback: () => {
				void (async () => {
					const store = new NotebookStore(this.app, this);
					const files = await store.listNotebookFiles();
					if (files.length === 0) {
						new Notice('Keine gespeicherten Notizbücher im Vault gefunden.');
						return;
					}

					const latest = files[0];
					if (latest instanceof TFile) {
						await this.activateView(latest);
					}
				})();
			},
		});

		// Automatically open notebook files in BetterNoteBooks view when opened in vault
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file && (file.name.endsWith('.bnp') || file.name.endsWith('.bnp.json'))) {
					void this.activateView(file);
				}
			}),
		);

		this.addCommand({
			id: 'add-new-page',
			name: 'BetterNoteBooks: Neue Seite hinzufügen',
			callback: () => {
				const activeLeaf = this.app.workspace.getActiveViewOfType(DrawingView);
				if (activeLeaf) {
					activeLeaf.addNewPage();
				} else {
					void (async () => {
						const leaf = await this.activateView();
						if (leaf?.view instanceof DrawingView) {
							leaf.view.addNewPage();
						}
					})();
				}
			},
		});

		this.addCommand({
			id: 'toggle-eraser-mode',
			name: 'BetterNoteBooks: Radiergummi-Modus umschalten (Strich / Präzision)',
			callback: () => {
				const activeLeaf = this.app.workspace.getActiveViewOfType(DrawingView);
				if (activeLeaf) {
					activeLeaf.toggleEraserMode();
				}
			},
		});

		this.addCommand({
			id: 'toggle-stylus-only-mode',
			name: 'BetterNoteBooks: Stift-Modus umschalten (Handflächenschutz)',
			callback: () => {
				const activeLeaf = this.app.workspace.getActiveViewOfType(DrawingView);
				if (activeLeaf) {
					activeLeaf.toggleStylusOnlyMode();
				}
			},
		});

		this.addCommand({
			id: 'clear-active-page',
			name: 'BetterNoteBooks: Aktuelle Seite leeren',
			callback: () => {
				const activeLeaf = this.app.workspace.getActiveViewOfType(DrawingView);
				if (activeLeaf) {
					activeLeaf.clearActivePageStrokes();
				}
			},
		});

		this.addSettingTab(new BetterNotebookSettingTab(this.app, this));
	}

	async activateView(file?: TFile): Promise<WorkspaceLeaf | null> {
		const { workspace } = this.app;

		if (file) {
			const leaves = workspace.getLeavesOfType(VIEW_TYPE_DRAWING);
			for (const l of leaves) {
				if (l.view instanceof DrawingView && l.view.file?.path === file.path) {
					await workspace.revealLeaf(l);
					return l;
				}
			}
			const leaf = workspace.getLeaf('tab');
			await leaf.openFile(file);
			return leaf;
		}

		// Find existing open leaf
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_DRAWING);
		if (leaves.length > 0 && leaves[0]) {
			await workspace.revealLeaf(leaves[0]);
			return leaves[0];
		}

		// Resolve or create default/active notebook file
		const store = new NotebookStore(this.app, this);
		const targetFile = await store.resolveOrCreateActiveNotebook();
		const leaf = workspace.getLeaf('tab');
		await leaf.openFile(targetFile);
		return leaf;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<BetterNotebookSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
