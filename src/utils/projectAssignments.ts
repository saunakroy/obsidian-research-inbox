import type { App } from 'obsidian';
import type { Project } from '../models/Project';
import type { Resource } from '../models/Resource';
import { assignmentVersion, resolveNoteLink, stringList } from './projects';

export function applyProjectAssignments(app: App, data: Record<string, unknown>, expected: Resource, selected: Project[], known: Project[]): void {
	if (assignmentVersion(data) !== (expected.projectVersion ?? assignmentVersion({ projects: [] }))) {
		throw new Error('Project assignments changed elsewhere. Close and reopen the form before saving.');
	}
	for (const field of ['projects', 'project_ids']) {
		if (data[field] != null && (!Array.isArray(data[field]) || (data[field] as unknown[]).some((value) => typeof value !== 'string'))) {
			throw new Error('Project properties must be lists of text. Check them in the note before saving.');
		}
	}
	const knownIds = new Set(known.map((project) => project.id));
	const unknownIds = stringList(data.project_ids).filter((id) => !knownIds.has(id));
	const unknownLinks = stringList(data.projects).filter((link) => {
		const file = resolveNoteLink(app, link, expected.file.path);
		return !known.some((project) => project.file === file);
	});
	data.project_ids = [...new Set([...selected.map((project) => project.id), ...unknownIds])];
	data.projects = [...new Set([...selected.map((project) => app.fileManager.generateMarkdownLink(project.file, expected.file.path)), ...unknownLinks])];
}
