import { setIcon } from 'obsidian';
import {
	StrokeStyle,
	EraserMode,
	DashStyle,
} from '../types';
import { t } from '../i18n';

export class BaseToolPopover {
	protected popoverEl: HTMLElement | null = null;
	protected anchorEl: HTMLElement;
	protected onCloseCallback: () => void;

	constructor(anchorEl: HTMLElement, onClose: () => void) {
		this.anchorEl = anchorEl;
		this.onCloseCallback = onClose;
	}

	public isOpen(): boolean {
		return this.popoverEl !== null;
	}

	protected createContainer(extraClass?: string): HTMLElement {
		const body = activeDocument?.body ?? document.body;
		this.popoverEl = body.createDiv({
			cls: `betternotebook-tool-popover ${extraClass || ''}`,
		});

		window.addEventListener('pointerdown', this.onWindowPointerDown, true);
		window.addEventListener('keydown', this.onWindowKeyDown, true);
		window.addEventListener('resize', this.onWindowResize);

		this.updatePosition();
		return this.popoverEl;
	}

	public close(): void {
		if (!this.popoverEl) return;

		window.removeEventListener('pointerdown', this.onWindowPointerDown, true);
		window.removeEventListener('keydown', this.onWindowKeyDown, true);
		window.removeEventListener('resize', this.onWindowResize);

		this.popoverEl.remove();
		this.popoverEl = null;
		this.onCloseCallback();
	}

	private onWindowPointerDown = (e: PointerEvent): void => {
		if (!this.popoverEl) return;
		const target = e.target as Node;
		if (this.popoverEl.contains(target) || this.anchorEl.contains(target)) {
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

	protected updatePosition(): void {
		if (!this.popoverEl) return;

		const rect = this.anchorEl.getBoundingClientRect();
		const popWidth = this.popoverEl.offsetWidth || 280;
		let left = rect.left + rect.width / 2 - popWidth / 2;

		const maxLeft = window.innerWidth - popWidth - 12;
		left = Math.max(12, Math.min(maxLeft, left));
		const top = rect.bottom + 8;

		this.popoverEl.style.left = `${left}px`;
		this.popoverEl.style.top = `${top}px`;
	}

	protected renderHeader(title: string, iconName: string): HTMLElement {
		if (!this.popoverEl) return createDiv();

		const header = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-popover-header',
		});
		const titleRow = header.createDiv({
			cls: 'betternotebook-lasso-popover-title-row',
		});
		const headerIcon = titleRow.createSpan({
			cls: 'betternotebook-lasso-popover-header-icon',
		});
		try {
			setIcon(headerIcon, iconName);
		} catch {
			// ignore
		}
		titleRow.createSpan({
			cls: 'betternotebook-lasso-popover-title',
			text: title,
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

		return header;
	}

	protected renderLineStyleSection(
		currentDash: DashStyle,
		onDashChange: (dash: DashStyle) => void,
	): void {
		if (!this.popoverEl) return;

		const styleHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		styleHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: t('popover_line_style').toUpperCase(),
		});

		const styleSegmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const styles: { value: DashStyle; title: string; dashArray?: string }[] = [
			{ value: 'solid', title: 'Durchgezogen (Solid)' },
			{ value: 'dashed', title: 'Gestrichelt (Dashed)', dashArray: '6 4.5' },
			{ value: 'dotted', title: 'Gepunktet (Dotted)', dashArray: '0.01 5.5' },
		];

		styles.forEach((s) => {
			const isActive = currentDash === s.value;
			const btn = styleSegmented.createEl('button', {
				cls: `betternotebook-lasso-seg-btn betternotebook-line-style-btn ${isActive ? 'is-active' : ''}`,
				title: s.title,
			});
			const svg = btn.createSvg('svg', {
				cls: 'betternotebook-line-style-svg',
				attr: {
					width: '38',
					height: '12',
					viewBox: '0 0 38 12',
				},
			});
			const lineAttr: Record<string, string> = {
				x1: '3',
				y1: '6',
				x2: '35',
				y2: '6',
				stroke: 'currentColor',
				'stroke-width': '2.5',
				'stroke-linecap': 'round',
			};
			if (s.dashArray) {
				lineAttr['stroke-dasharray'] = s.dashArray;
			}
			svg.createSvg('line', { attr: lineAttr });

			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				onDashChange(s.value);
			});
		});
	}
}

