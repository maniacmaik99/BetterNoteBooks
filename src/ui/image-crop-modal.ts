import { App, Modal, Notice } from 'obsidian';
import { PageImage } from '../types';

export interface CropResult {
	croppedDataUrl: string;
	newWidth: number;
	newHeight: number;
	isReset?: boolean;
}

export class ImageCropModal extends Modal {
	private image: PageImage;
	private onCropApplied: (result: CropResult) => void;

	// UI elements
	private stageEl!: HTMLElement;
	private imgEl!: HTMLImageElement;
	private cropBoxEl!: HTMLElement;

	// Display state
	private imgNaturalWidth = 0;
	private imgNaturalHeight = 0;
	private imgDisplayWidth = 0;
	private imgDisplayHeight = 0;

	// Crop box coordinates relative to displayed image
	private cropLeft = 0;
	private cropTop = 0;
	private cropWidth = 0;
	private cropHeight = 0;

	constructor(
		app: App,
		image: PageImage,
		onCropApplied: (result: CropResult) => void,
	) {
		super(app);
		this.image = image;
		this.onCropApplied = onCropApplied;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('betternotebook-crop-modal-content');

		contentEl.createEl('h2', {
			text: 'Bild zuschneiden',
			cls: 'betternotebook-modal-title',
		});

		const desc = contentEl.createEl('p', {
			cls: 'betternotebook-modal-subtitle',
			text: 'Passe den Zuschnittrahmen durch Ziehen an den Ecken an.',
		});
		desc.addClass('betternotebook-crop-desc');

		// Stage area
		this.stageEl = contentEl.createDiv({
			cls: 'betternotebook-crop-stage-container',
		});

		const stageWrapper = this.stageEl.createDiv({
			cls: 'betternotebook-crop-stage-wrapper',
		});

		const srcToLoad = this.image.originalSrc || this.image.src;

		this.imgEl = stageWrapper.createEl('img', {
			cls: 'betternotebook-crop-source-img',
			attr: { src: srcToLoad },
		});
		this.imgEl.draggable = false;

		this.cropBoxEl = stageWrapper.createDiv({
			cls: 'betternotebook-crop-box',
		});

		// Handles on 4 corners
		this.createHandle(this.cropBoxEl, 'nw');
		this.createHandle(this.cropBoxEl, 'ne');
		this.createHandle(this.cropBoxEl, 'se');
		this.createHandle(this.cropBoxEl, 'sw');

		this.attachCropInteractions(this.cropBoxEl);

		// Initialize once image is loaded
		this.imgEl.onload = () => {
			this.imgNaturalWidth = this.imgEl.naturalWidth || 400;
			this.imgNaturalHeight = this.imgEl.naturalHeight || 300;
			this.updateStageDimensions();
		};

		// Footer buttons
		const footer = contentEl.createDiv({
			cls: 'betternotebook-modal-footer betternotebook-crop-footer',
		});

		if (this.image.originalSrc && this.image.originalSrc !== this.image.src) {
			const resetBtn = footer.createEl('button', {
				text: 'Original wiederherstellen',
				cls: 'betternotebook-btn',
			});
			resetBtn.addEventListener('click', () => {
				this.resetToOriginal();
			});
		}

		const cancelBtn = footer.createEl('button', {
			text: 'Abbrechen',
			cls: 'betternotebook-btn',
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});

		const applyBtn = footer.createEl('button', {
			text: 'Zuschneiden & übernehmen',
			cls: 'mod-cta betternotebook-btn',
		});
		applyBtn.addEventListener('click', () => {
			this.applyCrop();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private updateStageDimensions(): void {
		const maxStageW = 520;
		const maxStageH = 360;

		let dispW = this.imgNaturalWidth;
		let dispH = this.imgNaturalHeight;

		const ratio = Math.min(maxStageW / dispW, maxStageH / dispH, 1.0);
		dispW = Math.round(dispW * ratio);
		dispH = Math.round(dispH * ratio);

		this.imgDisplayWidth = dispW;
		this.imgDisplayHeight = dispH;

		this.imgEl.style.width = `${dispW}px`;
		this.imgEl.style.height = `${dispH}px`;

		// Default crop box: inset slightly or fill
		const insetX = Math.round(dispW * 0.05);
		const insetY = Math.round(dispH * 0.05);

		this.cropLeft = insetX;
		this.cropTop = insetY;
		this.cropWidth = Math.max(40, dispW - insetX * 2);
		this.cropHeight = Math.max(40, dispH - insetY * 2);

		this.renderCropBox();
	}

	private renderCropBox(): void {
		this.cropBoxEl.style.left = `${this.cropLeft}px`;
		this.cropBoxEl.style.top = `${this.cropTop}px`;
		this.cropBoxEl.style.width = `${this.cropWidth}px`;
		this.cropBoxEl.style.height = `${this.cropHeight}px`;
	}

	private createHandle(parent: HTMLElement, role: string): HTMLElement {
		return parent.createDiv({
			cls: `betternotebook-crop-handle ${role}`,
			attr: { 'data-handle': role },
		});
	}

	private attachCropInteractions(cropBox: HTMLElement): void {
		let isDraggingBox = false;
		let activeHandle: string | null = null;
		let startX = 0;
		let startY = 0;
		let initialLeft = 0;
		let initialTop = 0;
		let initialWidth = 0;
		let initialHeight = 0;

		cropBox.addEventListener('pointerdown', (e: PointerEvent) => {
			const target = e.target as HTMLElement;
			const handleRole = target.getAttribute('data-handle');

			startX = e.clientX;
			startY = e.clientY;
			initialLeft = this.cropLeft;
			initialTop = this.cropTop;
			initialWidth = this.cropWidth;
			initialHeight = this.cropHeight;

			if (handleRole) {
				activeHandle = handleRole;
				try {
					target.setPointerCapture(e.pointerId);
				} catch {
					// ignore capture error
				}
			} else {
				isDraggingBox = true;
				try {
					cropBox.setPointerCapture(e.pointerId);
				} catch {
					// ignore capture error
				}
			}
			e.stopPropagation();
		});

		const onPointerMove = (e: PointerEvent): void => {
			if (!isDraggingBox && !activeHandle) return;

			const dx = e.clientX - startX;
			const dy = e.clientY - startY;

			if (isDraggingBox) {
				const maxL = this.imgDisplayWidth - this.cropWidth;
				const maxT = this.imgDisplayHeight - this.cropHeight;
				this.cropLeft = Math.max(0, Math.min(maxL, initialLeft + dx));
				this.cropTop = Math.max(0, Math.min(maxT, initialTop + dy));
				this.renderCropBox();
			} else if (activeHandle) {
				const minDim = 25;

				if (activeHandle === 'se') {
					const maxW = this.imgDisplayWidth - initialLeft;
					const maxH = this.imgDisplayHeight - initialTop;
					this.cropWidth = Math.max(minDim, Math.min(maxW, initialWidth + dx));
					this.cropHeight = Math.max(minDim, Math.min(maxH, initialHeight + dy));
				} else if (activeHandle === 'sw') {
					const maxW = initialLeft + initialWidth;
					const newW = Math.max(minDim, Math.min(maxW, initialWidth - dx));
					this.cropLeft = initialLeft + (initialWidth - newW);
					this.cropWidth = newW;
					const maxH = this.imgDisplayHeight - initialTop;
					this.cropHeight = Math.max(minDim, Math.min(maxH, initialHeight + dy));
				} else if (activeHandle === 'ne') {
					const maxW = this.imgDisplayWidth - initialLeft;
					this.cropWidth = Math.max(minDim, Math.min(maxW, initialWidth + dx));
					const maxH = initialTop + initialHeight;
					const newH = Math.max(minDim, Math.min(maxH, initialHeight - dy));
					this.cropTop = initialTop + (initialHeight - newH);
					this.cropHeight = newH;
				} else if (activeHandle === 'nw') {
					const maxW = initialLeft + initialWidth;
					const newW = Math.max(minDim, Math.min(maxW, initialWidth - dx));
					this.cropLeft = initialLeft + (initialWidth - newW);
					this.cropWidth = newW;
					const maxH = initialTop + initialHeight;
					const newH = Math.max(minDim, Math.min(maxH, initialHeight - dy));
					this.cropTop = initialTop + (initialHeight - newH);
					this.cropHeight = newH;
				}
				this.renderCropBox();
			}
		};

		const onPointerUp = (e: PointerEvent): void => {
			if (isDraggingBox) {
				isDraggingBox = false;
				try {
					cropBox.releasePointerCapture(e.pointerId);
				} catch {
					// ignore capture error
				}
			}
			if (activeHandle) {
				activeHandle = null;
			}
		};

		cropBox.addEventListener('pointermove', onPointerMove);
		cropBox.addEventListener('pointerup', onPointerUp);
		cropBox.addEventListener('pointercancel', onPointerUp);
	}

	private applyCrop(): void {
		if (this.imgDisplayWidth <= 0 || this.imgDisplayHeight <= 0) {
			this.close();
			return;
		}

		const scaleX = this.imgNaturalWidth / this.imgDisplayWidth;
		const scaleY = this.imgNaturalHeight / this.imgDisplayHeight;

		const srcX = Math.round(this.cropLeft * scaleX);
		const srcY = Math.round(this.cropTop * scaleY);
		const srcW = Math.round(this.cropWidth * scaleX);
		const srcH = Math.round(this.cropHeight * scaleY);

		if (srcW <= 0 || srcH <= 0) {
			new Notice('Ungültiger Zuschnittbereich');
			return;
		}

		try {
			const offscreenCanvas = createEl('canvas');
			offscreenCanvas.width = srcW;
			offscreenCanvas.height = srcH;

			const ctx = offscreenCanvas.getContext('2d');
			if (!ctx) {
				new Notice('Canvas-Kontext nicht verfügbar');
				return;
			}

			ctx.drawImage(
				this.imgEl,
				srcX,
				srcY,
				srcW,
				srcH,
				0,
				0,
				srcW,
				srcH,
			);

			const croppedDataUrl = offscreenCanvas.toDataURL('image/png');

			// Calculate new width/height on page canvas
			const cropAspect = srcW / srcH;
			const newW = this.image.width;
			const newH = Math.round(newW / cropAspect);

			this.onCropApplied({
				croppedDataUrl,
				newWidth: newW,
				newHeight: newH,
			});

			this.close();
			new Notice('Bild erfolgreich zugeschnitten');
		} catch (err) {
			new Notice(`Fehler beim Zuschneiden: ${String(err)}`);
		}
	}

	private resetToOriginal(): void {
		if (!this.image.originalSrc) return;

		const originalImg = new Image();
		originalImg.onload = () => {
			const aspect = (originalImg.naturalWidth || 1) / (originalImg.naturalHeight || 1);
			const newH = Math.round(this.image.width / aspect);

			this.onCropApplied({
				croppedDataUrl: this.image.originalSrc!,
				newWidth: this.image.width,
				newHeight: newH,
				isReset: true,
			});
			this.close();
			new Notice('Originalbild wiederhergestellt');
		};
		originalImg.src = this.image.originalSrc;
	}
}
