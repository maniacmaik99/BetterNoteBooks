import {
	NotebookDocument,
	NotebookPage,
	Stroke,
	PageImage,
	PageFormat,
	PageOrientation,
	PageBackground,
} from '../types';

export type NotebookAction =
	| { type: 'add_stroke'; pageId: string; stroke: Stroke }
	| { type: 'erase_stroke'; pageId: string; stroke: Stroke }
	| { type: 'add_page'; page: NotebookPage; index: number }
	| { type: 'delete_page'; page: NotebookPage; index: number }
	| { type: 'add_image'; pageId: string; image: PageImage }
	| { type: 'delete_image'; pageId: string; image: PageImage };

export class NotebookEngine {
	private document: NotebookDocument;
	private undoStack: NotebookAction[] = [];
	private redoStack: NotebookAction[] = [];
	private maxHistorySteps = 35;

	constructor(
		initialDoc?: NotebookDocument,
		defaultFormat: PageFormat = 'a4',
		defaultOrientation: PageOrientation = 'portrait',
		defaultBackground: PageBackground = 'ruled',
	) {
		if (initialDoc) {
			if (!initialDoc.groups || !Array.isArray(initialDoc.groups) || initialDoc.groups.length === 0) {
				initialDoc.groups = ['Standard'];
			}
			if (!initialDoc.pages || !Array.isArray(initialDoc.pages)) {
				initialDoc.pages = [];
			}
			for (let i = 0; i < initialDoc.pages.length; i++) {
				const p = initialDoc.pages[i];
				if (!p) continue;
				if (!p.id) p.id = `page_${Date.now()}_${i}`;
				if (!p.format) p.format = defaultFormat;
				if (!p.orientation) p.orientation = defaultOrientation;
				if (!p.background) p.background = defaultBackground;
				if (!p.strokes) p.strokes = [];
				if (!p.images) p.images = [];
				if (!p.pageNumber) p.pageNumber = i + 1;
			}
			this.document = initialDoc;
		} else {
			this.document = this.createEmptyDocument(
				'Mein Notizbuch',
				defaultFormat,
				defaultOrientation,
				defaultBackground,
			);
		}
	}

	public getDocument(): NotebookDocument {
		return this.document;
	}

	public getPages(): NotebookPage[] {
		return this.document.pages;
	}

	public getPage(pageId: string): NotebookPage | undefined {
		return this.document.pages.find((p) => p.id === pageId);
	}

	public getGroups(): string[] {
		const groups = new Set<string>(this.document.groups || ['Standard']);
		for (const p of this.document.pages) {
			if (p.group) groups.add(p.group);
		}
		return Array.from(groups).sort();
	}

	public addGroup(name: string): void {
		const trimmed = name.trim();
		if (!this.document.groups) {
			this.document.groups = ['Standard'];
		}
		if (trimmed && !this.document.groups.includes(trimmed)) {
			this.document.groups.push(trimmed);
			this.touch();
		}
	}

	public createPage(
		format: PageFormat = 'a4',
		orientation: PageOrientation = 'portrait',
		background: PageBackground = 'ruled',
		group?: string,
	): NotebookPage {
		const pageNumber = this.document.pages.length + 1;
		if (!this.document.groups || !Array.isArray(this.document.groups) || this.document.groups.length === 0) {
			this.document.groups = ['Standard'];
		}
		const newPage: NotebookPage = {
			id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
			pageNumber,
			title: `Seite ${pageNumber}`,
			group: group || (this.document.groups[0] ?? 'Standard'),
			format: format || 'a4',
			orientation: orientation || 'portrait',
			background: background || 'ruled',
			strokes: [],
			images: [],
		};

		this.document.pages.push(newPage);
		this.pushAction({
			type: 'add_page',
			page: newPage,
			index: this.document.pages.length - 1,
		});

		this.touch();
		return newPage;
	}

	public deletePage(pageId: string): boolean {
		if (this.document.pages.length <= 1) {
			return false; // Keep at least one page
		}

		const index = this.document.pages.findIndex((p) => p.id === pageId);
		if (index === -1) return false;

		const deletedPage = this.document.pages.splice(index, 1)[0];
		if (!deletedPage) return false;

		this.reindexPages();
		this.pushAction({
			type: 'delete_page',
			page: deletedPage,
			index,
		});

		this.touch();
		return true;
	}

	public duplicatePage(pageId: string): NotebookPage | null {
		const page = this.getPage(pageId);
		if (!page) return null;

		const pageNumber = this.document.pages.length + 1;
		const duplicated: NotebookPage = {
			...page,
			strokes: page.strokes.map((s) => ({
				...s,
				points: [...s.points],
				style: { ...s.style },
				bbox: s.bbox ? { ...s.bbox } : undefined,
			})),
			images: page.images.map((img) => ({ ...img })),
			id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
			pageNumber,
			title: `${page.title} (Kopie)`,
		};

		this.document.pages.push(duplicated);
		this.pushAction({
			type: 'add_page',
			page: duplicated,
			index: this.document.pages.length - 1,
		});

		this.touch();
		return duplicated;
	}

	public setPageGroup(pageId: string, group: string): void {
		const page = this.getPage(pageId);
		if (page) {
			page.group = group.trim();
			this.addGroup(group);
			this.touch();
		}
	}