// ----------------------------------------------------
// 1. Pen Popover
// ----------------------------------------------------
export interface PenPopoverOptions {
	anchorEl: HTMLElement;
	currentStyle: StrokeStyle;
	currentDashStyle: DashStyle;
	stylusOnlyMode: boolean;
	onToggleStylusOnly: () => void;
	onSmoothingChange: (smoothing: number) => void;
	onDashStyleChange: (dashStyle: DashStyle) => void;
	onClose: () => void;
}

export class PenPopover extends BaseToolPopover {
	private options: PenPopoverOptions;
	private currentSmoothing: number;
	private currentDash: DashStyle;
	private stylusOnlyMode: boolean;

	constructor(options: PenPopoverOptions) {
		super(options.anchorEl, options.onClose);
		this.options = options;
		this.currentSmoothing = options.currentStyle.smoothing ?? 0.35;
		this.currentDash = options.currentDashStyle || 'solid';
		this.stylusOnlyMode = options.stylusOnlyMode;
	}

	public open(): void {
		if (this.popoverEl) return;
		this.createContainer('is-pen-popover');
		this.render();
	}

	private render(): void {
		if (!this.popoverEl) return;
		this.popoverEl.empty();

		this.renderHeader(t('popover_pen_title'), 'pen-tool');

		// 1. Line Style (Solid, Dashed, Dotted)
		this.renderLineStyleSection(this.currentDash, (dash) => {
			this.currentDash = dash;
			this.options.onDashStyleChange(dash);
			this.render();
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 2. Smoothing Section
		const section = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		section.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: t('popover_pen_smoothing').toUpperCase(),
		});

		const segmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const modes = [
			{ label: '0', value: 0 },
			{ label: t('popover_size_medium'), value: 0.35 },
			{ label: t('popover_size_broad'), value: 0.65 },
		];

		modes.forEach((m) => {
			const isActive = Math.abs(this.currentSmoothing - m.value) < 0.05;
			const btn = segmented.createEl('button', {
				cls: `betternotebook-lasso-seg-btn ${isActive ? 'is-active' : ''}`,
				text: m.label,
			});
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.currentSmoothing = m.value;
				this.options.onSmoothingChange(m.value);
				this.render();
			});
		});

		// Description note
		const note = this.popoverEl.createDiv({
			cls: 'betternotebook-popover-hint',
		});
		note.createSpan({
			text: t('popover_pen_desc'),
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 3. Palm Rejection Switch Row
		const palmList = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-list',
		});

		const row = palmList.createDiv({
			cls: 'betternotebook-lasso-filter-row',
		});

		const left = row.createDiv({
			cls: 'betternotebook-lasso-filter-row-left',
		});
		const iconSpan = left.createSpan({
			cls: 'betternotebook-lasso-filter-icon',
		});
		setIcon(iconSpan, 'pencil');
		left.createSpan({
			cls: 'betternotebook-lasso-filter-label',
			text: t('popover_pen_stylus_only'),
		});

		const switchEl = row.createDiv({
			cls: `betternotebook-switch ${this.stylusOnlyMode ? 'is-checked' : ''}`,
		});
		switchEl.createDiv({ cls: 'betternotebook-switch-thumb' });

		row.addEventListener('click', (e) => {
			e.stopPropagation();
			this.stylusOnlyMode = !this.stylusOnlyMode;
			this.options.onToggleStylusOnly();
			this.render();
		});
	}
}

// ----------------------------------------------------
// 1b. Highlighter Popover
// ----------------------------------------------------
export interface HighlighterPopoverOptions {
	anchorEl: HTMLElement;
	currentStyle: StrokeStyle;
	currentDashStyle: DashStyle;
	onDashStyleChange: (dashStyle: DashStyle) => void;
	onOpacityChange?: (opacity: number) => void;
	onClose: () => void;
}

export class HighlighterPopover extends BaseToolPopover {
	private options: HighlighterPopoverOptions;
	private currentDash: DashStyle;
	private currentOpacity: number;

