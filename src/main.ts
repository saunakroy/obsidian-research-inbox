import { RankingService } from './services/RankingService';
import { Plugin } from 'obsidian';
import { CaptureModal } from './modals/CaptureModal';
import { ReviewModal } from './modals/ReviewModal';
import type { Resource } from './models/Resource';
import type { Project } from './models/Project';
import { ProjectService } from './services/ProjectService';
import { ProjectModal } from './modals/ProjectModal';
import { AssignProjectsModal } from './modals/AssignProjectsModal';
import { DEFAULT_PROJECT_FOLDER } from './utils/projects';
import { ArxivClient } from './services/ArxivClient';
import { CaptureService } from './services/CaptureService';
import { ResourceService } from './services/ResourceService';
import { ResearchSettingsTab } from './settings/SettingsTab';
import { DEFAULT_RESOURCE_FOLDER, validateResourceFolder } from './utils/resourceNote';
import { ResearchNavigation } from './navigation';
import { SidebarView, SIDEBAR_VIEW_TYPE } from './views/SidebarView';
import { WorkspaceView, WORKSPACE_VIEW_TYPE } from './views/WorkspaceView';

export default class ResearchInboxPlugin extends Plugin {
	async onload(): Promise<void> {
		let resourceFolder = DEFAULT_RESOURCE_FOLDER;
		let projectFolder = DEFAULT_PROJECT_FOLDER;
		const saved: unknown = await this.loadData();
		if (saved && typeof saved === 'object' && 'resourceFolder' in saved && typeof saved.resourceFolder === 'string') {
			try { resourceFolder = validateResourceFolder(saved.resourceFolder); }
			catch { /* Use the safe default if an old setting is invalid. */ }
		}
		if (saved && typeof saved === 'object' && 'projectFolder' in saved && typeof saved.projectFolder === 'string') {
			try { projectFolder = validateResourceFolder(saved.projectFolder); } catch { /* Use the safe default. */ }
		}
		const navigation = new ResearchNavigation(this.app);
		const resources = this.addChild(new ResourceService(this.app, () => resourceFolder));
		const projects = this.addChild(new ProjectService(this.app, () => projectFolder));
		const ranking = this.addChild(new RankingService(this.app, resources, projects));
		const client = new ArxivClient();
		const capture = new CaptureService(resources, client);
		let modal: CaptureModal | undefined;
		let reviewModal: ReviewModal | undefined;
		let projectModal: ProjectModal | undefined;
		let assignmentModal: AssignProjectsModal | undefined;
		const editProject = (project?: Project): void => {
			if (projectModal) return;
			projectModal = new ProjectModal(this.app, projects, (saved) => navigation.openProject(saved.id), () => { projectModal = undefined; }, project);
			projectModal.open();
		};
		const assignProjects = (resource: Resource): void => {
			if (assignmentModal) return;
			assignmentModal = new AssignProjectsModal(this.app, resource, projects, resources, () => { assignmentModal = undefined; });
			assignmentModal.open();
		};
		const openReview = (resource: Resource): void => {
			if (reviewModal) return;
			reviewModal = new ReviewModal(this.app, resources, resource, () => { reviewModal = undefined; });
			reviewModal.open();
		};
		const openCapture = (): void => {
			if (modal) return;
			modal = new CaptureModal(this.app, capture, () => navigation.openWorkspace('inbox', true), () => { modal = undefined; });
			modal.open();
		};
		this.register(() => { modal?.close(); reviewModal?.close(); projectModal?.close(); assignmentModal?.close(); client.dispose(); });
		this.register(() => navigation.dispose());
		this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new SidebarView(leaf, navigation, resources, openCapture, ranking));
		this.registerView(WORKSPACE_VIEW_TYPE, (leaf) => new WorkspaceView(leaf, resources, openCapture, openReview, projects, editProject, assignProjects, ranking, (id) => navigation.openProject(id)));
		this.addSettingTab(new ResearchSettingsTab(this.app, this, () => ({ resourceFolder, projectFolder }), async (folders) => {
			await this.saveData(folders);
			resourceFolder = folders.resourceFolder;
			projectFolder = folders.projectFolder;
		}));
		this.addCommand({ id: 'create-project', name: 'Create project', callback: () => editProject() });
		this.addCommand({ id: 'open-projects', name: 'Open projects', callback: () => navigation.openWorkspace('projects') });
		this.addCommand({ id: 'open-library', name: 'Open library', callback: () => navigation.openWorkspace('library') });
		this.addCommand({ id: 'add-resource', name: 'Add resource', callback: openCapture });
		this.addCommand({ id: 'open-reading-queue', name: 'Open reading queue', callback: () => navigation.openWorkspace('reading-queue') });
		this.addRibbonIcon('inbox', 'Open research inbox', () => navigation.openSidebar());
		this.addCommand({
			id: 'open-sidebar', name: 'Open sidebar',
			callback: () => navigation.openSidebar(),
		});
		this.addCommand({
			id: 'open-workspace', name: 'Open workspace',
			callback: () => navigation.openWorkspace(),
		});
		// Obsidian unregisters views on unload and preserves their layout for reload.
	}
}
