import { App, Component, stringifyYaml, TFolder } from 'obsidian';
import type { Project, ProjectDraft } from '../models/Project';
import type { Resource } from '../models/Resource';
import { applyProjectEdit, projectFromFrontmatter, resolveNoteLink, validateProjectDraft } from '../utils/projects';
import { validateResourceFolder } from '../utils/resourceNote';

export class ProjectService extends Component {
	private projects = new Map<string, Project>();
	private subscribers = new Set<() => void>();
	private writes: Promise<unknown> = Promise.resolve();
	private disposed = false;
	ready = false;

	constructor(private app: App, private getFolder: () => string) { super(); }

	onload(): void {
		this.registerEvent(this.app.metadataCache.on('changed', (file, _text, cache) => {
			const project = projectFromFrontmatter(file, cache.frontmatter);
			const existed = this.projects.delete(file.path);
			if (project) this.projects.set(file.path, project);
			if (project || existed) this.notify();
		}));
		this.registerEvent(this.app.vault.on('rename', () => {
			this.projects = new Map([...this.projects.values()].map((project) => [project.file.path, project]));
			this.notify();
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			for (const path of this.projects.keys()) if (path === file.path || path.startsWith(`${file.path}/`)) this.projects.delete(path);
			this.notify();
		}));
		const initialize = (): void => {
			if (this.disposed || this.ready) return;
			let pending = false;
			for (const file of this.app.vault.getMarkdownFiles()) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (!cache) pending = true;
				const project = projectFromFrontmatter(file, cache?.frontmatter);
				if (project) this.projects.set(file.path, project);
			}
			this.ready = !pending;
			this.notify();
		};
		this.registerEvent(this.app.metadataCache.on('resolved', initialize));
		this.app.workspace.onLayoutReady(initialize);
	}

	onunload(): void { this.disposed = true; this.projects.clear(); this.subscribers.clear(); }
	subscribe(callback: () => void): () => void { this.subscribers.add(callback); return () => { this.subscribers.delete(callback); }; }
	list(): Project[] { return [...this.projects.values()].sort((a, b) => a.title.localeCompare(b.title) || a.file.path.localeCompare(b.file.path)); }
	find(id: string): Project | undefined {
		const matches = [...this.projects.values()].filter((project) => project.id === id);
		return matches.length === 1 ? matches[0] : undefined;
	}
	matches(resource: Resource, id: string): boolean {
		if (resource.projectIds?.includes(id)) return true;
		const project = this.find(id);
		return !!project && !!resource.projects?.some((link) => resolveNoteLink(this.app, link, resource.file.path) === project.file);
	}

	save(draft: ProjectDraft, expected?: Project): Promise<Project> {
		const snapshot = { ...draft, questions: [...draft.questions], linkedNotes: [...draft.linkedNotes] };
		const result = this.writes.then(() => this.saveOnce(snapshot, expected));
		this.writes = result.catch(() => undefined);
		return result;
	}

	private async saveOnce(input: ProjectDraft, expected?: Project): Promise<Project> {
		this.assertReady();
		const folder = validateResourceFolder(this.getFolder());
		const draft = validateProjectDraft(this.app, input, expected?.file.path ?? `${folder}/project.md`);
		let project: Project | null = null;
		if (expected) {
			if (!this.find(expected.id) || this.app.vault.getAbstractFileByPath(expected.file.path) !== expected.file) throw new Error('This project was removed, replaced, or has a duplicate identifier. Check its note.');
			await this.app.fileManager.processFrontMatter(expected.file, (data: Record<string, unknown>) => {
				this.assertReady();
				applyProjectEdit(data, expected, draft);
				project = projectFromFrontmatter(expected.file, data);
			});
		} else {
			const id = crypto.randomUUID();
			let parent = '';
			for (const segment of folder.split('/')) {
				this.assertReady();
				parent = parent ? `${parent}/${segment}` : segment;
				const entry = this.app.vault.getAbstractFileByPath(parent);
				if (entry && !(entry instanceof TFolder)) throw new Error(`A file blocks the project folder at ${parent}. Choose another folder in settings.`);
				if (!entry) {
					try { await this.app.vault.createFolder(parent); }
					catch (error) { if (!(this.app.vault.getAbstractFileByPath(parent) instanceof TFolder)) throw error; }
				}
			}
			this.assertReady();
			const stem = `${folder}/project-${id}`;
			let path = `${stem}.md`;
			let suffix = 2;
			while (this.app.vault.getAbstractFileByPath(path)) path = `${stem} ${suffix++}.md`;
			const data = {
				research_project_id: `project:${id}`, type: 'research-project', title: draft.title,
				description: draft.description, project_status: draft.status,
				research_questions: draft.questions, related_notes: draft.linkedNotes, created: new Date().toISOString(),
			};
			const file = await this.app.vault.create(path, `---\n${stringifyYaml(data).trimEnd()}\n---\n\n# Research project\n\n## Notes\n`);
			project = projectFromFrontmatter(file, data);
		}
		if (!project) throw new Error('Could not read project details. Check its note.');
		const saved: Project = project;
		if (!this.disposed) { this.projects.set(saved.file.path, saved); this.notify(); }
		return saved;
	}

	private assertReady(): void {
		if (this.disposed) throw new Error('Research Inbox has been disabled.');
		if (!this.ready) throw new Error('Projects are still loading. Try again in a moment.');
	}
	private notify(): void {
		for (const callback of this.subscribers) {
			try { callback(); } catch (error) { console.error('Research Inbox: project view refresh failed', error); }
		}
	}
}
