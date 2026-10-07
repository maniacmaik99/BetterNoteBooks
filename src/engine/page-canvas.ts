import { App, Notice, setIcon, Menu } from 'obsidian';
import {
	NotebookPage,
	Stroke,
	StrokeStyle,
	Point,
	PageImage,
	GeometricShape,
	ShapeHandle,
	EraserMode,
	DashStyle,
} from '../types';
import {
	lerp,
	getMidPoint,
	computeTargetWidth,
	computeBoundingBox,
	computeShapeBoundingBox,
	isPointNearStroke,
	isPointInsideOrNearShape,
	getPageDimensions,
} from '../utils/geometry';
import { recognizeShape } from '../utils/shape-recognizer';
import { ShapeOptionsModal } from '../ui/shape-options-modal';
import { ImageCropModal } from '../ui/image-crop-modal';

export interface PageCanvasEvents {
	onStrokeAdded?: (pageId: string, stroke: Stroke) => void;
	onStrokeErased?: (pageId: string, strokeId: string) => void;
	onImageModified?: (pageId: string, image: PageImage) => void;
	onImageDeleted?: (pageId: string, image: PageImage) => void;
	onPageChanged?: (pageId: string) => void;
	isGestureActive?: () => boolean;
}

export class PageCanvas {
	public readonly page: NotebookPage;
	public readonly pageEl: HTMLElement;

	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private pageLabelEl: HTMLElement;
	private imageOverlayEl: HTMLElement;
	private shapeOverlayEl: HTMLElement;
	private events: PageCanvasEvents;
	private app?: App;

	// HiDPI & size state
	private currentDpr = 1;
	public cssWidth = 794;
	public cssHeight = 1123;
	private isVisible = true;
	private isDirty = false;

	// Active drawing state
	private isDrawing = false;
	private activePointerId: number | null = null;
	private currentStroke: Stroke | null = null;
	private currentPoints: Point[] = [];
	private lastMidPoint: { x: number; y: number } | null = null;
	private currentLineWidth = 2.5;

	// Draw and Hold state for Geometric Shapes
	private holdTimer: number | null = null;
	private lastMovePoint: { x: number; y: number } | null = null;
	private snappedShape: GeometricShape | null = null;
	private activeShapeStroke: Stroke | null = null;
	private floatingBarEl: HTMLElement | null = null;
	private snapAnchor: {
		cx: number;
		cy: number;
		d0: number;
		initialHandles: {
			id: string;
			x: number;
			y: number;
			role: ShapeHandle['role'];
		}[];
	} | null = null;

	private currentStyle: StrokeStyle;
	private pressureSensitivity = 2.0;
	private eraserMode: EraserMode = 'precision';
	private eraserRadius = 16;
	private currentZoom = 1.0;
	private zoomAdaptive = true;
	private stylusOnlyMode = false;
	private eraserCursorEl!: HTMLElement;

	constructor(
		parentContainer: HTMLElement,
		page: NotebookPage,
		initialStyle: StrokeStyle,
		pressureSensitivity: number,
		events: PageCanvasEvents,
		app?: App,
	) {
		this.page = page;
		this.currentStyle = { ...initialStyle };
		this.pressureSensitivity = pressureSensitivity;
		this.eraserMode = initialStyle.eraserMode || 'precision';
		this.eraserRadius = initialStyle.eraserRadius || 16;
		this.events = events;
		this.app = app;

		// 1. Create page container element
		this.pageEl = parentContainer.createDiv({
			cls: 'betternotebook-page',
			attr: { 'data-page-id': page.id },
		});

		// Page header badge
		const pageHeader = this.pageEl.createDiv({
			cls: 'betternotebook-page-header',
		});
		const pageLabel = pageHeader.createSpan({
			cls: 'betternotebook-page-label',
			text: `Seite ${page.pageNumber}${page.group ? ` • ${page.group}` : ''}`,
		});
		pageLabel.title = page.title || `Seite ${page.pageNumber}`;
		this.pageLabelEl = pageLabel;

		// Page dimensions
		const dims = getPageDimensions(page.format, page.orientation);
		this.cssWidth = dims.width;
		this.cssHeight = dims.height;
		this.pageEl.style.width = `${this.cssWidth}px`;
		this.pageEl.style.height = `${this.cssHeight}px`;

		// 2. Create canvas
		this.canvas = this.pageEl.createEl('canvas', {
			cls: 'betternotebook-canvas',
		});

		let context = this.canvas.getContext('2d');
		if (!context) {
			try {
				context = this.canvas.getContext('2d', { desynchronized: false });
			} catch {
				// ignore
			}
		}

		if (!context) {
			throw new Error('Canvas 2D context creation failed');
		}
		this.ctx = context;

		// 3. Image overlay layer
		this.imageOverlayEl = this.pageEl.createDiv({
			cls: 'betternotebook-image-overlay',
		});

		// 4. Shape handles overlay
		this.shapeOverlayEl = this.pageEl.createDiv({
			cls: 'betternotebook-shape-overlay',
		});

		// 5. Visual eraser cursor overlay
		this.eraserCursorEl = this.pageEl.createDiv({
			cls: 'betternotebook-eraser-cursor',
		});

		this.initDprAndSize();
		this.attachEvents();
		this.renderImages();
		this.redrawAll();
	}

	public setVisibility(visible: boolean): void {
		this.isVisible = visible;
		if (visible && this.isDirty) {
			this.isDirty = false;
			this.redrawAll();
		}
	}

	public setStyle(style: Partial<StrokeStyle>): void {
		this.currentStyle = {
			...this.currentStyle,
			...style,
		};
		if (style.eraserMode) {
			this.eraserMode = style.eraserMode;
		}
		if (style.eraserRadius) {
			this.eraserRadius = style.eraserRadius;
		}
		if (this.currentStyle.tool !== 'eraser' && this.eraserCursorEl) {
			this.eraserCursorEl.removeClass('is-active');
		}
	}

	public setPressureSensitivity(val: number): void {
		this.pressureSensitivity = val;
	}

	public setZoom(zoom: number): void {
		this.currentZoom = Math.max(0.1, zoom);
		if (this.floatingBarEl) {
			this.updateFloatingBarPosition();
		}
		if (!this.events.isGestureActive?.()) {
			this.updateDprForZoom();
		}
	}

	public setZoomAdaptive(enabled: boolean): void {
		this.zoomAdaptive = enabled;
	}

	public setStylusOnlyMode(enabled: boolean): void {
		this.stylusOnlyMode = enabled;
	}

	public updateDprForZoom(): void {
		const baseDpr = this.getDpr();
		const targetDpr = Math.min(4.0, Math.max(1.0, baseDpr * this.currentZoom));
		if (Math.abs(targetDpr - this.currentDpr) > 0.05) {
			this.currentDpr = targetDpr;
			this.canvas.width = Math.round(this.cssWidth * targetDpr);
			this.canvas.height = Math.round(this.cssHeight * targetDpr);
			this.canvas.style.width = `${this.cssWidth}px`;
			this.canvas.style.height = `${this.cssHeight}px`;
			this.ctx.setTransform(targetDpr, 0, 0, targetDpr, 0, 0);
			this.ctx.imageSmoothingEnabled = true;
			this.ctx.imageSmoothingQuality = 'high';
			this.redrawAll();
		}
	}

	private ensureDprForZoom(): void {
		const baseDpr = this.getDpr();
		const expectedDpr = Math.min(4.0, Math.max(1.0, baseDpr * this.currentZoom));
		if (Math.abs(expectedDpr - this.currentDpr) > 0.05) {
			this.updateDprForZoom();
		}
	}

	public updateDimensions(): void {
		const dims = getPageDimensions(this.page.format, this.page.orientation);
		this.cssWidth = dims.width;
		this.cssHeight = dims.height;
		this.pageEl.style.width = `${this.cssWidth}px`;
		this.pageEl.style.height = `${this.cssHeight}px`;
		this.initDprAndSize();
		this.redrawAll();
	}

	public updateHeader(): void {
		if (this.pageLabelEl) {
			this.pageLabelEl.textContent = `Seite ${this.page.pageNumber}${this.page.group ? ` • ${this.page.group}` : ''}`;
			this.pageLabelEl.title = this.page.title || `Seite ${this.page.pageNumber}`;
		}
	}

	private getDpr(): number {
		const doc = this.canvas?.ownerDocument;
		const win =
			doc?.defaultView ||
			(typeof window !== 'undefined' ? window : null);
		return win?.devicePixelRatio || 1;
	}

