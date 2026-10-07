import {
	Point,
	Stroke,
	BoundingBox,
	PageFormat,
	PageOrientation,
	PAGE_FORMAT_DIMENSIONS,
	GeometricShape,
} from '../types';

/**
 * Linearly interpolates between two numeric values.
 */
export function lerp(start: number, end: number, t: number): number {
	return start + (end - start) * t;
}

/**
 * Calculates the midpoint between two coordinate points.
 */
export function getMidPoint(
	p1: { x: number; y: number },
	p2: { x: number; y: number },
): { x: number; y: number } {
	return {
		x: (p1.x + p2.x) / 2,
		y: (p1.y + p2.y) / 2,
	};
}

/**
 * Calculates Euclidean distance between two points.
 */
export function getDistance(
	p1: { x: number; y: number },
	p2: { x: number; y: number },
): number {
	return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Calculates dynamic stroke width from stylus pressure.
 */
export function computeTargetWidth(
	baseWidth: number,
	pressure: number,
	isPen: boolean,
	sensitivity = 2.0,
): number {
	if (!isPen || pressure <= 0) {
		return baseWidth;
	}

	const clampedPressure = Math.max(0.05, Math.min(1.0, pressure));
	const dynamicFactor = Math.pow(clampedPressure, 0.85) * sensitivity;
	const minWidth = Math.max(0.6, baseWidth * 0.25);
	const maxWidth = baseWidth * 2.8;

	return Math.max(minWidth, Math.min(maxWidth, baseWidth * dynamicFactor));
}

/**
 * Computes axis-aligned bounding box for a series of stroke points.
 * Used for ultra-fast spatial culling on low-end hardware.
 */
export function computeBoundingBox(
	points: Point[],
	padding = 4,
): BoundingBox {
	if (points.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}

	return {
		minX: minX - padding,
		minY: minY - padding,
		maxX: maxX + padding,
		maxY: maxY + padding,
	};
}

/**
 * Calculates the shortest distance from point (px, py) to line segment (x1, y1)-(x2, y2).
 */
export function distanceToSegment(
	px: number,
	py: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const lenSq = dx * dx + dy * dy;

	if (lenSq === 0) {
		return Math.hypot(px - x1, py - y1);
	}

	// Projection factor t clamped to [0, 1]
	const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
	const projX = x1 + t * dx;
	const projY = y1 + t * dy;

	return Math.hypot(px - projX, py - projY);
}

/**
 * Computes accurate bounding box for a geometric shape.
 */
export function computeShapeBoundingBox(
	shape: GeometricShape,
	strokeWidth = 2.5,
): BoundingBox {
	const pad = strokeWidth + 14;
	if (shape.type === 'circle' && shape.center) {
		const rx = shape.radiusX ?? 30;
		const ry = shape.radiusY ?? rx;
		return {
			minX: shape.center.x - rx - pad,
			minY: shape.center.y - ry - pad,
			maxX: shape.center.x + rx + pad,
			maxY: shape.center.y + ry + pad,
		};
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const h of shape.handles) {
		if (h.x < minX) minX = h.x;
		if (h.x > maxX) maxX = h.x;
		if (h.y < minY) minY = h.y;
		if (h.y > maxY) maxY = h.y;
	}
	if (minX === Infinity) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	}
	return {
		minX: minX - pad,
		minY: minY - pad,
		maxX: maxX + pad,
		maxY: maxY + pad,
	};
}

/**
 * Checks if point (x, y) is inside a polygon using ray-casting.
 */
export function isPointInPolygon(
	corners: { x: number; y: number }[],
	x: number,
	y: number,
): boolean {
	let inside = false;
	for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
		const xi = corners[i]!.x;
		const yi = corners[i]!.y;
		const xj = corners[j]!.x;
		const yj = corners[j]!.y;
		const intersect =
			yi > y !== yj > y && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}
	return inside;
}

/**
 * High-performance stroke hit-testing for vector eraser and shape selection.
 * Supports freehand strokes, lines, arcs, circles, rectangles, and polygons.
 */
export function isPointNearStroke(
	stroke: Stroke,
	x: number,
	y: number,
	eraserRadius: number,
): boolean {
	const threshold = eraserRadius + stroke.style.width / 2;

	// 1. Fast AABB culling
	const bbox = stroke.bbox;
	if (bbox) {
		if (
			x < bbox.minX - threshold ||
			x > bbox.maxX + threshold ||
			y < bbox.minY - threshold ||
			y > bbox.maxY + threshold
		) {
			return false;
		}
	}

	// 2. Geometric Shape check
	if (stroke.shape) {
		const shape = stroke.shape;
		if (shape.type === 'circle' && shape.center) {
			const distCenter = Math.hypot(x - shape.center.x, y - shape.center.y);
			const rx = shape.radiusX ?? 30;
			// Touches circumference OR inside the circle area
			return distCenter <= rx + threshold;
		} else if (shape.type === 'line') {
			const start = shape.handles.find((h) => h.role === 'start');
			const end = shape.handles.find((h) => h.role === 'end');
			const mid = shape.handles.find((h) => h.role === 'mid');
			if (start && end) {
				if (
					mid &&
					Math.hypot(mid.x - (start.x + end.x) / 2, mid.y - (start.y + end.y) / 2) >= 4
				) {
					if (
						distanceToSegment(x, y, start.x, start.y, mid.x, mid.y) <= threshold ||
						distanceToSegment(x, y, mid.x, mid.y, end.x, end.y) <= threshold
					) {
						return true;
					}
				} else if (distanceToSegment(x, y, start.x, start.y, end.x, end.y) <= threshold) {
					return true;
				}
			}
			return false;
		} else {
			// Triangle, Rectangle, Quad, Polygon
			const corners = shape.handles.filter((h) => h.role === 'corner');
			// Check inside polygon
			if (corners.length >= 3 && isPointInPolygon(corners, x, y)) {
				return true;
			}
			// Check edges
			for (let i = 0; i < corners.length; i++) {
				const nextIdx = (i + 1) % corners.length;
				if (nextIdx === 0 && !shape.isClosed) continue;
				const c1 = corners[i];
				const c2 = corners[nextIdx];
				if (c1 && c2 && distanceToSegment(x, y, c1.x, c1.y, c2.x, c2.y) <= threshold) {
					return true;
				}
			}
			return false;
		}
	}

	// 3. Raw vector stroke check
	const pts = stroke.points;
	if (pts.length === 0) return false;

	if (pts.length === 1) {
		const first = pts[0];
		if (!first) return false;
		return Math.hypot(x - first.x, y - first.y) <= threshold;
	}

	for (let i = 0; i < pts.length - 1; i++) {
		const p1 = pts[i];
		const p2 = pts[i + 1];
		if (!p1 || !p2) continue;

		const dist = distanceToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
		if (dist <= threshold) {
			return true;
		}
	}

	return false;
}

/**
 * Computes CSS pixel dimensions for a given page format and orientation.
 */
export function getPageDimensions(
	format: PageFormat,
	orientation: PageOrientation,
): { width: number; height: number } {
	const base = PAGE_FORMAT_DIMENSIONS[format] ?? PAGE_FORMAT_DIMENSIONS.a4;
	if (orientation === 'landscape') {
		return { width: base.height, height: base.width };
	}
	return { width: base.width, height: base.height };
}

/**
 * Hit test for selecting geometric shapes: returns true if point is on the border or inside a closed shape.
 */
export function isPointInsideOrNearShape(
	stroke: Stroke,
	x: number,
	y: number,
	tolerance = 14,
): boolean {
	return isPointNearStroke(stroke, x, y, tolerance);
}
