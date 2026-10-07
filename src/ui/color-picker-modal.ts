import { App, Modal, Notice } from 'obsidian';

export const PRESET_COLOR_PALETTES: { name: string; colors: string[] }[] = [
	{
		name: 'GoodNotes Pastell',
		colors: [
			'#fecaca', // Rosé
			'#fed7aa', // Pfirsich
			'#fef08a', // Zartgelb
			'#bbf7d0', // Mintgrün
			'#bfdbfe', // Himmelblau
			'#ddd6fe', // Lavendel
			'#fbcfe8', // Zartrosa
		],
	},
	{
		name: 'Klassische Notizfarben',
		colors: [
			'#111827', // Tiefschwarz
			'#1e3a8a', // Marineblau
			'#991b1b', // Rubinrot
			'#166534', // Waldgrün
			'#854d0e', // Bernstein
			'#581c87', // Dunkellila
			'#374151', // Anthrazit
		],
	},
	{
		name: 'Kräftige & Leuchtende Farben',
		colors: [
			'#ef4444', // Korallrot
			'#f97316', // Orange
			'#eab308', // Textmarker Gelb
			'#10b981', // Smaragdgrün
			'#06b6d4', // Cyan
			'#3b82f6', // Königsblau
			'#8b5cf6', // Violett
			'#ec4899', // Pink
		],
	},
];

export class ColorPickerModal extends Modal {
	private currentColor: string;
	private onSelectColor: (hex: string) => void;
	private previewSwatchEl!: HTMLElement;
	private hexInputEl!: HTMLInputElement;

	constructor(
		app: App,
		initialColor: string,
		onSelectColor: (hex: string) => void,
	) {
		super(app);
		this.currentColor = initialColor.startsWith('#')
			? initialColor
			: `#${initialColor}`;
		this.onSelectColor = onSelectColor;
	}

	public onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('betternotebook-modal');

		contentEl.createEl('h2', {
			text: 'Farbe zur Palette hinzufügen',
		});

		// 1. Live Preview and Hex Input Section
		const inputSection = contentEl.createDiv({
			cls: 'betternotebook-color-picker-section',
		});

		const previewRow = inputSection.createDiv({
			cls: 'betternotebook-color-preview-row',
		});

		this.previewSwatchEl = previewRow.createDiv({
			cls: 'betternotebook-color-preview-swatch',
		});
		this.previewSwatchEl.style.backgroundColor = this.currentColor;

		this.hexInputEl = previewRow.createEl('input', {
			cls: 'betternotebook-hex-input',
			attr: {
				type: 'text',
				placeholder: '#242424',
				value: this.currentColor,
				maxlength: '9',
			},
		});

		const updateFromHex = (raw: string) => {
			let val = raw.trim();
			if (!val.startsWith('#') && /^[0-9a-fA-F]{3,8}$/.test(val)) {
				val = `#${val}`;
			}
			if (/^#[0-9a-fA-F]{3,8}$/.test(val)) {
				this.currentColor = val;
				this.previewSwatchEl.style.backgroundColor = val;
			}
		};

		this.hexInputEl.addEventListener('input', () => {
			updateFromHex(this.hexInputEl.value);
		});

		// Native Color Picker input (properly attached inside modal DOM)
		const nativeInput = previewRow.createEl('input', {
			cls: 'betternotebook-hidden-native-color',
			attr: { type: 'color', value: this.currentColor.substring(0, 7) },
		});

		nativeInput.addEventListener('change', () => {
			this.currentColor = nativeInput.value;
			this.hexInputEl.value = nativeInput.value;
			this.previewSwatchEl.style.backgroundColor = nativeInput.value;
		});

		const nativePickerBtn = previewRow.createEl('button', {
			cls: 'mod-cta betternotebook-picker-btn',
			text: 'Pipette / System-Auswahl',
		});
		nativePickerBtn.addEventListener('click', () => {
			nativeInput.click();
		});

		// 2. Preset Palette Sections
		for (const palette of PRESET_COLOR_PALETTES) {
			const groupContainer = contentEl.createDiv({
				cls: 'betternotebook-color-group',
			});
			groupContainer.createEl('h4', { text: palette.name });

			const swatchesGrid = groupContainer.createDiv({
				cls: 'betternotebook-color-swatches-grid',
			});

			for (const hex of palette.colors) {
				const swatch = swatchesGrid.createDiv({
					cls: 'betternotebook-swatch-item',
					attr: { title: hex },
				});
				swatch.style.backgroundColor = hex;
				swatch.addEventListener('click', () => {
					this.currentColor = hex;
					this.hexInputEl.value = hex;
					this.previewSwatchEl.style.backgroundColor = hex;
					nativeInput.value = hex.substring(0, 7);
				});
			}
		}

		// 3. Actions Footer
		const footer = contentEl.createDiv({
			cls: 'betternotebook-modal-footer',
		});

		const cancelBtn = footer.createEl('button', { text: 'Abbrechen' });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});

		const confirmBtn = footer.createEl('button', {
			cls: 'mod-cta',
			text: 'Farbe hinzufügen',
		});
		confirmBtn.addEventListener('click', () => {
			let finalHex = this.hexInputEl.value.trim();
			if (!finalHex.startsWith('#')) finalHex = `#${finalHex}`;
			if (!/^#[0-9a-fA-F]{3,8}$/.test(finalHex)) {
				new Notice('Bitte einen gültigen Hex-Farbwert (z.B. #242424) eingeben.');
				return;
			}
			this.onSelectColor(finalHex);
			this.close();
		});
	}

	public onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