	private initDprAndSize(): void {
		const dpr = this.getDpr();
		this.currentDpr = dpr;

		this.canvas.width = Math.round(this.cssWidth * dpr);
		this.canvas.height = Math.round(this.cssHeight * dpr);
		this.canvas.style.width = `${this.cssWidth}px`;
		this.canvas.style.height = `${this.cssHeight}px`;

		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	private attachEvents(): void {
		this.canvas.addEventListener('pointerdown', this.onPointerDown);
		this.canvas.addEventListener('pointermove', this.onPointerMove);
		this.canvas.addEventListener('pointerup', this.onPointerUp);
		this.canvas.addEventListener('pointercancel', this.onPointerCancel);
		this.canvas.addEventListener('pointerleave', this.onPointerLeave);
		this.canvas.addEventListener('contextmenu', this.onContextMenu);
	}

	public destroy(): void {
		this.clearHoldTimer();
		this.canvas.removeEventListener('pointerdown', this.onPointerDown);
		this.canvas.removeEventListener('pointermove', this.onPointerMove);
		this.canvas.removeEventListener('pointerup', this.onPointerUp);
		this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
		this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
		this.canvas.removeEventListener('contextmenu', this.onContextMenu);
		this.pageEl.remove();
	}

	private onContextMenu = (e: MouseEvent): void => {
		const { x, y } = this.getCanvasPoint(e as unknown as PointerEvent);

		// Check if right-clicking an image (locked or unlocked)
		const hitImage = this.page.images
			.slice()
			.reverse()
			.find(
				(img) =>
					x >= img.x &&
					x <= img.x + img.width &&
					y >= img.y &&
					y <= img.y + img.height,
			);
		if (hitImage) {
			e.preventDefault();
			e.stopPropagation();
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle(
						hitImage.isLocked
							? 'Position entsperren'
							: 'Position sperren (Fixieren)',
					)
					.setIcon(hitImage.isLocked ? 'unlock' : 'lock')
					.onClick(() => {
						hitImage.isLocked = !hitImage.isLocked;
						this.renderImages();
						this.events.onImageModified?.(this.page.id, hitImage);
						this.events.onPageChanged?.(this.page.id);
						new Notice(
							hitImage.isLocked
								? 'Bildposition gesperrt (kann jetzt beschrieben werden)'
								: 'Bildposition entsperrt',
						);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Bild zuschneiden...')
					.setIcon('crop')
					.onClick(() => {
						this.openCropModal(hitImage);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Bild löschen')
					.setIcon('trash-2')
					.onClick(() => {
						this.page.images = this.page.images.filter(
							(i) => i.id !== hitImage.id,
						);
						this.renderImages();
						this.redrawAll();
						this.events.onImageDeleted?.(this.page.id, hitImage);
						this.events.onPageChanged?.(this.page.id);
					}),
			);
			menu.showAtMouseEvent(e);
			return;
		}

		const hitShape = this.page.strokes
			.slice()
			.reverse()
			.find((s) => s.shape && isPointInsideOrNearShape(s, x, y, 16));
		if (hitShape) {
			e.preventDefault();
			e.stopPropagation();
			this.showShapeHandles(hitShape);
			this.openShapeOptions(hitShape);
		}
	};

	private onPointerLeave = (e: PointerEvent): void => {
		this.updateEraserCursor(0, 0, false);
		const related = e.relatedTarget as HTMLElement | null;
		if (related && related.closest('.betternotebook-image-lock-badge')) {
			return;
		}
		this.hideAllLockBadges();
	};

	private updateEraserCursor(x: number, y: number, show: boolean): void {
		if (!this.eraserCursorEl) return;
		if (!show || this.currentStyle.tool !== 'eraser') {
			this.eraserCursorEl.removeClass('is-active');
			return;
		}
		const zoom = this.zoomAdaptive ? Math.max(0.1, this.currentZoom) : 1.0;
		const r = (this.eraserRadius || 16) / zoom;
		this.eraserCursorEl.addClass('is-active');
		this.eraserCursorEl.style.left = `${x}px`;
		this.eraserCursorEl.style.top = `${y}px`;
		this.eraserCursorEl.style.width = `${r * 2}px`;
		this.eraserCursorEl.style.height = `${r * 2}px`;
	}

	private updateLockedImageHover(x: number, y: number): void {
		const lockBadges = this.imageOverlayEl.querySelectorAll<HTMLElement>(
			'.betternotebook-image-lock-badge',
		);
		if (lockBadges.length === 0) return;

		for (const badge of Array.from(lockBadges)) {
			const wrapper = badge.closest<HTMLElement>('.betternotebook-image-wrapper');
			if (!wrapper) continue;
			const imageId = wrapper.getAttribute('data-image-id');
			const img = this.page.images.find((i) => i.id === imageId);
			if (!img || !img.isLocked) {
				badge.removeClass('is-visible');
				continue;
			}

			// Zone: upper right corner of the locked image
			const cornerW = Math.max(36, Math.min(72, img.width * 0.35));
			const cornerH = Math.max(36, Math.min(72, img.height * 0.35));
			const minX = img.x + img.width - cornerW;
			const maxX = img.x + img.width + 16;
			const minY = img.y - 16;
			const maxY = img.y + cornerH;

			const isInside = x >= minX && x <= maxX && y >= minY && y <= maxY;
			if (isInside) {
				badge.addClass('is-visible');
			} else {
				badge.removeClass('is-visible');
			}
		}
	}

	private hideAllLockBadges(): void {
		const lockBadges = this.imageOverlayEl.querySelectorAll<HTMLElement>(
			'.betternotebook-image-lock-badge',
		);
		lockBadges.forEach((b) => b.removeClass('is-visible'));
	}

	private getCanvasPoint(e: PointerEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		const scaleX = this.cssWidth / (rect.width || this.cssWidth);
		const scaleY = this.cssHeight / (rect.height || this.cssHeight);
		return {
			x: (e.clientX - rect.left) * scaleX,
			y: (e.clientY - rect.top) * scaleY,
		};
	}

	public cancelCurrentStroke(): void {
		if (this.isDrawing) {
			this.clearHoldTimer();
			this.isDrawing = false;
			this.activePointerId = null;
			this.currentStroke = null;
			this.currentPoints = [];
			this.snappedShape = null;
			this.redrawAll();
		}
	}

	private clearHoldTimer(): void {
		if (this.holdTimer !== null) {
			window.clearTimeout(this.holdTimer);
			this.holdTimer = null;
		}
	}

	private onPointerDown = (e: PointerEvent): void => {
		if (e.button !== 0 && e.pointerType === 'mouse') return;
		if (this.events.isGestureActive?.()) return;

		// Stylus-Only / Palm Rejection Mode: touch inputs (fingers, palm) never draw!
		if (this.stylusOnlyMode && e.pointerType === 'touch') {
			return;
		}

		// Ensure canvas DPR is razor-sharp before pen touches down
		this.ensureDprForZoom();

		const { x, y } = this.getCanvasPoint(e);
		this.lastMovePoint = { x, y };

		// Check if tapping an existing geometric shape (border or inside filled shape)
		if (this.currentStyle.tool !== 'eraser') {
			const hitShape = this.page.strokes
				.slice()
				.reverse()
				.find((s) => s.shape && isPointInsideOrNearShape(s, x, y, 16));

			if (hitShape) {
				if (this.activeShapeStroke?.id === hitShape.id) {
					// Tapping already active shape opens the options modal!
					this.openShapeOptions(hitShape);
					return;
				}
				// Select shape and show handles
				this.showShapeHandles(hitShape);
				return;
			}
		}

		// Deselect images when tapping canvas
		this.deselectAllImages();

		// Dismiss existing shape handles if tapping outside
		if (this.activeShapeStroke) {
			this.clearActiveShape();
		}

		try {
			this.canvas.setPointerCapture(e.pointerId);
		} catch {
			// Ignore unsupported pointer capture
		}

		this.isDrawing = true;
		this.activePointerId = e.pointerId;
		this.snappedShape = null;

		// Handle Eraser Tool
		if (this.currentStyle.tool === 'eraser') {
			this.eraseAtPoint(x, y);
			return;
		}

		// Handle Drawing Tools (Pen / Highlighter / Shape)
		const isPen = e.pointerType === 'pen';
		const isHighlighter = this.currentStyle.tool === 'highlighter';

		const zoom = this.zoomAdaptive ? Math.max(0.1, this.currentZoom) : 1.0;
		const baseWidth = (isHighlighter
			? Math.max(18, this.currentStyle.width * 5.5)
			: this.currentStyle.width) / zoom;

		this.currentLineWidth = computeTargetWidth(
			baseWidth,
			e.pressure,
			isPen,
			this.pressureSensitivity,
		);

		const firstPoint: Point = {
			x,
			y,
			pressure: e.pressure,
			time: e.timeStamp,
		};

		this.currentPoints = [firstPoint];
		this.currentStroke = {
			id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
			points: [firstPoint],
			style: { ...this.currentStyle, width: baseWidth },
		};

		this.lastMidPoint = { x, y };

		// Render initial touch (pen & shape only; highlighter strokes start cleanly as a path)
		if (!isHighlighter) {
			this.setupContextForStyle(this.currentStroke.style);
			this.ctx.beginPath();
			this.ctx.arc(x, y, this.currentLineWidth / 2, 0, Math.PI * 2);
			this.ctx.fill();
		}

		// Start Draw-and-Hold timer for Shape & Line recognition (Pen, Shape, or Highlighter)
		if (
			this.currentStyle.tool === 'pen' ||
			this.currentStyle.tool === 'shape' ||
			this.currentStyle.tool === 'highlighter'
		) {
			this.startHoldTimer();
		}
	};

	private startHoldTimer(): void {
		this.clearHoldTimer();
		this.holdTimer = window.setTimeout(() => {
			this.triggerShapeRecognition();
		}, 450);
	}

	private triggerShapeRecognition(): void {
		this.holdTimer = null;
		if (!this.isDrawing || this.currentPoints.length < 2) return;

		let recognized = recognizeShape(this.currentPoints);
		const isHighlighter = this.currentStyle.tool === 'highlighter';

		if (isHighlighter) {
			if (!recognized) {
				const bbox = computeBoundingBox(this.currentPoints, 1);
				const width = bbox.maxX - bbox.minX;
				const height = bbox.maxY - bbox.minY;
				const diag = Math.hypot(width, height);
				const start = this.currentPoints[0]!;
				const end = this.currentPoints[this.currentPoints.length - 1]!;
				const startEndDist = Math.hypot(end.x - start.x, end.y - start.y);

				// Box / Rectangle detection fallback:
				// If stroke has 2D area (width & height > 25px) and start/end meet or are near relative to diagonal
				if (
					width > 25 &&
					height > 25 &&
					(startEndDist < Math.max(50, diag * 0.45) || startEndDist < 60)
				) {
					recognized = {
						type: 'rectangle',
						handles: [
							{ id: 'h_corner_0', x: bbox.minX, y: bbox.minY, role: 'corner' },
							{ id: 'h_corner_1', x: bbox.maxX, y: bbox.minY, role: 'corner' },
							{ id: 'h_corner_2', x: bbox.maxX, y: bbox.maxY, role: 'corner' },
							{ id: 'h_corner_3', x: bbox.minX, y: bbox.maxY, role: 'corner' },
						],
						isClosed: true,
						hasFill: true,
						fillColor: this.currentStroke?.style.color || this.currentStyle.color,
						fillOpacity: 0.35,
					};
				} else if (startEndDist > 15 || diag > 20) {
					// Open stroke -> straight ruler line
					const midX = (start.x + end.x) / 2;
					const midY = (start.y + end.y) / 2;
					recognized = {
						type: 'line',
						handles: [
							{ id: 'h_start', x: start.x, y: start.y, role: 'start' },
							{ id: 'h_mid', x: midX, y: midY, role: 'mid' },
							{ id: 'h_end', x: end.x, y: end.y, role: 'end' },
						],
						isClosed: false,
						arcOffset: { x: midX, y: midY },
					};
				}
			} else if (recognized.isClosed && recognized.type !== 'line') {
				// Any recognized closed shape drawn with highlighter is filled!
				recognized.hasFill = true;
				recognized.fillColor = this.currentStroke?.style.color || this.currentStyle.color;
				recognized.fillOpacity = 0.35;
			}
		}

		if (recognized && this.currentStroke) {
			this.snappedShape = recognized;
			this.currentStroke.shape = recognized;

			// Record centroid and initial handles for real-time draw-and-hold scaling
			const handles = recognized.handles;
			let cx = 0;
			let cy = 0;
			if (recognized.type === 'circle' && recognized.center) {
				cx = recognized.center.x;
				cy = recognized.center.y;
			} else if (handles.length > 0) {
				cx = handles.reduce((sum, h) => sum + h.x, 0) / handles.length;
				cy = handles.reduce((sum, h) => sum + h.y, 0) / handles.length;
			}
			const lastPt =
				this.currentPoints[this.currentPoints.length - 1] || { x: cx, y: cy };
			const d0 = Math.max(15, Math.hypot(lastPt.x - cx, lastPt.y - cy));

			this.snapAnchor = {
				cx,
				cy,
				d0,
				initialHandles: handles.map((h) => ({
					id: h.id,
					x: h.x,
					y: h.y,
					role: h.role,
				})),
			};

			// Re-render canvas with snapped shape preview
			this.redrawAll();
			this.renderGeometricShape(recognized, this.currentStroke.style);

			const label =
				recognized.type === 'line'
					? 'Linie / Bogen begradigt'
					: recognized.type === 'circle'
						? 'Kreis begradigt'
						: recognized.type === 'rectangle'
							? (isHighlighter ? 'Textmarker-Kasten begradigt' : 'Rechteck begradigt')
							: recognized.type === 'triangle'
								? 'Dreieck begradigt'
								: 'Form begradigt';
			new Notice(label, 1500);
		}
	}

	private onPointerMove = (e: PointerEvent): void => {
		const { x, y } = this.getCanvasPoint(e);

		// If hovering with eraser, update cursor circle position
		if (this.currentStyle.tool === 'eraser') {
			this.updateEraserCursor(x, y, true);
		}

		if (!this.isDrawing) {
			this.updateLockedImageHover(x, y);
			return;
		} else {
			this.hideAllLockBadges();
		}

		if (this.activePointerId !== e.pointerId) return;

		const isPen = e.pointerType === 'pen';
		const isHighlighter = this.currentStyle.tool === 'highlighter';
		const coalesced =
			typeof e.getCoalescedEvents === 'function'
				? e.getCoalescedEvents()
				: [e];

		let addedNewPoint = false;

		for (const event of coalesced) {
			const pt = this.getCanvasPoint(event);

			// Handle Eraser Move
			if (this.currentStyle.tool === 'eraser') {
				this.eraseAtPoint(pt.x, pt.y);
				continue;
			}

			// If already snapped to a shape, dragging updates the active shape!
			if (this.snappedShape && this.currentStroke) {
				this.updateSnappedShapeOnDrag(pt.x, pt.y);
				continue;
			}

			// Drawing stroke
			const prevPoint = this.currentPoints[this.currentPoints.length - 1];
			if (prevPoint) {
				const dx = pt.x - prevPoint.x;
				const dy = pt.y - prevPoint.y;
				const distSq = dx * dx + dy * dy;
				if (distSq < 0.25) continue; // Noise filter
			}

			// Reset or restart Draw and Hold timer whenever stylus moves away from hold anchor
			if (this.lastMovePoint) {
				const moveDist = Math.hypot(
					pt.x - this.lastMovePoint.x,
					pt.y - this.lastMovePoint.y,
				);
				if (moveDist > 6) {
					this.lastMovePoint = { x: pt.x, y: pt.y };
					this.startHoldTimer();
				}
			} else {
				this.lastMovePoint = { x: pt.x, y: pt.y };
				this.startHoldTimer();
			}

			const zoom = this.zoomAdaptive ? Math.max(0.1, this.currentZoom) : 1.0;
			const baseWidth = (isHighlighter
				? Math.max(18, this.currentStyle.width * 5.5)
				: this.currentStyle.width) / zoom;

			const targetWidth = computeTargetWidth(
				baseWidth,
				event.pressure,
				isPen,
				this.pressureSensitivity,
			);
			this.currentLineWidth = lerp(
				this.currentLineWidth,
				targetWidth,
				this.currentStyle.smoothing,
			);

			const currentPt: Point = {
				x: pt.x,
				y: pt.y,
				pressure: event.pressure,
				time: event.timeStamp,
			};

			this.currentPoints.push(currentPt);
			this.currentStroke?.points.push(currentPt);
			addedNewPoint = true;

			if (!isHighlighter) {
				if (this.currentPoints.length >= 2 && this.lastMidPoint && this.currentStroke) {
					const pPrev =
						this.currentPoints[this.currentPoints.length - 2] ?? currentPt;
					const mid = getMidPoint(pPrev, currentPt);

					this.setupContextForStyle(this.currentStroke.style);
					this.ctx.lineWidth = this.currentLineWidth;

					this.ctx.beginPath();
					this.ctx.moveTo(this.lastMidPoint.x, this.lastMidPoint.y);
					this.ctx.quadraticCurveTo(pPrev.x, pPrev.y, mid.x, mid.y);
					this.ctx.stroke();

					this.lastMidPoint = mid;
				}
			}
		}

		if (isHighlighter && addedNewPoint && this.currentStroke) {
			this.redrawAll();
			this.renderHighlighterStroke(this.currentStroke);
		}
	};

	private updateSnappedShapeOnDrag(x: number, y: number): void {
		if (!this.snappedShape || !this.currentStroke) return;

		// When dragging after snap, update end handle or scale
		const handles = this.snappedShape.handles;
		if (this.snappedShape.type === 'line') {
			const endH = handles.find((h) => h.role === 'end');
			const startH = handles.find((h) => h.role === 'start');
			const midH = handles.find((h) => h.role === 'mid');
			if (endH && startH) {
				endH.x = x;
				endH.y = y;
				if (midH) {
					midH.x = (startH.x + endH.x) / 2;
					midH.y = (startH.y + endH.y) / 2;
				}
			}
		} else if (this.snappedShape.type === 'circle' && this.snappedShape.center) {
			const r = Math.max(
				8,
				Math.hypot(x - this.snappedShape.center.x, y - this.snappedShape.center.y),
			);
			this.snappedShape.radiusX = r;
			this.snappedShape.radiusY = r;
			const radXH = handles.find((h) => h.id === 'h_rad_x');
			const radYH = handles.find((h) => h.id === 'h_rad_y');
			if (radXH) {
				radXH.x = this.snappedShape.center.x + r;
				radXH.y = this.snappedShape.center.y;
			}
			if (radYH) {
				radYH.x = this.snappedShape.center.x;
				radYH.y = this.snappedShape.center.y + r;
			}
		} else if (this.snappedShape.type === 'rectangle' && this.snapAnchor) {
			const { cx, cy } = this.snapAnchor;
			const halfW = Math.max(12, Math.abs(x - cx));
			const halfH = Math.max(12, Math.abs(y - cy));
			const corners = handles.filter((h) => h.role === 'corner');
			if (corners.length === 4) {
				corners[0]!.x = cx - halfW;
				corners[0]!.y = cy - halfH;
				corners[1]!.x = cx + halfW;
				corners[1]!.y = cy - halfH;
				corners[2]!.x = cx + halfW;
				corners[2]!.y = cy + halfH;
				corners[3]!.x = cx - halfW;
				corners[3]!.y = cy + halfH;
			}
		} else if (this.snapAnchor) {
			// Triangle & Polygon uniform scale from centroid
			const { cx, cy, d0, initialHandles } = this.snapAnchor;
			const currentDist = Math.hypot(x - cx, y - cy);
			const scale = Math.max(0.15, currentDist / d0);
			for (const h of handles) {
				const initH = initialHandles.find((ih) => ih.id === h.id);
				if (initH) {
					h.x = cx + (initH.x - cx) * scale;
					h.y = cy + (initH.y - cy) * scale;
				}
			}
		}

		this.redrawAll();
		this.renderGeometricShape(this.snappedShape, this.currentStroke.style);
	}

	private onPointerUp = (e: PointerEvent): void => {
		if (!this.isDrawing || this.activePointerId !== e.pointerId) return;
		this.finishPointer(e);
	};

	private onPointerCancel = (e: PointerEvent): void => {
		if (!this.isDrawing || this.activePointerId !== e.pointerId) return;
		this.finishPointer(e);
	};

	private finishPointer(e: PointerEvent): void {
		this.clearHoldTimer();

		if (this.currentStyle.tool === 'eraser') {
			this.isDrawing = false;
			this.activePointerId = null;
			return;
		}

		// If Shape tool was used and not yet snapped, try snapping now
		if (this.currentStyle.tool === 'shape' && !this.snappedShape && this.currentPoints.length >= 2) {
			const recognized = recognizeShape(this.currentPoints);
			if (recognized && this.currentStroke) {
				this.snappedShape = recognized;
				this.currentStroke.shape = recognized;
				const label =
					recognized.type === 'line'
						? 'Linie / Bogen begradigt'
						: recognized.type === 'circle'
							? 'Kreis begradigt'
							: 'Form begradigt';
				new Notice(label, 1500);
			}
		}

		if (this.snappedShape && this.currentStroke) {
			// Inherit dashStyle, opacity, and fill
			if (this.currentStyle.dashStyle) {
				this.snappedShape.dashStyle = this.currentStyle.dashStyle;
			}
			if (this.currentStyle.opacity !== undefined) {
				this.snappedShape.opacity = this.currentStyle.opacity;
			}
			if (this.snappedShape.isClosed && this.snappedShape.type !== 'line') {
				if (this.currentStyle.tool === 'highlighter') {
					this.snappedShape.hasFill = true;
					this.snappedShape.fillColor = this.currentStroke.style.color;
					this.snappedShape.fillOpacity = 0.35;
				} else if (this.currentStyle.hasFill !== undefined) {
					this.snappedShape.hasFill = this.currentStyle.hasFill;
					this.snappedShape.fillColor =
						this.currentStyle.fillColor || this.currentStroke.style.color;
					this.snappedShape.fillOpacity =
						this.currentStyle.fillOpacity ?? 0.25;
				}
			}

			// Shape finalized: commit stroke and activate interactive control handles!
			this.currentStroke.shape = this.snappedShape;
			this.currentStroke.bbox = computeShapeBoundingBox(
				this.snappedShape,
				this.currentStroke.style.width,
			);
			this.snapAnchor = null;
			this.page.strokes.push(this.currentStroke);
			this.events.onStrokeAdded?.(this.page.id, this.currentStroke);

			if (this.currentStyle.tool !== 'highlighter') {
				this.showShapeHandles(this.currentStroke);
			}
			this.redrawAll();
		} else {
			// Normal freehand stroke
			const isHighlighter = this.currentStyle.tool === 'highlighter';
			if (!isHighlighter && this.currentPoints.length >= 2 && this.lastMidPoint && this.currentStroke) {
				const lastPoint = this.currentPoints[this.currentPoints.length - 1];
				if (lastPoint) {
					this.setupContextForStyle(this.currentStroke.style);
					this.ctx.lineWidth = this.currentLineWidth;
					this.ctx.beginPath();
					this.ctx.moveTo(this.lastMidPoint.x, this.lastMidPoint.y);
					this.ctx.lineTo(lastPoint.x, lastPoint.y);
					this.ctx.stroke();
				}
			}

			if (this.currentStroke && this.currentStroke.points.length > 0) {
				this.currentStroke.bbox = computeBoundingBox(
					this.currentStroke.points,
					this.currentStroke.style.width,
				);
				this.page.strokes.push(this.currentStroke);
				this.events.onStrokeAdded?.(this.page.id, this.currentStroke);
				this.redrawAll();
			}
		}

		try {
			this.canvas.releasePointerCapture(e.pointerId);
		} catch {
			// Ignore release errors
		}

		this.isDrawing = false;
		this.activePointerId = null;
		this.currentStroke = null;
		this.currentPoints = [];
		this.lastMidPoint = null;
		this.snappedShape = null;
	}

	// ----------------------------------------------------
	// Interactive Shape Handles (GoodNotes Editing)
	// ----------------------------------------------------

	public showShapeHandles(stroke: Stroke): void {
		this.clearActiveShape();
		if (!stroke.shape) return;

		this.activeShapeStroke = stroke;
		const shape = stroke.shape;

		for (const handle of shape.handles) {
			const handleEl = this.shapeOverlayEl.createDiv({
				cls: `betternotebook-shape-handle role-${handle.role}`,
				attr: { 'data-handle-id': handle.id },
			});
			handleEl.style.left = `${handle.x}px`;
			handleEl.style.top = `${handle.y}px`;

			let isDraggingHandle = false;

			const onHandleDown = (ev: MouseEvent | PointerEvent) => {
				ev.stopPropagation();
				ev.preventDefault();
				isDraggingHandle = true;
				handleEl.addClass('is-dragging');
			};

			const onHandleMove = (ev: MouseEvent | PointerEvent) => {
				if (!isDraggingHandle) return;
				const pt = this.getCanvasPoint(ev as PointerEvent);
				const nx = Math.max(0, Math.min(this.cssWidth, pt.x));
				const ny = Math.max(0, Math.min(this.cssHeight, pt.y));

				handle.x = nx;
				handle.y = ny;
				handleEl.style.left = `${nx}px`;
				handleEl.style.top = `${ny}px`;

				// If moving center of circle, move radius handles along
				if (shape.type === 'circle' && handle.role === 'corner' && shape.center) {
					const dx = nx - shape.center.x;
					const dy = ny - shape.center.y;
					shape.center.x = nx;
					shape.center.y = ny;
					for (const radH of shape.handles) {
						if (radH.role === 'radius') {
							radH.x += dx;
							radH.y += dy;
							const radEl = this.shapeOverlayEl.querySelector(
								`[data-handle-id="${radH.id}"]`,
							) as HTMLElement;
							if (radEl) {
								radEl.style.left = `${radH.x}px`;
								radEl.style.top = `${radH.y}px`;
							}
						}
					}
				}

				// If dragging circle radius handle, dynamically resize circle and sync handles
				if (shape.type === 'circle' && handle.role === 'radius' && shape.center) {
					const r = Math.max(8, Math.hypot(nx - shape.center.x, ny - shape.center.y));
					shape.radiusX = r;
					shape.radiusY = r;

					const radXH = shape.handles.find((h) => h.id === 'h_rad_x');
					const radYH = shape.handles.find((h) => h.id === 'h_rad_y');
					if (radXH) {
						radXH.x = shape.center.x + r;
						radXH.y = shape.center.y;
						const radXEl = this.shapeOverlayEl.querySelector(
							`[data-handle-id="${radXH.id}"]`,
						) as HTMLElement;
						if (radXEl) {
							radXEl.style.left = `${radXH.x}px`;
							radXEl.style.top = `${radXH.y}px`;
						}
					}
					if (radYH) {
						radYH.x = shape.center.x;
						radYH.y = shape.center.y + r;
						const radYEl = this.shapeOverlayEl.querySelector(
							`[data-handle-id="${radYH.id}"]`,
						) as HTMLElement;
						if (radYEl) {
							radYEl.style.left = `${radYH.x}px`;
							radYEl.style.top = `${radYH.y}px`;
						}
					}
				}

				this.updateFloatingBarPosition();
				this.redrawAll();
			};

			const onHandleUp = () => {
				if (isDraggingHandle) {
					isDraggingHandle = false;
					handleEl.removeClass('is-dragging');
					stroke.bbox = computeShapeBoundingBox(
						shape,
						stroke.style.width,
					);
					this.updateFloatingBarPosition();
					this.events.onPageChanged?.(this.page.id);
				}
			};

			handleEl.addEventListener('pointerdown', onHandleDown as EventListener);
			handleEl.addEventListener('mousedown', onHandleDown as EventListener);
			window.addEventListener('pointermove', onHandleMove as EventListener);
			window.addEventListener('mousemove', onHandleMove as EventListener);
			window.addEventListener('pointerup', onHandleUp as EventListener);
			window.addEventListener('mouseup', onHandleUp as EventListener);
		}

		// Create Floating Quick Action Bar above selected shape
		const bar = this.shapeOverlayEl.createDiv({
			cls: 'betternotebook-shape-floating-bar',
		});
		this.floatingBarEl = bar;

		// 1. "Anpassen" Button (Full Options Modal)
		const editBtn = bar.createEl('button', {
			cls: 'betternotebook-shape-bar-btn',
			title: 'Form anpassen (Linienstil, Dicke, Transparenz, Füllung)',
		});
		editBtn.setText('🎨 Anpassen');
		editBtn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			this.openShapeOptions(stroke);
		});

		bar.createDiv({ cls: 'betternotebook-shape-bar-sep' });

		// 2. Quick Line Style Toggle
		const dashBtn = bar.createEl('button', {
			cls: 'betternotebook-shape-bar-btn',
			title: 'Linienstil wechseln (Durchgezogen / Gestrichelt / Gepunktet)',
		});
		const updateDashBtnText = () => {
			const ds = stroke.shape?.dashStyle || stroke.style.dashStyle || 'solid';
			dashBtn.setText(
				ds === 'dashed' ? '┄ Gestrichelt' : ds === 'dotted' ? '┈ Gepunktet' : '── Voll',
			);
		};
		updateDashBtnText();
		dashBtn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			const currentDash = stroke.shape?.dashStyle || stroke.style.dashStyle || 'solid';
			const nextDash: DashStyle =
				currentDash === 'solid' ? 'dashed' : currentDash === 'dashed' ? 'dotted' : 'solid';
			stroke.style.dashStyle = nextDash;
			if (stroke.shape) stroke.shape.dashStyle = nextDash;
			updateDashBtnText();
			this.redrawAll();
			this.events.onPageChanged?.(this.page.id);
		});

		// 3. Quick Fill Toggle (if closed shape)
		if (shape.isClosed && shape.type !== 'line') {
			bar.createDiv({ cls: 'betternotebook-shape-bar-sep' });
			const fillBtn = bar.createEl('button', {
				cls: `betternotebook-shape-bar-btn ${shape.hasFill ? 'is-active' : ''}`,
				title: 'Flächenfüllung umschalten',
			});
			fillBtn.setText(shape.hasFill ? '🪣 Gefüllt' : '🪣 Keine Füllung');
			fillBtn.addEventListener('click', (ev) => {
				ev.stopPropagation();
				shape.hasFill = !shape.hasFill;
				if (shape.hasFill) {
					shape.fillColor = shape.fillColor || stroke.style.color;
					shape.fillOpacity = shape.fillOpacity ?? 0.25;
				}
				fillBtn.toggleClass('is-active', shape.hasFill);
				fillBtn.setText(shape.hasFill ? '🪣 Gefüllt' : '🪣 Keine Füllung');
				this.redrawAll();
				this.events.onPageChanged?.(this.page.id);
			});
		}

		bar.createDiv({ cls: 'betternotebook-shape-bar-sep' });

		// 4. Delete Button
		const deleteBtn = bar.createEl('button', {
			cls: 'betternotebook-shape-bar-btn is-danger',
			title: 'Form löschen',
		});
		deleteBtn.setText('🗑️');
		deleteBtn.addEventListener('click', (ev) => {
			ev.stopPropagation();
			this.deleteShapeStroke(stroke);
		});

		this.updateFloatingBarPosition();
	}

