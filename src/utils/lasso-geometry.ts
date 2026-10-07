import {
	Stroke,
	PageImage,
	BoundingBox,
	LassoSelectionMode,
	LassoFilterSettings,
} from '../types';
import {
	isPointInPolygon,
	computeBoundingBox,
	computeShapeBoundingBox,
} from './geometry';

/**
 * Checks whether a stroke matches the lasso filter settings.
 */
export function doesStrokeMatchFilter(
	stroke: Stroke,
	filter: LassoFilterSettings,
): boolean {
	if (stroke.isLocked || stroke.shape?.isLocked) {
		return false;
	}
	if (filter.all) {
		return true;
	}
	if (stroke.shape) {
		return !!filter.shapes;
	}
	if (stroke.style.tool === 'highlighter') {
		return !!filter.highlighter;
	}
	if (stroke.style.tool === 'pen') {
		return !!filter.handwriting;
	}
	return true;
}

/**
 * Checks whether an image matches the lasso filter settings.
 */
export function doesImageMatchFilter(
	image: PageImage,
	filter: LassoFilterSettings,
): boolean {
	if (image.isLocked) {
		return false;
	}
	if (filter.all) {
		return true;
	}
	return !!filter.images;
}

/**
 * Checks if a stroke is selected by the lasso selection.
 */
