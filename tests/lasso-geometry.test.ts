import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	doesStrokeMatchFilter,
	doesImageMatchFilter,
	isStrokeSelectedByLasso,
	isImageSelectedByLasso,
	computeCombinedBoundingBox,
	translateSelectedItems,
	scaleSelectedItems,
	duplicateSelectedItems,
} from '../src/utils/lasso-geometry';
import { Stroke, PageImage, LassoFilterSettings, DEFAULT_LASSO_FILTER } from '../src/types';

describe('Lasso Geometry Utils', () => {
	const samplePenStroke: Stroke = {
		id: 'stroke_pen_1',
		points: [
			{ x: 10, y: 10, pressure: 0.5, time: 0 },
			{ x: 50, y: 50, pressure: 0.5, time: 10 },
		],
		style: { color: '#000', width: 2, tool: 'pen', smoothing: 0.35 },
		bbox: { minX: 8, minY: 8, maxX: 52, maxY: 52 },
	};

	const sampleHighlighterStroke: Stroke = {
		id: 'stroke_hl_1',
		points: [
			{ x: 20, y: 20, pressure: 0.5, time: 0 },
			{ x: 60, y: 20, pressure: 0.5, time: 10 },
		],
		style: { color: '#ffff00', width: 10, tool: 'highlighter', smoothing: 0.35 },
		bbox: { minX: 10, minY: 10, maxX: 70, maxY: 30 },
	};

	const sampleShapeStroke: Stroke = {
		id: 'stroke_shape_1',
		points: [],
		style: { color: '#000', width: 2, tool: 'shape', smoothing: 0.35 },
		shape: {
			type: 'rectangle',
			handles: [
				{ id: 'h0', x: 20, y: 20, role: 'corner' },
				{ id: 'h1', x: 80, y: 20, role: 'corner' },
				{ id: 'h2', x: 80, y: 80, role: 'corner' },
				{ id: 'h3', x: 20, y: 80, role: 'corner' },
			],
			isClosed: true,
		},
		bbox: { minX: 4, minY: 4, maxX: 96, maxY: 96 },
	};

	const sampleImage: PageImage = {
		id: 'img_1',
		src: 'data:image/png;base64,123',
		x: 30,
		y: 30,
		width: 40,
		height: 40,
	};

	describe('doesStrokeMatchFilter', () => {
		it('excludes locked strokes regardless of filter', () => {
			const lockedStroke: Stroke = { ...samplePenStroke, isLocked: true };
			assert.equal(doesStrokeMatchFilter(lockedStroke, DEFAULT_LASSO_FILTER), false);
		});

		it('matches all stroke types when filter.all is true', () => {
			assert.equal(doesStrokeMatchFilter(samplePenStroke, DEFAULT_LASSO_FILTER), true);
			assert.equal(doesStrokeMatchFilter(sampleHighlighterStroke, DEFAULT_LASSO_FILTER), true);
			assert.equal(doesStrokeMatchFilter(sampleShapeStroke, DEFAULT_LASSO_FILTER), true);
		});

		it('respects selective filters when filter.all is false', () => {
			const filterOnlyPen: LassoFilterSettings = {
				all: false,
				handwriting: true,
				highlighter: false,
				shapes: false,
				images: false,
			};
			assert.equal(doesStrokeMatchFilter(samplePenStroke, filterOnlyPen), true);
			assert.equal(doesStrokeMatchFilter(sampleHighlighterStroke, filterOnlyPen), false);
			assert.equal(doesStrokeMatchFilter(sampleShapeStroke, filterOnlyPen), false);
		});
	});

	describe('doesImageMatchFilter', () => {
		it('excludes locked images', () => {
			const locked: PageImage = { ...sampleImage, isLocked: true };
			assert.equal(doesImageMatchFilter(locked, DEFAULT_LASSO_FILTER), false);
		});

		it('matches image when images filter is enabled', () => {
			assert.equal(doesImageMatchFilter(sampleImage, DEFAULT_LASSO_FILTER), true);

			const filterNoImages: LassoFilterSettings = {
				all: false,
				handwriting: true,
				highlighter: true,
				shapes: true,
				images: false,
			};
			assert.equal(doesImageMatchFilter(sampleImage, filterNoImages), false);
		});
	});

	describe('isStrokeSelectedByLasso (Rectangle Mode)', () => {
		const rectBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

		it('selects strokes enclosed inside bounding box', () => {
			assert.equal(isStrokeSelectedByLasso(samplePenStroke, [], 'rectangle', rectBounds), true);
		});

		it('rejects strokes outside bounding box', () => {
			const outsideStroke: Stroke = {
				...samplePenStroke,
				points: [
					{ x: 150, y: 150, pressure: 0.5, time: 0 },
					{ x: 180, y: 180, pressure: 0.5, time: 10 },
				],
				bbox: { minX: 148, minY: 148, maxX: 182, maxY: 182 },
			};
			assert.equal(isStrokeSelectedByLasso(outsideStroke, [], 'rectangle', rectBounds), false);
		});
	});

	describe('isStrokeSelectedByLasso (Freehand Mode)', () => {
		const lassoLoop = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
			{ x: 0, y: 100 },
		];

		it('selects strokes whose points are enclosed inside the polygon loop', () => {
			assert.equal(isStrokeSelectedByLasso(samplePenStroke, lassoLoop, 'freehand'), true);
		});

		it('rejects strokes outside the polygon loop', () => {
			const farStroke: Stroke = {
				...samplePenStroke,
				points: [{ x: 300, y: 300, pressure: 0.5, time: 0 }],
				bbox: { minX: 298, minY: 298, maxX: 302, maxY: 302 },
			};
			assert.equal(isStrokeSelectedByLasso(farStroke, lassoLoop, 'freehand'), false);
		});
	});

	describe('computeCombinedBoundingBox', () => {
		it('returns null for empty lists', () => {
			assert.equal(computeCombinedBoundingBox([], []), null);
		});

		it('computes combined bounding box around strokes and images', () => {
			const bbox = computeCombinedBoundingBox([samplePenStroke], [sampleImage], 5);
			assert.ok(bbox);
			assert.ok(bbox.minX <= Math.min(samplePenStroke.bbox?.minX ?? 0, sampleImage.x));
			assert.ok(bbox.maxX >= Math.max(samplePenStroke.bbox?.maxX ?? 0, sampleImage.x + sampleImage.width));
		});
	});

	describe('translateSelectedItems', () => {
		it('shifts points and images by dx, dy', () => {
			const strokeClone: Stroke = JSON.parse(JSON.stringify(samplePenStroke));
			const imageClone: PageImage = JSON.parse(JSON.stringify(sampleImage));

			translateSelectedItems([strokeClone], [imageClone], 15, 25);

			assert.equal(strokeClone.points[0]?.x, 25);
			assert.equal(strokeClone.points[0]?.y, 35);
			assert.equal(imageClone.x, 45);
			assert.equal(imageClone.y, 55);
		});
	});

	describe('scaleSelectedItems', () => {
		it('scales items around an origin point', () => {
			const strokeClone: Stroke = JSON.parse(JSON.stringify(samplePenStroke));
			const imageClone: PageImage = JSON.parse(JSON.stringify(sampleImage));

			// Scale 2x around origin (0, 0)
			scaleSelectedItems([strokeClone], [imageClone], { x: 0, y: 0 }, 2, 2);

			assert.equal(strokeClone.points[0]?.x, 20);
			assert.equal(strokeClone.points[0]?.y, 20);
			assert.equal(imageClone.width, 80);
			assert.equal(imageClone.height, 80);
		});
	});

	describe('duplicateSelectedItems', () => {
		it('creates deep copies with new IDs and position offsets', () => {
			const { duplicatedStrokes, duplicatedImages } = duplicateSelectedItems(
				[samplePenStroke],
				[sampleImage],
				30,
				40,
			);

			assert.equal(duplicatedStrokes.length, 1);
			assert.equal(duplicatedImages.length, 1);
			assert.notEqual(duplicatedStrokes[0]?.id, samplePenStroke.id);
			assert.notEqual(duplicatedImages[0]?.id, sampleImage.id);
			assert.equal(duplicatedStrokes[0]?.points[0]?.x, samplePenStroke.points[0]!.x + 30);
			assert.equal(duplicatedStrokes[0]?.points[0]?.y, samplePenStroke.points[0]!.y + 40);
			assert.equal(duplicatedImages[0]?.x, sampleImage.x + 30);
			assert.equal(duplicatedImages[0]?.y, sampleImage.y + 40);
		});
	});
});
