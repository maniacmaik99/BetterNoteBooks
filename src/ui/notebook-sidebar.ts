import { App, Menu, setIcon } from 'obsidian';
import { NotebookEngine } from '../engine/notebook-engine';
import { NotebookPage } from '../types';
import { PromptModal } from './prompt-modal';
import { t } from '../i18n';

export interface NotebookSidebarCallbacks {
	onSelectPage: (pageId: string) => void;
	onAddPage: () => void;
	onDeletePage: (pageId: string) => void;
	onDuplicatePage: (pageId: string) => void;
	onGroupChanged: (pageId: string, newGroup: string) => void;
	onFormatChangeRequested: (pageId: string) => void;
}

export class NotebookSidebar {
	private app: App;
	private containerEl: HTMLElement;
	private engine: NotebookEngine;
	private callbacks: NotebookSidebarCallbacks;

	private searchQuery = '';
	private activeGroupFilter = 'ALL';
	private activePageId: string | null = null;

	private listContainerEl!: HTMLElement;
	private searchInputEl!: HTMLInputElement;
	private groupSuggestionsEl!: HTMLElement;
	private activeFilterBadgeEl!: HTMLElement;

	constructor(
		app: App,
		parentEl: HTMLElement,
		engine: NotebookEngine,
		callbacks: NotebookSidebarCallbacks,
	) {
		this.app = app;
		this.engine = engine;
		this.callbacks = callbacks;

		this.containerEl = parentEl.createDiv({
			cls: 'betternotebook-sidebar',
		});

		this.renderHeader();
		this.renderSearchAndFilters();
		this.renderPageList();
	}

	public setEngine(engine: NotebookEngine): void {
		this.engine = engine;
		this.refresh();
	}

	public setActivePageId(pageId: string | null): void {
		this.activePageId = pageId;
		const cards =
			this.listContainerEl?.querySelectorAll<HTMLElement>(
				'.betternotebook-page-card',
			);
		if (cards) {
			cards.forEach((card) => {
				const id = card.getAttribute('data-page-id');
				if (id === pageId) {
					card.classList.add('is-active');
				} else {
					card.classList.remove('is-active');
				}
			});
		}
	}

	public refresh(): void {
		this.renderActiveFilterBadge();
		this.renderPageListItems();
	}

	private renderHeader(): void {
		const header = this.containerEl.createDiv({
			cls: 'betternotebook-sidebar-header',
		});

		const title = header.createSpan({
			cls: 'betternotebook-sidebar-title',
			text: t('sidebar_title'),
		});
		title.title = this.engine.getDocument().title;

		const addPageBtn = header.createEl('button', {
			cls: 'betternotebook-sidebar-icon-btn',
			title: t('sidebar_new_page'),
		});
		setIcon(addPageBtn, 'plus');
		addPageBtn.addEventListener('click', () => {
			this.callbacks.onAddPage();
		});
	}

	private renderSearchAndFilters(): void {
		const filterBox = this.containerEl.createDiv({
			cls: 'betternotebook-sidebar-filters',
		});

		// Active filter badge row (only shown when a group filter is active)
		this.activeFilterBadgeEl = filterBox.createDiv({
			cls: 'betternotebook-active-filter-row',
		});
		this.renderActiveFilterBadge();

		// Search input container with suggestions dropdown
		const searchContainer = filterBox.createDiv({
			cls: 'betternotebook-search-container',
		});

		this.searchInputEl = searchContainer.createEl('input', {
			cls: 'betternotebook-search-input',
			attr: {
				type: 'text',
				placeholder: t('sidebar_search_placeholder'),
			},
		});

		this.groupSuggestionsEl = searchContainer.createDiv({
			cls: 'betternotebook-group-suggestions-dropdown',
		});

		this.searchInputEl.addEventListener('focus', () => {
			this.renderGroupSuggestions();
			this.groupSuggestionsEl.addClass('is-open');
		});

		this.searchInputEl.addEventListener('click', () => {
			this.renderGroupSuggestions();
			this.groupSuggestionsEl.addClass('is-open');
		});

		this.searchInputEl.addEventListener('input', () => {
			this.searchQuery = this.searchInputEl.value.toLowerCase().trim();
			this.renderPageListItems();
			this.renderGroupSuggestions();
		});

		// Hide suggestions when clicking outside
		this.containerEl.addEventListener('click', (e) => {
			if (!searchContainer.contains(e.target as Node)) {
				this.groupSuggestionsEl.removeClass('is-open');
			}
		});
	}

