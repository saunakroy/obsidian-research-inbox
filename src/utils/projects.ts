import { App, parseLinktext, TFile } from 'obsidian';
import type { Project, ProjectDraft } from '../models/Project';

export const DEFAULT_PROJECT_FOLDER = 'Research Inbox/Projects';
const fields = ['title', 'description', 'research_questions', 'related_notes', 'project_status'] as const;
export const stringList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function projectVersion(data: Record<string, unknown>): string {
	return JSON.stringify(fields.map((key) => data[key] ?? null));
}

export function projectFromFrontmatter(file: TFile, raw: unknown): Project | null {
	if (!raw || typeof raw !== 'object') return null;
	const data = raw as Record<string, unknown>;
	if (typeof data.research_project_id !== 'string' || !/^project:[a-z0-9-]+$/i.test(data.research_project_id)) return null;
	return {
		id: data.research_project_id, file, version: projectVersion(data),
		title: typeof data.title === 'string' && data.title.trim() ? data.title : file.basename,
		description: typeof data.description === 'string' ? data.description : '',
		questions: stringList(data.research_questions), linkedNotes: stringList(data.related_notes),
		status: data.project_status === 'archived' ? 'archived' : 'active',
	};
}

export function resolveNoteLink(app: App, text: string, source: string): TFile | null {
	let path = text.trim();
	const wiki = /^\[\[([^\]]+)\]\]$/.exec(path);
	const markdown = /^\[[^\]]*\]\((.+)\)$/.exec(path);
	if (wiki?.[1]) path = wiki[1].split('|')[0] ?? '';
	else if (markdown?.[1]) {
		try { path = decodeURIComponent(markdown[1].replace(/^<|>$/g, '')); } catch { return null; }
	}
	if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
	const file = app.metadataCache.getFirstLinkpathDest(parseLinktext(path).path, source);
	return file instanceof TFile && file.extension === 'md' ? file : null;
}

export function questionLinks(question: string): string[] {
	return Array.from(question.matchAll(/\[\[[^[\]]+\]\]/g), (match) => match[0]);
}

export function validateProjectDraft(app: App, draft: ProjectDraft, source: string): ProjectDraft {
	const result = {
		title: draft.title.trim(), description: draft.description.trim(), status: draft.status,
		questions: draft.questions.map((question) => question.trim()).filter(Boolean),
		linkedNotes: [...new Set(draft.linkedNotes.map((link) => link.trim()).filter(Boolean))],
	};
	if (!result.title) throw new Error('Enter a project title.');
	if (!['active', 'archived'].includes(result.status)) throw new Error('Choose an active or archived project status.');
	for (const link of [...result.linkedNotes, ...result.questions.flatMap(questionLinks)]) {
		if (!resolveNoteLink(app, link, source)) throw new Error(`Could not find a Markdown note for ${link}. Use an existing note path or link.`);
	}
	result.linkedNotes = [...new Set(result.linkedNotes.map((link) => {
		if (link.startsWith('[')) return link;
		const file = resolveNoteLink(app, link, source);
		return file ? app.fileManager.generateMarkdownLink(file, source) : link;
	}))];
	return result;
}

export function applyProjectEdit(data: Record<string, unknown>, expected: Project, draft: ProjectDraft): void {
	if (data.research_project_id !== expected.id) throw new Error('This note is no longer the same project. Reopen it before editing.');
	if (projectVersion(data) !== expected.version) throw new Error('Project details changed elsewhere. Close and reopen the form before saving.');
	if (data.project_status != null && data.project_status !== 'active' && data.project_status !== 'archived') {
		throw new Error('Project status is unrecognized. Check it in the note before saving.');
	}
	for (const key of ['title', 'description', 'project_status']) {
		if (data[key] != null && typeof data[key] !== 'string') throw new Error('Project text properties are malformed. Check them in the note.');
	}
	for (const key of ['research_questions', 'related_notes']) {
		if (data[key] != null && (!Array.isArray(data[key]) || (data[key] as unknown[]).some((value) => typeof value !== 'string'))) {
			throw new Error('Project questions and linked notes must be lists of text. Check them in the note.');
		}
	}
	data.title = draft.title;
	data.description = draft.description;
	data.research_questions = draft.questions;
	data.related_notes = draft.linkedNotes;
	data.project_status = draft.status;
}

export function assignmentVersion(data: Record<string, unknown>): string {
	return JSON.stringify([data.project_ids ?? null, data.projects ?? null]);
}
