export class Notice {
	constructor(public message: string, public duration?: number) {}
}

export class App {}
export class TFile {
	path = '';
	basename = '';
	name = '';
	stat = { mtime: Date.now() };
}
export class TFolder {
	path = '';
	children: any[] = [];
}
export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}
export class Plugin {}
export class WorkspaceLeaf {}
export class ItemView {}
