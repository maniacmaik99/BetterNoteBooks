import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type BetterNotebookPlugin from '../main';
import { NotebookEngine } from '../engine/notebook-engine';
import { PageFormat, PageOrientation, PageBackground } from '../types';

export class NotebookStore {
	private app: App;
	private plugin?: BetterNotebookPlugin;
	private currentFilePath: string | null = null;

	constructor(app: App, plugin?: BetterNotebookPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	public getCurrentFilePath(): string | null {
		return this.currentFilePath;
	}

	public setCurrentFilePath(path: string | null): void {
		this.currentFilePath = path;
	}

	/**
	 * Resolves the target folder path in the vault.
	 * Checks existing 'Notebooks' or 'notebooks' folder to preserve vault organization.
	 */
	public getFolder(): string {
		const configured = this.plugin?.settings?.notebooksFolder?.trim();
		if (configured) {
			const folderAbstract = this.app.vault.getAbstractFileByPath(
				normalizePath(configured),
			);
			if (folderAbstract instanceof TFolder) return configured;
		}

		// Check if 'Notebooks' exists
		const upper = this.app.vault.getAbstractFileByPath('Notebooks');
		if (upper instanceof TFolder) return 'Notebooks';

		// Check if 'notebooks' exists
		const lower = this.app.vault.getAbstractFileByPath('notebooks');
		if (lower instanceof TFolder) return 'notebooks';

		return configured || 'Notebooks';
	}

	/**
	 * Ensures the notebooks directory exists in the vault without throwing on collision.
	 */
	public async ensureFolderExists(): Promise<string> {
		const folderName = this.getFolder();
		const folderPath = normalizePath(folderName);
		const existing = this.app.vault.getAbstractFileByPath(folderPath);
		if (!existing) {
			try {
				await this.app.vault.createFolder(folderPath);
			} catch {
				// Folder may already exist on physical disk adapter
			}
		}
		return folderPath;
	}

	/**
	 * Resolves or creates the active notebook file.
	 */
	public async resolveOrCreateActiveNotebook(): Promise<TFile> {
		await this.ensureFolderExists();

		// 1. Try last active notebook path from settings
		const lastPath = this.plugin?.settings?.lastActiveNotebookPath;
		if (lastPath) {
			const candidatePath = normalizePath(
				lastPath.endsWith('.bnp.json')
					? lastPath.replace(/\.bnp\.json$/, '.bnp')
					: lastPath,
			);
			const abstractFile = this.app.vault.getAbstractFileByPath(candidatePath);
			if (abstractFile instanceof TFile) {
				this.currentFilePath = abstractFile.path;
				return abstractFile;
			}
		}

		// 2. Try any existing notebook file in folder
		const files = await this.listNotebookFiles();
		if (files.length > 0 && files[0]) {
			this.currentFilePath = files[0].path;
			return files[0];
		}

		// 3. Fallback: create default notebook
		const newFile = await this.createNewNotebookFile('Mein Notizbuch');
		this.currentFilePath = newFile.path;
		return newFile;
	}

	/**
	 * Creates a new notebook file in the notebooks folder and returns the TFile.
	 */
	public async createNewNotebookFile(
		title?: string,
		format?: PageFormat,
		orientation?: PageOrientation,
		background?: PageBackground,
	): Promise<TFile> {
		const folder = await this.ensureFolderExists();
		const safeTitle = (title || 'Neues Notizbuch')
			.replace(/[\\/:*?"<>|]/g, '_')
			.trim();

		let finalTitle = safeTitle;
		let counter = 1;
		while (
			this.app.vault.getAbstractFileByPath(
				normalizePath(`${folder}/${finalTitle}.bnp`),
			)
		) {
			counter++;
			finalTitle = `${safeTitle} ${counter}`;
		}

		const engine = new NotebookEngine(
			undefined,
			format || this.plugin?.settings?.defaultPageFormat || 'a4',
			orientation || this.plugin?.settings?.defaultOrientation || 'portrait',
			background || this.plugin?.settings?.defaultBackground || 'ruled',
		);
		const doc = engine.getDocument();
		doc.title = finalTitle;

		const targetPath = normalizePath(`${folder}/${finalTitle}.bnp`);
		const file = await this.app.vault.create(targetPath, engine.serialize());
		this.currentFilePath = file.path;
		return file;
	}

	/**
	 * Renames a notebook file in the vault.
	 */
	public async renameNotebookFile(
		file: TFile,
		newTitle: string,
	): Promise<string> {
		const folder = await this.ensureFolderExists();
		const safeNewTitle = newTitle.replace(/[\\/:*?"<>|]/g, '_').trim();
		const newPath = normalizePath(`${folder}/${safeNewTitle}.bnp`);

		if (file.path !== newPath) {
			await this.app.fileManager.renameFile(file, newPath);
			this.currentFilePath = newPath;
		}
		return newPath;
	}

	/**
	 * Lists all existing notebook files in the vault.
	 * Automatically migrates legacy .bnp.json files to .bnp so they appear in Obsidian's file explorer.
	 */
	public async listNotebookFiles(): Promise<TFile[]> {
		await this.ensureFolderExists();
		const folderPath = normalizePath(this.getFolder());
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return [];

		// Seamlessly migrate legacy .bnp.json files to .bnp
		for (const child of folder.children) {
			if (child instanceof TFile && child.name.endsWith('.bnp.json')) {
				const migratedPath = normalizePath(
					`${folderPath}/${child.name.replace(/\.bnp\.json$/, '.bnp')}`,
				);
				if (!this.app.vault.getAbstractFileByPath(migratedPath)) {
					try {
						await this.app.fileManager.renameFile(child, migratedPath);
					} catch {
						// ignore
					}
				}
			}
		}

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.name.endsWith('.bnp'),
		);

		return files.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	/**
	 * Resolves an image file from the vault to a usable resource URL.
	 */
	public getResourceUrl(file: TFile): string {
		return this.app.vault.getResourcePath(file);
	}
}
