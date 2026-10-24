import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type { ResearchNavigation } from '../navigation';
import { SECTIONS } from '../sections';
import { ResourceList } from '../components/ResourceList';
import type { ResourceService } from '../services/ResourceService';

export const SIDEBAR_VIEW_TYPE = 'research-inbox-sidebar';

export class SidebarView extends ItemView {
	private inboxList?: ResourceList;
	private queueList?: ResourceList;

	constructor(leaf: WorkspaceLeaf, private researchNavigation: ResearchNavigation, private resources: ResourceService, private openCapture: () => void) {
		super(leaf);
	}

	getViewType(): string { return SIDEBAR_VIEW_TYPE; }
	getDisplayText(): string { return 'Research inbox'; }
	getIcon(): string { return 'inbox'; }

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('research-inbox-view', 'research-inbox-sidebar');
		this.contentEl.createEl('h2', { text: 'Research inbox' });
		this.contentEl.createEl('p', { text: 'Your research, ready to review.', cls: 'research-inbox-muted' });
		const capture = this.contentEl.createDiv({ cls: 'research-inbox-card' });
		capture.createEl('h3', { text: 'Quick capture' });
		const add = capture.createEl('button', { text: 'Add resource', cls: 'mod-cta', attr: { type: 'button' } });
		this.registerDomEvent(add, 'click', this.openCapture);
		capture.createEl('p', { text: 'Save an arXiv link or identifier.', cls: 'research-inbox-muted' });
		const inbox = this.contentEl.createDiv({ cls: 'research-inbox-card' });
		inbox.createEl('h3', { text: 'Pending inbox' });
		this.inboxList = this.addChild(new ResourceList(this.app, inbox.createDiv(), this.resources, { mode: 'inbox', compact: true, limit: 2 }));
		const next = this.contentEl.createDiv({ cls: 'research-inbox-card' });
		next.createEl('h3', { text: 'Up next' });
		this.queueList = this.addChild(new ResourceList(this.app, next.createDiv(), this.resources, { mode: 'queue', compact: true, limit: 2 }));
		const open = this.contentEl.createEl('button', { text: 'Open workspace', cls: 'mod-cta', attr: { type: 'button' } });
		this.registerDomEvent(open, 'click', () => this.researchNavigation.openWorkspace());
		const nav = this.contentEl.createEl('nav', { cls: 'research-inbox-shortcuts', attr: { 'aria-label': 'Open research section' } });
		for (const section of SECTIONS) {
			const button = nav.createEl('button', { attr: { type: 'button' } });
			setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), section.icon);
			button.createSpan({ text: section.label });
			this.registerDomEvent(button, 'click', () => this.researchNavigation.openWorkspace(section.id));
		}
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		if (this.inboxList) this.removeChild(this.inboxList);
		this.inboxList = undefined;
		if (this.queueList) this.removeChild(this.queueList);
		this.queueList = undefined;
		this.contentEl.empty();
		return Promise.resolve();
	}
}
