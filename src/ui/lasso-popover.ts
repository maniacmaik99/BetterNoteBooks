import { setIcon } from 'obsidian';
import {
	StrokeStyle,
	LassoSelectionMode,
	LassoFilterSettings,
	DEFAULT_LASSO_FILTER,
} from '../types';
import { LassoManager } from '../engine/lasso-manager';

export interface LassoPopoverOptions {
	anchorEl: HTMLElement;
	currentStyle: StrokeStyle;
	onModeChange: (mode: LassoSelectionMode) => void;
	onFilterChange: (filter: LassoFilterSettings) => void;
	onPaste: () => void;
	onClose: () => void;
}

export class LassoPopover {
	private popoverEl: HTMLElement | null = null;
	private options: LassoPopoverOptions;
	private currentMode: LassoSelectionMode;
	private currentFilter: LassoFilterSettings;

	constructor(options: LassoPopoverOptions) {
		this.options = options;
		this.currentMode = options.currentStyle.lassoMode ?? 'freehand';
		this.currentFilter = options.currentStyle.lassoFilter
			? { ...options.currentStyle.lassoFilter }
			: { ...DEFAULT_LASSO_FILTER };
	}

	public isOpen(): boolean {
		return this.popoverEl !== null;
	}

	public open(): void {
		if (this.popoverEl) return;

		// Attach to activeDocument.body or document.body
		const body = activeDocument?.body ?? document.body;
		this.popoverEl = body.createDiv({
			cls: 'betternotebook-lasso-popover',
		});

		this.render();
		this.updatePosition();

		// Event listeners for closing
		window.addEventListener('pointerdown', this.onWindowPointerDown, true);
		window.addEventListener('keydown', this.onWindowKeyDown, true);
		window.addEventListener('resize', this.onWindowResize);
	}

	public close(): void {
		if (!this.popoverEl) return;

		window.removeEventListener('pointerdown', this.onWindowPointerDown, true);
		window.removeEventListener('keydown', this.onWindowKeyDown, true);
		window.removeEventListener('resize', this.onWindowResize);

		this.popoverEl.remove();
		this.popoverEl = null;
		this.options.onClose();
	}

	private onWindowPointerDown = (e: PointerEvent): void => {
		if (!this.popoverEl) return;
		const target = e.target as Node;
		if (this.popoverEl.contains(target) || this.options.anchorEl.contains(target)) {
			return;
		}
		this.close();
	};

	private onWindowKeyDown = (e: KeyboardEvent): void => {
		if (e.key === 'Escape') {
			e.stopPropagation();
			this.close();
		}
	};

	private onWindowResize = (): void => {
		if (this.popoverEl) {
			this.updatePosition();
		}
	};

	private updatePosition(): void {
		if (!this.popoverEl) return;

		const rect = this.options.anchorEl.getBoundingClientRect();
		const popWidth = 270;
		let left = rect.left + rect.width / 2 - popWidth / 2;

		const maxLeft = window.innerWidth - popWidth - 12;
		left = Math.max(12, Math.min(maxLeft, left));
		const top = rect.bottom + 8;

		this.popoverEl.style.left = `${left}px`;
		this.popoverEl.style.top = `${top}px`;
	}

