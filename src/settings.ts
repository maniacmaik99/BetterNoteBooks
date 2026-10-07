import { App, PluginSettingTab, Setting } from 'obsidian';
import type BetterNotebookPlugin from './main';
import { PageFormat, PageOrientation, PageBackground } from './types';

export class BetterNotebookSettingTab extends PluginSettingTab {
	private plugin: BetterNotebookPlugin;

	constructor(app: App, plugin: BetterNotebookPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	public display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('betterNotebook Palette Einstellungen')
			.setHeading();

		new Setting(containerEl)
			.setName('Strich-Glättung (Smoothing Factor)')
			.setDesc(
				'Stärke der Interpolation zwischen Sensor-Events (höherer Wert = weichere Striche, geringere Jitter-Empfindlichkeit). Standard: 0.35',
			)
			.addSlider((slider) =>
				slider
					.setLimits(0.1, 0.9, 0.05)
					.setValue(this.plugin.settings.smoothingFactor)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.smoothingFactor = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Druck-Empfindlichkeit (Pressure Sensitivity)')
			.setDesc(
				'Skalierungsfaktor für Stylus-Druckerkennung (Arch Linux / Wayland Stylus). Standard: 2.0',
			)
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 4.0, 0.1)
					.setValue(this.plugin.settings.pressureSensitivity)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.pressureSensitivity = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Standard-Papierformat')
			.setDesc('Papierformat für neu erstellte Seiten.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('a4', 'DIN A4')
					.addOption('a5', 'DIN A5')
					.addOption('a3', 'DIN A3')
					.addOption('letter', 'US Letter')
					.setValue(this.plugin.settings.defaultPageFormat)
					.onChange(async (val) => {
						this.plugin.settings.defaultPageFormat = val as PageFormat;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Standard-Seitenausrichtung')
			.setDesc('Ausrichtung für neu angelegte Seiten.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('portrait', 'Hochformat (Portrait)')
					.addOption('landscape', 'Querformat (Landscape)')
					.setValue(this.plugin.settings.defaultOrientation)
					.onChange(async (val) => {
						this.plugin.settings.defaultOrientation =
							val as PageOrientation;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Standard-Hintergrundmuster')
			.setDesc('Muster für neu angelegte Seiten.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('ruled', 'Liniert')
					.addOption('grid', 'Kariert')
					.addOption('dotted', 'Gepunktet')
					.addOption('blank', 'Blanko')
					.setValue(this.plugin.settings.defaultBackground)
					.onChange(async (val) => {
						this.plugin.settings.defaultBackground =
							val as PageBackground;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Standard-Strichstärke')
			.setDesc('Standard-Breite des Stifts in Pixeln.')
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 0.5)
					.setValue(this.plugin.settings.defaultWidth)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.defaultWidth = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Standard-Farbe')
			.setDesc('Hex-Farbwert für den Stift beim Öffnen.')
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.defaultColor)
					.onChange(async (val) => {
						this.plugin.settings.defaultColor = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Formen-Erkennung (Draw and Hold)')
			.setDesc(
				'Hält man den Stift am Ende einer geometrischen Form still, wird sie automatisch begradigt (Linie, Bogen, Kreis, Rechteck, Dreieck).',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.shapeRecognitionEnabled)
					.onChange(async (val) => {
						this.plugin.settings.shapeRecognitionEnabled = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Halte-Dauer für Formen (ms)')
			.setDesc('Stillstandsdauer in Millisekunden, bevor die Form einrastet.')
			.addSlider((slider) =>
				slider
					.setLimits(250, 800, 50)
					.setValue(this.plugin.settings.shapeHoldDurationMs)
					.setDynamicTooltip()
					.onChange(async (val) => {
						this.plugin.settings.shapeHoldDurationMs = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Stift-Modus (Handflächenschutz / Stylus Only)')
			.setDesc(
				'Wenn aktiviert, schreibt ausschließlich der Stift (Stylus / Apple Pencil). Finger und Handfläche scrollen oder zoomen und zeichnen keine versehentlichen Striche.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stylusOnlyMode)
					.onChange(async (val) => {
						this.plugin.settings.stylusOnlyMode = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Zoom-adaptive Strichstärke')
			.setDesc(
				'Passt die Strichstärke beim Hineinzoomen automatisch an, sodass beim Hineinzoomen feinere Notizen geschrieben werden können und die Schrift auf dem Blatt proportional kleiner wird.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.zoomAdaptiveStrokeWidth)
					.onChange(async (val) => {
						this.plugin.settings.zoomAdaptiveStrokeWidth = val;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Notizbuch-Ordner im Vault')
			.setDesc(
				'Name des Vault-Ordners, in dem alle erstellten Notizbücher abgelegt und gesucht werden. Standard: notebooks',
			)
			.addText((text) =>
				text
					.setPlaceholder('notebooks')
					.setValue(this.plugin.settings.notebooksFolder || 'notebooks')
					.onChange(async (val) => {
						this.plugin.settings.notebooksFolder = val.trim() || 'notebooks';
						await this.plugin.saveSettings();
					}),
			);
	}
}
