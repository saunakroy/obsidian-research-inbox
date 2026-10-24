import { ItemView, WorkspaceLeaf, ViewStateResult, setIcon } from 'obsidian';
import { renderEmptyState } from '../components/emptyState';
import { isSectionId, SECTIONS, SectionId } from '../sections';
import { ResourceList } from '../components/ResourceList';
import type { ResourceService } from '../services/ResourceService';
import type { Resource } from '../models/Resource';
import { parseListState } from '../utils/resourceLists';

export const WORKSPACE_VIEW_TYPE = 'research-inbox-workspace';

export class WorkspaceView extends ItemView {
	private section: SectionId = 'inbox';
	private sectionEl?: HTMLElement;
	private buttons = new Map<SectionId, HTMLButtonElement>();
	private resourceList?: ResourceList;
	private inboxState = parseListState(undefined, 'inbox');
	private queueState = parseListState(undefined, 'queue');

	constructor(leaf: WorkspaceLeaf, private resources: ResourceService, private openCapture: () => void, private openReview: (resource: Resource) => void) {
		super(leaf);
	}

	getViewType(): string { return WORKSPACE_VIEW_TYPE; }
	getDisplayText(): string { return 'Research workspace'; }
	getIcon(): string { return 'library'; }

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('research-inbox-view', 'research-inbox-workspace');
		const header = this.contentEl.createEl('header', { cls: 'research-inbox-header' });
		header.createEl('h2', { text: 'Research workspace' });
		header.createEl('p', { text: 'Capture, organize, and return to what matters.', cls: 'research-inbox-muted' });
		this.contentEl.createEl('p', {
			text: 'Capture, queue, and review your research. Projects and library are coming later.',
			cls: 'research-inbox-preview',
		});
		const add = header.createEl('button', { text: 'Add resource', cls: 'mod-cta', attr: { type: 'button' } });
		this.registerDomEvent(add, 'click', this.openCapture);
		const nav = this.contentEl.createEl('nav', { cls: 'research-inbox-nav', attr: { 'aria-label': 'Research sections' } });
		for (const section of SECTIONS) {
			const button = nav.createEl('button', { attr: { type: 'button' } });
			setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), section.icon);
			button.createSpan({ text: section.label });
			this.registerDomEvent(button, 'click', () => this.selectSection(section.id));
			this.buttons.set(section.id, button);
		}
		this.sectionEl = this.contentEl.createEl('section', { attr: { 'aria-label': 'Inbox', 'aria-live': 'polite' } });
		this.renderSection();
		return Promise.resolve();
	}

	selectSection(section: SectionId, resetFilter = false): void {
		this.section = section;
		if (resetFilter && section === 'inbox') this.inboxState.filter = 'inbox';
		if (resetFilter && section === 'reading-queue') this.queueState.filter = 'active';
		this.renderSection();
		this.app.workspace.requestSaveLayout();
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), section: this.section, inbox: { ...this.inboxState }, queue: { ...this.queueState } };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.section = state && typeof state === 'object' && 'section' in state && isSectionId(state.section)
			? state.section : 'inbox';
		this.inboxState = parseListState(state && typeof state === 'object' && 'inbox' in state ? state.inbox : undefined, 'inbox');
		this.queueState = parseListState(state && typeof state === 'object' && 'queue' in state ? state.queue : undefined, 'queue');
		this.renderSection();
		await super.setState(state, result);
	}

	onClose(): Promise<void> {
		if (this.resourceList) this.removeChild(this.resourceList);
		this.resourceList = undefined;
		this.buttons.clear();
		this.sectionEl = undefined;
		this.contentEl.empty();
		return Promise.resolve();
	}

	private renderSection(): void {
		if (!this.sectionEl) return;
		if (this.resourceList) this.removeChild(this.resourceList);
		this.resourceList = undefined;
		const section = SECTIONS.find((item) => item.id === this.section) ?? SECTIONS[0];
		for (const [id, button] of this.buttons) {
			button.setAttribute('aria-pressed', String(id === this.section));
		}
		this.sectionEl.empty();
		this.sectionEl.setAttribute('aria-label', section.label);
		this.sectionEl.createEl('h2', { text: section.label });
		this.sectionEl.createEl('p', { text: section.description, cls: 'research-inbox-muted' });
		if (this.section === 'inbox' || this.section === 'reading-queue') {
			const mode = this.section === 'inbox' ? 'inbox' : 'queue';
			this.resourceList = this.addChild(new ResourceList(this.app, this.sectionEl.createDiv(), this.resources, {
				mode, state: mode === 'inbox' ? this.inboxState : this.queueState, onReview: this.openReview,
				onStateChange: (state) => {
					if (mode === 'inbox') this.inboxState = state;
					else this.queueState = state;
					this.app.workspace.requestSaveLayout();
				},
			}));
		} else {
			renderEmptyState(this.sectionEl, section.icon, section.emptyTitle, section.emptyDescription, section.availability);
		}
	}
}
