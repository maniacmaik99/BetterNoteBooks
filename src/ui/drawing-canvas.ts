import { Point, Stroke, StrokeStyle, DrawingTool } from '../types';
import { lerp, getMidPoint, computeTargetWidth } from '../utils/interpolation';

export interface DrawingCanvasOptions {
	container: HTMLElement;
	defaultColor?: string;
	defaultWidth?: number;
	smoothingFactor?: number;
	pressureSensitivity?: number;
}

export class DrawingCanvas {
	private container: HTMLElement;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private resizeObserver: ResizeObserver | null = null;

	// Stroke collection & vector state
	private strokes: Stroke[] = [];
	private currentStroke: Stroke | null = null;
	private currentPoints: Point[] = [];
	private lastMidPoint: { x: number; y: number } | null = null;

	// Active drawing parameters
	private isDrawing = false;
	private activePointerId: number | null = null;
	private currentLineWidth = 2.5;

	// Tool & style state
	private currentStyle: StrokeStyle;
	private pressureSensitivity: number;

	// HiDPI tracking
	private currentDpr = 1;

	constructor(options: DrawingCanvasOptions) {
		this.container = options.container;
		this.pressureSensitivity = options.pressureSensitivity ?? 2.0;

		this.currentStyle = {
			color: options.defaultColor ?? '#2c2c2c',
			width: options.defaultWidth ?? 2.5,
			tool: 'pen',
			smoothing: options.smoothingFactor ?? 0.35,
		};

		this.currentLineWidth = this.currentStyle.width;

		// Setup canvas DOM
		this.canvas = this.container.createEl('canvas', {
			cls: 'betternotebook-canvas',
		});

		const context = this.canvas.getContext('2d', {
			desynchronized: true,
			alpha: false,
		});

		if (!context) {
			throw new Error('Could not get 2d context for canvas');
		}
		this.ctx = context;

		this.initHiDPI();
		this.attachEventListeners();
	}

	public getCanvasElement(): HTMLCanvasElement {
		return this.canvas;
	}

	public setStyle(style: Partial<StrokeStyle>): void {
		this.currentStyle = {
			...this.currentStyle,
			...style,
		};
	}

	public setColor(color: string): void {
		this.currentStyle.color = color;
	}

	public setWidth(width: number): void {
		this.currentStyle.width = width;
	}

	public setTool(tool: DrawingTool): void {
		this.currentStyle.tool = tool;
	}

	public getStrokes(): Stroke[] {
		return this.strokes;
	}

	public setStrokes(strokes: Stroke[]): void {
		this.strokes = [...strokes];
		this.redrawAll();
	}

	public undo(): boolean {
		if (this.strokes.length === 0) return false;
		this.strokes.pop();
		this.redrawAll();
		return true;
	}

	public clear(): void {
		this.strokes = [];
		this.redrawAll();
	}

	private getDpr(): number {
		const doc = this.canvas.ownerDocument;
		const win = doc.defaultView || window;
		return win.devicePixelRatio || 1;
	}

