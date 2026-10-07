export interface ZoomControllerOptions {
	scrollContainerEl: HTMLElement;
	zoomSizerEl: HTMLElement;
	zoomContentEl: HTMLElement;
	minZoom?: number;
	maxZoom?: number;
	initialZoom?: number;
	onZoomChanged?: (zoom: number) => void;
	onGestureStart?: () => void;
	onGestureEnd?: () => void;
	cancelActiveStrokes?: () => void;
	stylusOnlyMode?: boolean;
}

export class ZoomController {
	public zoom = 1.0;
	public readonly minZoom: number;
	public readonly maxZoom: number;
	public stylusOnlyMode = false;

	private scrollContainerEl: HTMLElement;
	private zoomSizerEl: HTMLElement;
	private zoomContentEl: HTMLElement;
	private options: ZoomControllerOptions;

	private isPinching = false;
	private pinchCooldownUntil = 0;

	// Single finger touch panning (for stylusOnlyMode)
	private isSingleTouchPanning = false;
	private singleTouchLastX = 0;
	private singleTouchLastY = 0;
	private singlePointerLastX = 0;
	private singlePointerLastY = 0;

	// Touch tracking
	private touchStartDistance = 1;
	private touchStartMidX = 0;
	private touchStartMidY = 0;
	private touchLastMidX = 0;
	private touchLastMidY = 0;
	private touchStartZoom = 1.0;

	private wheelDebounceTimer: number | null = null;

	// PointerEvents tracking fallback (for touchscreen laptops / Windows touch)
	private activeTouchPointers = new Map<number, { clientX: number; clientY: number }>();
	private pointerStartDistance = 1;
	private pointerStartZoom = 1.0;
	private pointerLastMidX = 0;
	private pointerLastMidY = 0;

	constructor(options: ZoomControllerOptions) {
		this.options = options;
		this.scrollContainerEl = options.scrollContainerEl;
		this.zoomSizerEl = options.zoomSizerEl;
		this.zoomContentEl = options.zoomContentEl;
		this.minZoom = options.minZoom ?? 0.25;
		this.maxZoom = options.maxZoom ?? 4.0;
		this.zoom = options.initialZoom ?? 1.0;
		this.stylusOnlyMode = options.stylusOnlyMode ?? false;

		this.attachEvents();
	}

	public setStylusOnlyMode(enabled: boolean): void {
		this.stylusOnlyMode = enabled;
	}

	public isGestureActive(): boolean {
		return this.isPinching || Date.now() < this.pinchCooldownUntil;
	}