	private render(): void {
		if (!this.popoverEl) return;
		this.popoverEl.empty();

		// Header
		const header = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-popover-header',
		});
		const titleRow = header.createDiv({
			cls: 'betternotebook-lasso-popover-title-row',
		});
		const headerIcon = titleRow.createSpan({
			cls: 'betternotebook-lasso-popover-header-icon',
		});
		setIcon(headerIcon, 'lasso');
		titleRow.createSpan({
			cls: 'betternotebook-lasso-popover-title',
			text: 'Lasso-Werkzeug',
		});

		const closeBtn = header.createEl('button', {
			cls: 'betternotebook-lasso-popover-close',
			title: 'Schließen',
		});
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.close();
		});

		// 1. Mode Switcher (Segmented Control)
		const segmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const freehandBtn = segmented.createEl('button', {
			cls: `betternotebook-lasso-seg-btn ${this.currentMode === 'freehand' ? 'is-active' : ''}`,
		});
		const freeIcon = freehandBtn.createSpan({ cls: 'seg-icon' });
		setIcon(freeIcon, 'lasso');
		freehandBtn.createSpan({ text: 'Freihand' });
		freehandBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.currentMode = 'freehand';
			this.options.onModeChange('freehand');
			this.render();
		});

		const rectBtn = segmented.createEl('button', {
			cls: `betternotebook-lasso-seg-btn ${this.currentMode === 'rectangle' ? 'is-active' : ''}`,
		});
		const rectIcon = rectBtn.createSpan({ cls: 'seg-icon' });
		setIcon(rectIcon, 'square');
		rectBtn.createSpan({ text: 'Rechteck' });
		rectBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.currentMode = 'rectangle';
			this.options.onModeChange('rectangle');
			this.render();
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 2. Filter Section Header
		const filterHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		filterHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: 'ELEMENTE AUSWÄHLEN',
		});

		const allBtn = filterHeader.createEl('button', {
			cls: `betternotebook-lasso-all-btn ${this.currentFilter.all ? 'is-active' : ''}`,
			title: 'Alles markieren (Stumpfer Modus)',
		});
		allBtn.createSpan({ text: this.currentFilter.all ? 'Alle an' : 'Filter aktiv' });
		allBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const nextAll = !this.currentFilter.all;
			this.currentFilter.all = nextAll;
			if (nextAll) {
				this.currentFilter.handwriting = true;
				this.currentFilter.highlighter = true;
				this.currentFilter.shapes = true;
				this.currentFilter.images = true;
			}
			this.options.onFilterChange({ ...this.currentFilter });
			this.render();
		});

		// Filter Rows List
		const filterList = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-list',
		});

		const filters: {
			key: 'handwriting' | 'highlighter' | 'shapes' | 'images';
			label: string;
			icon: string;
		}[] = [
			{ key: 'handwriting', label: 'Handschrift (Stift)', icon: 'pen-tool' },
			{ key: 'highlighter', label: 'Textmarker', icon: 'highlighter' },
			{ key: 'shapes', label: 'Formen & Linien', icon: 'shapes' },
			{ key: 'images', label: 'Bilder & Grafiken', icon: 'image' },
		];

		for (const item of filters) {
			const isChecked = !!this.currentFilter[item.key];
			const row = filterList.createDiv({
				cls: 'betternotebook-lasso-filter-row',
			});

			const left = row.createDiv({
				cls: 'betternotebook-lasso-filter-row-left',
			});
			const iconSpan = left.createSpan({
				cls: 'betternotebook-lasso-filter-icon',
			});
			try {
				setIcon(iconSpan, item.icon);
			} catch {
				setIcon(iconSpan, 'square');
			}
			left.createSpan({
				cls: 'betternotebook-lasso-filter-label',
				text: item.label,
			});

			const switchEl = row.createDiv({
				cls: `betternotebook-switch ${isChecked ? 'is-checked' : ''}`,
			});
			switchEl.createDiv({ cls: 'betternotebook-switch-thumb' });

			row.addEventListener('click', (e) => {
				e.stopPropagation();
				this.currentFilter[item.key] = !this.currentFilter[item.key];
				this.currentFilter.all = false;
				this.options.onFilterChange({ ...this.currentFilter });
				this.render();
			});
		}

		// 3. Clipboard Paste Action (if clipboard has items)
		if (
			LassoManager.clipboard &&
			(LassoManager.clipboard.strokes.length > 0 ||
				LassoManager.clipboard.images.length > 0)
		) {
			this.popoverEl.createDiv({
				cls: 'betternotebook-lasso-popover-divider',
			});

			const footer = this.popoverEl.createDiv({
				cls: 'betternotebook-lasso-popover-footer',
			});

			const count =
				LassoManager.clipboard.strokes.length +
				LassoManager.clipboard.images.length;
			const pasteBtn = footer.createEl('button', {
				cls: 'betternotebook-lasso-paste-pop-btn',
			});
			const pIcon = pasteBtn.createSpan({ cls: 'paste-icon' });
			setIcon(pIcon, 'clipboard-paste');
			pasteBtn.createSpan({
				text: `Einfügen (${count} ${count === 1 ? 'Element' : 'Elemente'})`,
			});

			pasteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.options.onPaste();
				this.close();
			});
		}
	}
}
