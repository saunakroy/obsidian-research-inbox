import { Component } from 'obsidian';
import type { ResourceService } from '../services/ResourceService';
import type { ProjectService } from '../services/ProjectService';
import type { ListState } from '../utils/resourceLists';

export class LibraryControls extends Component {
	constructor(private container: HTMLElement, private resources: ResourceService, private projects: ProjectService | undefined,
		private state: () => ListState, private change: (fields: Partial<ListState>) => void, private fixedProject?: string) { super(); }

	onload(): void {
		const controls = this.container.createDiv({ cls: 'research-inbox-library-controls' });
		const searchLabel = controls.createEl('label', { text: 'Search', cls: 'research-inbox-search-field' });
		const search = searchLabel.createEl('input', { attr: { type: 'search', placeholder: 'Title, author, or identifier', 'aria-label': 'Search resources' } });
		search.value = this.state().query ?? '';
		this.registerDomEvent(search, 'input', () => this.change({ query: search.value }));
		const project = this.fixedProject ? undefined : controls.createEl('label', { text: 'Project' })
			.createEl('select', { attr: { 'aria-label': 'Filter by project' } });
		const type = controls.createEl('label', { text: 'Type' }).createEl('select', { attr: { 'aria-label': 'Filter by resource type' } });
		if (project) this.registerDomEvent(project, 'change', () => this.change({ project: project.value }));
		this.registerDomEvent(type, 'change', () => this.change({ resourceType: type.value }));
		const refresh = (): void => {
			if (project) {
				project.empty();
				project.createEl('option', { text: 'All projects', value: 'all' });
				project.createEl('option', { text: 'Unassigned', value: 'none' });
				const projects = this.projects?.list() ?? [];
				const titleCounts = new Map<string, number>();
				for (const item of projects) titleCounts.set(item.title, (titleCounts.get(item.title) ?? 0) + 1);
				for (const item of projects) {
					const suffix = (titleCounts.get(item.title) ?? 0) > 1 ? ` · ${item.file.basename}` : '';
					project.createEl('option', { text: `${item.title}${item.status === 'archived' ? ' (archived)' : ''}${suffix}`, value: item.id });
				}
				const selected = this.state().project ?? 'all';
				if (selected !== 'all' && selected !== 'none' && !projects.some((item) => item.id === selected)) project.createEl('option', { text: 'Unavailable project', value: selected });
				project.value = selected;
			}
			type.empty();
			type.createEl('option', { text: 'All types', value: 'all' });
			const types = new Set(this.resources.list().map((resource) => resource.type ?? 'paper'));
			const selectedType = this.state().resourceType ?? 'all';
			if (selectedType !== 'all') types.add(selectedType);
			for (const value of [...types].sort()) type.createEl('option', { text: value === 'paper' ? 'Paper' : value, value });
			type.value = selectedType;
		};
		this.register(this.resources.subscribe(refresh));
		if (this.projects) this.register(this.projects.subscribe(refresh));
		refresh();
	}
}
