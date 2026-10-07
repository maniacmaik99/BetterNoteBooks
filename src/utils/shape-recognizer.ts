import { Point, GeometricShape, ShapeHandle, BoundingBox } from '../types';
import { getDistance, computeBoundingBox, distanceToSegment } from './geometry';

/**
 * Ramer-Douglas-Peucker algorithm for polyline simplification.
 */
export function ramerDouglasPeucker(points: Point[], epsilon: number): Point[] {
	if (points.length <= 2) return points;

	let dmax = 0;
	let index = 0;
	const end = points.length - 1;
	const pStart = points[0]!;
	const pEnd = points[end]!;

	for (let i = 1; i < end; i++) {
		const pt = points[i]!;
		const d = distanceToSegment(pt.x, pt.y, pStart.x, pStart.y, pEnd.x, pEnd.y);
		if (d > dmax) {
			index = i;
			dmax = d;
		}
	}

	if (dmax > epsilon) {
		const recResults1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
		const recResults2 = ramerDouglasPeucker(points.slice(index), epsilon);
		return [...recResults1.slice(0, recResults1.length - 1), ...recResults2];
	}

	return [pStart, pEnd];
}

/**
 * Calculates total arc length of a stroke path.
 */
function getPathLength(points: Point[]): number {
	let len = 0;
	for (let i = 0; i < points.length - 1; i++) {
		const p1 = points[i];
		const p2 = points[i + 1];
		if (p1 && p2) {
			len += getDistance(p1, p2);
		}
	}
	return len;
}

/**
 * Calculates internal angle in degrees at vertex pCurr formed by (pPrev -> pCurr -> pNext).
 */
function getAngleDeg(pPrev: Point, pCurr: Point, pNext: Point): number {
	const v1x = pPrev.x - pCurr.x;
	const v1y = pPrev.y - pCurr.y;
	const v2x = pNext.x - pCurr.x;
	const v2y = pNext.y - pCurr.y;
	const dot = v1x * v2x + v1y * v2y;
	const cross = v1x * v2y - v1y * v2x;
	return Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);
}

/**
 * Simplifies a closed polygon, removing collinear points and merging duplicate corners.
 */
function extractPolygonCorners(points: Point[], diag: number): Point[] {
	const epsilon = Math.max(8, diag * 0.055);
	let simplified = ramerDouglasPeucker(points, epsilon);
	if (simplified.length < 3) return simplified;

	// Remove closing duplicate if close to start
	const first = simplified[0]!;
	const last = simplified[simplified.length - 1]!;
	if (getDistance(first, last) < Math.max(25, diag * 0.22)) {
		simplified.pop();
	}

	// Merge vertices that are too close together
	let merged: Point[] = [];
	for (let i = 0; i < simplified.length; i++) {
		const pt = simplified[i]!;
		if (merged.length === 0) {
			merged.push({ ...pt });
		} else {
			const prev = merged[merged.length - 1]!;
			if (getDistance(prev, pt) < Math.max(14, diag * 0.12)) {
				prev.x = (prev.x + pt.x) / 2;
				prev.y = (prev.y + pt.y) / 2;
			} else {
				merged.push({ ...pt });
			}
		}
	}
	if (
		merged.length > 2 &&
		getDistance(merged[0]!, merged[merged.length - 1]!) < Math.max(14, diag * 0.12)
	) {
		merged.pop();
	}

	// Remove nearly collinear vertices (angle > 152 deg)
	if (merged.length > 3) {
		const filtered: Point[] = [];
		const n = merged.length;
		for (let i = 0; i < n; i++) {
			const pPrev = merged[(i - 1 + n) % n]!;
			const pCurr = merged[i]!;
			const pNext = merged[(i + 1) % n]!;
			const angle = getAngleDeg(pPrev, pCurr, pNext);
			if (angle <= 152) {
				filtered.push(pCurr);
			}
		}
		if (filtered.length >= 3) {
			merged = filtered;
		}
	}

	return merged;
}

/**
 * GoodNotes-inspired geometric shape recognition.
 * Analyzes rough hand-drawn strokes and snaps them to lines, arcs, circles, rectangles, triangles, or polygons.
 */