export function isStrokeSelectedByLasso(
	stroke: Stroke,
	lassoPoints: { x: number; y: number }[],
	mode: LassoSelectionMode,
	rectBounds?: BoundingBox,
): boolean {
	if (stroke.isLocked || stroke.shape?.isLocked) {
		return false;
	}

	if (mode === 'rectangle') {
		if (!rectBounds) return false;
		const rMinX = Math.min(rectBounds.minX, rectBounds.maxX);
		const rMaxX = Math.max(rectBounds.minX, rectBounds.maxX);
		const rMinY = Math.min(rectBounds.minY, rectBounds.maxY);
		const rMaxY = Math.max(rectBounds.minY, rectBounds.maxY);

		// Geometric Shape hit-test in rectangle mode
		if (stroke.shape) {
			const shape = stroke.shape;
			if (shape.type === 'circle' && shape.center) {
				const rx = shape.radiusX ?? 30;
				const ry = shape.radiusY ?? rx;
				// Check 8 circumference points
				let circInside = 0;
				for (let i = 0; i < 8; i++) {
					const angle = (i * Math.PI) / 4;
					const px = shape.center.x + rx * Math.cos(angle);
					const py = shape.center.y + ry * Math.sin(angle);
					if (px >= rMinX && px <= rMaxX && py >= rMinY && py <= rMaxY) {
						circInside++;
					}
				}
				return circInside >= 5;
			}

			if (shape.type === 'line') {
				const start = shape.handles.find((h) => h.role === 'start');
				const end = shape.handles.find((h) => h.role === 'end');
				if (start && end) {
					const startIn = start.x >= rMinX && start.x <= rMaxX && start.y >= rMinY && start.y <= rMaxY;
					const endIn = end.x >= rMinX && end.x <= rMaxX && end.y >= rMinY && end.y <= rMaxY;
					return startIn && endIn;
				}
				return false;
			}

			// Closed shapes: require at least 70% of corners to be inside the rectangle
			const corners = shape.handles.filter((h) => h.role === 'corner');
			if (corners.length > 0) {
				let cornersIn = 0;
				for (const c of corners) {
					if (c.x >= rMinX && c.x <= rMaxX && c.y >= rMinY && c.y <= rMaxY) {
						cornersIn++;
					}
				}
				return cornersIn / corners.length >= 0.7;
			}
			return false;
		}

		// Raw vector stroke hit-test in rectangle
		const pts = stroke.points;
		if (pts.length === 0) return false;

		// Fast AABB check
		const sBbox = stroke.bbox || computeBoundingBox(pts, stroke.style.width);
		if (
			sBbox.maxX < rMinX ||
			sBbox.minX > rMaxX ||
			sBbox.maxY < rMinY ||
			sBbox.minY > rMaxY
		) {
			return false;
		}

		if (pts.length <= 3) {
			return pts.every((p) => p.x >= rMinX && p.x <= rMaxX && p.y >= rMinY && p.y <= rMaxY);
		}

		// Require at least 60% of sampled points to be inside the rectangle
		const sampleCount = Math.min(25, pts.length);
		const sampleStep = Math.max(1, Math.floor(pts.length / sampleCount));
		let insideCount = 0;
		let totalSampled = 0;

		for (let i = 0; i < pts.length; i += sampleStep) {
			const p = pts[i];
			if (p) {
				totalSampled++;
				if (p.x >= rMinX && p.x <= rMaxX && p.y >= rMinY && p.y <= rMaxY) {
					insideCount++;
				}
			}
		}

		return totalSampled > 0 && insideCount / totalSampled >= 0.6;
	}

	// Freehand mode (polygon ray-casting)
	if (lassoPoints.length < 3) return false;

	if (stroke.shape) {
		const shape = stroke.shape;
		if (shape.type === 'circle' && shape.center) {
			const rx = shape.radiusX ?? 30;
			const ry = shape.radiusY ?? rx;
			let circInside = 0;
			for (let i = 0; i < 8; i++) {
				const angle = (i * Math.PI) / 4;
				const px = shape.center.x + rx * Math.cos(angle);
				const py = shape.center.y + ry * Math.sin(angle);
				if (isPointInPolygon(lassoPoints, px, py)) {
					circInside++;
				}
			}
			return circInside >= 5;
		}

		if (shape.type === 'line') {
			const start = shape.handles.find((h) => h.role === 'start');
			const end = shape.handles.find((h) => h.role === 'end');
			if (start && end) {
				const startIn = isPointInPolygon(lassoPoints, start.x, start.y);
				const endIn = isPointInPolygon(lassoPoints, end.x, end.y);
				return startIn && endIn;
			}
			return false;
		}

		// Closed shapes: require at least 70% of corners to be enclosed
		const corners = shape.handles.filter((h) => h.role === 'corner');
		if (corners.length > 0) {
			let cornersIn = 0;
			for (const c of corners) {
				if (isPointInPolygon(lassoPoints, c.x, c.y)) {
					cornersIn++;
				}
			}
			return cornersIn / corners.length >= 0.7;
		}

		return false;
	}

	// Raw vector stroke freehand hit-test
	const pts = stroke.points;
	if (pts.length === 0) return false;

	if (pts.length <= 3) {
		return pts.every((p) => isPointInPolygon(lassoPoints, p.x, p.y));
	}

	// Sample up to 30 points
	const sampleCount = Math.min(30, pts.length);
	const step = Math.max(1, Math.floor(pts.length / sampleCount));
	let insideCount = 0;
	let sampledTotal = 0;

	for (let i = 0; i < pts.length; i += step) {
		const p = pts[i];
		if (p) {
			sampledTotal++;
			if (isPointInPolygon(lassoPoints, p.x, p.y)) {
				insideCount++;
			}
		}
	}

	// Check last point
	const lastPoint = pts[pts.length - 1];
	if (lastPoint && pts.length % step !== 0) {
		sampledTotal++;
		if (isPointInPolygon(lassoPoints, lastPoint.x, lastPoint.y)) {
			insideCount++;
		}
	}

	// Must have at least 60% of sampled points inside
	return sampledTotal > 0 && insideCount / sampledTotal >= 0.6;
}

/**
 * Checks if an image is selected by the lasso.
 */