	/**
	 * Configures HiDPI scaling and handles automatic resizing via ResizeObserver.
	 */
	private initHiDPI(): void {
		this.currentDpr = this.getDpr();

		this.resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					this.handleResize(width, height);
				}
			}
		});

		this.resizeObserver.observe(this.container);

		// Initial sizing
		const rect = this.container.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) {
			this.handleResize(rect.width, rect.height);
		}
	}

	/**
	 * Resizes the canvas backbuffer according to devicePixelRatio
	 * and scales the drawing context for crisp rendering on HiDPI displays.
	 */
	private handleResize(cssWidth: number, cssHeight: number): void {
		const dpr = this.getDpr();
		this.currentDpr = dpr;

		const targetPixelWidth = Math.round(cssWidth * dpr);
		const targetPixelHeight = Math.round(cssHeight * dpr);

		// Only reallocate if dimensions changed
		if (
			this.canvas.width !== targetPixelWidth ||
			this.canvas.height !== targetPixelHeight
		) {
			this.canvas.width = targetPixelWidth;
			this.canvas.height = targetPixelHeight;
			this.canvas.style.width = `${cssWidth}px`;
			this.canvas.style.height = `${cssHeight}px`;

			// Scale all drawing operations to match CSS pixels
			this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// Repaint existing strokes crisply
			this.redrawAll();
		}
	}

	private attachEventListeners(): void {
		this.canvas.addEventListener('pointerdown', this.onPointerDown);
		this.canvas.addEventListener('pointermove', this.onPointerMove);
		this.canvas.addEventListener('pointerup', this.onPointerUp);
		this.canvas.addEventListener('pointercancel', this.onPointerCancel);
	}

	public destroy(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		this.canvas.removeEventListener('pointerdown', this.onPointerDown);
		this.canvas.removeEventListener('pointermove', this.onPointerMove);
		this.canvas.removeEventListener('pointerup', this.onPointerUp);
		this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
	}

	private getCanvasPoint(e: PointerEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		};
	}

	private onPointerDown = (e: PointerEvent): void => {
		// Only primary pointer button (left click / stylus contact)
		if (e.button !== 0 && e.pointerType === 'mouse') return;

		try {
			this.canvas.setPointerCapture(e.pointerId);
		} catch {
			// Some browsers or environments may not support pointer capture
		}

		this.isDrawing = true;
		this.activePointerId = e.pointerId;

		const { x, y } = this.getCanvasPoint(e);
		const isPen = e.pointerType === 'pen';

		this.currentLineWidth = computeTargetWidth(
			this.currentStyle.width,
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
			style: { ...this.currentStyle },
		};

		this.lastMidPoint = { x, y };

		// Render initial touch / dot
		this.setupContextForStyle(this.currentStyle);
		this.ctx.beginPath();
		this.ctx.arc(x, y, this.currentLineWidth / 2, 0, Math.PI * 2);
		this.ctx.fillStyle = this.currentStyle.color;
		this.ctx.fill();
	};

	private onPointerMove = (e: PointerEvent): void => {
		if (!this.isDrawing || this.activePointerId !== e.pointerId) return;

		const isPen = e.pointerType === 'pen';

		// Use hardware coalesced events for maximum accuracy on stylus / high-Hz screens
		const coalescedEvents =
			typeof e.getCoalescedEvents === 'function'
				? e.getCoalescedEvents()
				: [e];

		for (const event of coalescedEvents) {
			const { x, y } = this.getCanvasPoint(event);

			const prevPoint = this.currentPoints[this.currentPoints.length - 1];
			if (prevPoint) {
				const dx = x - prevPoint.x;
				const dy = y - prevPoint.y;
				// Filter micro-jitter below threshold
				if (dx * dx + dy * dy < 0.25) continue;
			}

			// Smooth pressure and line width with Lerp
			const targetWidth = computeTargetWidth(
				this.currentStyle.width,
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
				x,
				y,
				pressure: event.pressure,
				time: event.timeStamp,
			};

			this.currentPoints.push(currentPt);
			this.currentStroke?.points.push(currentPt);

			if (this.currentPoints.length >= 2 && this.lastMidPoint) {
				const pPrev =
					this.currentPoints[this.currentPoints.length - 2] ?? currentPt;
				const mid = getMidPoint(pPrev, currentPt);

				this.setupContextForStyle(this.currentStyle);
				this.ctx.lineWidth = this.currentLineWidth;

				this.ctx.beginPath();
				this.ctx.moveTo(this.lastMidPoint.x, this.lastMidPoint.y);
				this.ctx.quadraticCurveTo(pPrev.x, pPrev.y, mid.x, mid.y);
				this.ctx.stroke();

				this.lastMidPoint = mid;
			}
		}
	};

	private onPointerUp = (e: PointerEvent): void => {
		if (!this.isDrawing || this.activePointerId !== e.pointerId) return;
		this.finishStroke(e);
	};

	private onPointerCancel = (e: PointerEvent): void => {
		if (!this.isDrawing || this.activePointerId !== e.pointerId) return;
		this.finishStroke(e);
	};

	private finishStroke(e: PointerEvent): void {
		if (this.currentPoints.length >= 2 && this.lastMidPoint) {
			const lastPoint =
				this.currentPoints[this.currentPoints.length - 1];
			if (lastPoint) {
				this.setupContextForStyle(this.currentStyle);
				this.ctx.lineWidth = this.currentLineWidth;
				this.ctx.beginPath();
				this.ctx.moveTo(this.lastMidPoint.x, this.lastMidPoint.y);
				this.ctx.lineTo(lastPoint.x, lastPoint.y);
				this.ctx.stroke();
			}
		}

		if (this.currentStroke && this.currentStroke.points.length > 0) {
			this.strokes.push(this.currentStroke);
		}

		try {
			this.canvas.releasePointerCapture(e.pointerId);
		} catch {
			// ignore release errors
		}

		this.isDrawing = false;
		this.activePointerId = null;
		this.currentStroke = null;
		this.currentPoints = [];
		this.lastMidPoint = null;
	}

	private setupContextForStyle(style: StrokeStyle): void {
		this.ctx.lineCap = 'round';
		this.ctx.lineJoin = 'round';
		this.ctx.strokeStyle = style.color;
		this.ctx.fillStyle = style.color;

		if (style.tool === 'highlighter') {
			this.ctx.globalAlpha = 0.35;
		} else {
			this.ctx.globalAlpha = 1.0;
		}
	}

	/**
	 * Clears and repaints all stored vector strokes using smooth quadratic bezier curves.
	 */
	public redrawAll(): void {
		// Clear canvas
		this.ctx.save();
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.fillStyle = '#ffffff';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.restore();

		// Set HiDPI scale
		this.ctx.setTransform(
			this.currentDpr,
			0,
			0,
			this.currentDpr,
			0,
			0,
		);

		for (const stroke of this.strokes) {
			this.renderStroke(stroke);
		}
	}

	private renderStroke(stroke: Stroke): void {
		const points = stroke.points;
		if (points.length === 0) return;

		this.setupContextForStyle(stroke.style);

		const firstPoint = points[0];
		if (!firstPoint) return;

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
		if (!secondPoint) return;

		let lastMid = getMidPoint(firstPoint, secondPoint);

		// Draw initial segment from firstPoint to initial midpoint
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

		// Connect last midpoint to final point
		const lastPoint = points[points.length - 1];
		if (lastPoint) {
			this.ctx.beginPath();
			this.ctx.moveTo(lastMid.x, lastMid.y);
			this.ctx.lineTo(lastPoint.x, lastPoint.y);
			this.ctx.lineWidth = currentW;
			this.ctx.stroke();
		}
	}
}
