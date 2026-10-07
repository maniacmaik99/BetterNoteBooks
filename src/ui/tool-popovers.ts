import { setIcon } from 'obsidian';
import {
	StrokeStyle,
	EraserMode,
	DashStyle,
} from '../types';

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
}

// ----------------------------------------------------
// 1. Pen Popover
// ----------------------------------------------------
export interface PenPopoverOptions {
	anchorEl: HTMLElement;
	currentStyle: StrokeStyle;
	stylusOnlyMode: boolean;
	onToggleStylusOnly: () => void;
	onSmoothingChange: (smoothing: number) => void;
	onClose: () => void;
}

export class PenPopover extends BaseToolPopover {
	private options: PenPopoverOptions;
	private currentSmoothing: number;
	private stylusOnlyMode: boolean;

	constructor(options: PenPopoverOptions) {
		super(options.anchorEl, options.onClose);
		this.options = options;
		this.currentSmoothing = options.currentStyle.smoothing ?? 0.35;
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

		this.renderHeader('Stift-Einstellungen', 'pen-tool');

		// Smoothing Section
		const section = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		section.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: 'GLÄTTUNG (SMOOTHING)',
		});

		const segmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const modes = [
			{ label: 'Aus', value: 0 },
			{ label: 'Normal', value: 0.35 },
			{ label: 'Weich', value: 0.65 },
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
			text: 'Glättet Striche in Echtzeit für ein sauberes Schriftbild.',
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// Palm Rejection Switch Row
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
			text: 'Handflächenschutz (Nur Stift)',
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

		this.renderHeader('Radiergummi', 'eraser');

		// 1. Eraser Mode
		const modeHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		modeHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: 'RADIERER-MODUS',
		});

		const modeSegmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const precBtn = modeSegmented.createEl('button', {
			cls: `betternotebook-lasso-seg-btn ${this.currentMode === 'precision' ? 'is-active' : ''}`,
		});
		const precIcon = precBtn.createSpan({ cls: 'seg-icon' });
		setIcon(precIcon, 'scissors');
		precBtn.createSpan({ text: 'Präzision' });
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
		strokeBtn.createSpan({ text: 'Ganzer Strich' });
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
			text: 'RADIERER-GRÖSSE',
		});

		const sizeSegmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const sizes = [
			{ label: 'Fein (8px)', value: 8 },
			{ label: 'Mittel (16px)', value: 16 },
			{ label: 'Breit (28px)', value: 28 },
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
			title: 'Alle Striche auf dieser Seite entfernen',
		});
		const cIcon = clearBtn.createSpan({ cls: 'btn-icon' });
		setIcon(cIcon, 'trash');
		clearBtn.createSpan({ text: 'Seite leeren (Alle Striche löschen)' });
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
		this.currentDash = options.currentStyle.dashStyle || 'solid';
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

		this.renderHeader('Formen & Linien', 'shapes');

		// 1. Dash Style
		const styleHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		styleHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: 'LINIENSTIL',
		});

		const styleSegmented = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-segmented',
		});

		const styles: { label: string; value: DashStyle; icon: string }[] = [
			{ label: 'Voll', value: 'solid', icon: 'minus' },
			{ label: 'Gestrichelt', value: 'dashed', icon: 'more-horizontal' },
			{ label: 'Gepunktet', value: 'dotted', icon: 'circle' },
		];

		styles.forEach((s) => {
			const isActive = this.currentDash === s.value;
			const btn = styleSegmented.createEl('button', {
				cls: `betternotebook-lasso-seg-btn ${isActive ? 'is-active' : ''}`,
			});
			const icon = btn.createSpan({ cls: 'seg-icon' });
			setIcon(icon, s.icon);
			btn.createSpan({ text: s.label });
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.currentDash = s.value;
				this.options.onDashStyleChange(s.value);
				this.render();
			});
		});

		// Divider
		this.popoverEl.createDiv({ cls: 'betternotebook-lasso-popover-divider' });

		// 2. Opacity
		const opHeader = this.popoverEl.createDiv({
			cls: 'betternotebook-lasso-filter-header',
		});
		opHeader.createSpan({
			cls: 'betternotebook-lasso-section-label',
			text: 'LINIEN-DECKKRAFT',
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
			text: 'Form-Fläche füllen',
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
			? `${this.options.slotLabel}: Radierer-Größe`
			: `${this.options.slotLabel}: Stärke`;
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