export function isImageSelectedByLasso(
	image: PageImage,
	lassoPoints: { x: number; y: number }[],
	mode: LassoSelectionMode,
	rectBounds?: BoundingBox,
): boolean {
	if (image.isLocked) return false;

	const imgMinX = image.x;
	const imgMaxX = image.x + image.width;
	const imgMinY = image.y;
	const imgMaxY = image.y + image.height;
	const centerX = image.x + image.width / 2;
	const centerY = image.y + image.height / 2;

	const corners = [
		{ x: imgMinX, y: imgMinY },
		{ x: imgMaxX, y: imgMinY },
		{ x: imgMaxX, y: imgMaxY },
		{ x: imgMinX, y: imgMaxY },
	];

	if (mode === 'rectangle') {
		if (!rectBounds) return false;
		const rMinX = Math.min(rectBounds.minX, rectBounds.maxX);
		const rMaxX = Math.max(rectBounds.minX, rectBounds.maxX);
		const rMinY = Math.min(rectBounds.minY, rectBounds.maxY);
		const rMaxY = Math.max(rectBounds.minY, rectBounds.maxY);

		const centerIn =
			centerX >= rMinX &&
			centerX <= rMaxX &&
			centerY >= rMinY &&
			centerY <= rMaxY;

		const cornersIn = corners.filter(
			(c) => c.x >= rMinX && c.x <= rMaxX && c.y >= rMinY && c.y <= rMaxY,
		).length;

		// Center must be inside AND at least 2 corners
		return centerIn && cornersIn >= 2;
	}

	// Freehand mode
	if (lassoPoints.length < 3) return false;

	const centerIn = isPointInPolygon(lassoPoints, centerX, centerY);
	const cornersIn = corners.filter((c) => isPointInPolygon(lassoPoints, c.x, c.y)).length;

	return centerIn && cornersIn >= 2;
}

/**
 * Computes combined bounding box for all selected strokes and images.
 */
export function computeCombinedBoundingBox(
	strokes: Stroke[],
	images: PageImage[],
	padding = 8,
): BoundingBox | null {
	if (strokes.length === 0 && images.length === 0) {
		return null;
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const s of strokes) {
		const bbox =
			s.shape
				? computeShapeBoundingBox(s.shape, s.style.width)
				: (s.bbox || computeBoundingBox(s.points, s.style.width));
		if (bbox.minX < minX) minX = bbox.minX;
		if (bbox.minY < minY) minY = bbox.minY;
		if (bbox.maxX > maxX) maxX = bbox.maxX;
		if (bbox.maxY > maxY) maxY = bbox.maxY;
	}

	for (const img of images) {
		if (img.x < minX) minX = img.x;
		if (img.y < minY) minY = img.y;
		if (img.x + img.width > maxX) maxX = img.x + img.width;
		if (img.y + img.height > maxY) maxY = img.y + img.height;
	}

	if (minX === Infinity) {
		return null;
	}

	return {
		minX: minX - padding,
		minY: minY - padding,
		maxX: maxX + padding,
		maxY: maxY + padding,
	};
}

/**
 * Translates selected strokes and images by dx, dy.
 */
export function translateSelectedItems(
	strokes: Stroke[],
	images: PageImage[],
	dx: number,
	dy: number,
): void {
	for (const s of strokes) {
		for (const p of s.points) {
			p.x += dx;
			p.y += dy;
		}
		if (s.shape) {
			for (const h of s.shape.handles) {
				h.x += dx;
				h.y += dy;
			}
			if (s.shape.center) {
				s.shape.center.x += dx;
				s.shape.center.y += dy;
			}
			if (s.shape.arcOffset) {
				s.shape.arcOffset.x += dx;
				s.shape.arcOffset.y += dy;
			}
			s.bbox = computeShapeBoundingBox(s.shape, s.style.width);
		} else {
			s.bbox = computeBoundingBox(s.points, s.style.width);
		}
	}

	for (const img of images) {
		img.x += dx;
		img.y += dy;
	}
}

/**
 * Scales selected strokes and images relative to an origin point.
 */
