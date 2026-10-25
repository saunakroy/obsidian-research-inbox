import { App, Notice, requireApiVersion } from 'obsidian';
import type { SectionId } from './sections';
import { SIDEBAR_VIEW_TYPE } from './views/SidebarView';
import { WORKSPACE_VIEW_TYPE, WorkspaceView } from './views/WorkspaceView';

export class ResearchNavigation {
	private pending = new Map<string, Promise<void>>();
	private disposed = false;

	constructor(private app: App) {}

	openSidebar(): void {
		this.schedule(SIDEBAR_VIEW_TYPE);
	}

	openWorkspace(section?: SectionId, resetFilter = false): void {
		this.schedule(WORKSPACE_VIEW_TYPE, section, resetFilter);
	}
	openProject(id: string): void { this.schedule(WORKSPACE_VIEW_TYPE, 'projects', false, id); }

	dispose(): void {
		this.disposed = true;
	}

	private schedule(type: string, section?: SectionId, resetFilter = false, projectId?: string): void {
		// Serialize opens per view type, including rapid clicks before setViewState resolves.
		const previous = this.pending.get(type) ?? Promise.resolve();
		const next = previous.then(async () => {
			if (this.disposed) return;
			const workspace = this.app.workspace;
			let leaf = workspace.getLeavesOfType(type)[0];
			if (!leaf) {
				const created = type === SIDEBAR_VIEW_TYPE ? workspace.getRightLeaf(false) : workspace.getLeaf('tab');
				if (!created) throw new Error('No sidebar pane is available.');
				leaf = created;
				await leaf.setViewState({ type, active: true });
			}
			if (this.disposed) return;
			// Revealing first also loads deferred views on newer Obsidian versions.
			if (requireApiVersion('1.7.2')) {
				await workspace.revealLeaf(leaf);
			} else {
				const root = leaf.getRoot();
				if (root === workspace.rightSplit) workspace.rightSplit.expand();
				if (root === workspace.leftSplit) workspace.leftSplit.expand();
				workspace.setActiveLeaf(leaf, { focus: true });
			}
			if (!this.disposed && section && leaf.view instanceof WorkspaceView) {
				if (projectId) leaf.view.selectProject(projectId);
				else leaf.view.selectSection(section, resetFilter);
			}
		}).catch((error: unknown) => {
			if (this.disposed) return;
			console.error('Research Inbox: could not open view', error);
			new Notice('Could not open research inbox. Try reopening it from the command palette.');
		});
		this.pending.set(type, next);
		void next.then(() => {
			if (this.pending.get(type) === next) this.pending.delete(type);
		});
	}
}
