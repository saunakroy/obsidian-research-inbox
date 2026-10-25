import { App, Component, Notice } from 'obsidian';
import { USEFULNESS } from '../models/Resource';
import type { Resource, ResourceStatus } from '../models/Resource';
import type { ResourceService } from '../services/ResourceService';
import { FILTERS, parseListState, selectResources } from '../utils/resourceLists';
import type { ListMode, ListState } from '../utils/resourceLists';
import type { ProjectService } from '../services/ProjectService';
import type { RankingService } from '../services/RankingService';
import { renderRecommendation } from './recommendation';
import { isRecommendationCandidate } from '../utils/relevance';
import { LibraryControls } from './LibraryControls';
import { decorateButton, renderEmptyState } from './presentation';

interface ListOptions {
	mode: ListMode;
	compact?: boolean;
	limit?: number;
	state?: ListState;
	onStateChange?: (state: ListState) => void;
	onReview?: (resource: Resource) => void;
	onAssign?: (resource: Resource) => void;
	projects?: ProjectService;
	projectId?: string;
	ranking?: RankingService;
	onOpenProject?: (id: string) => void;
}

const STATUS_LABELS: Record<string, string> = { inbox: 'Inbox', queued: 'Queued', reading: 'Reading', read: 'Read', archived: 'Archived' };

export class ResourceList extends Component {
	private rows?: Component;
	private listEl!: HTMLElement;
	private countEl!: HTMLElement;
	private rankingStatus?: HTMLElement;
	private state: ListState;
	private busy = new Set<string>();
	private closed = false;
	private visibleCount = 50;

	constructor(private app: App, private container: HTMLElement, private resources: ResourceService, private options: ListOptions) {
		super();
		this.state = parseListState(options.state, options.mode);
	}

	onload(): void {
		if (!this.options.compact) this.renderControls();
		this.container.toggleClass('research-inbox-compact', !!this.options.compact);
		this.countEl = this.container.createEl('p', { cls: 'research-inbox-muted research-inbox-result-count', attr: { role: 'status', tabindex: '-1' } });
		this.listEl = this.container.createDiv();
		this.register(this.resources.subscribe(() => this.renderRows()));
		if (this.options.projects) this.register(this.options.projects.subscribe(() => this.renderRows()));
		if (this.options.ranking) this.register(this.options.ranking.subscribe(() => this.renderRows()));
		this.renderRows();
	}

	onunload(): void { this.closed = true; this.container.empty(); }

	private renderControls(): void {
		const toolbar = this.container.createDiv({ cls: 'research-inbox-toolbar' });
		if (this.options.mode === 'library') this.addChild(new LibraryControls(toolbar, this.resources, this.options.projects,
			() => this.state, (fields) => {
				this.state = parseListState({ ...this.state, ...fields }, 'library');
				this.options.onStateChange?.({ ...this.state }); this.visibleCount = 50; this.renderRows();
			}, this.options.projectId));
		const controls = toolbar.createDiv({ cls: 'research-inbox-list-controls' });
		const filterLabel = controls.createEl('label', { text: 'Show' });
		const filter = filterLabel.createEl('select', { attr: { 'aria-label': 'Filter resources by reading status' } });
		for (const [value, label] of Object.entries(FILTERS[this.options.mode])) filter.createEl('option', { text: label, value });
		filter.value = this.state.filter;
		const sortLabel = controls.createEl('label', { text: 'Sort' });
		const sort = sortLabel.createEl('select', { attr: { 'aria-label': 'Sort resources' } });
		for (const [value, label] of Object.entries({ oldest: 'Oldest first', newest: 'Newest first', title: 'Title', relevance: 'Relevance' })) {
			sort.createEl('option', { text: label, value });
		}
		sort.value = this.state.sort;
		const change = (): void => {
			this.state = parseListState({ ...this.state, filter: filter.value, sort: sort.value }, this.options.mode);
			this.visibleCount = 50;
			this.options.onStateChange?.({ ...this.state });
			this.renderRows();
		};
		this.registerDomEvent(filter, 'change', change);
		this.registerDomEvent(sort, 'change', change);
		this.rankingStatus = this.container.createEl('p', { cls: 'research-inbox-muted', attr: { role: 'status' } });
		if (this.options.mode === 'queue') this.container.createEl('p', {
			text: 'Active reading comes first. Dates use when a paper was queued, or completed in the completed view.', cls: 'research-inbox-muted',
		});
	}

