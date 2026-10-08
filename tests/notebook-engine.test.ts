import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotebookEngine } from '../src/engine/notebook-engine';
import { Stroke, PageImage } from '../src/types';

describe('NotebookEngine', () => {
	it('initializes a default notebook with 1 page', () => {
		const engine = new NotebookEngine(undefined, 'a4', 'portrait', 'ruled');
		const doc = engine.getDocument();
		assert.equal(doc.pages.length, 1);
		assert.equal(doc.pages[0]?.format, 'a4');
		assert.equal(doc.pages[0]?.orientation, 'portrait');
		assert.equal(doc.pages[0]?.background, 'ruled');
		assert.equal(doc.pages[0]?.pageNumber, 1);
	});

	it('creates new pages with auto-incrementing page numbers', () => {
		const engine = new NotebookEngine();
		const p2 = engine.createPage('a5', 'landscape', 'grid');
		assert.equal(engine.getPages().length, 2);
		assert.equal(p2.pageNumber, 2);
		assert.equal(p2.format, 'a5');
		assert.equal(p2.orientation, 'landscape');
		assert.equal(p2.background, 'grid');
	});

	it('refuses to delete the last remaining page', () => {
		const engine = new NotebookEngine();
		const pages = engine.getPages();
		assert.equal(pages.length, 1);
		const deleted = engine.deletePage(pages[0]!.id);
		assert.equal(deleted, false);
		assert.equal(engine.getPages().length, 1);
	});

	it('deletes pages and automatically re-indexes page numbers', () => {
		const engine = new NotebookEngine();
		const p2 = engine.createPage();
		const p3 = engine.createPage();
		assert.equal(engine.getPages().length, 3);

		const deleted = engine.deletePage(p2.id);
		assert.equal(deleted, true);
		assert.equal(engine.getPages().length, 2);
		assert.equal(engine.getPages()[0]?.pageNumber, 1);
		assert.equal(engine.getPages()[1]?.pageNumber, 2);
	});

	it('duplicates pages with deep-copied strokes and images', () => {
		const engine = new NotebookEngine();
		const p1 = engine.getPages()[0]!;
		p1.title = 'Kapitel 1';
		const stroke: Stroke = {
			id: 's_orig',
			points: [{ x: 10, y: 10, pressure: 0.5, time: 100 }],
			style: { color: '#1a56db', width: 2, tool: 'pen', smoothing: 0.35 },
		};
		p1.strokes.push(stroke);

		const duplicated = engine.duplicatePage(p1.id);
		assert.ok(duplicated);
		assert.equal(duplicated.title, 'Kapitel 1 (Kopie)');
		assert.equal(duplicated.pageNumber, 2);
		assert.equal(duplicated.strokes.length, 1);
		assert.equal(duplicated.strokes[0]?.id, 's_orig');
		// Must be a different points array reference
		assert.notEqual(duplicated.strokes[0]?.points, stroke.points);
	});

	it('manages groups correctly', () => {
		const engine = new NotebookEngine();
		engine.addGroup('Uni');
		engine.addGroup('Privat');
		const groups = engine.getGroups();
		assert.ok(groups.includes('Uni'));
		assert.ok(groups.includes('Privat'));

		const p1 = engine.getPages()[0]!;
		engine.setPageGroup(p1.id, 'Uni');
		assert.equal(engine.getPage(p1.id)?.group, 'Uni');
	});

	it('supports undo and redo for stroke addition and removal', () => {
		const engine = new NotebookEngine();
		const p1 = engine.getPages()[0]!;
		const stroke: Stroke = {
			id: 's_undo_test',
			points: [{ x: 5, y: 5, pressure: 0.5, time: 0 }],
			style: { color: '#000', width: 2, tool: 'pen', smoothing: 0.35 },
		};

		p1.strokes.push(stroke);
		engine.recordStrokeAdded(p1.id, stroke);
		assert.equal(p1.strokes.length, 1);

		assert.equal(engine.canUndo(), true);
		engine.undo();
		assert.equal(p1.strokes.length, 0);

		assert.equal(engine.canRedo(), true);
		engine.redo();
		assert.equal(p1.strokes.length, 1);
		assert.equal(p1.strokes[0]?.id, 's_undo_test');
	});

	it('serializes and deserializes accurately without data loss', () => {
		const engine = new NotebookEngine(undefined, 'a4', 'portrait', 'ruled');
		const p1 = engine.getPages()[0]!;
		p1.title = 'Test Document';
		p1.strokes.push({
			id: 'strk_ser',
			points: [
				{ x: 10, y: 20, pressure: 0.7, time: 100 },
				{ x: 30, y: 40, pressure: 0.9, time: 150 },
			],
			style: { color: '#d92525', width: 3, tool: 'pen', smoothing: 0.35 },
			bbox: { minX: 6, minY: 16, maxX: 34, maxY: 44 },
		});
		const img: PageImage = {
			id: 'img_ser',
			src: 'resource://vault/image.png',
			x: 100,
			y: 150,
			width: 200,
			height: 100,
		};
		p1.images.push(img);

		const json = engine.serialize();
		const deserialized = NotebookEngine.deserialize(json);

		assert.equal(deserialized.pages.length, 1);
		const restoredP1 = deserialized.pages[0]!;
		assert.equal(restoredP1.title, 'Test Document');
		assert.equal(restoredP1.strokes.length, 1);
		assert.equal(restoredP1.strokes[0]?.id, 'strk_ser');
		assert.equal(restoredP1.strokes[0]?.points.length, 2);
		assert.equal(restoredP1.images.length, 1);
		assert.equal(restoredP1.images[0]?.src, 'resource://vault/image.png');
	});

	it('throws on corrupted or invalid json input in deserialize', () => {
		assert.throws(() => {
			NotebookEngine.deserialize('{ "invalid": true }');
		}, /Ungültiges Notizbuch-Format/);
	});
});