export function scaleSelectedItems(
	strokes: Stroke[],
	images: PageImage[],
	origin: { x: number; y: number },
	scaleX: number,
	scaleY: number,
): void {
	// Constrain minimal scale factor to prevent complete collapse or inversion
	const sx = Math.max(0.05, Math.abs(scaleX));
	const sy = Math.max(0.05, Math.abs(scaleY));

	for (const s of strokes) {
		for (const p of s.points) {
			p.x = origin.x + (p.x - origin.x) * sx;
			p.y = origin.y + (p.y - origin.y) * sy;
		}

		if (s.shape) {
			for (const h of s.shape.handles) {
				h.x = origin.x + (h.x - origin.x) * sx;
				h.y = origin.y + (h.y - origin.y) * sy;
			}
			if (s.shape.center) {
				s.shape.center.x = origin.x + (s.shape.center.x - origin.x) * sx;
				s.shape.center.y = origin.y + (s.shape.center.y - origin.y) * sy;
			}
			if (s.shape.radiusX !== undefined) {
				s.shape.radiusX = Math.max(4, s.shape.radiusX * sx);
			}
			if (s.shape.radiusY !== undefined) {
				s.shape.radiusY = Math.max(4, s.shape.radiusY * sy);
			}
			if (s.shape.arcOffset) {
				s.shape.arcOffset.x = origin.x + (s.shape.arcOffset.x - origin.x) * sx;
				s.shape.arcOffset.y = origin.y + (s.shape.arcOffset.y - origin.y) * sy;
			}
			s.bbox = computeShapeBoundingBox(s.shape, s.style.width);
		} else {
			s.bbox = computeBoundingBox(s.points, s.style.width);
		}
	}

	for (const img of images) {
		img.x = origin.x + (img.x - origin.x) * sx;
		img.y = origin.y + (img.y - origin.y) * sy;
		img.width = Math.max(20, img.width * sx);
		img.height = Math.max(20, img.height * sy);
	}
}

/**
 * Creates deep copies of selected strokes and images with a position offset.
 */
export function duplicateSelectedItems(
	strokes: Stroke[],
	images: PageImage[],
	offsetX = 30,
	offsetY = 30,
): { duplicatedStrokes: Stroke[]; duplicatedImages: PageImage[] } {
	const now = Date.now();

	const duplicatedStrokes: Stroke[] = strokes.map((s, idx) => {
		const newId = `stroke_${now}_dup_${idx}_${Math.random().toString(36).substring(2, 6)}`;
		const clonedPoints = s.points.map((p) => ({
			x: p.x + offsetX,
			y: p.y + offsetY,
			pressure: p.pressure,
			time: p.time,
		}));

		const clonedStroke: Stroke = {
			id: newId,
			points: clonedPoints,
			style: { ...s.style },
			isLocked: false,
		};

		if (s.shape) {
			clonedStroke.shape = {
				...s.shape,
				isLocked: false,
				handles: s.shape.handles.map((h) => ({
					...h,
					x: h.x + offsetX,
					y: h.y + offsetY,
				})),
				center: s.shape.center
					? { x: s.shape.center.x + offsetX, y: s.shape.center.y + offsetY }
					: undefined,
				arcOffset: s.shape.arcOffset
					? { x: s.shape.arcOffset.x + offsetX, y: s.shape.arcOffset.y + offsetY }
					: undefined,
			};
			clonedStroke.bbox = computeShapeBoundingBox(
				clonedStroke.shape,
				clonedStroke.style.width,
			);
		} else {
			clonedStroke.bbox = computeBoundingBox(
				clonedPoints,
				clonedStroke.style.width,
			);
		}

		return clonedStroke;
	});

	const duplicatedImages: PageImage[] = images.map((img, idx) => {
		const newImgId = `img_${now}_dup_${idx}_${Math.random().toString(36).substring(2, 6)}`;
		return {
			...img,
			id: newImgId,
			x: img.x + offsetX,
			y: img.y + offsetY,
			isLocked: false,
		};
	});

	return { duplicatedStrokes, duplicatedImages };
}