	constructor(options: HighlighterPopoverOptions) {
		super(options.anchorEl, options.onClose);
		this.options = options;
		this.currentDash = options.currentDashStyle || 'solid';
		this.currentOpacity = options.currentStyle.opacity ?? 1.0;
	}

	public open(): void {
		if (this.popoverEl) return;
		this.createContainer('is-highlighter-popover');
		this.render();
	}

	private render(): void {
		if (!this.popoverEl) return;
		this.popoverEl.empty();

		this.renderHeader(t('toolbar_highlighter') || 'Textmarker', 'highlighter');

		// 1. Line Style (Solid, Dashed, Dotted)
		this.renderLineStyleSection(this.currentDash, (dash) => {
			this.currentDash = dash;
			this.options.onDashStyleChange(dash);
			this.render();
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 2. Opacity
		const opHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		opHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: t('popover_line_opacity').toUpperCase(),
		});

		const opSegmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const opOptions = [
			{ label: '100%', value: 1.0 },
			{ label: '75%', value: 0.75 },
			{ label: '50%', value: 0.5 },
		];

		opOptions.forEach((o) => {
			const isActive = Math.abs(this.currentOpacity - o.value) < 0.1;
			const btn = opSegmented.createEl('button', {
				cls: `betternotebook-lasso-seg-btn ${isActive ? 'is-active' : ''}`,
				text: o.label,
			});
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.currentOpacity = o.value;
				this.options.onOpacityChange?.(o.value);
				this.render();
			});
		});

		// Description note
		const note = this.popoverEl.createDiv({
			cls: 'betternotebook-popover-hint',
		});
		note.createSpan({
			text: 'Textmarker legt sich automatisch harmonisch hinter Vektorformen und Handschrift.',
		});
	}
}

// ----------------------------------------------------
// 2. Eraser Popover
// ----------------------------------------------------
export interface EraserPopoverOptions {
	anchorEl: HTMLElement;
	currentStyle: StrokeStyle;
	onModeChange: (mode: EraserMode) => void;
	onRadiusChange: (radius: number) => void;
	onClearPage: () => void;
	onClose: () => void;
}

export class EraserPopover extends BaseToolPopover {
	private options: EraserPopoverOptions;
	private currentMode: EraserMode;
	private currentRadius: number;

	constructor(options: EraserPopoverOptions) {
		super(options.anchorEl, options.onClose);
		this.options = options;
		this.currentMode = options.currentStyle.eraserMode || 'precision';
		this.currentRadius = options.currentStyle.eraserRadius || 16;
	}

	public open(): void {
		if (this.popoverEl) return;
		this.createContainer('is-eraser-popover');
		this.render();
	}

	private render(): void {
		if (!this.popoverEl) return;
		this.popoverEl.empty();

		this.renderHeader(t('popover_eraser_title'), 'eraser');

		// 1. Eraser Mode
		const modeHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		modeHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: t('popover_eraser_mode').toUpperCase(),
		});

		const modeSegmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const precBtn = modeSegmented.createEl('button', {
			cls: `betternotebook-lasso-seg-btn ${this.currentMode === 'precision' ? 'is-active' : ''}`,
		});
		const precIcon = precBtn.createSpan({ cls: 'seg-icon' });
		setIcon(precIcon, 'scissors');
		precBtn.createSpan({ text: t('popover_eraser_precision') });
		precBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.currentMode = 'precision';
			this.options.onModeChange('precision');
			this.render();
		});

		const strokeBtn = modeSegmented.createEl('button', {
			cls: `betternotebook-lasso-seg-btn ${this.currentMode === 'stroke' ? 'is-active' : ''}`,
		});
		const strokeIcon = strokeBtn.createSpan({ cls: 'seg-icon' });
		setIcon(strokeIcon, 'trash-2');
		strokeBtn.createSpan({ text: t('popover_eraser_stroke') });
		strokeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.currentMode = 'stroke';
			this.options.onModeChange('stroke');
			this.render();
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 2. Eraser Size / Radius
		const sizeHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		sizeHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: t('popover_eraser_size').toUpperCase(),
		});

		const sizeSegmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const sizes = [
			{ label: `${t('popover_size_fine')} (8px)`, value: 8 },
			{ label: `${t('popover_size_medium')} (16px)`, value: 16 },
			{ label: `${t('popover_size_broad')} (28px)`, value: 28 },
		];

		sizes.forEach((s) => {
			const isActive = this.currentRadius === s.value;
			const btn = sizeSegmented.createEl('button', {
				cls: `betternotebook-lasso-seg-btn ${isActive ? 'is-active' : ''}`,
				text: s.label,
			});
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.currentRadius = s.value;
				this.options.onRadiusChange(s.value);
				this.render();
			});
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 3. Clear Page Action
		const footer = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-popover-footer',
		});

		const clearBtn = footer.createEl('button', {
			cls: 'betternotebook-tool-action-btn is-danger',
			title: t('popover_clear_page_desc'),
		});
		const cIcon = clearBtn.createSpan({ cls: 'btn-icon' });
		setIcon(cIcon, 'trash');
		clearBtn.createSpan({ text: t('popover_clear_page') });
		clearBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.options.onClearPage();
			this.close();
		});
	}
}