	private renderRows(): void {
		if (this.closed) return;
		const active = this.container.ownerDocument.activeElement;
		const focusKey = active && this.listEl.contains(active) ? active.getAttribute('data-research-focus') : null;
		if (this.rows) this.removeChild(this.rows);
		this.rows = this.addChild(new Component());
		this.listEl.empty();
		const ranking = this.options.ranking;
		const projectId = this.options.projectId ?? this.state.project;
		this.rankingStatus?.setText(this.state.sort !== 'relevance' ? '' : ranking?.failed
			? 'Relevance is unavailable. Showing oldest first; try reloading the plugin.' : ranking?.ready
			? 'Relevance uses active projects and reading feedback. Ties and resources without a match use oldest first.' : 'Updating relevance…');
		const resources = selectResources(this.resources.list(), { ...this.state, project: this.options.projectId ?? this.state.project },
			this.options.projects ? (resource, id) => this.options.projects!.matches(resource, id) : undefined,
			(resource) => ranking?.get(resource, projectId)?.weight ?? 0);
		const name = this.options.mode === 'library' ? 'found' : this.state.filter === 'archived' ? 'archived' : this.state.filter === 'read' ? 'completed' : this.options.mode === 'queue' ? 'in reading queue' : 'in inbox';
		this.countEl.setText(this.resources.ready ? `${resources.length} ${resources.length === 1 ? 'resource' : 'resources'} ${name}` : 'Loading resources…');
		if (!this.resources.ready) return;
		if (!resources.length) renderEmptyState(this.listEl, this.options.mode === 'library' ? 'search' : this.options.mode === 'queue' ? 'book-open' : 'inbox',
			this.options.mode === 'library' ? 'No matching resources' : this.state.filter === 'inbox' ? 'Your inbox is clear' : this.state.filter === 'active' ? 'Make room for your next read' : 'Nothing here yet',
			this.options.mode === 'library' ? 'Try another search or adjust your filters.' : this.state.filter === 'inbox' ? 'Add an arXiv paper when something catches your interest.'
				: this.state.filter === 'active' ? 'Queue a paper from the inbox to get started.' : 'Resources with this status will appear here.');
		const list = this.listEl.createEl('ul', { cls: 'research-inbox-resources' });
		const focusTargets = new Map<string, HTMLButtonElement>();
		const projects = this.options.projects?.list() ?? [];
		for (const resource of resources.slice(0, this.options.limit ?? this.visibleCount)) {
			const item = list.createEl('li', { cls: 'research-inbox-card research-inbox-resource' });
			const meta = item.createDiv({ cls: 'research-inbox-resource-meta' });
			meta.createSpan({ text: STATUS_LABELS[resource.status] ?? resource.status, cls: 'research-inbox-status', attr: { 'data-status': resource.status } });
			meta.createSpan({ text: resource.type ?? 'paper', cls: 'research-inbox-resource-type' });
			if (!this.options.compact) meta.createSpan({ text: resource.arxivId });
			const button = (parent: HTMLElement, label: string, key: string, action: () => void): HTMLButtonElement => {
				const focus = JSON.stringify([resource.file.path, key]);
				const element = parent.createEl('button', { text: label, attr: { type: 'button', 'data-research-focus': focus } });
				focusTargets.set(focus, element);
				this.rows?.registerDomEvent(element, 'click', action);
				return element;
			};
			const title = button(item, resource.title, 'open', () => {
				void this.app.workspace.getLeaf('tab').openFile(resource.file).catch(() => new Notice('Could not open this note. It may have been moved or deleted.'));
			});
			title.addClass('research-inbox-resource-title');
			title.setAttribute('aria-label', `Open note: ${resource.title}`);
			if (resource.authors.length) item.createEl('p', { text: resource.authors.join(', '), cls: 'research-inbox-muted research-inbox-authors' });
			const projectNames = projects.filter((project) => this.options.projects?.matches(resource, project.id)).map((project) => project.title);
			if (projectNames.length) item.createEl('p', { text: `Projects: ${projectNames.join(', ')}`, cls: 'research-inbox-muted' });
			const details = item.createDiv({ cls: 'research-inbox-resource-meta research-inbox-resource-details' });
			const captured = new Date(resource.captured);
			if (!Number.isNaN(captured.getTime())) details.createSpan({ text: `Saved ${captured.toLocaleDateString()}` });
			if (this.options.compact) details.createSpan({ text: resource.arxivId });
			if (resource.status === 'read' && resource.review?.usefulness) details.createSpan({ text: USEFULNESS[resource.review.usefulness], cls: 'research-inbox-feedback' });
			if (ranking && this.rows) renderRecommendation(item, this.rows, resource, ranking, projectId, this.options.onOpenProject, this.options.compact);
			if (ranking?.ready && this.state.sort === 'relevance' && isRecommendationCandidate(resource) && !ranking.get(resource, projectId)) {
				item.createEl('p', { text: 'No active-project match from the available context.', cls: 'research-inbox-muted' });
			}
			if (this.options.compact) continue;
			const actions = item.createDiv({ cls: 'research-inbox-actions' });
			const transition = (label: string, target: ResourceStatus): void => {
				const action = button(actions, label, target, () => {
					if (this.busy.has(resource.file.path)) return;
					this.busy.add(resource.file.path);
					item.setAttribute('aria-busy', 'true');
					action.setAttribute('aria-disabled', 'true');
					void this.resources.setStatus(resource, target).then(() => {
						new Notice(target === 'queued' ? 'Resource added to reading queue.' : target === 'reading' ? 'Marked as reading.' : target === 'archived' ? 'Resource archived.' : 'Resource returned to inbox.');
					}).catch((error: unknown) => {
						new Notice(error instanceof Error ? error.message : 'Could not update reading status. Try again.');
					}).finally(() => {
						this.busy.delete(resource.file.path);
						item.removeAttribute('aria-busy');
						action.removeAttribute('aria-disabled');
					});
				});
				if (target === 'queued' || target === 'reading') { action.addClass('research-inbox-primary-action'); decorateButton(action, target === 'reading' ? 'book-open' : 'list-plus'); }
			};
			if (resource.status === 'inbox') transition('Queue', 'queued');
			if (resource.status === 'queued') transition('Start reading', 'reading');
			if (resource.status === 'queued' || resource.status === 'reading' || resource.status === 'read') {
				button(actions, resource.status === 'read' ? 'Edit review' : 'Mark read', 'review', () => {
					if (!this.busy.has(resource.file.path)) this.options.onReview?.(resource);
				});
			}
			if (resource.status === 'queued' || resource.status === 'reading') transition('Defer', 'inbox');
			if (resource.status === 'read') transition('Read again', 'queued');
			if (this.options.onAssign) button(actions, 'Assign projects', 'projects', () => this.options.onAssign?.(resource));
			if (resource.status === 'archived') transition('Restore to inbox', 'inbox');
			else if (['inbox', 'queued', 'reading', 'read'].includes(resource.status)) transition('Archive', 'archived');
		}
		if (this.options.limit && resources.length > this.options.limit) this.listEl.createEl('p', { text: 'Open the workspace to see all resources.', cls: 'research-inbox-muted' });
		if (!this.options.limit && resources.length > this.visibleCount) {
			const more = this.listEl.createEl('button', { text: 'Show more', attr: { type: 'button' } });
			this.rows.registerDomEvent(more, 'click', () => { this.visibleCount += 50; this.renderRows(); this.countEl.focus(); });
		}
		if (focusKey) (focusTargets.get(focusKey) ?? focusTargets.values().next().value ?? this.countEl).focus();
	}
}