	private updateFloatingBarPosition(): void {
		if (!this.floatingBarEl || !this.activeShapeStroke?.shape) return;
		const shape = this.activeShapeStroke.shape;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		if (shape.type === 'circle' && shape.center && shape.radiusX) {
			const rx = shape.radiusX;
			const ry = shape.radiusY ?? rx;
			minX = shape.center.x - rx;
			maxX = shape.center.x + rx;
			minY = shape.center.y - ry;
			maxY = shape.center.y + ry;
		} else {
			for (const h of shape.handles) {
				if (h.x < minX) minX = h.x;
				if (h.x > maxX) maxX = h.x;
				if (h.y < minY) minY = h.y;
				if (h.y > maxY) maxY = h.y;
			}
		}

		if (minX === Infinity) return;
		const midX = (minX + maxX) / 2;

		const spaceAbove = minY;
		const spaceBelow = this.cssHeight - maxY;
		// If near top border of the page (within 95px), place bar BELOW the shape to avoid toolbar overlap
		const isFlippedBelow =
			spaceAbove < 95 ? (spaceBelow >= 50 || spaceBelow > spaceAbove) : false;
		const barY = isFlippedBelow ? maxY + 14 : minY - 14;

		// Clamp X horizontally so the bar never clips past the page boundaries
		// Bar width is ~240px, half width ~135px
		const halfBarWidth = 135;
		const clampedX = Math.max(
			halfBarWidth + 14,
			Math.min(this.cssWidth - halfBarWidth - 14, midX),
		);

		this.floatingBarEl.style.left = `${clampedX}px`;
		this.floatingBarEl.style.top = `${barY}px`;

		this.floatingBarEl.toggleClass('is-flipped-below', isFlippedBelow);
	}

