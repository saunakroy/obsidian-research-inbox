import { App, Component, Notice } from 'obsidian';
import { USEFULNESS } from '../models/Resource';
import type { Resource, ResourceStatus } from '../models/Resource';
import type { ResourceService } from '../services/ResourceService';
import { FILTERS, parseListState, selectResources } from '../utils/resourceLists';
import type { ListMode, ListState } from '../utils/resourceLists';

interface ListOptions {
	mode: ListMode;
	compact?: boolean;
	limit?: number;
	state?: ListState;
	onStateChange?: (state: ListState) => void;
	onReview?: (resource: Resource) => void;
}

const STATUS_LABELS: Record<string, string> = { inbox: 'Inbox', queued: 'Queued', reading: 'Reading', read: 'Read', archived: 'Archived' };

export class ResourceList extends Component {
	private rows?: Component;
	private listEl!: HTMLElement;
	private countEl!: HTMLElement;
	private state: ListState;
	private busy = new Set<string>();
	private closed = false;

	constructor(private app: App, private container: HTMLElement, private resources: ResourceService, private options: ListOptions) {
		super();
		this.state = parseListState(options.state, options.mode);
	}

	onload(): void {
		if (!this.options.compact) this.renderControls();
		this.countEl = this.container.createEl('p', { cls: 'research-inbox-muted', attr: { role: 'status', tabindex: '-1' } });
		this.listEl = this.container.createDiv();
		this.register(this.resources.subscribe(() => this.renderRows()));
		this.renderRows();
	}

	onunload(): void { this.closed = true; this.container.empty(); }

	private renderControls(): void {
		const controls = this.container.createDiv({ cls: 'research-inbox-list-controls' });
		const filterLabel = controls.createEl('label', { text: 'Show' });
		const filter = filterLabel.createEl('select', { attr: { 'aria-label': 'Filter resources by reading status' } });
		for (const [value, label] of Object.entries(FILTERS[this.options.mode])) filter.createEl('option', { text: label, value });
		filter.value = this.state.filter;
		const sortLabel = controls.createEl('label', { text: 'Sort' });
		const sort = sortLabel.createEl('select', { attr: { 'aria-label': 'Sort resources' } });
		for (const [value, label] of Object.entries({ oldest: 'Oldest first', newest: 'Newest first', title: 'Title' })) {
			sort.createEl('option', { text: label, value });
		}
		sort.value = this.state.sort;
		const change = (): void => {
			this.state = parseListState({ filter: filter.value, sort: sort.value }, this.options.mode);
			this.options.onStateChange?.({ ...this.state });
			this.renderRows();
		};
		this.registerDomEvent(filter, 'change', change);
		this.registerDomEvent(sort, 'change', change);
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
		const resources = selectResources(this.resources.list(), this.state);
		const name = this.state.filter === 'archived' ? 'archived' : this.state.filter === 'read' ? 'completed' : this.options.mode === 'queue' ? 'in reading queue' : 'in inbox';
		this.countEl.setText(this.resources.ready ? `${resources.length} ${resources.length === 1 ? 'resource' : 'resources'} ${name}` : 'Loading resources…');
		if (!this.resources.ready) return;
		if (!resources.length) this.listEl.createEl('p', {
			text: this.state.filter === 'inbox' ? 'Save an arXiv paper to start your research inbox.'
				: this.state.filter === 'active' ? 'Queue a paper from the inbox to choose your next read.' : 'No resources with this status.',
		});
		const list = this.listEl.createEl('ul', { cls: 'research-inbox-resources' });
		const focusTargets = new Map<string, HTMLButtonElement>();
		for (const resource of resources.slice(0, this.options.limit)) {
			const item = list.createEl('li', { cls: 'research-inbox-card' });
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
			if (resource.authors.length) item.createEl('p', { text: resource.authors.join(', '), cls: 'research-inbox-muted' });
			item.createEl('p', { text: `${STATUS_LABELS[resource.status] ?? resource.status} · ${resource.arxivId}`, cls: 'research-inbox-muted' });
			const captured = new Date(resource.captured);
			if (!Number.isNaN(captured.getTime())) item.createEl('p', { text: `Saved ${captured.toLocaleDateString()}`, cls: 'research-inbox-muted' });
			if (resource.status === 'read' && resource.review?.usefulness) item.createEl('p', { text: USEFULNESS[resource.review.usefulness], cls: 'research-inbox-muted' });
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
			if (resource.status === 'archived') transition('Restore to inbox', 'inbox');
			else transition('Archive', 'archived');
		}
		if (this.options.limit && resources.length > this.options.limit) this.listEl.createEl('p', { text: 'Open the workspace to see all resources.', cls: 'research-inbox-muted' });
		if (focusKey) (focusTargets.get(focusKey) ?? focusTargets.values().next().value ?? this.countEl).focus();
	}
}
