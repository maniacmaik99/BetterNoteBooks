import { TextFileView, WorkspaceLeaf, setIcon, Notice, TFile, Menu } from 'obsidian';
import type BetterNotebookPlugin from '../main';
import {
	StrokeStyle,
	DrawingTool,
	PageImage,
	NotebookPage,
	PageFormat,
	PageBackground,
	EraserMode,
	DashStyle,
} from '../types';
import { PageCanvas } from '../engine/page-canvas';
import { NotebookEngine } from '../engine/notebook-engine';
import { NotebookSidebar } from './notebook-sidebar';
import { NotebookStore } from '../storage/notebook-store';
import { PageSettingsModal } from './page-settings-modal';
import { DefaultPageSettingsModal } from './default-page-settings-modal';
import { ColorPickerModal } from './color-picker-modal';
import { VaultImageModal } from './vault-image-modal';
import { ZoomController } from './zoom-controller';
import { PromptModal } from './prompt-modal';

export const VIEW_TYPE_DRAWING = 'drawing-view';

export class DrawingView extends TextFileView {
	private plugin: BetterNotebookPlugin;
	private engine: NotebookEngine;
	private store: NotebookStore;

	// UI Elements
	private rootContainerEl!: HTMLElement;
	private toolbarEl!: HTMLElement;
	private mainContentEl!: HTMLElement;
	private scrollContainerEl!: HTMLElement;
	private zoomSizerEl!: HTMLElement;
	private zoomContentEl!: HTMLElement;
	private zoomController!: ZoomController;
	private zoomBadgeEl: HTMLElement | null = null;
	private sidebar!: NotebookSidebar;
	private sidebarVisible = true;
	private notebookTitleEl: HTMLElement | null = null;
	private saveStatusEl: HTMLElement | null = null;

	// Page navigation controls
	private pageIndicatorEl: HTMLElement | null = null;
	private prevPageBtn: HTMLButtonElement | null = null;
	private nextPageBtn: HTMLButtonElement | null = null;

	// Page instances & virtual scrolling for low-end hardware
	private pageCanvases: Map<string, PageCanvas> = new Map();
	private intersectionObserver: IntersectionObserver | null = null;
	private activePageId: string | null = null;
	private bottomAddButtonEl: HTMLElement | null = null;
	private stylusOnlyMode: boolean = false;

	// Dropdown menu toggle state (3-click cycle)
	private activeMenuToolId: string | null = null;
	private activeMenuClosedAt = 0;
	private currentOpenMenu: Menu | null = null;

	// Active tool style
	private currentStyle: StrokeStyle;
	private colorButtonsContainerEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: BetterNotebookPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.store = new NotebookStore(plugin.app, plugin);
		this.stylusOnlyMode = plugin.settings?.stylusOnlyMode ?? false;

		// Respect user's default settings when instantiating new notebook
		this.engine = new NotebookEngine(
			undefined,
			plugin.settings?.defaultPageFormat || 'a4',
			plugin.settings?.defaultOrientation || 'portrait',
			plugin.settings?.defaultBackground || 'ruled',
		);

