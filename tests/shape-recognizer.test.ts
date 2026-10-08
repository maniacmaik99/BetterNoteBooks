import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ramerDouglasPeucker, recognizeShape } from '../src/utils/shape-recognizer';
import { Point } from '../src/types';

describe('Shape Recognizer Utils', () => {
	describe('ramerDouglasPeucker', () => {
		it('simplifies collinear points down to start and end', () => {
			const points: Point[] = [
				{ x: 0, y: 0, pressure: 0.5, time: 0 },
				{ x: 25, y: 0, pressure: 0.5, time: 1 },
				{ x: 50, y: 0, pressure: 0.5, time: 2 },
				{ x: 75, y: 0, pressure: 0.5, time: 3 },
				{ x: 100, y: 0, pressure: 0.5, time: 4 },
			];
			const simplified = ramerDouglasPeucker(points, 2);
			assert.equal(simplified.length, 2);
			assert.equal(simplified[0]?.x, 0);
			assert.equal(simplified[1]?.x, 100);
		});

		it('preserves significant corner deviations', () => {
			const points: Point[] = [
				{ x: 0, y: 0, pressure: 0.5, time: 0 },
				{ x: 50, y: 50, pressure: 0.5, time: 1 }, // Sharp peak
				{ x: 100, y: 0, pressure: 0.5, time: 2 },
			];
			const simplified = ramerDouglasPeucker(points, 5);
			assert.equal(simplified.length, 3);
			assert.equal(simplified[1]?.x, 50);
			assert.equal(simplified[1]?.y, 50);
		});
	});

	describe('recognizeShape', () => {
		it('returns null for very short paths or tiny strokes under 10px', () => {
			assert.equal(recognizeShape([]), null);
			assert.equal(
				recognizeShape([{ x: 0, y: 0, pressure: 0.5, time: 0 }]),
				null,
			);
			assert.equal(
				recognizeShape([
					{ x: 0, y: 0, pressure: 0.5, time: 0 },
					{ x: 2, y: 2, pressure: 0.5, time: 1 },
				]),
				null,
			);
		});

		it('recognizes a straight horizontal line', () => {
			const points: Point[] = [];
			for (let i = 0; i <= 20; i++) {
				points.push({
					x: i * 10,
					y: 50 + (Math.sin(i) * 0.5), // slight jitter
					pressure: 0.5,
					time: i * 10,
				});
			}
			const shape = recognizeShape(points);
			assert.ok(shape, 'shape should be recognized');
			assert.equal(shape.type, 'line');
			assert.equal(shape.isClosed, false);
		});

		it('recognizes a rough hand-drawn circle', () => {
			const points: Point[] = [];
			const radius = 60;
			const cx = 100;
			const cy = 100;
			const steps = 36;
			for (let i = 0; i <= steps; i++) {
				const theta = (i / steps) * Math.PI * 2;
				// slight jitter
				const r = radius + (Math.sin(i * 3) * 1.5);
				points.push({
					x: cx + r * Math.cos(theta),
					y: cy + r * Math.sin(theta),
					pressure: 0.5,
					time: i * 10,
				});
			}
			const shape = recognizeShape(points);
			assert.ok(shape, 'circle should be recognized');
			assert.equal(shape.type, 'circle');
			assert.equal(shape.isClosed, true);
			assert.ok(Math.abs((shape.center?.x ?? 0) - cx) < 8);
			assert.ok(Math.abs((shape.center?.y ?? 0) - cy) < 8);
		});

		it('recognizes a rough hand-drawn rectangle', () => {
			const points: Point[] = [];
			// Top side: (10, 10) -> (110, 10)
			for (let x = 10; x <= 110; x += 10) points.push({ x, y: 10, pressure: 0.5, time: points.length * 10 });
			// Right side: (110, 10) -> (110, 80)
			for (let y = 15; y <= 80; y += 10) points.push({ x: 110, y, pressure: 0.5, time: points.length * 10 });
			// Bottom side: (110, 80) -> (10, 80)
			for (let x = 105; x >= 10; x -= 10) points.push({ x, y: 80, pressure: 0.5, time: points.length * 10 });
			// Left side back to start: (10, 80) -> (10, 10)
			for (let y = 75; y >= 10; y -= 10) points.push({ x: 10, y, pressure: 0.5, time: points.length * 10 });

			const shape = recognizeShape(points);
			assert.ok(shape, 'rectangle should be recognized');
			assert.equal(shape.type, 'rectangle');
			assert.equal(shape.isClosed, true);
		});

		it('recognizes a hand-drawn triangle', () => {
			const points: Point[] = [];
			// (50, 10) -> (10, 90)
			for (let t = 0; t <= 10; t++) {
				points.push({ x: 50 - t * 4, y: 10 + t * 8, pressure: 0.5, time: points.length * 10 });
			}
			// (10, 90) -> (90, 90)
			for (let t = 1; t <= 10; t++) {
				points.push({ x: 10 + t * 8, y: 90, pressure: 0.5, time: points.length * 10 });
			}
			// (90, 90) -> (50, 10)
			for (let t = 1; t <= 10; t++) {
				points.push({ x: 90 - t * 4, y: 90 - t * 8, pressure: 0.5, time: points.length * 10 });
			}

			const shape = recognizeShape(points);
			assert.ok(shape, 'triangle should be recognized');
			assert.equal(shape.type, 'triangle');
			assert.equal(shape.isClosed, true);
			assert.equal(shape.handles.length, 3);
		});
	});
});