	private renderActiveFilterBadge(): void {
		this.activeFilterBadgeEl.empty();
		if (this.activeGroupFilter !== 'ALL') {
			const badge = this.activeFilterBadgeEl.createDiv({
				cls: 'betternotebook-active-filter-badge',
			});
			badge.createSpan({ text: `Gruppe: ${this.activeGroupFilter}` });
			const clearBtn = badge.createSpan({
				cls: 'betternotebook-clear-filter-btn',
				text: '✕',
				title: 'Filter aufheben',
			});
			clearBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.activeGroupFilter = 'ALL';
				this.renderActiveFilterBadge();
				this.renderPageListItems();
			});
		}
	}

	private renderGroupSuggestions(): void {
		this.groupSuggestionsEl.empty();

		this.groupSuggestionsEl.createDiv({
			cls: 'betternotebook-suggestions-header',
			text: 'Themen & Gruppen auswählen',
		});

		// All pages option
		const allPages = this.engine.getPages();
		const allItem = this.groupSuggestionsEl.createDiv({
			cls: `betternotebook-suggestion-item ${this.activeGroupFilter === 'ALL' ? 'is-active' : ''}`,
		});
		allItem.createSpan({ text: 'Alle Seiten anzeigen' });
		allItem.createSpan({
			cls: 'betternotebook-suggestion-count',
			text: `${allPages.length}`,
		});
		allItem.addEventListener('click', (e) => {
			e.stopPropagation();
			this.activeGroupFilter = 'ALL';
			this.searchInputEl.value = '';
			this.searchQuery = '';
			this.groupSuggestionsEl.removeClass('is-open');
			this.renderActiveFilterBadge();
			this.renderPageListItems();
		});

		// Existing groups
		const groups = this.engine.getGroups();
		for (const grp of groups) {
			const count = allPages.filter((p) => p.group === grp).length;
			const item = this.groupSuggestionsEl.createDiv({
				cls: `betternotebook-suggestion-item ${this.activeGroupFilter === grp ? 'is-active' : ''}`,
			});
			item.createSpan({ text: grp });
			item.createSpan({
				cls: 'betternotebook-suggestion-count',
				text: `${count}`,
			});
			item.addEventListener('click', (e) => {
				e.stopPropagation();
				this.activeGroupFilter = grp;
				this.searchInputEl.value = '';
				this.searchQuery = '';
				this.groupSuggestionsEl.removeClass('is-open');
				this.renderActiveFilterBadge();
				this.renderPageListItems();
			});
		}

		// Option to create a new group
		const newItem = this.groupSuggestionsEl.createDiv({
			cls: 'betternotebook-suggestion-item new-group-action',
		});
		newItem.createSpan({ text: '+ Neue Gruppe anlegen...' });
		newItem.addEventListener('click', (e) => {
			e.stopPropagation();
			this.groupSuggestionsEl.removeClass('is-open');
			new PromptModal(
				this.app,
				'Neue Gruppe anlegen',
				'',
				'z.B. Mathematik, Vorlesung...',
				(newGroup) => {
					this.engine.addGroup(newGroup);
					this.activeGroupFilter = newGroup;
					this.renderActiveFilterBadge();
					this.renderPageListItems();
				},
			).open();
		});
	}

	private renderPageList(): void {
		this.listContainerEl = this.containerEl.createDiv({
			cls: 'betternotebook-sidebar-page-list',
		});
		this.renderPageListItems();
	}

	private renderPageListItems(): void {
		this.listContainerEl.empty();

		let pages = this.engine.getPages();

		// Filter by group if user selected a group
		if (this.activeGroupFilter !== 'ALL') {
			pages = pages.filter((p) => p.group === this.activeGroupFilter);
		}

		// Filter by search query if typed
		if (this.searchQuery) {
			pages = pages.filter((p) => {
				const titleMatch = p.title.toLowerCase().includes(this.searchQuery);
				const groupMatch = p.group
					? p.group.toLowerCase().includes(this.searchQuery)
					: false;
				const pageNumMatch = `seite ${p.pageNumber}`.includes(
					this.searchQuery,
				);
				return titleMatch || groupMatch || pageNumMatch;
			});
		}

		if (pages.length === 0) {
			this.listContainerEl.createDiv({
				cls: 'betternotebook-empty-state',
				text: 'Keine passenden Seiten gefunden.',
			});
			return;
		}

		for (const page of pages) {
			this.renderPageCard(page);
		}
	}

	private renderPageCard(page: NotebookPage): void {
		const isActive = this.activePageId === page.id;
		const card = this.listContainerEl.createDiv({
			cls: `betternotebook-page-card ${isActive ? 'is-active' : ''}`,
			attr: { 'data-page-id': page.id },
		});

		const info = card.createDiv({ cls: 'betternotebook-page-card-info' });

		const titleRow = info.createDiv({ cls: 'betternotebook-page-card-title' });
		titleRow.createSpan({
			text: `${page.pageNumber}. ${page.title || `Seite ${page.pageNumber}`}`,
		});

		const badgeRow = info.createDiv({ cls: 'betternotebook-page-card-badges' });
		badgeRow.createSpan({
			cls: 'betternotebook-badge format',
			text: (page.format || 'a4').toUpperCase(),
		});

		const openGroupMenu = (e: MouseEvent) => {
			e.stopPropagation();
			const menu = new Menu();
			const groups = this.engine.getGroups();

			for (const grp of groups) {
				menu.addItem((item) =>
					item
						.setTitle(grp)
						.setIcon(page.group === grp ? 'check' : 'tag')
						.onClick(() => {
							this.callbacks.onGroupChanged(page.id, grp);
							this.refresh();
						}),
				);
			}

			menu.addSeparator();

			menu.addItem((item) =>
				item
					.setTitle('+ Neue Gruppe anlegen...')
					.setIcon('plus')
					.onClick(() => {
						new PromptModal(
							this.app,
							'Neue Gruppe anlegen',
							'',
							'z.B. Mathematik, Vorlesung...',
							(newGroup) => {
								this.engine.addGroup(newGroup);
								this.callbacks.onGroupChanged(page.id, newGroup);
								this.refresh();
							},
						).open();
					}),
			);

			if (page.group) {
				menu.addItem((item) =>
					item
						.setTitle('Gruppe entfernen')
						.setIcon('trash')
						.onClick(() => {
							this.callbacks.onGroupChanged(page.id, '');
							this.refresh();
						}),
				);
			}

			menu.showAtMouseEvent(e);
		};

		if (page.group) {
			const groupBadge = badgeRow.createSpan({
				cls: 'betternotebook-badge group',
				text: page.group,
			});
			groupBadge.title = 'Klicken zum Ändern oder Zuweisen einer Gruppe';
			groupBadge.addEventListener('click', (e) => {
				openGroupMenu(e);
			});
		} else {
			const addGroupBadge = badgeRow.createSpan({
				cls: 'betternotebook-badge add-group',
				text: '+ Gruppe',
			});
			addGroupBadge.title = 'Thema / Gruppe zuweisen';
			addGroupBadge.addEventListener('click', (e) => {
				openGroupMenu(e);
			});
		}

		// Quick actions on card
		const actions = card.createDiv({
			cls: 'betternotebook-page-card-actions',
		});

		const dupBtn = actions.createEl('button', {
			cls: 'betternotebook-card-btn',
			title: t('sidebar_duplicate_page'),
		});
		setIcon(dupBtn, 'copy');
		dupBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.callbacks.onDuplicatePage(page.id);
		});

		const formatBtn = actions.createEl('button', {
			cls: 'betternotebook-card-btn',
			title: t('sidebar_change_format_bg'),
		});
		setIcon(formatBtn, 'sliders');
		formatBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.callbacks.onFormatChangeRequested(page.id);
		});

		const delBtn = actions.createEl('button', {
			cls: 'betternotebook-card-btn delete',
			title: t('sidebar_delete_page'),
		});
		setIcon(delBtn, 'trash-2');
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle(`Seite ${page.pageNumber} wirklich löschen`)
					.setIcon('trash-2')
					.onClick(() => {
						this.callbacks.onDeletePage(page.id);
					}),
			);
			menu.showAtMouseEvent(e);
		});

		// Jump to page on click
		card.addEventListener('click', () => {
			this.callbacks.onSelectPage(page.id);
		});
	}
}