	public deleteShapeStroke(stroke: Stroke): void {
		this.clearActiveShape();
		this.page.strokes = this.page.strokes.filter((s) => s.id !== stroke.id);
		this.redrawAll();
		this.events.onStrokeErased?.(this.page.id, stroke.id);
		this.events.onPageChanged?.(this.page.id);
		new Notice('Form gelöscht', 1500);
	}

	public openShapeOptions(stroke: Stroke): void {
		let app = this.app;
		if (!app) {
			const win = this.canvas.ownerDocument?.defaultView as unknown as { app?: App };
			if (win?.app) app = win.app;
		}
		if (!app) return;

		new ShapeOptionsModal(
			app,
			stroke,
			() => {
				if (stroke.shape) {
					stroke.bbox = computeShapeBoundingBox(
						stroke.shape,
						stroke.style.width,
					);
				}
				this.redrawAll();
				this.updateFloatingBarPosition();
				this.events.onPageChanged?.(this.page.id);
			},
			() => {
				this.deleteShapeStroke(stroke);
			},
		).open();
	}

	public clearActiveShape(): void {
		this.activeShapeStroke = null;
		this.floatingBarEl = null;
		this.shapeOverlayEl.empty();
	}

	public clearStrokes(): void {
		this.clearActiveShape();
		this.page.strokes = [];
		this.redrawAll();
		this.events.onPageChanged?.(this.page.id);
	}

