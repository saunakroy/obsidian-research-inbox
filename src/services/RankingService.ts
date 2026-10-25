import { App, Component, TFile } from 'obsidian';
import type { Resource } from '../models/Resource';
import type { Recommendation } from '../models/Recommendation';
import type { ProjectService } from './ProjectService';
import type { ResourceService } from './ResourceService';
import { extractAbstract, isRecommendationCandidate, rankResources } from '../utils/relevance';
import { questionLinks, resolveNoteLink } from '../utils/projects';

/** Read-only, disposable recommendations. Source notes remain the authority. */
export class RankingService extends Component {
	private abstracts = new Map<TFile, { stamp: number; text: string; failed: boolean }>();
	private recommendations = new Map<string, Recommendation[]>();
	private subscribers = new Set<() => void>();
	private dirty = false;
	private running = false;
	private disposed = false;
	ready = false;
	failed = false;

	constructor(private app: App, private resources: ResourceService, private projects: ProjectService) { super(); }

	onload(): void {
		this.register(this.resources.subscribe(() => this.schedule()));
		this.register(this.projects.subscribe(() => this.schedule()));
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && this.resources.list().some((resource) => resource.file === file)) {
				this.abstracts.delete(file); this.schedule();
			}
		}));
		this.schedule();
	}

	onunload(): void { this.disposed = true; this.ready = false; this.abstracts.clear(); this.recommendations.clear(); this.subscribers.clear(); }
	subscribe(callback: () => void): () => void { this.subscribers.add(callback); return () => { this.subscribers.delete(callback); }; }
	get(resource: Resource, projectId?: string): Recommendation | undefined {
		if (!this.ready || !isRecommendationCandidate(resource)) return undefined;
		const items = this.recommendations.get(resource.file.path) ?? [];
		return projectId && projectId !== 'all' && projectId !== 'none' ? items.find((item) => item.project.id === projectId) : items[0];
	}
	abstractUnavailable(resource: Resource): boolean { return this.abstracts.get(resource.file)?.failed ?? false; }

	private schedule(): void {
		if (this.disposed) return;
		this.dirty = true; this.ready = false; this.failed = false;
		if (this.running) return;
		this.running = true;
		// Coalesce synchronous metadata notifications and keep I/O out of onload.
		void Promise.resolve().then(() => this.refresh()).catch((error: unknown) => {
			if (!this.disposed) {
				this.failed = true;
				console.error('Research Inbox: could not refresh relevance', error);
				this.notify();
			}
		}).finally(() => { this.running = false; if (this.dirty && !this.disposed) this.schedule(); });
	}

	private async refresh(): Promise<void> {
		while (this.dirty && !this.disposed) {
			this.dirty = false;
			if (!this.resources.ready || !this.projects.ready) return;
			const resources = this.resources.list();
			const projects = this.projects.list().filter((project) => project.status === 'active' && this.projects.find(project.id));
			const files = new Set(resources.filter((resource) => isRecommendationCandidate(resource) || resource.review?.usefulness).map((resource) => resource.file));
			for (const file of this.abstracts.keys()) if (!files.has(file) || !projects.length) this.abstracts.delete(file);
			if (projects.length) for (const file of files) {
				if (this.disposed || this.dirty) break;
				const stamp = file.stat.mtime;
				if (this.abstracts.get(file)?.stamp === stamp) continue;
				let text = ''; let failed = false;
				try { text = extractAbstract(await this.app.vault.cachedRead(file)); } catch { failed = true; }
				if (this.disposed || this.dirty) break;
				this.abstracts.set(file, { stamp, text, failed });
			}
			if (this.disposed || this.dirty) continue;
			const linkedNoteNames = new Map(projects.map((project) => [project.id,
				[...project.linkedNotes, ...project.questions.flatMap(questionLinks)].map((link) => resolveNoteLink(this.app, link, project.file.path)?.basename ?? '').join(' ')]));
			this.recommendations = rankResources({ resources, projects, linkedNoteNames,
				abstracts: new Map(resources.map((resource) => [resource.file.path, this.abstracts.get(resource.file)?.text ?? ''])),
				matchesProject: (resource, id) => this.projects.matches(resource, id),
			});
			this.ready = true;
			this.notify();
		}
	}

	private notify(): void {
		for (const callback of [...this.subscribers]) {
			try { callback(); } catch (error) { console.error('Research Inbox: relevance view refresh failed', error); }
		}
	}
}