	public recordStrokeAdded(pageId: string, stroke: Stroke): void {
		this.pushAction({
			type: 'add_stroke',
			pageId,
			stroke,
		});
		this.touch();
	}

	public recordStrokeErased(pageId: string, stroke: Stroke): void {
		this.pushAction({
			type: 'erase_stroke',
			pageId,
			stroke,
		});
		this.touch();
	}

	public recordImageAdded(pageId: string, image: PageImage): void {
		this.pushAction({
			type: 'add_image',
			pageId,
			image,
		});
		this.touch();
	}

	public recordImageDeleted(pageId: string, image: PageImage): void {
		this.pushAction({
			type: 'delete_image',
			pageId,
			image,
		});
		this.touch();
	}

	// ----------------------------------------------------
	// Lightweight Undo / Redo for Low-End Systems
	// ----------------------------------------------------

	private pushAction(action: NotebookAction): void {
		this.undoStack.push(action);
		if (this.undoStack.length > this.maxHistorySteps) {
			this.undoStack.shift();
		}
		this.redoStack = [];
	}

	public canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	public canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	public undo(): NotebookAction | null {
		const action = this.undoStack.pop();
		if (!action) return null;

		switch (action.type) {
			case 'add_stroke': {
				const page = this.getPage(action.pageId);
				if (page) {
					page.strokes = page.strokes.filter((s) => s.id !== action.stroke.id);
				}
				break;
			}
			case 'erase_stroke': {
				const page = this.getPage(action.pageId);
				if (page) {
					page.strokes.push(action.stroke);
				}
				break;
			}
			case 'add_page': {
				this.document.pages = this.document.pages.filter(
					(p) => p.id !== action.page.id,
				);
				this.reindexPages();
				break;
			}
			case 'delete_page': {
				this.document.pages.splice(action.index, 0, action.page);
				this.reindexPages();
				break;
			}
			case 'add_image': {
				const page = this.getPage(action.pageId);
				if (page) {
					page.images = page.images.filter((i) => i.id !== action.image.id);
				}
				break;
			}
			case 'delete_image': {
				const page = this.getPage(action.pageId);
				if (page) {
					page.images.push(action.image);
				}
				break;
			}
		}

		this.redoStack.push(action);
		this.touch();
		return action;
	}

	public redo(): NotebookAction | null {
		const action = this.redoStack.pop();
		if (!action) return null;

		switch (action.type) {
			case 'add_stroke': {
				const page = this.getPage(action.pageId);
				if (page) {
					page.strokes.push(action.stroke);
				}
				break;
			}
			case 'erase_stroke': {
				const page = this.getPage(action.pageId);
				if (page) {
					page.strokes = page.strokes.filter((s) => s.id !== action.stroke.id);
				}
				break;
			}
			case 'add_page': {
				this.document.pages.splice(action.index, 0, action.page);
				this.reindexPages();
				break;
			}
			case 'delete_page': {
				this.document.pages = this.document.pages.filter(
					(p) => p.id !== action.page.id,
				);
				this.reindexPages();
				break;
			}
			case 'add_image': {
				const page = this.getPage(action.pageId);
				if (page) {
					page.images.push(action.image);
				}
				break;
			}
			case 'delete_image': {
				const page = this.getPage(action.pageId);
				if (page) {
					page.images = page.images.filter((i) => i.id !== action.image.id);
				}
				break;
			}
		}

		this.undoStack.push(action);
		this.touch();
		return action;
	}

	private reindexPages(): void {
		this.document.pages.forEach((p, idx) => {
			p.pageNumber = idx + 1;
		});
	}

	private touch(): void {
		this.document.updatedAt = Date.now();
	}

	public createEmptyDocument(
		title: string,
		defaultFormat: PageFormat = 'a4',
		defaultOrientation: PageOrientation = 'portrait',
		defaultBackground: PageBackground = 'ruled',
	): NotebookDocument {
		const now = Date.now();
		const firstPage: NotebookPage = {
			id: `page_${now}_init`,
			pageNumber: 1,
			title: 'Seite 1',
			group: 'Standard',
			format: defaultFormat,
			orientation: defaultOrientation,
			background: defaultBackground,
			strokes: [],
			images: [],
		};

		return {
			id: `notebook_${now}`,
			title,
			createdAt: now,
			updatedAt: now,
			version: 1,
			pages: [firstPage],
			groups: ['Standard'],
		};
	}

	public serialize(): string {
		return JSON.stringify(this.document, null, 2);
	}

	public static deserialize(rawJson: string): NotebookDocument {
		const parsed = JSON.parse(rawJson) as NotebookDocument;
		if (!parsed.pages || !Array.isArray(parsed.pages)) {
			throw new Error('Ungültiges Notizbuch-Format');
		}
		if (!parsed.groups || !Array.isArray(parsed.groups) || parsed.groups.length === 0) {
			parsed.groups = ['Standard'];
		}
		for (let i = 0; i < parsed.pages.length; i++) {
			const p = parsed.pages[i];
			if (!p) continue;
			if (!p.id) p.id = `page_${Date.now()}_${i}`;
			if (!p.format) p.format = 'a4';
			if (!p.orientation) p.orientation = 'portrait';
			if (!p.background) p.background = 'ruled';
			if (!p.strokes) p.strokes = [];
			if (!p.images) p.images = [];
			if (!p.pageNumber) p.pageNumber = i + 1;
		}
		return parsed;
	}
}