	/**
	 * Dual-mode vector eraser:
	 * 1. 'stroke' (Strichradierer): Deletes the entire stroke if eraser circle touches it.
	 * 2. 'precision' (Präzisionsradierer): Erases only the segments of strokes within the circle.
	 */
	private eraseAtPoint(x: number, y: number): void {
		const initialCount = this.page.strokes.length;
		if (initialCount === 0) return;

		const remainingStrokes: Stroke[] = [];
		let erasedAny = false;

		const zoom = this.zoomAdaptive ? Math.max(0.1, this.currentZoom) : 1.0;
		const mode = this.currentStyle.eraserMode || this.eraserMode || 'precision';
		const radius = (this.currentStyle.eraserRadius || this.eraserRadius || 16) / zoom;

		if (mode === 'stroke') {
			// Strichradierer: delete entire stroke
			for (const stroke of this.page.strokes) {
				if (isPointNearStroke(stroke, x, y, radius)) {
					erasedAny = true;
					if (this.activeShapeStroke?.id === stroke.id) {
						this.clearActiveShape();
					}
					this.events.onStrokeErased?.(this.page.id, stroke.id);
				} else {
					remainingStrokes.push(stroke);
				}
			}
		} else {
			// Präzisionsradierer: split & excise segments
			for (const stroke of this.page.strokes) {
				if (stroke.shape || stroke.points.length <= 2) {
					if (isPointNearStroke(stroke, x, y, radius)) {
						erasedAny = true;
						if (this.activeShapeStroke?.id === stroke.id) {
							this.clearActiveShape();
						}
						this.events.onStrokeErased?.(this.page.id, stroke.id);
					} else {
						remainingStrokes.push(stroke);
					}
					continue;
				}

				const pointsInside = stroke.points.some((p) => Math.hypot(p.x - x, p.y - y) <= radius);
				if (!pointsInside && !isPointNearStroke(stroke, x, y, radius)) {
					remainingStrokes.push(stroke);
					continue;
				}

				erasedAny = true;
				this.events.onStrokeErased?.(this.page.id, stroke.id);

				const segments: Point[][] = [];
				let curSeg: Point[] = [];

				for (const pt of stroke.points) {
					const dist = Math.hypot(pt.x - x, pt.y - y);
					if (dist > radius) {
						curSeg.push(pt);
					} else {
						if (curSeg.length > 0) {
							segments.push(curSeg);
							curSeg = [];
						}
					}
				}
				if (curSeg.length > 0) {
					segments.push(curSeg);
				}

				for (const seg of segments) {
					if (seg.length >= 2) {
						remainingStrokes.push({
							id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
							points: seg,
							style: { ...stroke.style },
							bbox: computeBoundingBox(seg, stroke.style.width),
						});
					} else if (seg.length === 1 && seg[0]) {
						const p0 = seg[0];
						remainingStrokes.push({
							id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
							points: [p0, { ...p0, x: p0.x + 0.1 }],
							style: { ...stroke.style },
							bbox: computeBoundingBox([p0], stroke.style.width),
						});
					}
				}
			}
		}

		if (erasedAny) {
			this.page.strokes = remainingStrokes;
			this.redrawAll();
			this.events.onPageChanged?.(this.page.id);
		}
	}

