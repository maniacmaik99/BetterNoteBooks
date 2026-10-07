import { App, Modal, Setting } from 'obsidian';
import { Stroke, DashStyle } from '../types';

export class ShapeOptionsModal extends Modal {
	private stroke: Stroke;
	private onUpdate: () => void;
	private onDelete: () => void;

	constructor(
		app: App,
		stroke: Stroke,
		onUpdate: () => void,
		onDelete: () => void,
	) {
		super(app);
		this.stroke = stroke;
		this.onUpdate = onUpdate;
		this.onDelete = onDelete;
	}

	public onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('betternotebook-modal', 'betternotebook-shape-modal');

		const shape = this.stroke.shape;
		const shapeName = shape
			? shape.type === 'circle'
				? 'Kreis'
				: shape.type === 'rectangle'
					? 'Rechteck'
					: shape.type === 'triangle'
						? 'Dreieck'
						: shape.type === 'polygon'
							? 'Vieleck'
							: 'Linie / Bogen'
			: 'Form';

		contentEl.createEl('h2', {
			text: `${shapeName} anpassen`,
		});

		// 1. Linienstil (durchgezogen, gestrichelt, gepunktet)
		new Setting(contentEl)
			.setName('Linienstil')
			.setDesc('Art der Konturlinie.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('solid', 'Durchgezogen (──────)')
					.addOption('dashed', 'Gestrichelt (- - - -)')
					.addOption('dotted', 'Gepunktet (• • • •)')
					.setValue(this.stroke.style.dashStyle || 'solid')
					.onChange((val) => {
						const dash = val as DashStyle;
						this.stroke.style.dashStyle = dash;
						if (this.stroke.shape) {
							this.stroke.shape.dashStyle = dash;
						}
						this.onUpdate();
					}),
			);

		// 2. Linienstärke
		new Setting(contentEl)
			.setName('Linienstärke')
			.setDesc('Dicke der Konturlinie.')
			.addSlider((slider) =>
				slider
					.setLimits(1, 24, 1)
					.setValue(Math.round(this.stroke.style.width || 3))
					.setDynamicTooltip()
					.onChange((val) => {
						this.stroke.style.width = val;
						this.onUpdate();
					}),
			);

		// 3. Linienfarbe
		new Setting(contentEl)
			.setName('Linienfarbe')
			.setDesc('Farbe der Kontur.')
			.addColorPicker((cp) =>
				cp
					.setValue(this.stroke.style.color || '#242424')
					.onChange((color) => {
						this.stroke.style.color = color;
						this.onUpdate();
					}),
			);

		// 4. Linien-Deckkraft (Transparenz)
		new Setting(contentEl)
			.setName('Linien-Deckkraft')
			.setDesc('Transparenz der Kontur (10% bis 100%).')
			.addSlider((slider) =>
				slider
					.setLimits(10, 100, 5)
					.setValue(
						Math.round((this.stroke.style.opacity ?? 1.0) * 100),
					)
					.setDynamicTooltip()
					.onChange((val) => {
						const op = val / 100;
						this.stroke.style.opacity = op;
						if (this.stroke.shape) {
							this.stroke.shape.opacity = op;
						}
						this.onUpdate();
					}),
			);

		// 5. Füllung (nur für geschlossene Formen oder Form-Objekte)
		if (shape && shape.isClosed) {
			const fillSectionContainer = contentEl.createDiv({
				cls: 'betternotebook-shape-fill-section',
			});

			const renderFillControls = () => {
				fillSectionContainer.empty();

				new Setting(fillSectionContainer)
					.setName('Fläche füllen')
					.setDesc('Halbtransparenten Hintergrund aktivieren.')
					.addToggle((toggle) =>
						toggle
							.setValue(shape.hasFill ?? false)
							.onChange((val) => {
								shape.hasFill = val;
								if (val && !shape.fillColor) {
									shape.fillColor = this.stroke.style.color;
								}
								if (val && shape.fillOpacity === undefined) {
									shape.fillOpacity = 0.25;
								}
								this.onUpdate();
								renderFillControls();
							}),
					);

				if (shape.hasFill) {
					new Setting(fillSectionContainer)
						.setName('Füllfarbe')
						.setDesc('Farbe der Innenfläche.')
						.addColorPicker((cp) =>
							cp
								.setValue(
									shape.fillColor || this.stroke.style.color || '#242424',
								)
								.onChange((color) => {
									shape.fillColor = color;
									this.onUpdate();
								}),
						);

					new Setting(fillSectionContainer)
						.setName('Füllung-Deckkraft')
						.setDesc('Transparenz der Innenfläche (5% bis 100%).')
						.addSlider((slider) =>
							slider
								.setLimits(5, 100, 5)
								.setValue(Math.round((shape.fillOpacity ?? 0.25) * 100))
								.setDynamicTooltip()
								.onChange((val) => {
									shape.fillOpacity = val / 100;
									this.onUpdate();
								}),
						);
				}
			};

			renderFillControls();
		}

		// 6. Position sperren (Fixieren)
		new Setting(contentEl)
			.setName('Position sperren (Fixieren)')
			.setDesc('Fixiert die Form gegen Verschieben und erlaubt ungestörtes Beschreiben.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.stroke.isLocked ?? false)
					.onChange((val) => {
						this.stroke.isLocked = val;
						if (this.stroke.shape) {
							this.stroke.shape.isLocked = val;
						}
						this.onUpdate();
					}),
			);

		// 7. Form löschen (Danger Action)
		const actionContainer = contentEl.createDiv({
			cls: 'betternotebook-shape-modal-actions',
		});

		const deleteBtn = actionContainer.createEl('button', {
			cls: 'mod-warning',
			text: '🗑️ Form löschen',
		});
		deleteBtn.addEventListener('click', () => {
			this.close();
			this.onDelete();
		});

		const doneBtn = actionContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Fertig',
		});
		doneBtn.addEventListener('click', () => {
			this.close();
		});
	}

	public onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
