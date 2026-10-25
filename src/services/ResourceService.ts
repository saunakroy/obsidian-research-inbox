import { App, Component, TFolder } from 'obsidian';
import type { CaptureDraft, Resource, ResourceStatus, ReviewInput } from '../models/Resource';
import { createResourceNote, resourceFromFrontmatter, validateResourceFolder } from '../utils/resourceNote';
import { applyWorkflowChange } from '../utils/workflow';
import type { ProjectService } from './ProjectService';
import { applyProjectAssignments } from '../utils/projectAssignments';

export class ResourceService extends Component {
	private resources = new Map<string, Resource>();
	private subscribers = new Set<() => void>();
	private writes: Promise<unknown> = Promise.resolve();
	private disposed = false;
	ready = false;

	constructor(private app: App, private getFolder: () => string) { super(); }

	onload(): void {
		this.registerEvent(this.app.metadataCache.on('changed', (file, _data, cache) => {
			const resource = resourceFromFrontmatter(file, cache.frontmatter);
			const existed = this.resources.delete(file.path);
			if (resource) this.resources.set(file.path, resource);
			if (resource || existed) this.notify();
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			let changed = false;
			for (const path of this.resources.keys()) {
				if (path === file.path || path.startsWith(`${file.path}/`)) {
					this.resources.delete(path);
					changed = true;
				}
			}
			if (changed) this.notify();
		}));
		this.registerEvent(this.app.vault.on('rename', () => {
			// TFile references have already received their new paths, including folder renames.
			this.resources = new Map([...this.resources.values()].map((resource) => [resource.file.path, resource]));
			this.notify();
		}));
		const initialize = (): void => {
			if (this.disposed || this.ready) return;
			const files = this.app.vault.getMarkdownFiles();
			let waitingForCache = false;
			for (const file of files) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (!cache) waitingForCache = true;
				const resource = resourceFromFrontmatter(file, cache?.frontmatter);
				if (resource) this.resources.set(file.path, resource);
			}
			this.ready = !waitingForCache;
			this.notify();
		};
		this.registerEvent(this.app.metadataCache.on('resolved', initialize));
		this.app.workspace.onLayoutReady(initialize);
	}

	onunload(): void {
		this.disposed = true;
		this.subscribers.clear();
		this.resources.clear();
	}

	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback);
		return () => { this.subscribers.delete(callback); };
	}

	listInbox(): Resource[] {
		return [...this.resources.values()].filter((resource) => resource.status === 'inbox')
			.sort((a, b) => b.captured.localeCompare(a.captured) || a.title.localeCompare(b.title));
	}

	find(arxivId: string): Resource | undefined {
		return [...this.resources.values()].find((resource) => resource.arxivId === arxivId);
	}

	list(): Resource[] { return [...this.resources.values()]; }

	setStatus(resource: Resource, target: ResourceStatus): Promise<Resource> {
		return this.enqueue(() => this.updateWorkflow(resource, target));
	}

	saveReview(resource: Resource, review: ReviewInput): Promise<Resource> {
		const snapshot = { ...review };
		return this.enqueue(() => this.updateWorkflow(resource, 'read', snapshot));
	}

	assignProjects(resource: Resource, projectIds: string[], projects: ProjectService): Promise<Resource> {
		const ids = [...new Set(projectIds)];
		return this.enqueue(() => this.updateResource(resource, (data) => {
			if (!projects.ready) throw new Error('Projects are still loading. Try again shortly.');
			const selected = ids.map((id) => {
				const project = projects.find(id);
				if (!project || this.app.vault.getAbstractFileByPath(project.file.path) !== project.file) throw new Error('A selected project is unavailable or has a duplicate identifier. Reopen the assignment form.');
				return project;
			});
			applyProjectAssignments(this.app, data, resource, selected, projects.list());
		}));
	}

	create(draft: CaptureDraft, whySaved: string): Promise<{ resource: Resource; duplicate: boolean }> {
		return this.enqueue(() => this.createOnce(draft, whySaved));
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.writes.then(operation);
		this.writes = result.catch(() => undefined);
		return result;
	}

	private async updateWorkflow(resource: Resource, target: ResourceStatus, review?: ReviewInput): Promise<Resource> {
		return this.updateResource(resource, (data) => applyWorkflowChange(data, resource, target, new Date().toISOString(), review));
	}

	private async updateResource(resource: Resource, mutate: (data: Record<string, unknown>) => void): Promise<Resource> {
		this.assertAvailable();
		if (this.app.vault.getAbstractFileByPath(resource.file.path) !== resource.file) {
			throw new Error('This note was deleted or replaced. Reopen it from the workspace before trying again.');
		}
		let updated: Resource | null = null;
		await this.app.fileManager.processFrontMatter(resource.file, (data: Record<string, unknown>) => {
			this.assertAvailable();
			const current = resourceFromFrontmatter(resource.file, data);
			if (!current || current.arxivId !== resource.arxivId) throw new Error('This note is no longer a recognized resource for the same paper. Nothing was changed.');
			mutate(data);
			updated = resourceFromFrontmatter(resource.file, data);
		});
		if (!updated) throw new Error('Could not read the updated resource. Reopen its note to check the properties.');
		if (!this.disposed) {
			this.resources.set(resource.file.path, updated);
			this.notify();
		}
		return updated;
	}

	private async createOnce(draft: CaptureDraft, whySaved: string): Promise<{ resource: Resource; duplicate: boolean }> {
		this.assertAvailable();
		const existing = this.find(draft.reference.id);
		if (existing) return { resource: existing, duplicate: true };
		if (!draft.paper.title.trim()) throw new Error('Enter a title before saving.');
		const folder = validateResourceFolder(this.getFolder());
		let parent = '';
		for (const segment of folder.split('/')) {
			this.assertAvailable();
			parent = parent ? `${parent}/${segment}` : segment;
			const entry = this.app.vault.getAbstractFileByPath(parent);
			if (entry && !(entry instanceof TFolder)) throw new Error(`A file already exists at ${parent}. Choose another resource folder in settings.`);
			if (!entry) {
				try { await this.app.vault.createFolder(parent); }
				catch (error) {
					if (!(this.app.vault.getAbstractFileByPath(parent) instanceof TFolder)) throw error;
				}
			}
		}
		this.assertAvailable();
		const concurrent = this.find(draft.reference.id);
		if (concurrent) return { resource: concurrent, duplicate: true };
		const stem = `${folder}/arxiv-${draft.reference.id.replace('/', '-')}`;
		let path = `${stem}.md`;
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(path)) path = `${stem} ${suffix++}.md`;
		const captured = new Date().toISOString();
		// Vault.create never overwrites a note; do not use modify/process for capture.
		const file = await this.app.vault.create(path, createResourceNote(draft, whySaved, captured));
		const resource: Resource = {
			file, arxivId: draft.reference.id, title: draft.paper.title,
			authors: [...draft.paper.authors], status: 'inbox', captured, type: 'paper', projects: [], projectIds: [],
		};
		if (!this.disposed) {
			this.resources.set(file.path, resource);
			this.notify();
		}
		return { resource, duplicate: false };
	}

	private assertAvailable(): void {
		if (this.disposed) throw new Error('Research Inbox has been disabled. Re-enable it before saving.');
		if (!this.ready) throw new Error('The vault is still loading. Try again in a moment.');
	}

	private notify(): void {
		for (const callback of this.subscribers) {
			try { callback(); }
			catch (error) { console.error('Research Inbox: view refresh failed', error); }
		}
	}
}