	private setupContextForStyle(style: StrokeStyle, shape?: GeometricShape): void {
		this.ctx.lineCap = 'round';
		this.ctx.lineJoin = 'round';
		this.ctx.strokeStyle = style.color;
		this.ctx.fillStyle = style.color;

		const dashStyle: DashStyle = shape?.dashStyle || style.dashStyle || 'solid';
		const w = Math.max(1, style.width);
		if (dashStyle === 'dashed') {
			this.ctx.setLineDash([w * 3.5, w * 2.5]);
		} else if (dashStyle === 'dotted') {
			this.ctx.setLineDash([w * 0.8, w * 2.0]);
		} else {
			this.ctx.setLineDash([]);
		}

		const opacity = shape?.opacity ?? style.opacity ?? 1.0;

		if (style.tool === 'highlighter') {
			// Multiply mode gives real physical marker blending without muddy overlaps
			this.ctx.globalCompositeOperation = 'multiply';
			this.ctx.globalAlpha = 0.55 * opacity;
		} else {
			this.ctx.globalCompositeOperation = 'source-over';
			this.ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));
		}
	}

	/**
	 * Redraws background pattern and all vector strokes.
	 * Highlighters are layered underneath pen strokes (GoodNotes behavior).
	 */
	public redrawAll(): void {
		// 1. Clear background completely
		this.ctx.save();
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.globalCompositeOperation = 'source-over';
		this.ctx.globalAlpha = 1.0;
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.fillStyle = '#ffffff';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.restore();

		this.ctx.setTransform(
			this.currentDpr,
			0,
			0,
			this.currentDpr,
			0,
			0,
		);

		// 2. Draw page background pattern
		this.renderBackgroundPattern();

		// 3. Render Images onto canvas (so highlighters and pen strokes appear on top!)
		for (const img of this.page.images) {
			const el = this.getImageElement(img);
			if (el && el.complete && el.naturalWidth > 0) {
				this.ctx.drawImage(el, img.x, img.y, img.width, img.height);
			}
		}

		// 4. Render Highlighters first (layer underneath ink)
		const highlighters = this.page.strokes.filter(
			(s) => s.style.tool === 'highlighter',
		);
		for (const hl of highlighters) {
			this.renderStroke(hl);
		}

		// 5. Render Pen and Shape strokes on top
		const normalStrokes = this.page.strokes.filter(
			(s) => s.style.tool !== 'highlighter',
		);
		for (const stroke of normalStrokes) {
			this.renderStroke(stroke);
		}
	}

	private imageElements = new Map<string, HTMLImageElement>();

	private getImageElement(img: PageImage): HTMLImageElement {
		let el = this.imageElements.get(img.id);
		if (!el || el.src !== img.src) {
			el = new Image();
			el.onload = () => {
				this.redrawAll();
			};
			el.src = img.src;
			this.imageElements.set(img.id, el);
		}
		return el;
	}

	private renderBackgroundPattern(): void {
		const bg = this.page.background;
		if (bg === 'blank') return;

		this.ctx.save();
		this.ctx.globalCompositeOperation = 'source-over';

		if (bg === 'ruled') {
			this.ctx.strokeStyle = '#e2e8f0';
			this.ctx.lineWidth = 1;
			const lineHeight = 34;
			const topMargin = 60;

			for (let y = topMargin; y < this.cssHeight; y += lineHeight) {
				this.ctx.beginPath();
				this.ctx.moveTo(20, y);
				this.ctx.lineTo(this.cssWidth - 20, y);
				this.ctx.stroke();
			}
		} else if (bg === 'grid') {
			this.ctx.strokeStyle = '#edf2f7';
			this.ctx.lineWidth = 1;
			const gridSize = 24;

			for (let x = gridSize; x < this.cssWidth; x += gridSize) {
				this.ctx.beginPath();
				this.ctx.moveTo(x, 0);
				this.ctx.lineTo(x, this.cssHeight);
				this.ctx.stroke();
			}

			for (let y = gridSize; y < this.cssHeight; y += gridSize) {
				this.ctx.beginPath();
				this.ctx.moveTo(0, y);
				this.ctx.lineTo(this.cssWidth, y);
				this.ctx.stroke();
			}
		} else if (bg === 'dotted') {
			this.ctx.fillStyle = '#cbd5e1';
			const dotSpacing = 24;
			const dotRadius = 1;

			for (let x = dotSpacing; x < this.cssWidth; x += dotSpacing) {
				for (let y = dotSpacing; y < this.cssHeight; y += dotSpacing) {
					this.ctx.beginPath();
					this.ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
					this.ctx.fill();
				}
			}
		}

		this.ctx.restore();
	}

	private renderStroke(stroke: Stroke): void {
		if (stroke.shape) {
			this.renderGeometricShape(stroke.shape, stroke.style);
			return;
		}

		if (stroke.style.tool === 'highlighter') {
			this.renderHighlighterStroke(stroke);
			return;
		}

		const points = stroke.points;
		if (points.length === 0) return;

		this.ctx.save();
		this.setupContextForStyle(stroke.style);

		const firstPoint = points[0];
		if (!firstPoint) {
			this.ctx.restore();
			return;
		}

		if (points.length === 1) {
			this.ctx.beginPath();
			this.ctx.arc(
				firstPoint.x,
				firstPoint.y,
				stroke.style.width / 2,
				0,
				Math.PI * 2,
			);
			this.ctx.fill();
			this.ctx.restore();
			return;
		}

		const isPen = points.some((p) => p.pressure > 0 && p.pressure !== 0.5);
		let currentW = computeTargetWidth(
			stroke.style.width,
			firstPoint.pressure,
			isPen,
			this.pressureSensitivity,
		);

		const secondPoint = points[1];
		if (!secondPoint) {
			this.ctx.restore();
			return;
		}

		let lastMid = getMidPoint(firstPoint, secondPoint);

		this.ctx.beginPath();
		this.ctx.moveTo(firstPoint.x, firstPoint.y);
		this.ctx.lineTo(lastMid.x, lastMid.y);
		this.ctx.lineWidth = currentW;
		this.ctx.stroke();

		for (let i = 2; i < points.length; i++) {
			const ptPrev = points[i - 1];
			const ptCurr = points[i];
			if (!ptPrev || !ptCurr) continue;

			const targetW = computeTargetWidth(
				stroke.style.width,
				ptCurr.pressure,
				isPen,
				this.pressureSensitivity,
			);
			currentW = lerp(currentW, targetW, stroke.style.smoothing);

			const mid = getMidPoint(ptPrev, ptCurr);

			this.ctx.beginPath();
			this.ctx.moveTo(lastMid.x, lastMid.y);
			this.ctx.quadraticCurveTo(ptPrev.x, ptPrev.y, mid.x, mid.y);
			this.ctx.lineWidth = currentW;
			this.ctx.stroke();

			lastMid = mid;
		}

		const lastPoint = points[points.length - 1];
		if (lastPoint) {
			this.ctx.beginPath();
			this.ctx.moveTo(lastMid.x, lastMid.y);
			this.ctx.lineTo(lastPoint.x, lastPoint.y);
			this.ctx.lineWidth = currentW;
			this.ctx.stroke();
		}

		this.ctx.restore();
	}

	private renderHighlighterStroke(stroke: Stroke): void {
		const points = stroke.points;
		if (points.length === 0) return;

		const firstPoint = points[0];
		if (!firstPoint) return;

		this.ctx.save();
		this.setupContextForStyle(stroke.style);

		if (points.length === 1) {
			this.ctx.beginPath();
			this.ctx.arc(
				firstPoint.x,
				firstPoint.y,
				stroke.style.width / 2,
				0,
				Math.PI * 2,
			);
			this.ctx.fill();
			this.ctx.restore();
			return;
		}

		this.ctx.lineWidth = stroke.style.width;
		this.ctx.lineCap = 'round';
		this.ctx.lineJoin = 'round';

		this.ctx.beginPath();
		this.ctx.moveTo(firstPoint.x, firstPoint.y);

		for (let i = 1; i < points.length - 1; i++) {
			const ptCurr = points[i];
			const ptNext = points[i + 1];
			if (!ptCurr || !ptNext) continue;

			const mid = getMidPoint(ptCurr, ptNext);
			this.ctx.quadraticCurveTo(ptCurr.x, ptCurr.y, mid.x, mid.y);
		}

		const lastPoint = points[points.length - 1];
		if (lastPoint) {
			this.ctx.lineTo(lastPoint.x, lastPoint.y);
		}

		this.ctx.stroke();
		this.ctx.restore();
	}

	private renderGeometricShape(shape: GeometricShape, style: StrokeStyle): void {
		const isClosed = shape.isClosed && shape.type !== 'line';

		// 1. Render Semi-transparent Fill for closed shapes if enabled
		if (isClosed && shape.hasFill) {
			this.ctx.save();
			if (style.tool === 'highlighter') {
				this.ctx.globalCompositeOperation = 'multiply';
				this.ctx.fillStyle = shape.fillColor || style.color;
				const fillAlpha =
					(shape.fillOpacity ?? 0.35) * (shape.opacity ?? style.opacity ?? 1.0);
				this.ctx.globalAlpha = Math.max(0.01, Math.min(1.0, fillAlpha));
			} else {
				this.ctx.globalCompositeOperation = 'source-over';
				this.ctx.fillStyle = shape.fillColor || style.color;
				const fillAlpha =
					(shape.fillOpacity ?? 0.25) * (shape.opacity ?? style.opacity ?? 1.0);
				this.ctx.globalAlpha = Math.max(0.01, Math.min(1.0, fillAlpha));
			}

			if (shape.type === 'circle') {
				const center = shape.center;
				if (center) {
					const rx = shape.radiusX ?? 30;
					const ry = shape.radiusY ?? rx;
					this.ctx.beginPath();
					this.ctx.ellipse(
						center.x,
						center.y,
						Math.max(5, rx),
						Math.max(5, ry),
						0,
						0,
						Math.PI * 2,
					);
					this.ctx.fill();
				}
			} else {
				// Triangle, Rectangle, Quad, Polygon
				const corners = shape.handles.filter((h) => h.role === 'corner');
				if (corners.length >= 3) {
					this.ctx.beginPath();
					this.ctx.moveTo(corners[0]!.x, corners[0]!.y);
					for (let i = 1; i < corners.length; i++) {
						this.ctx.lineTo(corners[i]!.x, corners[i]!.y);
					}
					this.ctx.closePath();
					this.ctx.fill();
				}
			}
			this.ctx.restore();
		}

		// 2. Render Stroke with line dash and opacity
		this.ctx.save();
		this.setupContextForStyle(style, shape);
		const isHighlighterShape = style.tool === 'highlighter' && isClosed;
		this.ctx.lineWidth = isHighlighterShape
			? Math.min(8, Math.max(2, style.width * 0.35))
			: style.width;

		if (shape.type === 'line') {
			const start = shape.handles.find((h) => h.role === 'start');
			const mid = shape.handles.find((h) => h.role === 'mid');
			const end = shape.handles.find((h) => h.role === 'end');
			if (!start || !end) {
				this.ctx.restore();
				return;
			}

			this.ctx.beginPath();
			this.ctx.moveTo(start.x, start.y);

			if (mid) {
				const chordMidX = (start.x + end.x) / 2;
				const chordMidY = (start.y + end.y) / 2;
				const distFromChord = Math.hypot(mid.x - chordMidX, mid.y - chordMidY);

				if (distFromChord < 4) {
					// Straight Line
					this.ctx.lineTo(end.x, end.y);
				} else {
					// Arc / curved line passing directly through the mid handle
					const ctrlX = 2 * mid.x - 0.5 * (start.x + end.x);
					const ctrlY = 2 * mid.y - 0.5 * (start.y + end.y);
					this.ctx.quadraticCurveTo(ctrlX, ctrlY, end.x, end.y);
				}
			} else {
				this.ctx.lineTo(end.x, end.y);
			}
			this.ctx.stroke();
		} else if (shape.type === 'circle') {
			const center = shape.center;
			if (!center) {
				this.ctx.restore();
				return;
			}
			const rx = shape.radiusX ?? 30;
			const ry = shape.radiusY ?? rx;

			this.ctx.beginPath();
			this.ctx.ellipse(center.x, center.y, Math.max(5, rx), Math.max(5, ry), 0, 0, Math.PI * 2);
			this.ctx.stroke();
		} else {
			// Triangle, Rectangle, Quad, Polygon
			const corners = shape.handles.filter((h) => h.role === 'corner');
			if (corners.length >= 2) {
				this.ctx.beginPath();
				this.ctx.moveTo(corners[0]!.x, corners[0]!.y);
				for (let i = 1; i < corners.length; i++) {
					this.ctx.lineTo(corners[i]!.x, corners[i]!.y);
				}
				if (shape.isClosed) {
					this.ctx.closePath();
				}
				this.ctx.stroke();
			}
		}
		this.ctx.restore();
	}

	// ----------------------------------------------------
	// Image Management
	// ----------------------------------------------------

	public addImage(img: PageImage): void {
		this.page.images.push(img);
		this.renderImages();
		this.redrawAll();
		this.events.onImageModified?.(this.page.id, img);
		this.events.onPageChanged?.(this.page.id);
	}

	public deselectAllImages(): void {
		const allWrappers = this.imageOverlayEl.querySelectorAll('.betternotebook-image-wrapper');
		allWrappers.forEach((el) => el.removeClass('is-selected'));
	}

	public renderImages(): void {
		this.imageOverlayEl.empty();

		for (const img of this.page.images) {
			const wrapper = this.imageOverlayEl.createDiv({
				cls: 'betternotebook-image-wrapper',
				attr: { 'data-image-id': img.id },
			});
			wrapper.style.left = `${img.x}px`;
			wrapper.style.top = `${img.y}px`;
			wrapper.style.width = `${img.width}px`;
			wrapper.style.height = `${img.height}px`;

			if (img.isLocked) {
				wrapper.addClass('is-locked');

				const lockBadge = wrapper.createDiv({
					cls: 'betternotebook-image-lock-badge',
					title: 'Bildposition gesperrt (Klicken zum Entsperren)',
				});
				setIcon(lockBadge, 'lock');

				lockBadge.addEventListener('pointerdown', (e) => e.stopPropagation());
				lockBadge.addEventListener('click', (e) => {
					e.stopPropagation();
					img.isLocked = false;
					this.renderImages();
					this.events.onImageModified?.(this.page.id, img);
					this.events.onPageChanged?.(this.page.id);
					new Notice('Bildposition entsperrt');
				});
				lockBadge.addEventListener('pointerleave', (e: PointerEvent) => {
					const pt = this.getCanvasPoint(e);
					const cornerW = Math.max(36, Math.min(72, img.width * 0.35));
					const cornerH = Math.max(36, Math.min(72, img.height * 0.35));
					const isInside =
						pt.x >= img.x + img.width - cornerW &&
						pt.x <= img.x + img.width + 16 &&
						pt.y >= img.y - 16 &&
						pt.y <= img.y + cornerH;
					if (!isInside) {
						lockBadge.removeClass('is-visible');
					}
				});

				continue;
			}

			wrapper.addClass('is-unlocked');

			const deleteBtn = wrapper.createDiv({
				cls: 'betternotebook-image-delete-btn',
				title: 'Bild löschen',
			});
			deleteBtn.setText('✕');

			const triggerDelete = (e: Event): void => {
				e.preventDefault();
				e.stopPropagation();
				this.page.images = this.page.images.filter((i) => i.id !== img.id);
				wrapper.remove();
				this.redrawAll();
				this.events.onImageDeleted?.(this.page.id, img);
				this.events.onPageChanged?.(this.page.id);
			};
			deleteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
			deleteBtn.addEventListener('click', triggerDelete);

			const lockBtn = wrapper.createDiv({
				cls: 'betternotebook-image-lock-btn',
				title: 'Position sperren (Fixieren)',
			});
			setIcon(lockBtn, 'unlock');

			const triggerLock = (e: Event): void => {
				e.preventDefault();
				e.stopPropagation();
				img.isLocked = true;
				this.renderImages();
				this.events.onImageModified?.(this.page.id, img);
				this.events.onPageChanged?.(this.page.id);
				new Notice('Bildposition gesperrt (kann jetzt beschrieben werden)');
			};
			lockBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
			lockBtn.addEventListener('click', triggerLock);

			const cropBtn = wrapper.createDiv({
				cls: 'betternotebook-image-crop-btn',
				title: 'Bild zuschneiden',
			});
			setIcon(cropBtn, 'crop');

			const triggerCrop = (e: Event): void => {
				e.preventDefault();
				e.stopPropagation();
				this.openCropModal(img);
			};
			cropBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
			cropBtn.addEventListener('click', triggerCrop);

			wrapper.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const menu = new Menu();
				menu.addItem((item) =>
					item
						.setTitle(img.isLocked ? 'Position entsperren' : 'Position sperren (Fixieren)')
						.setIcon(img.isLocked ? 'unlock' : 'lock')
						.onClick(() => {
							img.isLocked = !img.isLocked;
							this.renderImages();
							this.events.onImageModified?.(this.page.id, img);
							this.events.onPageChanged?.(this.page.id);
							new Notice(img.isLocked ? 'Bildposition gesperrt' : 'Bildposition entsperrt');
						}),
				);
				menu.addItem((item) =>
					item
						.setTitle('Bild zuschneiden...')
						.setIcon('crop')
						.onClick(() => {
							this.openCropModal(img);
						}),
				);
				menu.addItem((item) =>
					item
						.setTitle('Bild löschen')
						.setIcon('trash-2')
						.onClick(() => {
							this.page.images = this.page.images.filter((i) => i.id !== img.id);
							wrapper.remove();
							this.redrawAll();
							this.events.onImageDeleted?.(this.page.id, img);
							this.events.onPageChanged?.(this.page.id);
						}),
				);
				menu.showAtMouseEvent(e);
			});

			const resizeHandle = wrapper.createDiv({
				cls: 'betternotebook-image-resize-handle',
				title: 'Größe anpassen',
			});

			this.attachImageInteractions(wrapper, img, resizeHandle);
		}
	}

	private openCropModal(img: PageImage): void {
		let app = this.app;
		if (!app && typeof window !== 'undefined') {
			app = (window as unknown as { app?: App }).app;
		}
		if (!app) return;

		new ImageCropModal(app, img, (result) => {
			if (!img.originalSrc) {
				img.originalSrc = img.src;
			}
			img.src = result.croppedDataUrl;
			img.width = result.newWidth;
			img.height = result.newHeight;
			this.imageElements.delete(img.id);
			this.renderImages();
			this.redrawAll();
			this.events.onImageModified?.(this.page.id, img);
			this.events.onPageChanged?.(this.page.id);
		}).open();
	}

	private attachImageInteractions(
		wrapper: HTMLElement,
		img: PageImage,
		resizeHandle: HTMLElement,
	): void {
		let isDragging = false;
		let isResizing = false;
		let startX = 0;
		let startY = 0;
		let initialLeft = 0;
		let initialTop = 0;
		let initialW = 0;
		let initialH = 0;

		const selectThisImage = (): void => {
			this.deselectAllImages();
			wrapper.addClass('is-selected');
		};

		wrapper.addEventListener('pointerdown', (e: PointerEvent) => {
			selectThisImage();
			if (e.target === resizeHandle) {
				isResizing = true;
				startX = e.clientX;
				startY = e.clientY;
				initialW = img.width;
				initialH = img.height;
				try {
					resizeHandle.setPointerCapture(e.pointerId);
				} catch {
					// ignore capture error
				}
				e.stopPropagation();
			} else {
				const target = e.target as HTMLElement;
				if (
					target.closest('.betternotebook-image-delete-btn') ||
					target.closest('.betternotebook-image-crop-btn') ||
					target.closest('.betternotebook-image-lock-btn') ||
					target.closest('.betternotebook-image-lock-badge')
				) {
					return;
				}
				isDragging = true;
				startX = e.clientX;
				startY = e.clientY;
				initialLeft = img.x;
				initialTop = img.y;
				try {
					wrapper.setPointerCapture(e.pointerId);
				} catch {
					// ignore capture error
				}
				e.stopPropagation();
			}
		});

		wrapper.addEventListener('pointermove', (e: PointerEvent) => {
			if (isDragging) {
				const rect = this.canvas.getBoundingClientRect();
				const scale = (rect.width || this.cssWidth) / this.cssWidth;
				const dx = (e.clientX - startX) / (scale || 1);
				const dy = (e.clientY - startY) / (scale || 1);
				img.x = Math.max(0, Math.min(this.cssWidth - 50, initialLeft + dx));
				img.y = Math.max(0, Math.min(this.cssHeight - 50, initialTop + dy));
				wrapper.style.left = `${img.x}px`;
				wrapper.style.top = `${img.y}px`;
				this.redrawAll();
			}
		});

		resizeHandle.addEventListener('pointermove', (e: PointerEvent) => {
			if (isResizing) {
				const rect = this.canvas.getBoundingClientRect();
				const scale = (rect.width || this.cssWidth) / this.cssWidth;
				const dx = (e.clientX - startX) / (scale || 1);
				const aspect = (initialW || 1) / (initialH || 1);
				const newW = Math.max(50, Math.min(this.cssWidth - img.x, initialW + dx));
				const newH = Math.max(30, Math.round(newW / aspect));
				img.width = newW;
				img.height = newH;
				wrapper.style.width = `${newW}px`;
				wrapper.style.height = `${newH}px`;
				this.redrawAll();
			}
		});

		const onEnd = (e: PointerEvent): void => {
			if (isDragging) {
				isDragging = false;
				try {
					wrapper.releasePointerCapture(e.pointerId);
				} catch {
					// ignore capture error
				}
				this.redrawAll();
				this.events.onImageModified?.(this.page.id, img);
				this.events.onPageChanged?.(this.page.id);
			}
			if (isResizing) {
				isResizing = false;
				try {
					resizeHandle.releasePointerCapture(e.pointerId);
				} catch {
					// ignore capture error
				}
				this.redrawAll();
				this.events.onImageModified?.(this.page.id, img);
				this.events.onPageChanged?.(this.page.id);
			}
		};

		wrapper.addEventListener('pointerup', onEnd);
		wrapper.addEventListener('pointercancel', onEnd);
		resizeHandle.addEventListener('pointerup', onEnd);
		resizeHandle.addEventListener('pointercancel', onEnd);
	}
}

