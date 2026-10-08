import { Notice, setIcon } from 'obsidian';
import {
	NotebookPage,
	Stroke,
	PageImage,
	BoundingBox,
	GeometricShape,
	ShapeHandle,
	LassoSelectionMode,
	LassoFilterSettings,
	DEFAULT_LASSO_FILTER,
	DEFAULT_PALETTE_COLORS,
} from '../types';
import { t } from '../i18n';
import {
	isStrokeSelectedByLasso,
	isImageSelectedByLasso,
	doesStrokeMatchFilter,
	doesImageMatchFilter,
	computeCombinedBoundingBox,
	translateSelectedItems,
	scaleSelectedItems,
	duplicateSelectedItems,
} from '../utils/lasso-geometry';

export interface LassoManagerCallbacks {
	redrawAll: () => void;
	renderImages: () => void;
	onPageChanged: () => void;
	getColors: () => string[];
	getCanvasPoint: (e: PointerEvent) => { x: number; y: number };
}

export interface ActiveLassoSelection {
	strokes: Stroke[];
	images: PageImage[];
	bbox: BoundingBox;
}

export class LassoManager {
	// Global clipboard shared across all pages and views
	public static clipboard: { strokes: Stroke[]; images: PageImage[] } | null = null;

	private pageEl: HTMLElement;
	private page: NotebookPage;
	private callbacks: LassoManagerCallbacks;

	// UI Overlays
	private overlayEl: HTMLElement;
	private svgEl: SVGSVGElement;
	private svgPathEl: SVGPathElement;
	private svgRectEl: SVGRectElement;
	private selectionBoxEl: HTMLElement | null = null;
	private floatingBarEl: HTMLElement | null = null;
	private handlesElMap: Map<string, HTMLElement> = new Map();

	// State
	public isLassoDrawing = false;
	public isDraggingSelection = false;
	public isScalingSelection = false;
	private lassoPoints: { x: number; y: number }[] = [];
	private activeSelection: ActiveLassoSelection | null = null;

	// Drag & Scale temp state
	private dragLastPt: { x: number; y: number } | null = null;
	private scaleState: {
		handleRole: 'tl' | 'tr' | 'br' | 'bl';
		anchor: { x: number; y: number };
		initialBbox: BoundingBox;
		initialWidth: number;
		initialHeight: number;
	} | null = null;
	private scaleSnapshot: {
		strokes: {
			points: { x: number; y: number; pressure?: number; time?: number }[];
			shape?: GeometricShape;
		}[];
		images: { x: number; y: number; width: number; height: number }[];
	} | null = null;

