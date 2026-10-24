import { stringifyYaml } from 'obsidian';
import type { CaptureDraft, Resource } from '../models/Resource';
import type { TFile } from 'obsidian';
import { parseArxivInput } from './arxiv';
import { readReview, reviewVersion } from './workflow';

export const DEFAULT_RESOURCE_FOLDER = 'Research Inbox/Resources';

export function validateResourceFolder(value: string): string {
	const folder = value.trim().replace(/\/+$/, '');
	if (!folder || folder.split('/').some((part) => !part.trim() || part.startsWith('.') || part !== part.trim())
		|| /[\\:*?"<>|]/u.test(folder) || [...folder].some((character) => character.charCodeAt(0) < 32)) {
		throw new Error('Use a vault-relative folder, such as Research Inbox/Resources, without hidden folders or special path characters.');
	}
	return folder;
}

// External metadata is plain text: never turn it into HTML, embeds, or active Markdown.
export function escapeMarkdown(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/([\\`*_{}[\]()#!|~$])/g, '\\$1');
}

export function createResourceNote(draft: CaptureDraft, whySaved: string, captured: string): string {
	const { paper, reference } = draft;
	const metadata: Record<string, unknown> = {
		research_id: `arxiv:${reference.id}`, arxiv_id: reference.id,
		type: 'paper', status: 'inbox', title: paper.title,
		source: reference.source, original_source: reference.originalInput,
		authors: paper.authors, captured, projects: [], metadata_status: draft.metadataStatus,
	};
	if (paper.published) metadata.published = paper.published;
	return `---\n${stringifyYaml(metadata).trimEnd()}\n---\n\n# ${escapeMarkdown(paper.title.replace(/\s+/g, ' '))}\n\n`
		+ `Source: <${reference.source}>\n\n## Abstract\n\n${escapeMarkdown(paper.abstract) || 'Metadata not available.'}\n\n`
		+ `## Why I Saved This\n\n${whySaved.trim()}\n\n## Key Takeaways\n\n## Open Questions\n\n## Personal Notes\n`;
}

export function resourceFromFrontmatter(file: TFile, raw: unknown): Resource | null {
	if (!raw || typeof raw !== 'object') return null;
	const data = raw as Record<string, unknown>;
	if (typeof data.research_id !== 'string' || !data.research_id.startsWith('arxiv:')) return null;
	try {
		const arxivId = parseArxivInput(data.research_id).id;
		return {
			file, arxivId,
			title: typeof data.title === 'string' && data.title.trim() ? data.title : file.basename,
			authors: Array.isArray(data.authors) ? data.authors.filter((author): author is string => typeof author === 'string') : [],
			captured: typeof data.captured === 'string' ? data.captured : '',
			status: typeof data.status === 'string' ? data.status : 'inbox',
			queuedAt: typeof data.queued_at === 'string' ? data.queued_at : undefined,
			readAt: typeof data.read_at === 'string' ? data.read_at : undefined,
			review: readReview(data),
			reviewVersion: reviewVersion(data),
		};
	} catch { return null; }
}
