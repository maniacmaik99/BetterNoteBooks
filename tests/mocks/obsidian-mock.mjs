export class Notice {
	constructor(public_message, duration) {
		this.message = public_message;
		this.duration = duration;
	}
}

export function getLanguage() {
	return 'en';
}

export class App {}
export class TFile {
	constructor() {
		this.path = '';
		this.basename = '';
		this.name = '';
		this.stat = { mtime: Date.now() };
	}
}
export class TFolder {
	constructor() {
		this.path = '';
		this.children = [];
	}
}
export function normalizePath(path) {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}
export class Plugin {}
export class WorkspaceLeaf {}
export class ItemView {}
