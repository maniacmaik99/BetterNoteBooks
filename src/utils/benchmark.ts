import { isPointNearStroke, computeBoundingBox } from './geometry';
import { isStrokeSelectedByLasso } from './lasso-geometry';
import { recognizeShape } from './shape-recognizer';
import { NotebookEngine } from '../engine/notebook-engine';
import { Stroke, Point } from '../types';

export interface BenchmarkResult {
	name: string;
	iterations: number;
	durationMs: number;
	opsPerSec: number;
}

export function runAllBenchmarks(): BenchmarkResult[] {
	const results: BenchmarkResult[] = [];

	// 1. Stroke Hit-Testing (Eraser & Pointer queries)
	{
		const strokesCount = 500;
		const pointsPerStroke = 100;
		const strokes: Stroke[] = [];

		for (let s = 0; s < strokesCount; s++) {
			const pts: Point[] = [];
			const startX = (s % 25) * 35;
			const startY = Math.floor(s / 25) * 55;
			for (let p = 0; p < pointsPerStroke; p++) {
				pts.push({
					x: startX + p * 0.35,
					y: startY + Math.sin(p * 0.2) * 5,
					pressure: 0.5,
					time: p * 10,
				});
			}
			strokes.push({
				id: `stroke_${s}`,
				points: pts,
				style: { color: '#000', width: 2.5, tool: 'pen', smoothing: 0.35 },
				bbox: computeBoundingBox(pts, 2.5),
			});
		}

		const queryPoints: { x: number; y: number }[] = [];
		for (let q = 0; q < 500; q++) {
			queryPoints.push({
				x: (q * 17) % 800,
				y: (q * 23) % 1100,
			});
		}

		const t0 = performance.now();
		let _hits = 0;
		for (const qp of queryPoints) {
			for (const strk of strokes) {
				if (isPointNearStroke(strk, qp.x, qp.y, 16)) {
					_hits++;
				}
			}
		}
		const t1 = performance.now();
		const durationMs = t1 - t0;
		const totalOps = queryPoints.length * strokes.length;

		results.push({
			name: 'Stroke Hit-Testing (250k checks)',
			iterations: totalOps,
			durationMs: Math.round(durationMs * 100) / 100,
			opsPerSec: Math.round(totalOps / (durationMs / 1000)),
		});
	}

	// 2. Lasso Freehand Selection Filtering
	{
		const strokesCount = 1000;
		const strokes: Stroke[] = [];

		for (let s = 0; s < strokesCount; s++) {
			const pts: Point[] = [];
			const startX = (s % 30) * 30;
			const startY = Math.floor(s / 30) * 35;
			for (let p = 0; p < 80; p++) {
				pts.push({
					x: startX + p * 0.3,
					y: startY + (p % 2 === 0 ? 2 : 0),
					pressure: 0.5,
					time: p * 10,
				});
			}
			strokes.push({
				id: `lasso_stroke_${s}`,
				points: pts,
				style: { color: '#000', width: 2, tool: 'pen', smoothing: 0.35 },
				bbox: computeBoundingBox(pts, 2),
			});
		}

		const lassoLoop: { x: number; y: number }[] = [];
		const cx = 250;
		const cy = 250;
		const radius = 120;
		for (let i = 0; i < 40; i++) {
			const theta = (i / 40) * Math.PI * 2;
			lassoLoop.push({
				x: cx + radius * Math.cos(theta),
				y: cy + radius * Math.sin(theta),
			});
		}

		let lMinX = Infinity, lMinY = Infinity, lMaxX = -Infinity, lMaxY = -Infinity;
		for (const p of lassoLoop) {
			if (p.x < lMinX) lMinX = p.x;
			if (p.y < lMinY) lMinY = p.y;
			if (p.x > lMaxX) lMaxX = p.x;
			if (p.y > lMaxY) lMaxY = p.y;
		}
		const lassoRectBounds = { minX: lMinX, minY: lMinY, maxX: lMaxX, maxY: lMaxY };

		const runs = 20;
		const t0 = performance.now();
		let _selectedCount = 0;
		for (let r = 0; r < runs; r++) {
			for (const stroke of strokes) {
				if (isStrokeSelectedByLasso(stroke, lassoLoop, 'freehand', lassoRectBounds)) {
					_selectedCount++;
				}
			}
		}
		const t1 = performance.now();
		const durationMs = t1 - t0;
		const totalOps = runs * strokes.length;

		results.push({
			name: 'Lasso Freehand Selection (20k evals)',
			iterations: totalOps,
			durationMs: Math.round(durationMs * 100) / 100,
			opsPerSec: Math.round(totalOps / (durationMs / 1000)),
		});
	}

	// 3. Shape Recognition & RDP
	{
		const samplePaths: Point[][] = [];
		const linePts: Point[] = [];
		for (let i = 0; i < 200; i++) {
			linePts.push({ x: i * 2, y: 100 + Math.sin(i) * 0.4, pressure: 0.5, time: i * 5 });
		}
		samplePaths.push(linePts);

		const circPts: Point[] = [];
		for (let i = 0; i < 200; i++) {
			const theta = (i / 200) * Math.PI * 2;
			circPts.push({
				x: 300 + 80 * Math.cos(theta) + Math.sin(i * 4) * 0.8,
				y: 300 + 80 * Math.sin(theta) + Math.cos(i * 4) * 0.8,
				pressure: 0.5,
				time: i * 5,
			});
		}
		samplePaths.push(circPts);

		const rectPts: Point[] = [];
		for (let x = 0; x <= 50; x++) rectPts.push({ x: 50 + x * 2, y: 50, pressure: 0.5, time: rectPts.length * 5 });
		for (let y = 0; y <= 50; y++) rectPts.push({ x: 150, y: 50 + y * 2, pressure: 0.5, time: rectPts.length * 5 });
		for (let x = 50; x >= 0; x--) rectPts.push({ x: 50 + x * 2, y: 150, pressure: 0.5, time: rectPts.length * 5 });
		for (let y = 50; y >= 0; y--) rectPts.push({ x: 50, y: 50 + y * 2, pressure: 0.5, time: rectPts.length * 5 });
		samplePaths.push(rectPts);

		const iterations = 500;
		const t0 = performance.now();
		let _recognized = 0;
		for (let i = 0; i < iterations; i++) {
			const path = samplePaths[i % samplePaths.length]!;
			const shape = recognizeShape(path);
			if (shape) _recognized++;
		}
		const t1 = performance.now();
		const durationMs = t1 - t0;

		results.push({
			name: 'Shape Recognition (500 strokes, 200pts ea)',
			iterations,
			durationMs: Math.round(durationMs * 100) / 100,
			opsPerSec: Math.round(iterations / (durationMs / 1000)),
		});
	}

	// 4. Document JSON Roundtrip
	{
		const engine = new NotebookEngine(undefined, 'a4', 'portrait', 'ruled');
		for (let p = 0; p < 4; p++) {
			engine.createPage();
		}
		const pages = engine.getPages();
		for (const page of pages) {
			for (let s = 0; s < 50; s++) {
				const pts: Point[] = [];
				for (let pt = 0; pt < 50; pt++) {
					pts.push({ x: pt * 5, y: s * 10 + Math.sin(pt) * 4, pressure: 0.6, time: pt * 10 });
				}
				page.strokes.push({
					id: `s_${page.id}_${s}`,
					points: pts,
					style: { color: '#1a56db', width: 2.5, tool: 'pen', smoothing: 0.35 },
					bbox: computeBoundingBox(pts, 2.5),
				});
			}
		}

		const iterations = 40;
		const t0 = performance.now();
		for (let i = 0; i < iterations; i++) {
			const serialized = engine.serialize();
			NotebookEngine.deserialize(serialized);
		}
		const t1 = performance.now();
		const durationMs = t1 - t0;

		results.push({
			name: 'Document JSON Roundtrip (40 cycles, 250 strokes)',
			iterations,
			durationMs: Math.round(durationMs * 100) / 100,
			opsPerSec: Math.round(iterations / (durationMs / 1000)),
		});
	}

	// 5. Precision Eraser Evaluation
	{
		const strokes: Stroke[] = [];
		for (let s = 0; s < 200; s++) {
			const pts: Point[] = [];
			const startX = (s % 10) * 80;
			const startY = Math.floor(s / 10) * 50;
			for (let p = 0; p < 100; p++) {
				pts.push({
					x: startX + p * 0.7,
					y: startY + (p % 2 === 0 ? 3 : 0),
					pressure: 0.5,
					time: p * 10,
				});
			}
			strokes.push({
				id: `erase_s_${s}`,
				points: pts,
				style: { color: '#000', width: 2, tool: 'pen', smoothing: 0.35 },
				bbox: computeBoundingBox(pts, 2),
			});
		}

		const eraserSweeps: { x: number; y: number; r: number }[] = [];
		for (let i = 0; i < 200; i++) {
			eraserSweeps.push({
				x: (i * 13) % 800,
				y: (i * 29) % 1000,
				r: 16,
			});
		}

		const t0 = performance.now();
		let _candidates = 0;
		for (const sweep of eraserSweeps) {
			const radius = sweep.r;
			const radiusSq = radius * radius;
			for (const stroke of strokes) {
				const bbox = stroke.bbox;
				if (bbox) {
					if (
						sweep.x < bbox.minX - radius ||
						sweep.x > bbox.maxX + radius ||
						sweep.y < bbox.minY - radius ||
						sweep.y > bbox.maxY + radius
					) {
						continue;
					}
				}
				const pointsInside = stroke.points.some((p) => {
					const dx = p.x - sweep.x;
					const dy = p.y - sweep.y;
					return dx * dx + dy * dy <= radiusSq;
				});
				if (pointsInside || isPointNearStroke(stroke, sweep.x, sweep.y, radius)) {
					_candidates++;
				}
			}
		}
		const t1 = performance.now();
		const durationMs = t1 - t0;
		const totalOps = eraserSweeps.length * strokes.length;

		results.push({
			name: 'Precision Eraser Sweeps (40k evaluations)',
			iterations: totalOps,
			durationMs: Math.round(durationMs * 100) / 100,
			opsPerSec: Math.round(totalOps / (durationMs / 1000)),
		});
	}

	return results;
}
