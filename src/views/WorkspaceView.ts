import type { RankingService } from '../services/RankingService';
import { Component, ItemView, WorkspaceLeaf, ViewStateResult, setIcon } from 'obsidian';
import { isSectionId, SECTIONS, SectionId } from '../sections';
import { ResourceList } from '../components/ResourceList';
import type { ResourceService } from '../services/ResourceService';
import type { Resource } from '../models/Resource';
import { parseListState } from '../utils/resourceLists';
import { ProjectsPanel } from '../components/ProjectsPanel';
import type { ProjectService } from '../services/ProjectService';
import type { Project } from '../models/Project';
import { decorateButton } from '../components/presentation';

export const WORKSPACE_VIEW_TYPE = 'research-inbox-workspace';

export class WorkspaceView extends ItemView {
	private section: SectionId = 'inbox';
	private sectionEl?: HTMLElement;
	private buttons = new Map<SectionId, HTMLButtonElement>();
	private panel?: Component;
	private inboxState = parseListState(undefined, 'inbox');
	private queueState = parseListState(undefined, 'queue');
	private libraryState = parseListState(undefined, 'library');
	private selectedProject = '';

	constructor(leaf: WorkspaceLeaf, private resources: ResourceService, private openCapture: () => void, private openReview: (resource: Resource) => void,
		private projects: ProjectService, private editProject: (project?: Project) => void, private assignProjects: (resource: Resource) => void, private ranking: RankingService, private openProject: (id: string) => void) {
		super(leaf);
	}

	getViewType(): string { return WORKSPACE_VIEW_TYPE; }
	getDisplayText(): string { return 'Research workspace'; }
	getIcon(): string { return 'library'; }

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('research-inbox-view', 'research-inbox-workspace');
		const header = this.contentEl.createEl('header', { cls: 'research-inbox-header' });
		const identity = header.createDiv({ cls: 'research-inbox-identity' });
		setIcon(identity.createSpan({ cls: 'research-inbox-brand', attr: { 'aria-hidden': 'true' } }), 'library');
		const heading = identity.createDiv();
		heading.createEl('h2', { text: 'Research workspace' });
		heading.createEl('p', { text: 'Capture, organize, and return to what matters.', cls: 'research-inbox-muted' });
		const add = header.createEl('button', { text: 'Add resource', cls: 'mod-cta', attr: { type: 'button' } });
		decorateButton(add, 'plus');
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
		return { ...super.getState(), section: this.section, inbox: { ...this.inboxState }, queue: { ...this.queueState }, library: { ...this.libraryState }, project: this.selectedProject };
	}

	selectProject(id: string): void { this.selectedProject = id; this.selectSection('projects'); }

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.section = state && typeof state === 'object' && 'section' in state && isSectionId(state.section)
			? state.section : 'inbox';
		this.inboxState = parseListState(state && typeof state === 'object' && 'inbox' in state ? state.inbox : undefined, 'inbox');
		this.queueState = parseListState(state && typeof state === 'object' && 'queue' in state ? state.queue : undefined, 'queue');
		this.libraryState = parseListState(state && typeof state === 'object' && 'library' in state ? state.library : undefined, 'library');
		this.selectedProject = state && typeof state === 'object' && 'project' in state && typeof state.project === 'string' ? state.project : '';
		this.renderSection();
		await super.setState(state, result);
	}

	onClose(): Promise<void> {
		if (this.panel) this.removeChild(this.panel);
		this.panel = undefined;
		this.buttons.clear();
		this.sectionEl = undefined;
		this.contentEl.empty();
		return Promise.resolve();
	}

	private renderSection(): void {
		if (!this.sectionEl) return;
		if (this.panel) this.removeChild(this.panel);
		this.panel = undefined;
		const section = SECTIONS.find((item) => item.id === this.section) ?? SECTIONS[0];
		for (const [id, button] of this.buttons) {
			button.setAttribute('aria-pressed', String(id === this.section));
		}
		this.sectionEl.empty();
		this.sectionEl.setAttribute('aria-label', section.label);
		const heading = this.sectionEl.createDiv({ cls: 'research-inbox-section-heading' });
		heading.createEl('h2', { text: section.label });
		heading.createEl('p', { text: section.description, cls: 'research-inbox-muted' });
		if (this.section !== 'projects') {
			const mode = this.section === 'inbox' ? 'inbox' : this.section === 'library' ? 'library' : 'queue';
			this.panel = this.addChild(new ResourceList(this.app, this.sectionEl.createDiv(), this.resources, {
				mode, state: mode === 'inbox' ? this.inboxState : mode === 'library' ? this.libraryState : this.queueState,
				onReview: this.openReview, onAssign: this.assignProjects, projects: this.projects, ranking: this.ranking, onOpenProject: this.openProject,
				onStateChange: (state) => {
					if (mode === 'inbox') this.inboxState = state;
					else if (mode === 'queue') this.queueState = state;
					else this.libraryState = state;
					this.app.workspace.requestSaveLayout();
				},
			}));
		} else {
			this.panel = this.addChild(new ProjectsPanel(this.app, this.sectionEl.createDiv(), this.projects, this.resources, this.selectedProject, this.ranking, {
				edit: this.editProject, assign: this.assignProjects, review: this.openReview,
				select: (id) => { this.selectedProject = id; this.app.workspace.requestSaveLayout(); },
			}));
		}
	}
}