		this.currentStyle = {
			color: plugin.settings?.defaultColor || '#242424',
			width: plugin.settings?.defaultWidth || 2.5,
			tool: 'pen',
			smoothing: plugin.settings?.smoothingFactor || 0.35,
			eraserMode: plugin.settings?.eraserMode || 'precision',
			eraserRadius: plugin.settings?.eraserRadius || 16,
			dashStyle: plugin.settings?.defaultDashStyle || 'solid',
			opacity: plugin.settings?.defaultOpacity ?? 1.0,
			hasFill: plugin.settings?.defaultShapeFill ?? false,
			fillOpacity: plugin.settings?.defaultShapeFillOpacity ?? 0.25,
		};
	}

	public getViewType(): string {
		return VIEW_TYPE_DRAWING;
	}

	public override getDisplayText(): string {
		return this.file ? this.file.basename : (this.engine?.getDocument().title || 'BetterNoteBooks');
	}

	public override getIcon(): string {
		return 'pencil';
	}

	public override canAcceptExtension(extension: string): boolean {
		return extension === 'bnp';
	}

	public getViewData(): string {
		return this.engine.serialize();
	}

	public setViewData(data: string, clear: boolean): void {
		if (data && data.trim()) {
			try {
				const doc = NotebookEngine.deserialize(data);
				this.engine = new NotebookEngine(doc);
			} catch (e) {
				console.error('Failed to parse notebook data:', e);
				if (clear) {
					this.engine = new NotebookEngine(
						undefined,
						this.plugin.settings?.defaultPageFormat || 'a4',
						this.plugin.settings?.defaultOrientation || 'portrait',
						this.plugin.settings?.defaultBackground || 'ruled',
					);
				}
			}
		} else if (clear) {
			this.engine = new NotebookEngine(
				undefined,
				this.plugin.settings?.defaultPageFormat || 'a4',
				this.plugin.settings?.defaultOrientation || 'portrait',
				this.plugin.settings?.defaultBackground || 'ruled',
			);
		}

		if (this.file) {
			this.plugin.settings.lastActiveNotebookPath = this.file.path;
			void this.plugin.saveSettings();
		}

		if (this.rootContainerEl) {
			this.sidebar?.setEngine(this.engine);
			this.updateNotebookTitleUI();
			this.renderAllPages();
			this.updateSaveStatus('saved');
		}
	}

	public clear(): void {
		this.engine = new NotebookEngine(
			undefined,
			this.plugin.settings?.defaultPageFormat || 'a4',
			this.plugin.settings?.defaultOrientation || 'portrait',
			this.plugin.settings?.defaultBackground || 'ruled',
		);
		this.pageCanvases.forEach((pc) => pc.destroy());
		this.pageCanvases.clear();
	}

	public async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.rootContainerEl = this.contentEl.createDiv({
			cls: 'betternotebook-view-root',
		});

		// 1. Render GoodNotes-style toolbar
		this.toolbarEl = this.rootContainerEl.createDiv({
			cls: 'betternotebook-toolbar',
		});
		this.renderToolbar();

		// 2. Render Main workspace (Sidebar + Vertical Scroll Area)
		this.mainContentEl = this.rootContainerEl.createDiv({
			cls: 'betternotebook-workspace',
		});

		// Sidebar
		this.sidebar = new NotebookSidebar(
			this.plugin.app,
			this.mainContentEl,
			this.engine,
			{
				onSelectPage: (pageId) => this.scrollToPage(pageId),
				onAddPage: () => this.addNewPage(),
				onDeletePage: (pageId) => this.deletePage(pageId),
				onDuplicatePage: (pageId) => this.duplicatePage(pageId),
				onGroupChanged: (pageId, group) => {
					this.engine.setPageGroup(pageId, group);
					this.scheduleSave();
				},
				onFormatChangeRequested: (pageId) => this.openPageSettings(pageId),
			},
		);

		// Vertical Multi-Page Scroll View
		this.scrollContainerEl = this.mainContentEl.createDiv({
			cls: 'betternotebook-scroll-container',
		});

		this.zoomSizerEl = this.scrollContainerEl.createDiv({
			cls: 'betternotebook-zoom-sizer',
		});

		this.zoomContentEl = this.zoomSizerEl.createDiv({
			cls: 'betternotebook-zoom-content',
		});

		this.zoomController = new ZoomController({
			scrollContainerEl: this.scrollContainerEl,
			zoomSizerEl: this.zoomSizerEl,
			zoomContentEl: this.zoomContentEl,
			minZoom: 0.25,
			maxZoom: 4.0,
			initialZoom: 1.0,
			stylusOnlyMode: this.stylusOnlyMode,
			onZoomChanged: (zoom) => {
				this.updateZoomBadge(zoom);
				this.pageCanvases.forEach((pc) => pc.setZoom(zoom));
			},
			onGestureEnd: () => {
				this.pageCanvases.forEach((pc) => pc.updateDprForZoom());
			},
			cancelActiveStrokes: () => {
				this.cancelActiveStrokes();
			},
		});

		this.scrollContainerEl.addEventListener(
			'scroll',
			() => {
				this.onContainerScroll();
			},
			{ passive: true },
		);

		// Setup IntersectionObserver for low-end hardware performance
		this.setupIntersectionObserver();

		// Clipboard paste (Ctrl+V / Cmd+V) for images
		this.registerDomEvent(this.containerEl, 'paste', (e: ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) return;
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item && item.type.startsWith('image/')) {
					const file = item.getAsFile();
					if (file) {
						e.preventDefault();
						const reader = new FileReader();
						reader.onload = () => {
							const dataUrl = reader.result as string;
							this.insertImageToActivePage(dataUrl);
						};
						reader.readAsDataURL(file);
						break;
					}
				}
			}
		});

		// Drag and drop images onto notebook
		this.registerDomEvent(this.scrollContainerEl, 'dragover', (e: DragEvent) => {
			if (e.dataTransfer?.types.includes('Files')) {
				e.preventDefault();
			}
		});
		this.registerDomEvent(this.scrollContainerEl, 'drop', (e: DragEvent) => {
			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					if (file && file.type.startsWith('image/')) {
						e.preventDefault();
						const reader = new FileReader();
						reader.onload = () => {
							const dataUrl = reader.result as string;
							this.insertImageToActivePage(dataUrl);
						};
						reader.readAsDataURL(file);
						break;
					}
				}
			}
		});

		// Render all pages
		this.renderAllPages();
	}

	private setupIntersectionObserver(): void {
		this.intersectionObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const pageId = entry.target.getAttribute('data-page-id');
					if (!pageId) continue;

					const pageCanvas = this.pageCanvases.get(pageId);
					if (pageCanvas) {
						pageCanvas.setVisibility(entry.isIntersecting);
						if (entry.isIntersecting) {
							this.activePageId = pageId;
							this.sidebar.setActivePageId(pageId);
							this.updatePageIndicator();
						}
					}
				}
			},
			{
				root: this.scrollContainerEl,
				rootMargin: '200px 0px 200px 0px',
				threshold: 0.05,
			},
		);
	}

	private renderToolbar(): void {
		this.toolbarEl.empty();

		// Sidebar Toggle
		const sidebarToggleBtn = this.toolbarEl.createEl('button', {
			cls: `betternotebook-tool-btn ${this.sidebarVisible ? 'is-active' : ''}`,
			title: 'Seitenübersicht ein-/ausblenden',
		});
		setIcon(sidebarToggleBtn, 'panel-left');
		sidebarToggleBtn.addEventListener('click', () => {
			this.sidebarVisible = !this.sidebarVisible;
			sidebarToggleBtn.toggleClass('is-active', this.sidebarVisible);
			this.mainContentEl.toggleClass(
				'sidebar-hidden',
				!this.sidebarVisible,
			);
		});

		// Notebook Selector Dropdown
		this.renderNotebookSelector();

		// Tools Group (Pen, Highlighter, Eraser, Shapes)
		const toolsGroup = this.toolbarEl.createDiv({
			cls: 'betternotebook-toolbar-group tools',
		});

		const penBtn = toolsGroup.createEl('button', {
			cls: `betternotebook-tool-btn ${this.currentStyle.tool === 'pen' ? 'is-active' : ''} ${this.stylusOnlyMode ? 'has-stylus-mode' : ''}`,
			title: `Stift (Freihand)${this.stylusOnlyMode ? ' • Stift-Modus (Handflächenschutz) AKTIV' : ''}`,
		});
		setIcon(penBtn, 'pen-tool');

		const populatePenMenu = (menu: Menu) => {
			menu.addItem((item) =>
				item
					.setTitle(`Stift-Modus (Handflächenschutz): ${this.stylusOnlyMode ? 'Aktiviert' : 'Deaktiviert'}`)
					.setIcon(this.stylusOnlyMode ? 'check' : 'pencil')
					.onClick(() => {
						this.toggleStylusOnlyMode();
					}),
			);

			menu.addSeparator();

			menu.addItem((item) =>
				item
					.setTitle('Glättung: Natürlich (Standard)')
					.setIcon(Math.abs((this.currentStyle.smoothing ?? 0.35) - 0.35) < 0.05 ? 'check' : 'circle')
					.onClick(() => {
						this.setSmoothingFactor(0.35);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Glättung: Hoch (Sehr weich)')
					.setIcon(Math.abs((this.currentStyle.smoothing ?? 0.35) - 0.65) < 0.05 ? 'check' : 'circle')
					.onClick(() => {
						this.setSmoothingFactor(0.65);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Glättung: Aus (Roh)')
					.setIcon((this.currentStyle.smoothing ?? 0.35) === 0 ? 'check' : 'circle')
					.onClick(() => {
						this.setSmoothingFactor(0);
					}),
			);
		};

		const highlighterBtn = toolsGroup.createEl('button', {
			cls: `betternotebook-tool-btn ${this.currentStyle.tool === 'highlighter' ? 'is-active' : ''}`,
			title: 'Textmarker (Highlighter)',
		});
		setIcon(highlighterBtn, 'highlighter');

		const eraserBtn = toolsGroup.createEl('button', {
			cls: `betternotebook-tool-btn ${this.currentStyle.tool === 'eraser' ? 'is-active' : ''}`,
			title: `Radiergummi (${this.currentStyle.eraserMode === 'stroke' ? 'Strichradierer' : 'Präzisionsradierer'})`,
		});
		setIcon(eraserBtn, 'eraser');

		const populateEraserMenu = (menu: Menu) => {
			menu.addItem((item) =>
				item
					.setTitle('Präzisionsradierer (Teile wegradieren)')
					.setIcon(this.currentStyle.eraserMode === 'precision' ? 'check' : 'scissors')
					.onClick(() => {
						this.setEraserMode('precision');
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Strichradierer (Ganzen Strich löschen)')
					.setIcon(this.currentStyle.eraserMode === 'stroke' ? 'check' : 'trash-2')
					.onClick(() => {
						this.setEraserMode('stroke');
					}),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('Größe: Fein (8 px)')
					.setIcon(this.currentStyle.eraserRadius === 8 ? 'check' : 'circle')
					.onClick(() => {
						this.setEraserRadius(8);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Größe: Mittel (16 px)')
					.setIcon(this.currentStyle.eraserRadius === 16 ? 'check' : 'circle')
					.onClick(() => {
						this.setEraserRadius(16);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Größe: Breit (28 px)')
					.setIcon(this.currentStyle.eraserRadius === 28 ? 'check' : 'circle')
					.onClick(() => {
						this.setEraserRadius(28);
					}),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('Aktuelle Seite leeren (Alle Striche löschen)')
					.setIcon('trash')
					.onClick(() => {
						this.clearActivePageStrokes();
					}),
			);
		};

		const shapeBtn = toolsGroup.createEl('button', {
			cls: `betternotebook-tool-btn ${this.currentStyle.tool === 'shape' ? 'is-active' : ''}`,
			title: 'Geometrische Formen (Shape Tool)',
		});
		setIcon(shapeBtn, 'shapes');

		const populateShapeMenu = (menu: Menu) => {
			menu.addItem((item) =>
				item
					.setTitle('Linienstil: Durchgezogen (──────)')
					.setIcon(
						this.currentStyle.dashStyle === 'solid' ||
							!this.currentStyle.dashStyle
							? 'check'
							: 'minus',
					)
					.onClick(() => {
						this.setShapeDashStyle('solid');
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Linienstil: Gestrichelt (- - - -)')
					.setIcon(
						this.currentStyle.dashStyle === 'dashed'
							? 'check'
							: 'more-horizontal',
					)
					.onClick(() => {
						this.setShapeDashStyle('dashed');
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Linienstil: Gepunktet (• • • •)')
					.setIcon(
						this.currentStyle.dashStyle === 'dotted'
							? 'check'
							: 'circle',
					)
					.onClick(() => {
						this.setShapeDashStyle('dotted');
					}),
			);

			menu.addSeparator();

			menu.addItem((item) =>
				item
					.setTitle('Linien-Deckkraft: 100% (Voll)')
					.setIcon(
						(this.currentStyle.opacity ?? 1.0) === 1.0
							? 'check'
							: 'circle',
					)
					.onClick(() => {
						this.setShapeOpacity(1.0);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Linien-Deckkraft: 75%')
					.setIcon(
						(this.currentStyle.opacity ?? 1.0) === 0.75
							? 'check'
							: 'circle',
					)
					.onClick(() => {
						this.setShapeOpacity(0.75);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Linien-Deckkraft: 50%')
					.setIcon(
						(this.currentStyle.opacity ?? 1.0) === 0.5
							? 'check'
							: 'circle',
					)
					.onClick(() => {
						this.setShapeOpacity(0.5);
					}),
			);

			menu.addSeparator();

			menu.addItem((item) =>
				item
					.setTitle(
						this.currentStyle.hasFill
							? 'Fläche füllen: Aktiviert'
							: 'Fläche füllen: Deaktiviert',
					)
					.setIcon(this.currentStyle.hasFill ? 'check' : 'square')
					.onClick(() => {
						this.toggleShapeFill();
					}),
			);
		};

		const updateToolState = (tool: DrawingTool) => {
			this.currentStyle.tool = tool;
			penBtn.toggleClass('is-active', tool === 'pen');
			highlighterBtn.toggleClass('is-active', tool === 'highlighter');
			eraserBtn.toggleClass('is-active', tool === 'eraser');
			shapeBtn.toggleClass('is-active', tool === 'shape');
			this.pageCanvases.forEach((pc) => pc.setStyle({ tool }));

			if (tool === 'shape') {
				new Notice(
					'Formen-Werkzeug aktiv: Zeichne eine grobe Form oder Linie – sie wird automatisch begradigt!',
					2500,
				);
			}
		};

		penBtn.addEventListener('click', () => {
			if (this.currentStyle.tool === 'pen') {
				this.toggleToolMenu('pen', penBtn, populatePenMenu);
			} else {
				updateToolState('pen');
			}
		});
		penBtn.addEventListener('contextmenu', (ev) => {
			ev.preventDefault();
			this.toggleToolMenu('pen', penBtn, populatePenMenu);
		});

		highlighterBtn.addEventListener('click', () => {
			updateToolState('highlighter');
		});

		eraserBtn.addEventListener('click', () => {
			if (this.currentStyle.tool === 'eraser') {
				this.toggleToolMenu('eraser', eraserBtn, populateEraserMenu);
			} else {
				updateToolState('eraser');
			}
		});
		eraserBtn.addEventListener('contextmenu', (ev) => {
			ev.preventDefault();
			this.toggleToolMenu('eraser', eraserBtn, populateEraserMenu);
		});

		shapeBtn.addEventListener('click', () => {
			if (this.currentStyle.tool === 'shape') {
				this.toggleToolMenu('shape', shapeBtn, populateShapeMenu);
			} else {
				updateToolState('shape');
			}
		});
		shapeBtn.addEventListener('contextmenu', (ev) => {
			ev.preventDefault();
			this.toggleToolMenu('shape', shapeBtn, populateShapeMenu);
		});

		// Colors Group (Expandable Color Palette)
		const colorsGroup = this.toolbarEl.createDiv({
			cls: 'betternotebook-toolbar-group colors',
		});
		this.colorButtonsContainerEl = colorsGroup.createDiv({
			cls: 'betternotebook-color-palette-inner',
		});
		this.renderColorPalette();

		// Widths Group
		const widthGroup = this.toolbarEl.createDiv({
			cls: 'betternotebook-toolbar-group stroke-widths',
		});
		const widths = [
			{ label: 'Fein', value: 1.5 },
			{ label: 'Mittel', value: 2.8 },
			{ label: 'Breit', value: 5.0 },
		];

		const widthButtons: HTMLButtonElement[] = [];
		widths.forEach((w, idx) => {
			const widthBtn = widthGroup.createEl('button', {
				cls: `betternotebook-width-btn ${idx === 1 ? 'is-active' : ''}`,
				title: `${w.label} (${w.value}px)`,
			});

			const dot = widthBtn.createDiv({ cls: 'betternotebook-width-dot' });
			dot.style.width = `${Math.max(3, w.value * 2)}px`;
			dot.style.height = `${Math.max(3, w.value * 2)}px`;

			widthBtn.addEventListener('click', () => {
				widthButtons.forEach((b) => b.removeClass('is-active'));
				widthBtn.addClass('is-active');
				this.currentStyle.width = w.value;
				this.pageCanvases.forEach((pc) =>
					pc.setStyle({ width: w.value }),
				);
			});
			widthButtons.push(widthBtn);
		});

		// Insert Image & Documents
		const insertGroup = this.toolbarEl.createDiv({
			cls: 'betternotebook-toolbar-group insert',
		});

		const insertImageBtn = insertGroup.createEl('button', {
			cls: 'betternotebook-action-btn',
			title: 'Foto / Dokument einfügen (vom Gerät)',
		});
		setIcon(insertImageBtn, 'image');
		insertImageBtn.addEventListener('click', () => {
			this.openImageFileDialog();
		});
		insertImageBtn.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			this.showImageSourceMenu(e);
		});

		const insertCaretBtn = insertGroup.createEl('button', {
			cls: 'betternotebook-action-btn small-caret',
			title: 'Bildquelle wählen (Vault, Zwischenablage, etc.)',
		});
		setIcon(insertCaretBtn, 'chevron-down');
		insertCaretBtn.addEventListener('click', (e) => {
			this.showImageSourceMenu(e);
		});

		// Page Management & Navigation Group
		const pageGroup = this.toolbarEl.createDiv({
			cls: 'betternotebook-toolbar-group page-controls',
		});

		this.prevPageBtn = pageGroup.createEl('button', {
			cls: 'betternotebook-action-btn',
			title: 'Vorherige Seite',
		});
		setIcon(this.prevPageBtn, 'chevron-left');
		this.prevPageBtn.addEventListener('click', () => {
			this.goToPreviousPage();
		});

		this.pageIndicatorEl = pageGroup.createSpan({
			cls: 'betternotebook-page-counter-badge',
			title: 'Klicken zum Springen auf eine bestimmte Seite',
		});
		this.pageIndicatorEl.addEventListener('click', (ev) => {
			this.openPageJumpMenu(ev);
		});

		this.nextPageBtn = pageGroup.createEl('button', {
			cls: 'betternotebook-action-btn',
			title: 'Nächste Seite',
		});
		setIcon(this.nextPageBtn, 'chevron-right');
		this.nextPageBtn.addEventListener('click', () => {
			this.goToNextPage();
		});

		const curFormat = (this.plugin.settings?.defaultPageFormat || 'a4').toUpperCase();
		const curBg = this.plugin.settings?.defaultBackground || 'ruled';
		const bgLabels: Record<string, string> = {
			ruled: 'Liniert',
			grid: 'Kariert',
			dotted: 'Gepunktet',
			blank: 'Blanko',
		};
		const curBgLabel = bgLabels[curBg] || curBg;

		const addPageBtn = pageGroup.createEl('button', {
			cls: 'betternotebook-action-btn with-text',
			title: `Neue Seite anlegen (Standard: ${curFormat} • ${curBgLabel})`,
		});
		setIcon(addPageBtn, 'file-plus');
		addPageBtn.createSpan({ text: '+ Seite' });
		addPageBtn.addEventListener('click', () => {
			this.addNewPage();
		});

		// Quick Template Menu & Default Page Layout Settings
		const pageMenuBtn = pageGroup.createEl('button', {
			cls: 'betternotebook-action-btn small-caret',
			title: 'Seiteneinstellungen & Standard-Layout wählen',
		});
		setIcon(pageMenuBtn, 'chevron-down');
		pageMenuBtn.addEventListener('click', (ev) => {
			const menu = new Menu();

			// 1. Quick insert using current standard
			menu.addItem((item) =>
				item
					.setTitle(`Neue Standard-Seite anlegen (${curFormat} • ${curBgLabel})`)
					.setIcon('file-plus')
					.onClick(() => this.addNewPage()),
			);

			menu.addSeparator();

			// 2. Insert one-off page with specific template
			menu.addItem((item) =>
				item
					.setTitle('Neue Seite (DIN A4 • Liniert)')
					.setIcon('file-text')
					.onClick(() => this.addNewPage('a4', 'ruled')),
			);
			menu.addItem((item) =>
				item
					.setTitle('Neue Seite (DIN A4 • Kariert)')
					.setIcon('file-text')
					.onClick(() => this.addNewPage('a4', 'grid')),
			);
			menu.addItem((item) =>
				item
					.setTitle('Neue Seite (DIN A4 • Gepunktet)')
					.setIcon('file-text')
					.onClick(() => this.addNewPage('a4', 'dotted')),
			);
			menu.addItem((item) =>
				item
					.setTitle('Neue Seite (DIN A4 • Blanko)')
					.setIcon('file-text')
					.onClick(() => this.addNewPage('a4', 'blank')),
			);
			menu.addItem((item) =>
				item
					.setTitle('Neue Seite (DIN A5 • Liniert)')
					.setIcon('file-text')
					.onClick(() => this.addNewPage('a5', 'ruled')),
			);
			menu.addItem((item) =>
				item
					.setTitle('Neue Seite (DIN A3 • Kariert)')
					.setIcon('file-text')
					.onClick(() => this.addNewPage('a3', 'grid')),
			);

			menu.addSeparator();

			// 3. Set standard layout for future '+ Seite' creations
			const setAsDefault = async (format: PageFormat, bg: PageBackground, label: string) => {
				this.plugin.settings.defaultPageFormat = format;
				this.plugin.settings.defaultBackground = bg;
				await this.plugin.saveSettings();
				this.renderToolbar();
				new Notice(`Standard-Layout für neue Seiten auf ${label} gesetzt`);
			};

			menu.addItem((item) =>
				item
					.setTitle(`Standard für '+ Seite': DIN A4 Liniert`)
					.setIcon(curFormat === 'A4' && curBg === 'ruled' ? 'check' : 'settings')
					.onClick(() => {
						void setAsDefault('a4', 'ruled', 'DIN A4 Liniert');
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle(`Standard für '+ Seite': DIN A4 Kariert`)
					.setIcon(curFormat === 'A4' && curBg === 'grid' ? 'check' : 'settings')
					.onClick(() => {
						void setAsDefault('a4', 'grid', 'DIN A4 Kariert');
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle(`Standard für '+ Seite': DIN A4 Gepunktet`)
					.setIcon(curFormat === 'A4' && curBg === 'dotted' ? 'check' : 'settings')
					.onClick(() => {
						void setAsDefault('a4', 'dotted', 'DIN A4 Gepunktet');
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle(`Standard für '+ Seite': DIN A4 Blanko`)
					.setIcon(curFormat === 'A4' && curBg === 'blank' ? 'check' : 'settings')
					.onClick(() => {
						void setAsDefault('a4', 'blank', 'DIN A4 Blanko');
					}),
			);

			menu.addSeparator();

			menu.addItem((item) =>
				item
					.setTitle('Standard-Layout anpassen...')
					.setIcon('sliders')
					.onClick(() => {
						new DefaultPageSettingsModal(this.plugin.app, this.plugin, () => {
							this.renderToolbar();
							new Notice('Standard-Seiteneinstellungen aktualisiert');
						}).open();
					}),
			);

			if (this.activePageId) {
				menu.addItem((item) =>
					item
						.setTitle('Aktuelle Seite anpassen...')
						.setIcon('file-edit')
						.onClick(() => {
							if (this.activePageId) {
								this.openPageSettings(this.activePageId);
							}
						}),
				);
			}

			menu.setUseNativeMenu(false);
			const rect = pageMenuBtn.getBoundingClientRect();
			menu.showAtPosition({ x: Math.max(8, rect.left), y: rect.bottom + 5 });
		});

		this.updatePageIndicator();

		// Undo & Redo Group
		const historyGroup = this.toolbarEl.createDiv({
			cls: 'betternotebook-toolbar-group history',
		});

		const undoBtn = historyGroup.createEl('button', {
			cls: 'betternotebook-action-btn',
			title: 'Rückgängig (Undo)',
		});
		setIcon(undoBtn, 'undo-2');
		undoBtn.addEventListener('click', () => {
			const undone = this.engine.undo();
			if (undone) {
				this.refreshAffectedPages();
				this.scheduleSave();
			}
		});

		const redoBtn = historyGroup.createEl('button', {
			cls: 'betternotebook-action-btn',
			title: 'Wiederholen (Redo)',
		});
		setIcon(redoBtn, 'redo-2');
		redoBtn.addEventListener('click', () => {
			const redone = this.engine.redo();
			if (redone) {
				this.refreshAffectedPages();
				this.scheduleSave();
			}
		});

		// Zoom Controls Group
		const zoomGroup = this.toolbarEl.createDiv({
			cls: 'betternotebook-toolbar-group zoom-controls',
		});

		const zoomOutBtn = zoomGroup.createEl('button', {
			cls: 'betternotebook-action-btn',
			title: 'Verkleinern (Zoom -)',
		});
		setIcon(zoomOutBtn, 'minus');
		zoomOutBtn.addEventListener('click', () => {
			this.zoomController?.zoomOut();
		});

		this.zoomBadgeEl = zoomGroup.createSpan({
			cls: 'betternotebook-zoom-badge',
			title: 'Zoom zurücksetzen (100%)',
		});
		this.zoomBadgeEl.setText(`${Math.round((this.zoomController?.zoom ?? 1.0) * 100)}%`);
		this.zoomBadgeEl.addEventListener('click', () => {
			this.zoomController?.resetZoom();
		});

		const zoomInBtn = zoomGroup.createEl('button', {
			cls: 'betternotebook-action-btn',
			title: 'Vergrößern (Zoom +)',
		});
		setIcon(zoomInBtn, 'plus');
		zoomInBtn.addEventListener('click', () => {
			this.zoomController?.zoomIn();
		});

		// Save / Storage Group
		const saveGroup = this.toolbarEl.createDiv({
			cls: 'betternotebook-toolbar-group save-controls',
		});

		this.saveStatusEl = saveGroup.createDiv({
			cls: 'betternotebook-save-status',
			title: 'Automatisches Speichern aktiv',
		});
		this.updateSaveStatus('saved');

		const saveBtn = saveGroup.createEl('button', {
			cls: 'betternotebook-action-btn',
			title: 'Jetzt sofort speichern (Autosave ist auch aktiv)',
		});
		setIcon(saveBtn, 'save');
		saveBtn.addEventListener('click', () => {
			void this.saveNotebookExplicit();
		});
	}

	// ----------------------------------------------------
	// Expandable Color Palette
	// ----------------------------------------------------

	private renderColorPalette(): void {
		if (!this.colorButtonsContainerEl) return;
		this.colorButtonsContainerEl.empty();

		const palette = this.plugin.settings.customColors || [];

		palette.forEach((hex) => {
			const isActive = this.currentStyle.color.toLowerCase() === hex.toLowerCase();
			const colorBtn = this.colorButtonsContainerEl!.createEl('button', {
				cls: `betternotebook-color-btn ${isActive ? 'is-active' : ''}`,
				title: `${hex} (Rechtsklick zum Entfernen)`,
			});
			colorBtn.type = 'button';
			colorBtn.style.backgroundColor = hex;

			colorBtn.addEventListener('click', () => {
				this.currentStyle.color = hex;
				this.pageCanvases.forEach((pc) => pc.setStyle({ color: hex }));
				this.renderColorPalette();
			});

			colorBtn.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const menu = new Menu();
				menu.setUseNativeMenu(false);
				menu.addItem((item) =>
					item
						.setTitle(`Farbe ${hex} entfernen`)
						.setIcon('trash')
						.onClick(async () => {
							this.plugin.settings.customColors = this.plugin.settings.customColors.filter(
								(c) => c.toLowerCase() !== hex.toLowerCase(),
							);
							await this.plugin.saveSettings();
							this.renderColorPalette();
						}),
				);
				const rect = colorBtn.getBoundingClientRect();
				menu.showAtPosition({ x: Math.max(8, rect.left), y: rect.bottom + 5 });
			});
		});

		// Add custom color button (+)
		const addColorBtn = this.colorButtonsContainerEl.createEl('button', {
			cls: 'betternotebook-add-color-btn',
			title: 'Farbe hinzufügen (Palette / Hex / Pipette)',
		});
		addColorBtn.type = 'button';
		setIcon(addColorBtn, 'plus');

		addColorBtn.addEventListener('click', () => {
			new ColorPickerModal(
				this.plugin.app,
				this.currentStyle.color,
				(selectedHex: string) => {
					void (async () => {
						this.currentStyle.color = selectedHex;
						this.pageCanvases.forEach((pc) => pc.setStyle({ color: selectedHex }));

						if (
							!this.plugin.settings.customColors.some(
								(c) => c.toLowerCase() === selectedHex.toLowerCase(),
							)
						) {
							this.plugin.settings.customColors.push(selectedHex);
							await this.plugin.saveSettings();
						}
						this.renderColorPalette();
						new Notice(`Farbe ${selectedHex} zur Palette hinzugefügt`);
					})();
				},
			).open();
		});
	}

	private renderAllPages(): void {
		this.pageCanvases.forEach((pc) => pc.destroy());
		this.pageCanvases.clear();
		this.zoomContentEl.empty();

		const pages = this.engine.getPages();
		for (const page of pages) {
			this.createPageCanvasInstance(page);
		}

		this.updateBottomAddButton();
		this.zoomController?.updateLayout();
	}

	private updateBottomAddButton(): void {
		if (this.bottomAddButtonEl) {
			this.bottomAddButtonEl.remove();
			this.bottomAddButtonEl = null;
		}

		this.bottomAddButtonEl = this.zoomContentEl.createDiv({
			cls: 'betternotebook-bottom-add-container',
		});

		const btn = this.bottomAddButtonEl.createEl('button', {
			cls: 'betternotebook-bottom-add-btn',
			title: 'Neue Seite anhängen',
		});
		setIcon(btn, 'plus');
		btn.createSpan({ text: 'Neue Seite hinzufügen' });
		btn.addEventListener('click', () => {
			this.addNewPage();
		});
	}

	private createPageCanvasInstance(page: NotebookPage): PageCanvas {
		const pc = new PageCanvas(
			this.zoomContentEl,
			page,
			this.currentStyle,
			this.plugin.settings?.pressureSensitivity ?? 2.0,
			{
				onStrokeAdded: (_pageId, stroke) => {
					this.engine.recordStrokeAdded(page.id, stroke);
					this.scheduleSave();
				},
				onStrokeErased: (_pageId, strokeId) => {
					const erased = page.strokes.find((s) => s.id === strokeId);
					if (erased) {
						this.engine.recordStrokeErased(page.id, erased);
					}
					this.scheduleSave();
				},
				onImageModified: () => {
					this.scheduleSave();
				},
				onImageDeleted: (_pageId, image) => {
					this.engine.recordImageDeleted(page.id, image);
					this.scheduleSave();
				},
				onPageChanged: () => {
					this.scheduleSave();
				},
				isGestureActive: () => {
					return this.zoomController?.isGestureActive() ?? false;
				},
			},
			this.app,
		);

		pc.setZoom(this.zoomController?.zoom ?? 1.0);
		pc.setZoomAdaptive(this.plugin.settings?.zoomAdaptiveStrokeWidth ?? true);
		pc.setStylusOnlyMode(this.stylusOnlyMode);

		this.pageCanvases.set(page.id, pc);
		if (this.intersectionObserver) {
			this.intersectionObserver.observe(pc.pageEl);
		}

		if (!this.activePageId) {
			this.activePageId = page.id;
		}

		return pc;
	}

	public addNewPage(formatOverride?: PageFormat, bgOverride?: PageBackground): NotebookPage {
		// Strict adherence to user's configured defaults in settings
		const format = formatOverride || this.plugin.settings?.defaultPageFormat || 'a4';
		const orientation = this.plugin.settings?.defaultOrientation || 'portrait';
		const background = bgOverride || this.plugin.settings?.defaultBackground || 'ruled';

		const newPage = this.engine.createPage(
			format,
			orientation,
			background,
		);

		if (this.bottomAddButtonEl) {
			this.bottomAddButtonEl.remove();
			this.bottomAddButtonEl = null;
		}

		this.createPageCanvasInstance(newPage);
		this.activePageId = newPage.id;

		this.updateBottomAddButton();
		this.sidebar.refresh();
		this.sidebar.setActivePageId(newPage.id);
		this.updatePageIndicator();
		this.zoomController?.updateLayout();
		this.scheduleSave();

		// Smooth scroll to the newly created page
		window.setTimeout(() => {
			this.scrollToPage(newPage.id);
		}, 30);

		new Notice(`Seite ${newPage.pageNumber} hinzugefügt`);
		return newPage;
	}

	public deletePage(pageId: string): void {
		const pc = this.pageCanvases.get(pageId);
		if (pc) {
			if (this.intersectionObserver) {
				this.intersectionObserver.unobserve(pc.pageEl);
			}
			pc.destroy();
			this.pageCanvases.delete(pageId);
		}

		const deleted = this.engine.deletePage(pageId);
		if (!deleted) {
			new Notice('Die letzte verbleibende Seite kann nicht gelöscht werden.');
			return;
		}

		// Reindex headers
		this.pageCanvases.forEach((c) => c.updateHeader());

		const pages = this.engine.getPages();
		if (this.activePageId === pageId || !this.pageCanvases.has(this.activePageId || '')) {
			this.activePageId = pages[0]?.id || null;
		}

		this.sidebar.refresh();
		this.updatePageIndicator();
		this.scheduleSave();
		this.updateBottomAddButton();
		this.zoomController?.updateLayout();
		new Notice('Seite gelöscht');
	}

	public duplicatePage(pageId: string): void {
		const duplicated = this.engine.duplicatePage(pageId);
		if (duplicated) {
			if (this.bottomAddButtonEl) {
				this.bottomAddButtonEl.remove();
				this.bottomAddButtonEl = null;
			}
			this.createPageCanvasInstance(duplicated);
			this.updateBottomAddButton();
			this.activePageId = duplicated.id;
			this.sidebar.refresh();
			this.sidebar.setActivePageId(duplicated.id);
			this.updatePageIndicator();
			this.zoomController?.updateLayout();
			this.scheduleSave();
			window.setTimeout(() => {
				this.scrollToPage(duplicated.id);
			}, 30);
			new Notice(`Seite ${duplicated.pageNumber} dupliziert`);
		}
	}

	private openPageSettings(pageId: string): void {
		const page = this.engine.getPage(pageId);
		if (!page) return;

		new PageSettingsModal(
			this.plugin.app,
			page,
			this.engine.getGroups(),
			(updatedPage) => {
				const pc = this.pageCanvases.get(updatedPage.id);
				if (pc) {
					pc.updateDimensions();
				}
				this.sidebar.refresh();
				this.zoomController?.updateLayout();
				this.scheduleSave();
			},
		).open();
	}

	public scrollToPage(pageId: string): void {
		const pc = this.pageCanvases.get(pageId);
		if (pc && this.scrollContainerEl) {
			this.activePageId = pageId;
			this.sidebar.setActivePageId(pageId);
			this.updatePageIndicator();

			const containerRect = this.scrollContainerEl.getBoundingClientRect();
			const pageRect = pc.pageEl.getBoundingClientRect();
			const offsetTop =
				pageRect.top - containerRect.top + this.scrollContainerEl.scrollTop - 20;

			this.scrollContainerEl.scrollTo({
				top: Math.max(0, offsetTop),
				behavior: 'smooth',
			});
		}
	}

	public updatePageIndicator(): void {
		const pages = this.engine.getPages();
		const total = Math.max(1, pages.length);
		let currentIdx = 0;
		if (this.activePageId) {
			const idx = pages.findIndex((p) => p.id === this.activePageId);
			if (idx >= 0) currentIdx = idx;
		}

		if (this.pageIndicatorEl) {
			this.pageIndicatorEl.setText(`Seite ${currentIdx + 1} / ${total}`);
		}
		if (this.prevPageBtn) {
			this.prevPageBtn.disabled = currentIdx <= 0;
			this.prevPageBtn.toggleClass('is-disabled', currentIdx <= 0);
		}
		if (this.nextPageBtn) {
			this.nextPageBtn.disabled = currentIdx >= total - 1;
			this.nextPageBtn.toggleClass('is-disabled', currentIdx >= total - 1);
		}
	}

	private openPageJumpMenu(ev: MouseEvent): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);
		const pages = this.engine.getPages();
		pages.forEach((p) => {
			menu.addItem((item) =>
				item
					.setTitle(`Seite ${p.pageNumber}${p.group ? ` • ${p.group}` : ''}`)
					.setIcon(p.id === this.activePageId ? 'check' : 'file')
					.onClick(() => {
						this.scrollToPage(p.id);
					}),
			);
		});

		const el = (ev.currentTarget as HTMLElement) || (ev.target as HTMLElement);
		if (el && typeof el.getBoundingClientRect === 'function') {
			const rect = el.getBoundingClientRect();
			menu.showAtPosition({ x: Math.max(8, rect.left), y: rect.bottom + 5 });
		} else {
			menu.showAtMouseEvent(ev);
		}
	}

	private goToPreviousPage(): void {
		const pages = this.engine.getPages();
		const idx = pages.findIndex((p) => p.id === this.activePageId);
		if (idx > 0) {
			const prev = pages[idx - 1];
			if (prev) this.scrollToPage(prev.id);
		}
	}

	private goToNextPage(): void {
		const pages = this.engine.getPages();
		const idx = pages.findIndex((p) => p.id === this.activePageId);
		if (idx >= 0 && idx < pages.length - 1) {
			const next = pages[idx + 1];
			if (next) this.scrollToPage(next.id);
		}
	}

	private onContainerScroll(): void {
		if (!this.scrollContainerEl) return;
		const containerRect = this.scrollContainerEl.getBoundingClientRect();
		const pages = this.engine.getPages();
		let closestPageId = this.activePageId;
		let minDiff = Infinity;

		for (const page of pages) {
			const pc = this.pageCanvases.get(page.id);
			if (!pc) continue;
			const r = pc.pageEl.getBoundingClientRect();
			const diff = Math.abs(r.top - containerRect.top);
			if (diff < minDiff) {
				minDiff = diff;
				closestPageId = page.id;
			}
		}

		if (closestPageId && closestPageId !== this.activePageId) {
			this.activePageId = closestPageId;
			this.sidebar.setActivePageId(closestPageId);
			this.updatePageIndicator();
		}
	}

	public setStylusOnlyMode(enabled: boolean): void {
		this.stylusOnlyMode = enabled;
		this.plugin.settings.stylusOnlyMode = enabled;
		void this.plugin.saveSettings();

		this.zoomController?.setStylusOnlyMode(enabled);
		this.pageCanvases.forEach((pc) => {
			pc.setStylusOnlyMode(enabled);
		});

		this.renderToolbar();

		if (enabled) {
			new Notice(
				'Stift-Modus (Handflächenschutz) aktiviert:\nNur der Stift zeichnet. Hand & Finger können scrollen und zoomen.',
				3000,
			);
		} else {
			new Notice('Stift-Modus deaktiviert:\nFreies Zeichnen mit Stift und Fingern.', 2500);
		}
	}

	public toggleStylusOnlyMode(): void {
		this.setStylusOnlyMode(!this.stylusOnlyMode);
	}

	public setSmoothingFactor(smoothing: number): void {
		this.currentStyle.smoothing = smoothing;
		this.plugin.settings.smoothingFactor = smoothing;
		void this.plugin.saveSettings();
		this.pageCanvases.forEach((pc) => pc.setStyle({ smoothing }));
		const label = smoothing === 0 ? 'Deaktiviert' : smoothing > 0.5 ? 'Hoch' : 'Natürlich';
		new Notice(`Stift-Glättung: ${label}`, 1500);
	}

	private toggleToolMenu(
		toolId: string,
		buttonEl: HTMLElement,
		populateMenu: (menu: Menu) => void,
	): void {
		// 3rd click: if this menu was closed in the last 300ms by clicking the button, do not reopen!
		if (this.activeMenuToolId === toolId && Date.now() - this.activeMenuClosedAt < 300) {
			this.activeMenuToolId = null;
			return;
		}

		if (this.currentOpenMenu) {
			this.currentOpenMenu.hide();
			this.currentOpenMenu = null;
			if (this.activeMenuToolId === toolId) {
				this.activeMenuToolId = null;
				return;
			}
		}

		const menu = new Menu();
		menu.setUseNativeMenu(false);
		populateMenu(menu);

		const rect = buttonEl.getBoundingClientRect();
		// Position directly underneath the button so the button stays fully visible!
		menu.showAtPosition({ x: Math.max(8, rect.left), y: rect.bottom + 5 });

		this.activeMenuToolId = toolId;
		this.currentOpenMenu = menu;
		menu.onHide(() => {
			this.activeMenuToolId = toolId;
			this.activeMenuClosedAt = Date.now();
			this.currentOpenMenu = null;
		});
	}

	public setEraserMode(mode: EraserMode): void {
		this.currentStyle.eraserMode = mode;
		this.pageCanvases.forEach((pc) => pc.setStyle({ eraserMode: mode }));
		this.plugin.settings.eraserMode = mode;
		void this.plugin.saveSettings();
		this.renderToolbar();
		const label =
			mode === 'stroke'
				? 'Strichradierer (Ganze Striche)'
				: 'Präzisionsradierer (Teile wegradieren)';
		new Notice(`Radierer-Modus: ${label}`);
	}

	public toggleEraserMode(): void {
		const nextMode: EraserMode =
			this.currentStyle.eraserMode === 'stroke' ? 'precision' : 'stroke';
		this.setEraserMode(nextMode);
	}

	public setEraserRadius(radius: number): void {
		this.currentStyle.eraserRadius = radius;
		this.pageCanvases.forEach((pc) => pc.setStyle({ eraserRadius: radius }));
		this.plugin.settings.eraserRadius = radius;
		void this.plugin.saveSettings();
		new Notice(`Radierer-Größe: ${radius} px`);
	}

	public setShapeDashStyle(dashStyle: DashStyle): void {
		this.currentStyle.dashStyle = dashStyle;
		this.plugin.settings.defaultDashStyle = dashStyle;
		void this.plugin.saveSettings();
		this.pageCanvases.forEach((pc) => pc.setStyle({ dashStyle }));
		new Notice(
			`Linienstil: ${dashStyle === 'dashed' ? 'Gestrichelt' : dashStyle === 'dotted' ? 'Gepunktet' : 'Durchgezogen'}`,
			1500,
		);
	}

	public setShapeOpacity(opacity: number): void {
		this.currentStyle.opacity = opacity;
		this.plugin.settings.defaultOpacity = opacity;
		void this.plugin.saveSettings();
		this.pageCanvases.forEach((pc) => pc.setStyle({ opacity }));
		new Notice(`Linien-Deckkraft: ${Math.round(opacity * 100)}%`, 1500);
	}

	public toggleShapeFill(): void {
		this.currentStyle.hasFill = !this.currentStyle.hasFill;
		this.currentStyle.fillOpacity = this.currentStyle.fillOpacity ?? 0.25;
		this.plugin.settings.defaultShapeFill = this.currentStyle.hasFill;
		void this.plugin.saveSettings();
		this.pageCanvases.forEach((pc) =>
			pc.setStyle({
				hasFill: this.currentStyle.hasFill,
				fillOpacity: this.currentStyle.fillOpacity,
			}),
		);
		new Notice(
			this.currentStyle.hasFill
				? 'Flächenfüllung: Aktiviert'
				: 'Flächenfüllung: Deaktiviert',
			1500,
		);
	}

	public clearActivePageStrokes(): void {
		const targetPageId = this.activePageId || this.engine.getPages()[0]?.id;
		if (!targetPageId) return;
		const pc = this.pageCanvases.get(targetPageId);
		if (pc) {
			pc.clearStrokes();
			this.scheduleSave();
			new Notice('Seite geleert');
		}
	}

	private refreshAffectedPages(): void {
		this.pageCanvases.forEach((pc) => {
			pc.redrawAll();
			pc.renderImages();
		});
	}

	// ----------------------------------------------------
	// Image & Document Insertion
	// ----------------------------------------------------

	private showImageSourceMenu(e: MouseEvent | HTMLElement): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);
		menu.addItem((item) =>
			item
				.setTitle('Datei vom Gerät / PC auswählen...')
				.setIcon('folder-open')
				.onClick(() => {
					this.openImageFileDialog();
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle('Bild aus Obsidian Vault auswählen...')
				.setIcon('vault')
				.onClick(() => {
					this.openVaultImageDialog();
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle('Aus Zwischenablage einfügen (Strg+V)')
				.setIcon('clipboard')
				.onClick(() => {
					void this.pasteImageFromClipboard();
				}),
		);

		const el =
			e instanceof HTMLElement
				? e
				: (e.currentTarget as HTMLElement) ||
				  (e.target as HTMLElement);
		if (el && typeof el.getBoundingClientRect === 'function') {
			const rect = el.getBoundingClientRect();
			menu.showAtPosition({ x: Math.max(8, rect.left), y: rect.bottom + 5 });
		} else if (e instanceof MouseEvent) {
			menu.showAtMouseEvent(e);
		}
	}

	private openImageFileDialog(): void {
		const doc = this.containerEl.ownerDocument || activeDocument || document;
		const fileInput = doc.body.createEl('input', {
			type: 'file',
			cls: 'betternotebook-hidden-input',
			attr: { accept: 'image/*' },
		});

		fileInput.addEventListener('change', () => {
			const file = fileInput.files?.[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = reader.result as string;
					this.insertImageToActivePage(dataUrl);
				};
				reader.readAsDataURL(file);
			}
			fileInput.remove();
		});

		fileInput.click();
	}

	private openVaultImageDialog(): void {
		new VaultImageModal(this.app, (file: TFile) => {
			void this.insertVaultImageToActivePage(file);
		}).open();
	}

	private async insertVaultImageToActivePage(file: TFile): Promise<void> {
		try {
			const buffer = await this.app.vault.readBinary(file);
			const ext = file.extension.toLowerCase();
			const mimeType =
				ext === 'svg'
					? 'image/svg+xml'
					: ext === 'jpg' || ext === 'jpeg'
						? 'image/jpeg'
						: ext === 'webp'
							? 'image/webp'
							: ext === 'gif'
								? 'image/gif'
								: 'image/png';
			const blob = new Blob([buffer], { type: mimeType });
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				this.insertImageToActivePage(dataUrl);
			};
			reader.readAsDataURL(blob);
		} catch (err) {
			new Notice(`Fehler beim Laden des Bildes: ${String(err)}`);
		}
	}

	private async pasteImageFromClipboard(): Promise<void> {
		try {
			if (navigator.clipboard?.read) {
				const items = await navigator.clipboard.read();
				for (const item of items) {
					const imageType = item.types.find((t) => t.startsWith('image/'));
					if (imageType) {
						const blob = await item.getType(imageType);
						const reader = new FileReader();
						reader.onload = () => {
							const dataUrl = reader.result as string;
							this.insertImageToActivePage(dataUrl);
						};
						reader.readAsDataURL(blob);
						return;
					}
				}
			}
			new Notice('Kein Bild in der Zwischenablage gefunden. Nutze Strg+V.');
		} catch {
			new Notice('Zugriff auf Zwischenablage nicht gestattet. Bitte Strg+V nutzen.');
		}
	}

	private insertImageToActivePage(dataUrl: string): void {
		const targetPageId =
			this.activePageId ?? this.engine.getPages()[0]?.id;
		if (!targetPageId) return;

		const pc = this.pageCanvases.get(targetPageId);
		if (!pc) return;

		const img = new Image();
		img.onload = () => {
			const maxDim = 340;
			let w = img.naturalWidth || maxDim;
			let h = img.naturalHeight || maxDim;

			if (w > maxDim || h > maxDim) {
				const ratio = Math.min(maxDim / w, maxDim / h);
				w = Math.round(w * ratio);
				h = Math.round(h * ratio);
			}

			const posX = Math.max(20, Math.round((pc.cssWidth - w) / 2));
			const posY = 100;

			const pageImg: PageImage = {
				id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
				src: dataUrl,
				x: posX,
				y: posY,
				width: w,
				height: h,
			};

			pc.addImage(pageImg);
			this.engine.recordImageAdded(targetPageId, pageImg);
			this.scheduleSave();
			new Notice('Bild eingefügt');
		};
		img.src = dataUrl;
	}

	// ----------------------------------------------------
	// Notebook Management & Persistence
	// ----------------------------------------------------

	private saveStatusDebounce: number | null = null;

	private renderNotebookSelector(): void {
		const notebookBtn = this.toolbarEl.createEl('button', {
			cls: 'betternotebook-notebook-selector-btn',
			title: 'Notizbuch wechseln oder neues Notizbuch erstellen',
		});
		const docTitle = this.file?.basename || this.engine.getDocument().title || 'Notizbuch';
		const bookIcon = notebookBtn.createSpan({ cls: 'betternotebook-notebook-icon' });
		setIcon(bookIcon, 'book-open');
		const titleSpan = notebookBtn.createSpan({
			cls: 'betternotebook-notebook-title',
			text: docTitle,
		});
		this.notebookTitleEl = titleSpan;
		const chevron = notebookBtn.createSpan({ cls: 'betternotebook-notebook-chevron' });
		setIcon(chevron, 'chevron-down');

		notebookBtn.addEventListener('click', (e) => {
			this.openNotebooksMenu(e);
		});
	}

	public updateNotebookTitleUI(): void {
		const title = this.file?.basename || this.engine.getDocument().title || 'Notizbuch';
		if (this.notebookTitleEl) {
			this.notebookTitleEl.setText(title);
		}
		this.sidebar?.refresh();
	}

	private openNotebooksMenu(e: MouseEvent): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);

		const currentTitle = this.file?.basename || this.engine.getDocument().title || 'Notizbuch';

		// Active notebook label
		menu.addItem((item) =>
			item
				.setTitle(`Aktuell: ${currentTitle}`)
				.setIcon('book-open')
				.setDisabled(true),
		);

		menu.addSeparator();

		void (async () => {
			const files = await this.store.listNotebookFiles();
			if (files.length > 0) {
				for (const file of files) {
					const isActive = this.file?.path === file.path;
					const displayName = file.basename;
					menu.addItem((item) => {
						item
							.setTitle(`${isActive ? '✓  ' : '    '}${displayName}`)
							.setIcon('book')
							.onClick(() => {
								if (!isActive) {
									void this.leaf.openFile(file);
								}
							});
					});
				}
				menu.addSeparator();
			}

			// New notebook
			menu.addItem((item) =>
				item
					.setTitle('Neues Notizbuch erstellen...')
					.setIcon('plus')
					.onClick(() => {
						this.promptCreateNewNotebook();
					}),
			);

			// Rename current notebook
			menu.addItem((item) =>
				item
					.setTitle('Notizbuch umbenennen...')
					.setIcon('edit')
					.onClick(() => {
						this.promptRenameNotebook();
					}),
			);

			menu.showAtMouseEvent(e);
		})();
	}

	public promptCreateNewNotebook(): void {
		const modal = new PromptModal(
			this.app,
			'Neues Notizbuch erstellen',
			'',
			'z. B. Mathe, Biologie, Notizen...',
			(name) => {
				void (async () => {
					const trimmed = name.trim();
					if (!trimmed) return;

					await this.save();

					const newFile = await this.store.createNewNotebookFile(trimmed);
					this.plugin.settings.lastActiveNotebookPath = newFile.path;
					await this.plugin.saveSettings();

					await this.leaf.openFile(newFile);
					new Notice(`Neues Notizbuch "${trimmed}" erstellt`);
				})();
			},
		);
		modal.open();
	}

	public promptRenameNotebook(): void {
		if (!this.file) return;
		const currentTitle = this.file.basename;
		const modal = new PromptModal(
			this.app,
			'Notizbuch umbenennen',
			currentTitle,
			'Neuer Name:',
			(newName) => {
				void (async () => {
					const trimmed = newName.trim();
					if (!trimmed || trimmed === currentTitle) return;

					await this.save();
					await this.store.renameNotebookFile(this.file!, trimmed);
					this.updateNotebookTitleUI();
					new Notice(`Notizbuch umbenannt in "${trimmed}"`);
				})();
			},
		);
		modal.open();
	}

	private updateSaveStatus(status: 'saved' | 'saving' | 'dirty'): void {
		if (!this.saveStatusEl) return;
		this.saveStatusEl.empty();
		if (status === 'saving') {
			this.saveStatusEl.addClass('is-saving');
			const icon = this.saveStatusEl.createSpan({ cls: 'betternotebook-save-icon' });
			setIcon(icon, 'loader');
			this.saveStatusEl.createSpan({ text: 'Speichern...' });
		} else if (status === 'dirty') {
			this.saveStatusEl.removeClass('is-saving');
			const icon = this.saveStatusEl.createSpan({ cls: 'betternotebook-save-icon' });
			setIcon(icon, 'alert-circle');
			this.saveStatusEl.createSpan({ text: 'Ungespeichert' });
		} else {
			this.saveStatusEl.removeClass('is-saving');
			const icon = this.saveStatusEl.createSpan({ cls: 'betternotebook-save-icon' });
			setIcon(icon, 'check');
			this.saveStatusEl.createSpan({ text: 'Gespeichert' });
		}
	}

	private scheduleSave(): void {
		this.updateSaveStatus('saving');
		this.requestSave();
		if (this.saveStatusDebounce !== null) {
			window.clearTimeout(this.saveStatusDebounce);
		}
		this.saveStatusDebounce = window.setTimeout(() => {
			this.updateSaveStatus('saved');
		}, 1000);
	}

	private async saveNotebookExplicit(): Promise<void> {
		try {
			this.updateSaveStatus('saving');
			await this.save();
			this.updateSaveStatus('saved');
			new Notice(`Notizbuch gespeichert: ${this.file?.basename || ''}`);
		} catch (err) {
			this.updateSaveStatus('dirty');
			new Notice(`Fehler beim Speichern: ${String(err)}`);
		}
	}

	public cancelActiveStrokes(): void {
		this.pageCanvases.forEach((pc) => pc.cancelCurrentStroke());
	}

	public updateZoomBadge(zoom: number): void {
		if (this.zoomBadgeEl) {
			this.zoomBadgeEl.setText(`${Math.round(zoom * 100)}%`);
		}
	}

	public override onResize(): void {
		super.onResize();
		this.zoomController?.updateLayout();
	}

	public override async onClose(): Promise<void> {
		this.zoomController?.destroy();

		if (this.intersectionObserver) {
			this.intersectionObserver.disconnect();
			this.intersectionObserver = null;
		}

		this.pageCanvases.forEach((pc) => pc.destroy());
		this.pageCanvases.clear();

		if (this.saveStatusDebounce !== null) {
			window.clearTimeout(this.saveStatusDebounce);
			this.saveStatusDebounce = null;
		}

		await super.onClose();
	}
}