export function recognizeShape(points: Point[]): GeometricShape | null {
	if (points.length < 2) return null;

	const start = points[0]!;
	const end = points[points.length - 1]!;
	const pathLen = getPathLength(points);
	const chordLen = getDistance(start, end);
	const bbox: BoundingBox = computeBoundingBox(points, 0);
	const diag = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);

	if (diag < 10) return null; // Too small to form a meaningful shape

	// Path is closed if endpoints are reasonably close
	const isClosed =
		points.length >= 4 &&
		chordLen < Math.max(50, Math.min(pathLen * 0.35, diag * 0.45));

	// ----------------------------------------------------
	// 1. Straight Line / Arc Detection (Open Paths)
	// ----------------------------------------------------
	if (!isClosed) {
		let maxDeviation = 0;
		let apexPoint: Point = {
			x: (start.x + end.x) / 2,
			y: (start.y + end.y) / 2,
			pressure: 0.5,
			time: 0,
		};
		for (const pt of points) {
			const d = distanceToSegment(pt.x, pt.y, start.x, start.y, end.x, end.y);
			if (d > maxDeviation) {
				maxDeviation = d;
				apexPoint = pt;
			}
		}

		const midX = (start.x + end.x) / 2;
		const midY = (start.y + end.y) / 2;

		// Straight line: few points or low deviation from the chord
		if (points.length <= 4 || maxDeviation < Math.max(12, chordLen * 0.18)) {
			const handles: ShapeHandle[] = [
				{ id: 'h_start', x: start.x, y: start.y, role: 'start' },
				{ id: 'h_mid', x: midX, y: midY, role: 'mid' },
				{ id: 'h_end', x: end.x, y: end.y, role: 'end' },
			];

			return {
				type: 'line',
				handles,
				isClosed: false,
				arcOffset: { x: midX, y: midY },
			};
		}

		// Smooth Arc Curve: stroke has noticeable bend, snap to smooth arc through apex
		if (chordLen / Math.max(1, pathLen) > 0.40) {
			const handles: ShapeHandle[] = [
				{ id: 'h_start', x: start.x, y: start.y, role: 'start' },
				{ id: 'h_mid', x: apexPoint.x, y: apexPoint.y, role: 'mid' },
				{ id: 'h_end', x: end.x, y: end.y, role: 'end' },
			];

			return {
				type: 'line',
				handles,
				isClosed: false,
				arcOffset: { x: apexPoint.x, y: apexPoint.y },
			};
		}
	}

	// ----------------------------------------------------
	// 2. Closed Shapes: Circle vs Polygon Analysis
	// ----------------------------------------------------
	const corners = extractPolygonCorners(points, diag);

	// Calculate circle/ellipse variance
	const centerX = (bbox.minX + bbox.maxX) / 2;
	const centerY = (bbox.minY + bbox.maxY) / 2;
	const radiusX = (bbox.maxX - bbox.minX) / 2;
	const radiusY = (bbox.maxY - bbox.minY) / 2;

	let varianceSum = 0;
	for (const pt of points) {
		const dx = (pt.x - centerX) / Math.max(1, radiusX);
		const dy = (pt.y - centerY) / Math.max(1, radiusY);
		const normalizedDist = Math.hypot(dx, dy);
		varianceSum += Math.abs(normalizedDist - 1.0);
	}
	const avgVariance = varianceSum / points.length;

	// Circle / Ellipse: Must have low variance (< 0.10) AND not 3 or 4 sharp corners
	if (avgVariance < 0.10 && corners.length !== 3 && corners.length !== 4) {
		const isNearCircle =
			Math.abs(radiusX - radiusY) / Math.max(radiusX, radiusY) < 0.22;
		const finalRadiusX = isNearCircle ? (radiusX + radiusY) / 2 : radiusX;
		const finalRadiusY = isNearCircle ? (radiusX + radiusY) / 2 : radiusY;

		const handles: ShapeHandle[] = [
			{ id: 'h_center', x: centerX, y: centerY, role: 'corner' },
			{ id: 'h_rad_x', x: centerX + finalRadiusX, y: centerY, role: 'radius' },
			{ id: 'h_rad_y', x: centerX, y: centerY + finalRadiusY, role: 'radius' },
		];

		return {
			type: 'circle',
			handles,
			isClosed: true,
			center: { x: centerX, y: centerY },
			radiusX: finalRadiusX,
			radiusY: finalRadiusY,
		};
	}

	// ----------------------------------------------------
	// 3. Polygons: Triangles, Rectangles, Quadrilaterals
	// ----------------------------------------------------

	// 3.1 Triangle (3 corners)
	if (corners.length === 3) {
		const handles: ShapeHandle[] = corners.map((c, i) => ({
			id: `h_corner_${i}`,
			x: c.x,
			y: c.y,
			role: 'corner',
		}));

		return {
			type: 'triangle',
			handles,
			isClosed: true,
		};
	}

	// 3.2 Rectangle / Quad / Trapezoid (4 corners)
	if (corners.length === 4) {
		// Check if corners are roughly orthogonal (approx 90 deg)
		let isRoughlyOrthogonal = true;
		for (let i = 0; i < 4; i++) {
			const pPrev = corners[(i + 3) % 4]!;
			const pCurr = corners[i]!;
			const pNext = corners[(i + 1) % 4]!;
			const angle = getAngleDeg(pPrev, pCurr, pNext);
			if (angle < 68 || angle > 115) {
				isRoughlyOrthogonal = false;
				break;
			}
		}

		let finalCorners = corners;
		if (isRoughlyOrthogonal) {
			// Check if roughly axis-aligned
			const edgeAngle =
				Math.abs(Math.atan2(corners[1]!.y - corners[0]!.y, corners[1]!.x - corners[0]!.x)) *
				(180 / Math.PI);
			const isAxisAligned =
				edgeAngle < 18 ||
				Math.abs(edgeAngle - 90) < 18 ||
				Math.abs(edgeAngle - 180) < 18;

			if (isAxisAligned) {
				// Snap to clean axis-aligned rectangle
				finalCorners = [
					{ x: bbox.minX, y: bbox.minY, pressure: 0.5, time: 0 },
					{ x: bbox.maxX, y: bbox.minY, pressure: 0.5, time: 0 },
					{ x: bbox.maxX, y: bbox.maxY, pressure: 0.5, time: 0 },
					{ x: bbox.minX, y: bbox.maxY, pressure: 0.5, time: 0 },
				];
			}
		}

		const handles: ShapeHandle[] = finalCorners.map((c, i) => ({
			id: `h_corner_${i}`,
			x: c.x,
			y: c.y,
			role: 'corner',
		}));

		return {
			type: 'rectangle',
			handles,
			isClosed: true,
		};
	}

	// 3.3 General Polygon (5 to 8 corners)
	if (corners.length >= 5 && corners.length <= 8) {
		const handles: ShapeHandle[] = corners.map((c, i) => ({
			id: `h_corner_${i}`,
			x: c.x,
			y: c.y,
			role: 'corner',
		}));

		return {
			type: 'polygon',
			handles,
			isClosed: true,
		};
	}

	// Fallback to circle if variance was reasonably smooth and didn't match clear polygon corners
	if (avgVariance < 0.13) {
		const isNearCircle =
			Math.abs(radiusX - radiusY) / Math.max(radiusX, radiusY) < 0.22;
		const finalRadiusX = isNearCircle ? (radiusX + radiusY) / 2 : radiusX;
		const finalRadiusY = isNearCircle ? (radiusX + radiusY) / 2 : radiusY;

		const handles: ShapeHandle[] = [
			{ id: 'h_center', x: centerX, y: centerY, role: 'corner' },
			{ id: 'h_rad_x', x: centerX + finalRadiusX, y: centerY, role: 'radius' },
			{ id: 'h_rad_y', x: centerX, y: centerY + finalRadiusY, role: 'radius' },
		];

		return {
			type: 'circle',
			handles,
			isClosed: true,
			center: { x: centerX, y: centerY },
			radiusX: finalRadiusX,
			radiusY: finalRadiusY,
		};
	}

	return null;
}
