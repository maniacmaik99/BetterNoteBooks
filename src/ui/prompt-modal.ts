import { App, Modal, Setting } from 'obsidian';

export class PromptModal extends Modal {
	private titleText: string;
	private defaultValue: string;
	private placeholder: string;
	private onSubmit: (value: string) => void;

	constructor(
		app: App,
		titleText: string,
		defaultValue: string,
		placeholder: string,
		onSubmit: (value: string) => void,
	) {
		super(app);
		this.titleText = titleText;
		this.defaultValue = defaultValue;
		this.placeholder = placeholder;
		this.onSubmit = onSubmit;
	}

	public onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('betternotebook-modal');

		contentEl.createEl('h3', { text: this.titleText });

		let val = this.defaultValue;
		new Setting(contentEl).addText((text) => {
			text
				.setPlaceholder(this.placeholder)
				.setValue(val)
				.onChange((v) => {
					val = v;
				});
			text.inputEl.focus();
			text.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					const trimmed = val.trim();
					if (trimmed) {
						this.onSubmit(trimmed);
						this.close();
					}
				}
			});
		});

		const footer = contentEl.createDiv({ cls: 'betternotebook-modal-footer' });
		const cancelBtn = footer.createEl('button', { text: 'Abbrechen' });
		cancelBtn.addEventListener('click', () => this.close());

		const confirmBtn = footer.createEl('button', {
			cls: 'mod-cta',
			text: 'Übernehmen',
		});
		confirmBtn.addEventListener('click', () => {
			const trimmed = val.trim();
			if (trimmed) {
				this.onSubmit(trimmed);
				this.close();
			}
		});
	}

	public onClose(): void {
		this.contentEl.empty();
	}
}