// ----------------------------------------------------
// 3. Shape Popover
// ----------------------------------------------------
export interface ShapePopoverOptions {
	anchorEl: HTMLElement;
	currentStyle: StrokeStyle;
	currentDashStyle?: DashStyle;
	onDashStyleChange: (dash: DashStyle) => void;
	onOpacityChange: (opacity: number) => void;
	onFillToggle: () => void;
	onClose: () => void;
}

export class ShapePopover extends BaseToolPopover {
	private options: ShapePopoverOptions;
	private currentDash: DashStyle;
	private currentOpacity: number;
	private currentHasFill: boolean;

	constructor(options: ShapePopoverOptions) {
		super(options.anchorEl, options.onClose);
		this.options = options;
		this.currentDash = options.currentDashStyle || options.currentStyle.dashStyle || 'solid';
		this.currentOpacity = options.currentStyle.opacity ?? 1.0;
		this.currentHasFill = !!options.currentStyle.hasFill;
	}

	public open(): void {
		if (this.popoverEl) return;
		this.createContainer('is-shape-popover');
		this.render();
	}

	private render(): void {
		if (!this.popoverEl) return;
		this.popoverEl.empty();

		this.renderHeader(t('popover_shapes_title'), 'shapes');

		// 1. Dash Style
		this.renderLineStyleSection(this.currentDash, (dash) => {
			this.currentDash = dash;
			this.options.onDashStyleChange(dash);
			this.render();
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 2. Opacity
		const opHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		opHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: t('popover_line_opacity').toUpperCase(),
		});

		const opSegmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const opacities = [
			{ label: '100%', value: 1.0 },
			{ label: '75%', value: 0.75 },
			{ label: '50%', value: 0.5 },
		];

		opacities.forEach((o) => {
			const isActive = Math.abs(this.currentOpacity - o.value) < 0.05;
			const btn = opSegmented.createEl('button', {
				cls: `betternotebook-lasso-seg-btn ${isActive ? 'is-active' : ''}`,
				text: o.label,
			});
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.currentOpacity = o.value;
				this.options.onOpacityChange(o.value);
				this.render();
			});
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 3. Fill toggle switch row
		const fillList = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-list',
		});

		const row = fillList.createDiv({
			cls: 'betternotebook-lasso-filter-row',
		});

		const left = row.createDiv({
			cls: 'betternotebook-lasso-filter-row-left',
		});
		const iconSpan = left.createSpan({
			cls: 'betternotebook-lasso-filter-icon',
		});
		setIcon(iconSpan, 'box');
		left.createSpan({
			cls: 'betternotebook-lasso-filter-label',
			text: t('popover_shape_fill'),
		});

		const switchEl = row.createDiv({
			cls: `betternotebook-switch ${this.currentHasFill ? 'is-checked' : ''}`,
		});
		switchEl.createDiv({ cls: 'betternotebook-switch-thumb' });

		row.addEventListener('click', (e) => {
			e.stopPropagation();
			this.currentHasFill = !this.currentHasFill;
			this.options.onFillToggle();
			this.render();
		});
	}
}