	public setZoom(targetZoom: number, pivotClientX?: number, pivotClientY?: number): void {
		const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));
		const oldZoom = this.zoom;
		if (Math.abs(newZoom - oldZoom) < 0.0005) return;

		const containerRect = this.scrollContainerEl.getBoundingClientRect();

		// Default pivot to center of scroll container if not specified
		const pX = pivotClientX !== undefined ? pivotClientX : containerRect.left + containerRect.width / 2;
		const pY = pivotClientY !== undefined ? pivotClientY : containerRect.top + containerRect.height / 2;

		const viewX = pX - containerRect.left;
		const viewY = pY - containerRect.top;

		const currentScrollLeft = this.scrollContainerEl.scrollLeft;
		const currentScrollTop = this.scrollContainerEl.scrollTop;

		const sizerX = currentScrollLeft + viewX;
		const sizerY = currentScrollTop + viewY;

		const oldContentLeft = parseFloat(this.zoomContentEl.style.left) || 0;
		const oldContentTop = parseFloat(this.zoomContentEl.style.top) || 0;

		// Unscaled content coordinates under cursor
		const unscaledX = (sizerX - oldContentLeft) / oldZoom;
		const unscaledY = (sizerY - oldContentTop) / oldZoom;

		this.zoom = newZoom;
		this.updateLayout();

		const newContentLeft = parseFloat(this.zoomContentEl.style.left) || 0;
		const newContentTop = parseFloat(this.zoomContentEl.style.top) || 0;

		const newSizerX = newContentLeft + unscaledX * newZoom;
		const newSizerY = newContentTop + unscaledY * newZoom;

		this.scrollContainerEl.scrollLeft = Math.max(0, newSizerX - viewX);
		this.scrollContainerEl.scrollTop = Math.max(0, newSizerY - viewY);

		this.options.onZoomChanged?.(this.zoom);
	}

	public resetZoom(): void {
		this.setZoom(1.0);
		this.options.onGestureEnd?.();
	}

	public zoomIn(): void {
		this.setZoom(this.zoom * 1.25);
		this.options.onGestureEnd?.();
	}

	public zoomOut(): void {
		this.setZoom(this.zoom / 1.25);
		this.options.onGestureEnd?.();
	}

	public updateLayout(maxPageWidth?: number): void {
		if (!this.scrollContainerEl || !this.zoomSizerEl || !this.zoomContentEl) return;

		const viewportW = this.scrollContainerEl.clientWidth;
		const viewportH = this.scrollContainerEl.clientHeight;

		// Find max page width if not supplied
		let baseW = maxPageWidth || 0;
		if (!baseW) {
			const pageEls = this.zoomContentEl.querySelectorAll<HTMLElement>('.betternotebook-page');
			pageEls.forEach((el) => {
				const w = el.offsetWidth || parseFloat(el.style.width) || 0;
				if (w > baseW) baseW = w;
			});
		}
		if (!baseW) baseW = 794; // A4 standard fallback

		const scaledW = baseW * this.zoom;
		const paddingX = 32;
		const paddingY = 40;

		// Determine natural unscaled height of content
		const naturalH = this.zoomContentEl.scrollHeight || 1123;
		const scaledH = naturalH * this.zoom;

		const sizerW = Math.max(viewportW, Math.round(scaledW + paddingX * 2));
		const sizerH = Math.max(viewportH, Math.round(scaledH + paddingY * 2 + 60));

		this.zoomSizerEl.style.width = `${sizerW}px`;
		this.zoomSizerEl.style.height = `${sizerH}px`;

		const left = Math.max(paddingX, Math.round((sizerW - scaledW) / 2));
		this.zoomContentEl.style.left = `${left}px`;
		this.zoomContentEl.style.top = `${paddingY}px`;
		this.zoomContentEl.style.transform = `scale(${this.zoom})`;
	}

	private attachEvents(): void {
		// 1. Touchpad (Trackpad) pinch-to-zoom OR Ctrl + Mouse Wheel
		this.scrollContainerEl.addEventListener('wheel', this.onWheel, { passive: false });

		// 2. Touchscreen 2-Finger Pinch & Pan
		this.scrollContainerEl.addEventListener('touchstart', this.onTouchStart, {
			capture: true,
			passive: false,
		});
		this.scrollContainerEl.addEventListener('touchmove', this.onTouchMove, {
			capture: true,
			passive: false,
		});
		this.scrollContainerEl.addEventListener('touchend', this.onTouchEnd, {
			capture: true,
			passive: false,
		});
		this.scrollContainerEl.addEventListener('touchcancel', this.onTouchEnd, {
			capture: true,
			passive: false,
		});

		// 3. PointerEvents fallback for touchscreen laptops
		this.scrollContainerEl.addEventListener('pointerdown', this.onPointerDown, {
			capture: true,
		});
		this.scrollContainerEl.addEventListener('pointermove', this.onPointerMove, {
			capture: true,
		});
		this.scrollContainerEl.addEventListener('pointerup', this.onPointerUp, {
			capture: true,
		});
		this.scrollContainerEl.addEventListener('pointercancel', this.onPointerUp, {
			capture: true,
		});
	}

	private onWheel = (e: WheelEvent): void => {
		if (e.ctrlKey) {
			e.preventDefault();
			e.stopPropagation();

			// Exponential scale factor for buttery-smooth trackpad pinch
			const delta = -e.deltaY * 0.007;
			const factor = Math.exp(delta);
			this.setZoom(this.zoom * factor, e.clientX, e.clientY);

			if (this.wheelDebounceTimer !== null) {
				window.clearTimeout(this.wheelDebounceTimer);
			}
			this.wheelDebounceTimer = window.setTimeout(() => {
				this.options.onGestureEnd?.();
				this.wheelDebounceTimer = null;
			}, 250);
		}
	};

	private onTouchStart = (e: TouchEvent): void => {
		if (e.touches.length >= 2) {
			this.isSingleTouchPanning = false;
			this.isPinching = true;
			this.options.cancelActiveStrokes?.();
			this.options.onGestureStart?.();

			const t1 = e.touches[0];
			const t2 = e.touches[1];
			if (!t1 || !t2) return;

			this.touchStartDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
			this.touchStartMidX = (t1.clientX + t2.clientX) / 2;
			this.touchStartMidY = (t1.clientY + t2.clientY) / 2;
			this.touchLastMidX = this.touchStartMidX;
			this.touchLastMidY = this.touchStartMidY;
			this.touchStartZoom = this.zoom;
		} else if (e.touches.length === 1 && this.stylusOnlyMode) {
			const t = e.touches[0];
			if (t) {
				this.singleTouchLastX = t.clientX;
				this.singleTouchLastY = t.clientY;
				this.isSingleTouchPanning = true;
			}
		}
	};

	private onTouchMove = (e: TouchEvent): void => {
		if (e.touches.length >= 2 && this.isPinching) {
			e.preventDefault();
			e.stopPropagation();

			const t1 = e.touches[0];
			const t2 = e.touches[1];
			if (!t1 || !t2) return;

			const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
			const midX = (t1.clientX + t2.clientX) / 2;
			const midY = (t1.clientY + t2.clientY) / 2;

			const scaleRatio = dist / this.touchStartDistance;
			const targetZoom = this.touchStartZoom * scaleRatio;

			// Zoom centered around current midpoint
			this.setZoom(targetZoom, midX, midY);

			// Two-finger pan (scrolling)
			const deltaX = midX - this.touchLastMidX;
			const deltaY = midY - this.touchLastMidY;
			this.scrollContainerEl.scrollLeft -= deltaX;
			this.scrollContainerEl.scrollTop -= deltaY;

			this.touchLastMidX = midX;
			this.touchLastMidY = midY;
		} else if (e.touches.length === 1 && this.isSingleTouchPanning && this.stylusOnlyMode) {
			const t = e.touches[0];
			if (t) {
				const deltaX = t.clientX - this.singleTouchLastX;
				const deltaY = t.clientY - this.singleTouchLastY;
				this.scrollContainerEl.scrollLeft -= deltaX;
				this.scrollContainerEl.scrollTop -= deltaY;
				this.singleTouchLastX = t.clientX;
				this.singleTouchLastY = t.clientY;
			}
		}
	};

	private onTouchEnd = (e: TouchEvent): void => {
		if (e.touches.length === 0) {
			this.isSingleTouchPanning = false;
		}
		if (e.touches.length < 2 && this.isPinching) {
			this.isPinching = false;
			this.pinchCooldownUntil = Date.now() + 150;
			this.options.onGestureEnd?.();
		}
	};

	private onPointerDown = (e: PointerEvent): void => {
		if (e.pointerType === 'touch') {
			this.activeTouchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

			if (this.activeTouchPointers.size >= 2) {
				this.isPinching = true;
				this.options.cancelActiveStrokes?.();
				this.options.onGestureStart?.();

				const pts = Array.from(this.activeTouchPointers.values());
				const p1 = pts[0];
				const p2 = pts[1];
				if (!p1 || !p2) return;

				this.pointerStartDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY) || 1;
				this.pointerLastMidX = (p1.clientX + p2.clientX) / 2;
				this.pointerLastMidY = (p1.clientY + p2.clientY) / 2;
				this.pointerStartZoom = this.zoom;
			} else if (this.activeTouchPointers.size === 1 && this.stylusOnlyMode) {
				this.singlePointerLastX = e.clientX;
				this.singlePointerLastY = e.clientY;
			}
		}
	};

	private onPointerMove = (e: PointerEvent): void => {
		if (e.pointerType === 'touch' && this.activeTouchPointers.has(e.pointerId)) {
			this.activeTouchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

			if (this.activeTouchPointers.size >= 2 && this.isPinching) {
				const pts = Array.from(this.activeTouchPointers.values());
				const p1 = pts[0];
				const p2 = pts[1];
				if (!p1 || !p2) return;

				const dist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY) || 1;
				const midX = (p1.clientX + p2.clientX) / 2;
				const midY = (p1.clientY + p2.clientY) / 2;

				const scaleRatio = dist / this.pointerStartDistance;
				const targetZoom = this.pointerStartZoom * scaleRatio;

				this.setZoom(targetZoom, midX, midY);

				const deltaX = midX - this.pointerLastMidX;
				const deltaY = midY - this.pointerLastMidY;
				this.scrollContainerEl.scrollLeft -= deltaX;
				this.scrollContainerEl.scrollTop -= deltaY;

				this.pointerLastMidX = midX;
				this.pointerLastMidY = midY;
			} else if (this.activeTouchPointers.size === 1 && this.stylusOnlyMode && !this.isPinching) {
				const deltaX = e.clientX - this.singlePointerLastX;
				const deltaY = e.clientY - this.singlePointerLastY;
				this.scrollContainerEl.scrollLeft -= deltaX;
				this.scrollContainerEl.scrollTop -= deltaY;
				this.singlePointerLastX = e.clientX;
				this.singlePointerLastY = e.clientY;
			}
		}
	};

	private onPointerUp = (e: PointerEvent): void => {
		if (e.pointerType === 'touch') {
			this.activeTouchPointers.delete(e.pointerId);
			if (this.activeTouchPointers.size < 2 && this.isPinching) {
				this.isPinching = false;
				this.pinchCooldownUntil = Date.now() + 150;
				this.options.onGestureEnd?.();
			}
		}
	};

	public destroy(): void {
		if (this.wheelDebounceTimer !== null) {
			window.clearTimeout(this.wheelDebounceTimer);
			this.wheelDebounceTimer = null;
		}
		this.scrollContainerEl.removeEventListener('wheel', this.onWheel);
		this.scrollContainerEl.removeEventListener('touchstart', this.onTouchStart, { capture: true });
		this.scrollContainerEl.removeEventListener('touchmove', this.onTouchMove, { capture: true });
		this.scrollContainerEl.removeEventListener('touchend', this.onTouchEnd, { capture: true });
		this.scrollContainerEl.removeEventListener('touchcancel', this.onTouchEnd, { capture: true });
		this.scrollContainerEl.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
		this.scrollContainerEl.removeEventListener('pointermove', this.onPointerMove, { capture: true });
		this.scrollContainerEl.removeEventListener('pointerup', this.onPointerUp, { capture: true });
		this.scrollContainerEl.removeEventListener('pointercancel', this.onPointerUp, { capture: true });
		this.activeTouchPointers.clear();
	}
}
