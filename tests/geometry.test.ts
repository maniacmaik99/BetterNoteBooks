import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	lerp,
	getMidPoint,
	getDistance,
	computeTargetWidth,
	computeBoundingBox,
	distanceToSegment,
	computeShapeBoundingBox,
	isPointInPolygon,
	isPointNearStroke,
	getPageDimensions,
	isPointInsideOrNearShape,
} from '../src/utils/geometry';
import { Stroke, GeometricShape, Point } from '../src/types';

describe('Geometry Utils', () => {
	describe('lerp', () => {
		it('interpolates correctly between start and end values', () => {
			assert.equal(lerp(0, 10, 0), 0);
			assert.equal(lerp(0, 10, 0.5), 5);
			assert.equal(lerp(0, 10, 1), 10);
			assert.equal(lerp(10, 20, 0.25), 12.5);
			assert.equal(lerp(-10, 10, 0.5), 0);
		});
	});

	describe('getMidPoint', () => {
		it('calculates the exact midpoint between two points', () => {
			const mid = getMidPoint({ x: 0, y: 0 }, { x: 10, y: 20 });
			assert.deepEqual(mid, { x: 5, y: 10 });

			const midNeg = getMidPoint({ x: -10, y: -20 }, { x: 10, y: 20 });
			assert.deepEqual(midNeg, { x: 0, y: 0 });
		});
	});

	describe('getDistance', () => {
		it('calculates Euclidean distance accurately', () => {
			assert.equal(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
			assert.equal(getDistance({ x: 1, y: 1 }, { x: 1, y: 1 }), 0);
			assert.equal(getDistance({ x: -3, y: 0 }, { x: 0, y: 4 }), 5);
		});
	});

	describe('computeTargetWidth', () => {
		it('returns base width when isPen is false or pressure === 0.5', () => {
			assert.equal(computeTargetWidth(3.0, 0.8, false), 3.0);
			assert.equal(computeTargetWidth(3.0, 0.5, true), 3.0);
		});

		it('handles low/zero pressure gracefully for stylus without jumping', () => {
			const widthZero = computeTargetWidth(3.0, 0, true, 2.0);
			const widthLight = computeTargetWidth(3.0, 0.1, true, 2.0);
			const widthMed = computeTargetWidth(3.0, 0.5, true, 2.0);
			assert.ok(widthZero <= widthLight, 'zero pressure should be minimum/light width');
			assert.ok(widthLight <= widthMed, 'light pressure should be thinner than base width');
		});

		it('scales width based on pressure and sensitivity for stylus pen', () => {
			const widthLow = computeTargetWidth(4.0, 0.2, true, 2.0);
			const widthMed = computeTargetWidth(4.0, 0.5, true, 2.0);
			const widthHigh = computeTargetWidth(4.0, 0.9, true, 2.0);

			assert.ok(widthLow < widthMed, 'lower pressure should produce thinner stroke');
			assert.ok(widthMed < widthHigh, 'higher pressure should produce thicker stroke');
			assert.ok(widthLow >= 4.0 * 0.35, 'should respect minimum width constraint');
			assert.ok(widthHigh <= 4.0 * 2.5, 'should respect maximum width constraint');
		});
	});

	describe('computeBoundingBox', () => {
		it('returns zero bbox for empty points array', () => {
			const bbox = computeBoundingBox([]);
			assert.deepEqual(bbox, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
		});

		it('computes accurate bounding box with padding', () => {
			const points: Point[] = [
				{ x: 10, y: 20, pressure: 0.5, time: 100 },
				{ x: 50, y: 80, pressure: 0.5, time: 200 },
				{ x: -10, y: 30, pressure: 0.5, time: 300 },
			];
			const bbox = computeBoundingBox(points, 5);
			assert.equal(bbox.minX, -15);
			assert.equal(bbox.minY, 15);
			assert.equal(bbox.maxX, 55);
			assert.equal(bbox.maxY, 85);
		});
	});

	describe('distanceToSegment', () => {
		it('computes shortest distance to point when projection falls on segment', () => {
			// Horizontal segment from (0, 0) to (10, 0), point at (5, 5)
			const dist = distanceToSegment(5, 5, 0, 0, 10, 0);
			assert.equal(Math.round(dist * 100) / 100, 5);
		});

		it('computes distance to closest endpoint when projection falls outside segment', () => {
			// Segment from (0, 0) to (10, 0), point at (15, 0)
			const distAfter = distanceToSegment(15, 0, 0, 0, 10, 0);
			assert.equal(distAfter, 5);

			// Point before start at (-5, 0)
			const distBefore = distanceToSegment(-5, 0, 0, 0, 10, 0);
			assert.equal(distBefore, 5);
		});

		it('handles degenerate zero-length segments', () => {
			const dist = distanceToSegment(3, 4, 0, 0, 0, 0);
			assert.equal(dist, 5);
		});
	});

	describe('computeShapeBoundingBox', () => {
		it('computes circle bounding box correctly', () => {
			const circle: GeometricShape = {
				type: 'circle',
				handles: [],
				isClosed: true,
				center: { x: 100, y: 100 },
				radiusX: 50,
				radiusY: 30,
			};
			const bbox = computeShapeBoundingBox(circle, 2);
			const pad = 2 + 14;
			assert.equal(bbox.minX, 100 - 50 - pad);
			assert.equal(bbox.maxX, 100 + 50 + pad);
			assert.equal(bbox.minY, 100 - 30 - pad);
			assert.equal(bbox.maxY, 100 + 30 + pad);
		});

		it('computes rectangle / polygon handles bounding box correctly', () => {
			const rect: GeometricShape = {
				type: 'rectangle',
				handles: [
					{ id: 'h0', x: 10, y: 20, role: 'corner' },
					{ id: 'h1', x: 80, y: 20, role: 'corner' },
					{ id: 'h2', x: 80, y: 90, role: 'corner' },
					{ id: 'h3', x: 10, y: 90, role: 'corner' },
				],
				isClosed: true,
			};
			const bbox = computeShapeBoundingBox(rect, 4);
			const pad = 4 + 14;
			assert.equal(bbox.minX, 10 - pad);
			assert.equal(bbox.maxX, 80 + pad);
			assert.equal(bbox.minY, 20 - pad);
			assert.equal(bbox.maxY, 90 + pad);
		});
	});

	describe('isPointInPolygon', () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
			{ x: 0, y: 100 },
		];

		it('returns true for point inside polygon', () => {
			assert.equal(isPointInPolygon(square, 50, 50), true);
			assert.equal(isPointInPolygon(square, 10, 10), true);
		});

		it('returns false for point outside polygon', () => {
			assert.equal(isPointInPolygon(square, -5, 50), false);
			assert.equal(isPointInPolygon(square, 105, 50), false);
			assert.equal(isPointInPolygon(square, 50, -5), false);
			assert.equal(isPointInPolygon(square, 50, 105), false);
		});
	});

	describe('isPointNearStroke', () => {
		const sampleStroke: Stroke = {
			id: 's1',
			points: [
				{ x: 10, y: 10, pressure: 0.5, time: 1 },
				{ x: 50, y: 10, pressure: 0.5, time: 2 },
				{ x: 100, y: 10, pressure: 0.5, time: 3 },
			],
			style: { color: '#000', width: 4, tool: 'pen', smoothing: 0.35 },
			bbox: { minX: 6, minY: 6, maxX: 104, maxY: 14 },
		};

		it('returns true when point is within eraser radius of a stroke line', () => {
			assert.equal(isPointNearStroke(sampleStroke, 50, 12, 10), true);
			assert.equal(isPointNearStroke(sampleStroke, 10, 10, 5), true);
		});

		it('returns false when point is outside threshold or culled by bbox', () => {
			assert.equal(isPointNearStroke(sampleStroke, 50, 50, 5), false);
			assert.equal(isPointNearStroke(sampleStroke, 200, 200, 10), false);
		});

		it('tests geometric shapes accurately (circle, line, rectangle)', () => {
			const circleStroke: Stroke = {
				id: 's_circ',
				points: [],
				style: { color: '#000', width: 2, tool: 'shape', smoothing: 0.35 },
				shape: {
					type: 'circle',
					handles: [],
					isClosed: true,
					center: { x: 50, y: 50 },
					radiusX: 20,
					radiusY: 20,
				},
				bbox: { minX: 10, minY: 10, maxX: 90, maxY: 90 },
			};
			assert.equal(isPointNearStroke(circleStroke, 50, 50, 5), true, 'center inside circle');
			assert.equal(isPointNearStroke(circleStroke, 70, 50, 5), true, 'border of circle');
			assert.equal(isPointNearStroke(circleStroke, 100, 100, 5), false, 'far outside circle');
		});
	});

	describe('getPageDimensions', () => {
		it('returns correct dimensions for standard formats and orientations', () => {
			const a4Portrait = getPageDimensions('a4', 'portrait');
			assert.deepEqual(a4Portrait, { width: 794, height: 1123 });

			const a4Landscape = getPageDimensions('a4', 'landscape');
			assert.deepEqual(a4Landscape, { width: 1123, height: 794 });

			const letterPortrait = getPageDimensions('letter', 'portrait');
			assert.deepEqual(letterPortrait, { width: 816, height: 1056 });
		});
	});
});
