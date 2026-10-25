import type { RankingService } from '../services/RankingService';
import { App, Component, Notice, setIcon } from 'obsidian';
import type { Project } from '../models/Project';
import type { Resource } from '../models/Resource';
import type { ProjectService } from '../services/ProjectService';
import type { ResourceService } from '../services/ResourceService';
import { questionLinks, resolveNoteLink } from '../utils/projects';
import { parseListState } from '../utils/resourceLists';
import { ResourceList } from './ResourceList';
import { decorateButton, renderEmptyState } from './presentation';

interface ProjectActions {
	edit: (project?: Project) => void;
	assign: (resource: Resource) => void;
	review: (resource: Resource) => void;
	select: (id: string) => void;
}

export class ProjectsPanel extends Component {
	private rendered?: Component;
	private listState = parseListState(undefined, 'library');
	constructor(private app: App, private container: HTMLElement, private projects: ProjectService,
		private resources: ResourceService, private selected: string, private ranking: RankingService, private actions: ProjectActions) { super(); }

	onload(): void {
		this.register(this.projects.subscribe(() => this.render()));
		this.register(this.resources.subscribe(() => { if (!this.selected) this.render(); }));
		this.render();
	}
	onunload(): void { this.container.empty(); }

	private render(): void {
		if (this.rendered) this.removeChild(this.rendered);
		this.rendered = this.addChild(new Component());
		this.container.empty();
		const controls = this.container.createDiv({ cls: 'research-inbox-actions' });
		const create = this.button(controls, 'Create project', () => this.actions.edit());
		decorateButton(create, 'plus');
		if (!this.projects.ready) { this.container.createEl('p', { text: 'Loading projects…' }); return; }
		if (this.selected) {
			this.button(controls, 'All projects', () => this.select(''));
			const project = this.projects.find(this.selected);
			if (!project) { this.container.createEl('p', { text: 'This project is unavailable or has a duplicate identifier. Check its note or select another project.' }); return; }
			this.renderProject(project);
			return;
		}
		const projects = this.projects.list();
		const titleCounts = new Map<string, number>();
		for (const project of projects) titleCounts.set(project.title, (titleCounts.get(project.title) ?? 0) + 1);
		if (!projects.length) renderEmptyState(this.container, 'folder-open', 'Give your research a direction', 'Create a project to connect questions, notes, and resources.');
		const grid = this.container.createDiv({ cls: 'research-inbox-project-grid' });
		for (const project of projects) {
			const card = grid.createDiv({ cls: 'research-inbox-card research-inbox-project-card' });
			const meta = card.createDiv({ cls: 'research-inbox-resource-meta' });
			setIcon(meta.createSpan({ cls: 'research-inbox-icon', attr: { 'aria-hidden': 'true' } }), 'folder-open');
			meta.createSpan({ text: project.status === 'archived' ? 'Archived' : 'Active', cls: 'research-inbox-status' });
			this.button(card, project.title, () => this.select(project.id)).addClass('research-inbox-resource-title');
			card.createEl('p', { text: project.description || 'No description yet.', cls: 'research-inbox-muted research-inbox-project-description' });
			const count = this.resources.list().filter((resource) => this.projects.matches(resource, project.id)).length;
			card.createEl('p', { text: `${project.questions.length} ${project.questions.length === 1 ? 'question' : 'questions'} · ${count} ${count === 1 ? 'resource' : 'resources'}`, cls: 'research-inbox-muted research-inbox-project-stats' });
			if ((titleCounts.get(project.title) ?? 0) > 1) card.createEl('p', { text: project.file.path, cls: 'research-inbox-muted research-inbox-project-path' });
		}
	}

	private renderProject(project: Project): void {
		const overview = this.container.createDiv({ cls: 'research-inbox-project-overview' });
		overview.createEl('p', { text: project.status === 'archived' ? 'Archived project' : 'Active project', cls: 'research-inbox-eyebrow' });
		overview.createEl('h3', { text: project.title });
		overview.createEl('p', { text: project.description || 'No description yet.', cls: 'research-inbox-project-description' });
		const controls = overview.createDiv({ cls: 'research-inbox-actions' });
		this.button(controls, 'Edit project', () => this.actions.edit(project));
		this.button(controls, 'Open project note', () => {
			void this.app.workspace.getLeaf('tab').openFile(project.file).catch(() => new Notice('Could not open the project note.'));
		});
		this.container.createEl('h3', { text: 'Research questions' });
		if (!project.questions.length) this.container.createEl('p', { text: 'Edit this project to add questions.' });
		const questions = this.container.createEl('ol', { cls: 'research-inbox-questions' });
		for (const question of project.questions) {
			const item = questions.createEl('li');
			item.createEl('p', { text: question });
			for (const link of questionLinks(question)) this.linkButton(item, link, project.file.path);
		}
		if (project.linkedNotes.length) {
			this.container.createEl('h3', { text: 'Linked notes' });
			const links = this.container.createDiv({ cls: 'research-inbox-actions' });
			for (const link of project.linkedNotes) this.linkButton(links, link, project.file.path);
		}
		this.container.createEl('h3', { text: 'Project resources' });
		this.container.createEl('p', { text: 'Assign resources here from the inbox or library. Choose queued and reading to see this project’s reading queue.', cls: 'research-inbox-muted' });
		this.rendered?.addChild(new ResourceList(this.app, this.container.createDiv(), this.resources, {
			mode: 'library', projects: this.projects, ranking: this.ranking, projectId: project.id, state: this.listState,
			onStateChange: (state) => { this.listState = state; }, onAssign: this.actions.assign, onReview: this.actions.review,
		}));
	}

	private linkButton(parent: HTMLElement, link: string, source: string): void {
		const file = resolveNoteLink(this.app, link, source);
		if (!file) { parent.createSpan({ text: `Unavailable note: ${link}`, cls: 'research-inbox-muted' }); return; }
		this.button(parent, file.basename, () => {
			void this.app.workspace.getLeaf('tab').openFile(file).catch(() => new Notice('Could not open the linked note.'));
		});
	}
	private button(parent: HTMLElement, text: string, callback: () => void): HTMLButtonElement {
		const button = parent.createEl('button', { text, attr: { type: 'button' } });
		this.rendered?.registerDomEvent(button, 'click', callback);
		return button;
	}
	private select(id: string): void { this.selected = id; this.listState = parseListState(undefined, 'library'); this.actions.select(id); this.render(); }
}