	constructor(
		pageEl: HTMLElement,
		page: NotebookPage,
		callbacks: LassoManagerCallbacks,
	) {
		this.pageEl = pageEl;
		this.page = page;
		this.callbacks = callbacks;

		// Main overlay container
		this.overlayEl = this.pageEl.createDiv({
			cls: 'betternotebook-lasso-overlay',
		});

		// SVG layer for drawing loop or rectangle preview
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'betternotebook-lasso-svg');
		this.overlayEl.appendChild(svg);
		this.svgEl = svg;

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('class', 'betternotebook-lasso-path');
		this.svgEl.appendChild(path);
		this.svgPathEl = path;

		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('class', 'betternotebook-lasso-rect');
		this.svgEl.appendChild(rect);
		this.svgRectEl = rect;
	}

	public destroy(): void {
		this.clearSelection();
		this.overlayEl.remove();
	}

	public hasActiveSelection(): boolean {
		return this.activeSelection !== null;
	}

	public getActiveSelection(): ActiveLassoSelection | null {
		return this.activeSelection;
	}

	/**
	 * Checks if canvas coordinate (x, y) is inside the active selection box.
	 */
	public isPointInsideSelection(x: number, y: number, padding = 4): boolean {
		if (!this.activeSelection) return false;
		const b = this.activeSelection.bbox;
		return (
			x >= b.minX - padding &&
			x <= b.maxX + padding &&
			y >= b.minY - padding &&
			y <= b.maxY + padding
		);
	}

	/**
	 * Checks if coordinate (x, y) hits one of the 4 corner scaling handles.
	 */
	public hitTestCornerHandle(
		x: number,
		y: number,
		hitRadius = 14,
	): 'tl' | 'tr' | 'br' | 'bl' | null {
		if (!this.activeSelection) return null;
		const b = this.activeSelection.bbox;

		const corners: { role: 'tl' | 'tr' | 'br' | 'bl'; x: number; y: number }[] = [
			{ role: 'tl', x: b.minX, y: b.minY },
			{ role: 'tr', x: b.maxX, y: b.minY },
			{ role: 'br', x: b.maxX, y: b.maxY },
			{ role: 'bl', x: b.minX, y: b.maxY },
		];

		for (const c of corners) {
			if (Math.hypot(x - c.x, y - c.y) <= hitRadius) {
				return c.role;
			}
		}
		return null;
	}

	// ----------------------------------------------------
	// Lasso Drawing Phase
	// ----------------------------------------------------

	public startDrawing(x: number, y: number): void {
		this.clearSelection();
		this.isLassoDrawing = true;
		this.lassoPoints = [{ x, y }];
		this.svgPathEl.classList.remove('is-visible');
		this.svgRectEl.classList.remove('is-visible');
	}

	public cancelDrawing(): void {
		this.svgPathEl.classList.remove('is-visible');
		this.svgRectEl.classList.remove('is-visible');
		this.isLassoDrawing = false;
		this.lassoPoints = [];
	}

	public updateDrawing(x: number, y: number, mode: LassoSelectionMode): void {
		if (!this.isLassoDrawing) return;
		this.lassoPoints.push({ x, y });

		if (mode === 'rectangle') {
			if (this.lassoPoints.length >= 2) {
				const start = this.lassoPoints[0]!;
				const minX = Math.min(start.x, x);
				const minY = Math.min(start.y, y);
				const width = Math.abs(x - start.x);
				const height = Math.abs(y - start.y);

				this.svgRectEl.setAttribute('x', `${minX}`);
				this.svgRectEl.setAttribute('y', `${minY}`);
				this.svgRectEl.setAttribute('width', `${width}`);
				this.svgRectEl.setAttribute('height', `${height}`);
				this.svgRectEl.classList.add('is-visible');
				this.svgPathEl.classList.remove('is-visible');
			}
		} else {
			// Freehand
			if (this.lassoPoints.length >= 2) {
				let d = `M ${this.lassoPoints[0]!.x} ${this.lassoPoints[0]!.y}`;
				for (let i = 1; i < this.lassoPoints.length; i++) {
					const pt = this.lassoPoints[i]!;
					d += ` L ${pt.x} ${pt.y}`;
				}
				this.svgPathEl.setAttribute('d', d);
				this.svgPathEl.classList.add('is-visible');
				this.svgRectEl.classList.remove('is-visible');
			}
		}
	}

	public finishDrawing(
		mode: LassoSelectionMode,
		filter: LassoFilterSettings = DEFAULT_LASSO_FILTER,
	): boolean {
		this.svgPathEl.classList.remove('is-visible');
		this.svgRectEl.classList.remove('is-visible');
		this.isLassoDrawing = false;

		if (this.lassoPoints.length < 2) {
			this.lassoPoints = [];
			return false;
		}

		let rectBounds: BoundingBox | undefined;
		if (mode === 'rectangle') {
			const start = this.lassoPoints[0]!;
			const end = this.lassoPoints[this.lassoPoints.length - 1]!;
			const minX = Math.min(start.x, end.x);
			const maxX = Math.max(start.x, end.x);
			const minY = Math.min(start.y, end.y);
			const maxY = Math.max(start.y, end.y);

			if (maxX - minX < 8 && maxY - minY < 8) {
				this.lassoPoints = [];
				return false;
			}
			rectBounds = { minX, minY, maxX, maxY };
		} else {
			// Freehand: close loop
			if (this.lassoPoints.length < 3) {
				this.lassoPoints = [];
				return false;
			}
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const p of this.lassoPoints) {
				if (p.x < minX) minX = p.x;
				if (p.y < minY) minY = p.y;
				if (p.x > maxX) maxX = p.x;
				if (p.y > maxY) maxY = p.y;
			}
			rectBounds = { minX, minY, maxX, maxY };
		}

		// Filter matching strokes
		const candidateStrokes = this.page.strokes.filter((s) =>
			doesStrokeMatchFilter(s, filter),
		);
		const selectedStrokes = candidateStrokes.filter((s) =>
			isStrokeSelectedByLasso(s, this.lassoPoints, mode, rectBounds),
		);

		// Filter matching images
		const candidateImages = this.page.images.filter((img) =>
			doesImageMatchFilter(img, filter),
		);
		const selectedImages = candidateImages.filter((img) =>
			isImageSelectedByLasso(img, this.lassoPoints, mode, rectBounds),
		);

		this.lassoPoints = [];

		if (selectedStrokes.length === 0 && selectedImages.length === 0) {
			this.clearSelection();
			return false;
		}

		const bbox = computeCombinedBoundingBox(selectedStrokes, selectedImages, 8);
		if (!bbox) {
			this.clearSelection();
			return false;
		}

		this.activeSelection = {
			strokes: selectedStrokes,
			images: selectedImages,
			bbox,
		};

		this.renderSelectionUI();
		return true;
	}

	// ----------------------------------------------------
	// Drag & Scale Interaction Phase
	// ----------------------------------------------------

	public startDragging(x: number, y: number): void {
		if (!this.activeSelection) return;
		this.isDraggingSelection = true;
		this.dragLastPt = { x, y };
		if (this.selectionBoxEl) {
			this.selectionBoxEl.addClass('is-dragging');
		}
	}

	public updateDragging(x: number, y: number): void {
		if (!this.isDraggingSelection || !this.dragLastPt || !this.activeSelection) return;
		const dx = x - this.dragLastPt.x;
		const dy = y - this.dragLastPt.y;
		this.dragLastPt = { x, y };

		if (dx === 0 && dy === 0) return;

		translateSelectedItems(
			this.activeSelection.strokes,
			this.activeSelection.images,
			dx,
			dy,
		);

		this.activeSelection.bbox.minX += dx;
		this.activeSelection.bbox.maxX += dx;
		this.activeSelection.bbox.minY += dy;
		this.activeSelection.bbox.maxY += dy;

		this.updateSelectionBoxPosition();
		this.callbacks.redrawAll();
		if (this.activeSelection.images.length > 0) {
			this.callbacks.renderImages();
		}
	}

	public finishDragging(): void {
		if (!this.isDraggingSelection) return;
		this.isDraggingSelection = false;
		this.dragLastPt = null;
		if (this.selectionBoxEl) {
			this.selectionBoxEl.removeClass('is-dragging');
		}
		this.recalculateBoundingBox();
		this.updateSelectionBoxPosition();
		this.callbacks.onPageChanged();
	}

	public startScaling(handleRole: 'tl' | 'tr' | 'br' | 'bl'): void {
		if (!this.activeSelection) return;
		this.isScalingSelection = true;
		const b = this.activeSelection.bbox;

		let anchorX = b.minX;
		let anchorY = b.minY;
		if (handleRole === 'tl') {
			anchorX = b.maxX;
			anchorY = b.maxY;
		} else if (handleRole === 'tr') {
			anchorX = b.minX;
			anchorY = b.maxY;
		} else if (handleRole === 'br') {
			anchorX = b.minX;
			anchorY = b.minY;
		} else if (handleRole === 'bl') {
			anchorX = b.maxX;
			anchorY = b.minY;
		}

		this.scaleState = {
			handleRole,
			anchor: { x: anchorX, y: anchorY },
			initialBbox: { ...b },
			initialWidth: Math.max(10, b.maxX - b.minX),
			initialHeight: Math.max(10, b.maxY - b.minY),
		};

		this.scaleSnapshot = {
			strokes: this.activeSelection.strokes.map((s) => ({
				points: s.points.map((p) => ({ ...p })),
				shape: s.shape
					? {
							...s.shape,
							handles: s.shape.handles.map((h) => ({ ...h })),
							center: s.shape.center ? { ...s.shape.center } : undefined,
							arcOffset: s.shape.arcOffset
								? { ...s.shape.arcOffset }
								: undefined,
						}
					: undefined,
			})),
			images: this.activeSelection.images.map((img) => ({
				x: img.x,
				y: img.y,
				width: img.width,
				height: img.height,
			})),
		};
	}

	public updateScaling(x: number, y: number): void {
		if (!this.isScalingSelection || !this.scaleState || !this.activeSelection || !this.scaleSnapshot) return;

		const { anchor, initialWidth, initialHeight } = this.scaleState;
		const currentDistX = Math.abs(x - anchor.x);
		const currentDistY = Math.abs(y - anchor.y);

		const sx = Math.max(0.05, currentDistX / initialWidth);
		const sy = Math.max(0.05, currentDistY / initialHeight);

		// Revert to snapshot before applying absolute scale factor
		for (let i = 0; i < this.activeSelection.strokes.length; i++) {
			const s = this.activeSelection.strokes[i]!;
			const snap = this.scaleSnapshot.strokes[i]!;
			for (let j = 0; j < s.points.length; j++) {
				s.points[j]!.x = snap.points[j]!.x;
				s.points[j]!.y = snap.points[j]!.y;
			}
			if (s.shape && snap.shape) {
				s.shape.handles = snap.shape.handles.map((h: ShapeHandle) => ({ ...h }));
				if (snap.shape.center) s.shape.center = { ...snap.shape.center };
				if (snap.shape.arcOffset) s.shape.arcOffset = { ...snap.shape.arcOffset };
				s.shape.radiusX = snap.shape.radiusX;
				s.shape.radiusY = snap.shape.radiusY;
			}
		}
		for (let i = 0; i < this.activeSelection.images.length; i++) {
			const img = this.activeSelection.images[i]!;
			const snap = this.scaleSnapshot.images[i]!;
			img.x = snap.x;
			img.y = snap.y;
			img.width = snap.width;
			img.height = snap.height;
		}

		// Uniform or directional scale factor relative to anchor
		scaleSelectedItems(
			this.activeSelection.strokes,
			this.activeSelection.images,
			anchor,
			sx,
			sy,
		);

		// Refresh bounding box
		const newBbox = computeCombinedBoundingBox(
			this.activeSelection.strokes,
			this.activeSelection.images,
			8,
		);
		if (newBbox) {
			this.activeSelection.bbox = newBbox;
		}

		this.updateSelectionBoxPosition();
		this.callbacks.redrawAll();
		if (this.activeSelection.images.length > 0) {
			this.callbacks.renderImages();
		}
	}

	public finishScaling(): void {
		if (!this.isScalingSelection) return;
		this.isScalingSelection = false;
		this.scaleState = null;
		this.scaleSnapshot = null;
		this.recalculateBoundingBox();
		this.updateSelectionBoxPosition();
		this.callbacks.onPageChanged();
	}

	private recalculateBoundingBox(): void {
		if (!this.activeSelection) return;
		const newBbox = computeCombinedBoundingBox(
			this.activeSelection.strokes,
			this.activeSelection.images,
			8,
		);
		if (newBbox) {
			this.activeSelection.bbox = newBbox;
		}
	}

	// ----------------------------------------------------
	// Selection UI Rendering
	// ----------------------------------------------------

	public clearSelection(): void {
		this.clearSelectionBoxDOM();
		this.activeSelection = null;
		this.isDraggingSelection = false;
		this.isScalingSelection = false;
		this.dragLastPt = null;
		this.scaleState = null;
		this.scaleSnapshot = null;
	}

	private renderSelectionUI(): void {
		if (!this.activeSelection) return;
		this.clearSelectionBoxDOM();

		// Selection Box
		this.selectionBoxEl = this.overlayEl.createDiv({
			cls: 'betternotebook-lasso-box',
		});

		this.selectionBoxEl.addEventListener('pointerdown', (e: PointerEvent) => {
			if (e.button !== 0 && e.pointerType === 'mouse') return;
			e.stopPropagation();
			e.preventDefault();

			const pt = this.callbacks.getCanvasPoint(e);
			this.startDragging(pt.x, pt.y);

			try {
				this.selectionBoxEl?.setPointerCapture(e.pointerId);
			} catch {
				// Ignore capture error
			}

			const onMove = (moveEv: PointerEvent) => {
				if (!this.isDraggingSelection) return;
				const currentPt = this.callbacks.getCanvasPoint(moveEv);
				this.updateDragging(currentPt.x, currentPt.y);
			};

			const onUp = (upEv: PointerEvent) => {
				try {
					this.selectionBoxEl?.releasePointerCapture(upEv.pointerId);
				} catch {
					// Ignore release error
				}
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				window.removeEventListener('pointercancel', onUp);
				this.selectionBoxEl?.removeEventListener('pointermove', onMove);
				this.selectionBoxEl?.removeEventListener('pointerup', onUp);
				this.selectionBoxEl?.removeEventListener('pointercancel', onUp);
				this.finishDragging();
			};

			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
			window.addEventListener('pointercancel', onUp);
			this.selectionBoxEl?.addEventListener('pointermove', onMove);
			this.selectionBoxEl?.addEventListener('pointerup', onUp);
			this.selectionBoxEl?.addEventListener('pointercancel', onUp);
		});

		// 4 Corner Handles
		const handleRoles: ('tl' | 'tr' | 'br' | 'bl')[] = ['tl', 'tr', 'br', 'bl'];
		for (const role of handleRoles) {
			const hEl = this.overlayEl.createDiv({
				cls: `betternotebook-lasso-handle role-${role}`,
				attr: { 'data-role': role },
			});
			this.handlesElMap.set(role, hEl);

			hEl.addEventListener('pointerdown', (e: PointerEvent) => {
				if (e.button !== 0 && e.pointerType === 'mouse') return;
				e.stopPropagation();
				e.preventDefault();

				this.startScaling(role);

				try {
					hEl.setPointerCapture(e.pointerId);
				} catch {
					// Ignore capture error
				}

				const onMove = (moveEv: PointerEvent) => {
					if (!this.isScalingSelection) return;
					const currentPt = this.callbacks.getCanvasPoint(moveEv);
					this.updateScaling(currentPt.x, currentPt.y);
				};

				const onUp = (upEv: PointerEvent) => {
					try {
						hEl.releasePointerCapture(upEv.pointerId);
					} catch {
						// Ignore release error
					}
					window.removeEventListener('pointermove', onMove);
					window.removeEventListener('pointerup', onUp);
					window.removeEventListener('pointercancel', onUp);
					hEl.removeEventListener('pointermove', onMove);
					hEl.removeEventListener('pointerup', onUp);
					hEl.removeEventListener('pointercancel', onUp);
					this.finishScaling();
				};

				window.addEventListener('pointermove', onMove);
				window.addEventListener('pointerup', onUp);
				window.addEventListener('pointercancel', onUp);
				hEl.addEventListener('pointermove', onMove);
				hEl.addEventListener('pointerup', onUp);
				hEl.addEventListener('pointercancel', onUp);
			});
		}

		// Floating Action Bar
		this.renderFloatingBar();

		// Update positions
		this.updateSelectionBoxPosition();
	}

	private clearSelectionBoxDOM(): void {
		if (this.selectionBoxEl) {
			this.selectionBoxEl.remove();
			this.selectionBoxEl = null;
		}
		if (this.floatingBarEl) {
			this.floatingBarEl.remove();
			this.floatingBarEl = null;
		}
		this.handlesElMap.forEach((el) => el.remove());
		this.handlesElMap.clear();
	}

	private updateSelectionBoxPosition(): void {
		if (!this.activeSelection || !this.selectionBoxEl) return;
		const b = this.activeSelection.bbox;
		const width = Math.max(16, b.maxX - b.minX);
		const height = Math.max(16, b.maxY - b.minY);

		this.selectionBoxEl.style.left = `${b.minX}px`;
		this.selectionBoxEl.style.top = `${b.minY}px`;
		this.selectionBoxEl.style.width = `${width}px`;
		this.selectionBoxEl.style.height = `${height}px`;

		// Corner handles positions
		const tl = this.handlesElMap.get('tl');
		if (tl) {
			tl.style.left = `${b.minX - 7}px`;
			tl.style.top = `${b.minY - 7}px`;
		}
		const tr = this.handlesElMap.get('tr');
		if (tr) {
			tr.style.left = `${b.maxX - 7}px`;
			tr.style.top = `${b.minY - 7}px`;
		}
		const br = this.handlesElMap.get('br');
		if (br) {
			br.style.left = `${b.maxX - 7}px`;
			br.style.top = `${b.maxY - 7}px`;
		}
		const bl = this.handlesElMap.get('bl');
		if (bl) {
			bl.style.left = `${b.minX - 7}px`;
			bl.style.top = `${b.maxY - 7}px`;
		}

		// Floating Action Bar position
		if (this.floatingBarEl) {
			const barHeight = 36;
			const barTop =
				b.minY - barHeight - 12 >= 10
					? b.minY - barHeight - 12
					: b.maxY + 12;
			const barLeft = Math.max(10, b.minX + width / 2);

			this.floatingBarEl.style.top = `${barTop}px`;
			this.floatingBarEl.style.left = `${barLeft}px`;
		}
	}

	private renderFloatingBar(): void {
		if (!this.activeSelection) return;

		this.floatingBarEl = this.overlayEl.createDiv({
			cls: 'betternotebook-lasso-floating-bar',
		});

		// 1. Color Picker Button
		const colorBtn = this.floatingBarEl.createEl('button', {
			cls: 'betternotebook-lasso-action-btn',
			title: t('lasso_change_color'),
		});
		setIcon(colorBtn, 'palette');
		colorBtn.createSpan({ text: t('lasso_change_color') });
		colorBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
		colorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openColorPicker(colorBtn);
		});

		// 2. Duplicate Button
		const dupBtn = this.floatingBarEl.createEl('button', {
			cls: 'betternotebook-lasso-action-btn',
			title: t('lasso_duplicate'),
		});
		setIcon(dupBtn, 'copy');
		dupBtn.createSpan({ text: t('lasso_duplicate') });
		dupBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
		dupBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.duplicateSelection();
		});

		// 3. Copy Button (Clipboard)
		const copyBtn = this.floatingBarEl.createEl('button', {
			cls: 'betternotebook-lasso-action-btn',
			title: t('lasso_copy'),
		});
		setIcon(copyBtn, 'clipboard');
		copyBtn.createSpan({ text: t('lasso_copy') });
		copyBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
		copyBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.copySelectionToClipboard();
		});

		// 3b. Paste Button (if clipboard has items)
		if (LassoManager.clipboard) {
			const pasteBtn = this.floatingBarEl.createEl('button', {
				cls: 'betternotebook-lasso-action-btn',
				title: t('lasso_paste'),
			});
			setIcon(pasteBtn, 'clipboard-paste');
			pasteBtn.createSpan({ text: t('lasso_paste') });
			pasteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
			pasteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.pasteClipboard();
			});
		}

		// 4. Delete Button
		const delBtn = this.floatingBarEl.createEl('button', {
			cls: 'betternotebook-lasso-action-btn is-danger',
			title: t('lasso_delete'),
		});
		setIcon(delBtn, 'trash-2');
		delBtn.createSpan({ text: t('lasso_delete') });
		delBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.deleteSelection();
		});
	}

	// ----------------------------------------------------
	// Action Handlers
	// ----------------------------------------------------

	private openColorPicker(anchorEl: HTMLElement): void {
		if (!this.activeSelection) return;

		// Create quick popup menu of palette colors
		const colors = this.callbacks.getColors?.() || DEFAULT_PALETTE_COLORS;
		const popup = this.overlayEl.createDiv({
			cls: 'betternotebook-lasso-color-popup',
		});

		const rect = anchorEl.getBoundingClientRect();
		const overlayRect = this.overlayEl.getBoundingClientRect();
		popup.style.top = `${rect.bottom - overlayRect.top + 6}px`;
		popup.style.left = `${rect.left - overlayRect.left}px`;

		colors.forEach((color) => {
			const swatch = popup.createEl('button', {
				cls: 'betternotebook-lasso-color-swatch',
			});
			swatch.style.backgroundColor = color;
			swatch.addEventListener('pointerdown', (e) => e.stopPropagation());
			swatch.addEventListener('click', (e) => {
				e.stopPropagation();
				this.applyColorToSelection(color);
				popup.remove();
			});
		});

		// Close popup when tapping outside
		const onOutside = (e: MouseEvent) => {
			if (!popup.contains(e.target as Node)) {
				popup.remove();
				window.removeEventListener('pointerdown', onOutside, true);
			}
		};
		window.addEventListener('pointerdown', onOutside, true);
	}

	private applyColorToSelection(color: string): void {
		if (!this.activeSelection) return;

		for (const stroke of this.activeSelection.strokes) {
			stroke.style.color = color;
			if (stroke.shape) {
				if (stroke.shape.hasFill) {
					stroke.shape.fillColor = color;
				}
			}
		}

		this.callbacks.redrawAll();
		this.callbacks.onPageChanged();
		new Notice(t('lasso_color_applied'), 1500);
	}

	public duplicateSelection(): void {
		if (!this.activeSelection) return;

		const { duplicatedStrokes, duplicatedImages } = duplicateSelectedItems(
			this.activeSelection.strokes,
			this.activeSelection.images,
			30,
			30,
		);

		this.page.strokes.push(...duplicatedStrokes);
		this.page.images.push(...duplicatedImages);

		this.callbacks.renderImages();
		this.callbacks.redrawAll();
		this.callbacks.onPageChanged();

		// Switch selection to new duplicates
		const newBbox = computeCombinedBoundingBox(
			duplicatedStrokes,
			duplicatedImages,
			8,
		);
		if (newBbox) {
			this.activeSelection = {
				strokes: duplicatedStrokes,
				images: duplicatedImages,
				bbox: newBbox,
			};
			this.renderSelectionUI();
		}

		new Notice(t('lasso_duplicate'), 1500);
	}

	public copySelectionToClipboard(): void {
		if (!this.activeSelection) return;

		const { duplicatedStrokes, duplicatedImages } = duplicateSelectedItems(
			this.activeSelection.strokes,
			this.activeSelection.images,
			0,
			0,
		);

		LassoManager.clipboard = {
			strokes: duplicatedStrokes,
			images: duplicatedImages,
		};

		const count = duplicatedStrokes.length + duplicatedImages.length;
		new Notice(
			`${count} ${t('lasso_items_copied')}`,
			2500,
		);

		// Re-render floating bar to display "Einfügen" button immediately
		if (this.floatingBarEl) {
			this.floatingBarEl.remove();
			this.floatingBarEl = null;
		}
		this.renderFloatingBar();
		this.updateSelectionBoxPosition();
	}

	public deleteSelection(): void {
		if (!this.activeSelection) return;

		const strokeIds = new Set(this.activeSelection.strokes.map((s) => s.id));
		const imageIds = new Set(this.activeSelection.images.map((i) => i.id));

		this.page.strokes = this.page.strokes.filter((s) => !strokeIds.has(s.id));
		this.page.images = this.page.images.filter((i) => !imageIds.has(i.id));

		this.clearSelection();
		this.callbacks.renderImages();
		this.callbacks.redrawAll();
		this.callbacks.onPageChanged();
		new Notice(t('lasso_deleted_notice'), 1500);
	}

	public pasteClipboard(targetCenter?: { x: number; y: number }): boolean {
		if (!LassoManager.clipboard) {
			return false;
		}

		const clipBbox = computeCombinedBoundingBox(
			LassoManager.clipboard.strokes,
			LassoManager.clipboard.images,
			0,
		);

		let offsetX = 30;
		let offsetY = 30;

		if (targetCenter && clipBbox) {
			const clipCenterX = (clipBbox.minX + clipBbox.maxX) / 2;
			const clipCenterY = (clipBbox.minY + clipBbox.maxY) / 2;
			offsetX = targetCenter.x - clipCenterX;
			offsetY = targetCenter.y - clipCenterY;
		}

		const { duplicatedStrokes, duplicatedImages } = duplicateSelectedItems(
			LassoManager.clipboard.strokes,
			LassoManager.clipboard.images,
			offsetX,
			offsetY,
		);

		this.page.strokes.push(...duplicatedStrokes);
		this.page.images.push(...duplicatedImages);

		this.callbacks.renderImages();
		this.callbacks.redrawAll();
		this.callbacks.onPageChanged();

		const newBbox = computeCombinedBoundingBox(
			duplicatedStrokes,
			duplicatedImages,
			8,
		);
		if (newBbox) {
			this.activeSelection = {
				strokes: duplicatedStrokes,
				images: duplicatedImages,
				bbox: newBbox,
			};
			this.renderSelectionUI();
		}

		const count = duplicatedStrokes.length + duplicatedImages.length;
		new Notice(`${count} ${t('lasso_pasted_notice')}`, 1500);
		return true;
	}
}
