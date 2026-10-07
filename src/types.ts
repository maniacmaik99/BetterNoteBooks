export type DrawingTool = 'pen' | 'highlighter' | 'eraser' | 'shape' | 'lasso';

export type LassoSelectionMode = 'freehand' | 'rectangle';

export interface LassoFilterSettings {
	all: boolean;
	handwriting: boolean;
	highlighter: boolean;
	shapes: boolean;
	images: boolean;
}

export const DEFAULT_LASSO_FILTER: LassoFilterSettings = {
	all: true,
	handwriting: true,
	highlighter: true,
	shapes: true,
	images: true,
};

export type PageFormat = 'a4' | 'a3' | 'a5' | 'letter';
export type PageOrientation = 'portrait' | 'landscape';
export type PageBackground = 'blank' | 'ruled' | 'grid' | 'dotted';

export interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface Point {
	x: number;
	y: number;
	pressure: number;
	time: number;
}

export type EraserMode = 'stroke' | 'precision';
export type DashStyle = 'solid' | 'dashed' | 'dotted';

export interface StrokeStyle {
	color: string;
	width: number;
	tool: DrawingTool;
	smoothing: number;
	eraserMode?: EraserMode;
	eraserRadius?: number;
	dashStyle?: DashStyle;
	opacity?: number;
	hasFill?: boolean;
	fillColor?: string;
	fillOpacity?: number;
	lassoMode?: LassoSelectionMode;
	lassoFilter?: LassoFilterSettings;
}

export type ShapeType = 'line' | 'arc' | 'circle' | 'rectangle' | 'triangle' | 'polygon';

export interface ShapeHandle {
	id: string;
	x: number;
	y: number;
	role: 'start' | 'end' | 'mid' | 'corner' | 'radius';
}

export interface GeometricShape {
	type: ShapeType;
	handles: ShapeHandle[];
	isClosed: boolean;
	arcOffset?: { x: number; y: number }; // For lines bent into arcs
	center?: { x: number; y: number };
	radiusX?: number;
	radiusY?: number;
	dashStyle?: DashStyle;
	opacity?: number;
	hasFill?: boolean;
	fillColor?: string;
	fillOpacity?: number;
	isLocked?: boolean;
}

export interface Stroke {
	id: string;
	points: Point[];
	style: StrokeStyle;
	bbox?: BoundingBox;
	shape?: GeometricShape;
	isLocked?: boolean;
}

export interface PageImage {
	id: string;
	src: string;
	originalSrc?: string;
	vaultPath?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation?: number;
	isLocked?: boolean;
}

export interface PageDimensions {
	width: number;
	height: number;
}

export const PAGE_FORMAT_DIMENSIONS: Record<PageFormat, PageDimensions> = {
	a4: { width: 794, height: 1123 },
	a5: { width: 559, height: 794 },
	a3: { width: 1123, height: 1587 },
	letter: { width: 816, height: 1056 },
};

export interface NotebookPage {
	id: string;
	pageNumber: number;
	title: string;
	group?: string;
	format: PageFormat;
	orientation: PageOrientation;
	background: PageBackground;
	strokes: Stroke[];
	images: PageImage[];
}

export interface NotebookDocument {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	version: number;
	pages: NotebookPage[];
	groups: string[];
}

export interface BetterNotebookSettings {
	defaultColor: string;
	defaultWidth: number;
	smoothingFactor: number;
	pressureSensitivity: number;
	defaultPageFormat: PageFormat;
	defaultOrientation: PageOrientation;
	defaultBackground: PageBackground;
	autosaveIntervalSeconds: number;
	customColors: string[];
	shapeRecognitionEnabled: boolean;
	shapeHoldDurationMs: number;
	eraserMode: EraserMode;
	eraserRadius: number;
	defaultDashStyle: DashStyle;
	defaultOpacity: number;
	defaultShapeFill: boolean;
	defaultShapeFillOpacity: number;
	stylusOnlyMode: boolean;
	zoomAdaptiveStrokeWidth: boolean;
	notebooksFolder: string;
	lastActiveNotebookPath: string;
	penWidthSlots: [number, number];
	penActiveSlotIndex: number;
	eraserRadiusSlots: [number, number];
	eraserActiveSlotIndex: number;
	language: string;
}

export const DEFAULT_PALETTE_COLORS = [
	'#242424', // Klassisches Schwarz
	'#1a56db', // Tinte Blau
	'#d92525', // Korrektur Rot
	'#16a34a', // Smaragd Grün
	'#eab308', // Textmarker Gelb
	'#ec4899', // Pink
	'#8b5cf6', // Lila
	'#06b6d4', // Türkis
];

export const DEFAULT_SETTINGS: BetterNotebookSettings = {
	defaultColor: '#242424',
	defaultWidth: 2.5,
	smoothingFactor: 0.35,
	pressureSensitivity: 2.0,
	defaultPageFormat: 'a4',
	defaultOrientation: 'portrait',
	defaultBackground: 'ruled',
	autosaveIntervalSeconds: 3,
	customColors: [...DEFAULT_PALETTE_COLORS],
	shapeRecognitionEnabled: true,
	shapeHoldDurationMs: 450,
	eraserMode: 'precision',
	eraserRadius: 16,
	defaultDashStyle: 'solid',
	defaultOpacity: 1.0,
	defaultShapeFill: false,
	defaultShapeFillOpacity: 0.25,
	stylusOnlyMode: false,
	zoomAdaptiveStrokeWidth: true,
	notebooksFolder: 'Notebooks',
	lastActiveNotebookPath: '',
	penWidthSlots: [1.8, 4.0],
	penActiveSlotIndex: 0,
	eraserRadiusSlots: [12, 28],
	eraserActiveSlotIndex: 0,
	language: 'auto',
};