// ----------------------------------------------------
// 4. Quick Size Adjustment Popover (Stroke & Eraser)
// ----------------------------------------------------
export interface SizeAdjustmentPopoverOptions {
	anchorEl: HTMLElement;
	mode: 'stroke' | 'eraser';
	currentValue: number;
	color?: string;
	slotLabel: string;
	onChange: (newValue: number) => void;
	onClose: () => void;
}

export class SizeAdjustmentPopover extends BaseToolPopover {
	private options: SizeAdjustmentPopoverOptions;
	private value: number;

	constructor(options: SizeAdjustmentPopoverOptions) {
		super(options.anchorEl, options.onClose);
		this.options = options;
		this.value = options.currentValue;
	}

	public open(): void {
		if (this.popoverEl) return;
		this.createContainer('betternotebook-size-popover');
		this.render();
	}

	private render(): void {
		if (!this.popoverEl) return;
		this.popoverEl.empty();

		const isEraser = this.options.mode === 'eraser';
		const title = isEraser
			? `${this.options.slotLabel}: ${t('popover_eraser_size')}`
			: `${this.options.slotLabel}: ${t('toolbar_pen_slot')}`;
		const iconName = isEraser ? 'eraser' : 'pen-tool';

		this.renderHeader(title, iconName);

		// Preview row
		const previewRow = this.popoverEl.createDiv({
			cls: 'betternotebook-size-preview-row',
		});

		const circleWrap = previewRow.createDiv({
			cls: 'betternotebook-size-preview-circle-wrap',
		});

		const circle = circleWrap.createDiv({
			cls: `betternotebook-size-preview-circle ${isEraser ? 'is-eraser' : ''}`,
		});
		if (!isEraser && this.options.color) {
			circle.style.backgroundColor = this.options.color;
		}

		// Calculate preview diameter (clamped to fit in wrap)
		const previewDiameter = isEraser
			? Math.max(6, Math.min(34, Math.round(this.value * 0.7)))
			: Math.max(3, Math.min(34, Math.round(this.value * 2.4)));
		circle.style.width = `${previewDiameter}px`;
		circle.style.height = `${previewDiameter}px`;

		const valueBadge = previewRow.createDiv({
			cls: 'betternotebook-size-value-badge',
			text: isEraser ? `${Math.round(this.value)} px` : `${this.value.toFixed(1)} px`,
		});

		// Slider wrap
		const sliderWrap = this.popoverEl.createDiv({
			cls: 'betternotebook-size-slider-wrap',
		});

		const minVal = isEraser ? 4 : 0.5;
		const maxVal = isEraser ? 60 : 15.0;
		const stepVal = isEraser ? 1 : 0.2;

		const slider = sliderWrap.createEl('input', {
			type: 'range',
		});
		slider.min = String(minVal);
		slider.max = String(maxVal);
		slider.step = String(stepVal);
		slider.value = String(this.value);

		slider.addEventListener('input', () => {
			const num = parseFloat(slider.value);
			this.value = num;
			const newDiameter = isEraser
				? Math.max(6, Math.min(34, Math.round(this.value * 0.7)))
				: Math.max(3, Math.min(34, Math.round(this.value * 2.4)));
			circle.style.width = `${newDiameter}px`;
			circle.style.height = `${newDiameter}px`;
			valueBadge.textContent = isEraser ? `${Math.round(this.value)} px` : `${this.value.toFixed(1)} px`;
			this.options.onChange(this.value);
		});

		// Quick Presets
		const presetsWrap = this.popoverEl.createDiv({
			cls: 'betternotebook-size-presets',
		});

		const presets = isEraser
			? [8, 16, 26, 40]
			: [1.0, 2.0, 3.5, 6.0];

		presets.forEach((p) => {
			const isActive = Math.abs(this.value - p) < (isEraser ? 0.5 : 0.15);
			const pBtn = presetsWrap.createEl('button', {
				cls: `betternotebook-size-preset-btn ${isActive ? 'is-active' : ''}`,
				text: isEraser ? `${p}px` : `${p.toFixed(1)}`,
			});
			pBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.value = p;
				this.options.onChange(p);
				this.render();
			});
		});
	}
}

