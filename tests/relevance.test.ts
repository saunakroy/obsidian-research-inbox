import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TFile as ObsidianFile } from 'obsidian';
import type { Resource, ReviewInput } from '../src/models/Resource';
import type { Project } from '../src/models/Project';
import { extractAbstract, rankResources, terms } from '../src/utils/relevance';
import type { RankingContext } from '../src/utils/relevance';
import { parseListState, selectResources } from '../src/utils/resourceLists';
import { TFile } from './obsidianMock';

function paper(id: string, overrides: Partial<Resource> = {}): Resource {
	return { file: new TFile(`${id}.md`) as unknown as ObsidianFile, arxivId: id, title: 'Spatial editing with Gaussian splatting',
		authors: [], status: 'queued', captured: '2026-10-01', ...overrides };
}
function project(overrides: Partial<Project> = {}): Project {
	return { id: 'project:a', file: new TFile('Project.md') as unknown as ObsidianFile, version: '', title: 'Spatial editing',
		description: 'Localized changes', questions: ['How does spatial editing preserve consistency?'], linkedNotes: [], status: 'active', ...overrides };
}
function context(resources: Resource[], projects = [project()], overrides: Partial<RankingContext> = {}): RankingContext {
	return { resources, projects, abstracts: new Map(), linkedNoteNames: new Map(), matchesProject: (resource, id) => !!resource.projectIds?.includes(id), ...overrides };
}

void test('abstract extraction ignores properties and annotations and handles CRLF, escaping, and missing metadata', () => {
	const note = '---\ntitle: private\n---\n# Paper\n\n## Abstract\n\nSpatial \\*editing\\* &amp; consistency.\n\n## Why I Saved This\nSecret notes';
	assert.equal(extractAbstract(note), 'Spatial *editing* & consistency.');
	assert.equal(extractAbstract(note.replace(/\n/g, '\r\n')), 'Spatial *editing* & consistency.');
	assert.equal(extractAbstract('---\ntext: |\n  ## Abstract\n  private\n---\n## Notes\nPrivate'), '');
	assert.equal(extractAbstract('## Abstract\nMetadata not available.\n## Notes\nSpatial editing'), '');
	assert.equal(extractAbstract('## Abstract\nOnly an abstract'), 'Only an abstract');
	assert.equal(extractAbstract('# Personal notes\nspatial editing'), '');
});

void test('term matching normalizes case and Unicode and ignores common words and repeated words', () => {
	assert.deepEqual([...terms('HOW can ＳＰＡＴＩＡＬ spatial editing 2026 3D AI naïve?')], ['spatial', 'editing', '3d', 'ai', 'naïve']);
	assert.equal(terms('the and research methods paper available metadata').size, 0);
});

void test('suggestions explain project terms and exact research questions without creating assignments', () => {
	const resource = paper('a'); const input = context([resource]);
	const before = JSON.stringify(input.resources);
	const match = rankResources(input).get(resource.file.path)?.[0];
	assert.ok(match);
	assert.equal(match.assigned, false);
	assert.equal(match.weight, 8);
	assert.match(match.reasons.join(' '), /editing, spatial/);
	assert.equal(match.questions[0]?.question, input.projects[0]?.questions[0]);
	assert.deepEqual(match.questions[0]?.terms, ['editing', 'spatial']);
	assert.equal(JSON.stringify(input.resources), before);
	assert.equal(resource.projectIds, undefined);
});

void test('saved abstract terms can establish a match when the title cannot', () => {
	const resource = paper('a', { title: 'An unrelated title' });
	assert.equal(rankResources(context([resource])).get(resource.file.path)?.length, 0);
	const match = rankResources(context([resource], [project()], { abstracts: new Map([[resource.file.path, 'Localized spatial editing']]) })).get(resource.file.path)?.[0];
	assert.equal(match?.questions.length, 1);
});

void test('explicit assignments and linked note names are independent, explainable signals', () => {
	const resource = paper('a', { title: 'Unrelated topic', projectIds: ['project:a'] });
	const assigned = rankResources(context([resource])).get(resource.file.path)?.[0];
	assert.equal(assigned?.weight, 8);
	assert.equal(assigned?.assigned, true);
	assert.match(assigned?.reasons[0] ?? '', /You assigned/);
	const unassigned = paper('b', { title: 'Gaussian splatting' });
	const linked = rankResources(context([unassigned], [project({ questions: [] })], { linkedNoteNames: new Map([['project:a', 'Gaussian splatting']]) })).get(unassigned.file.path)?.[0];
	assert.equal(linked?.weight, 2);
	assert.match(linked?.reasons[0] ?? '', /linked note names/);
});

void test('no active project or shared context means no invented recommendation', () => {
	const resource = paper('a');
	for (const projects of [[], [project({ status: 'archived' })], [project({ title: 'Biology', description: '', questions: [] })]]) {
		assert.equal(rankResources(context([resource], projects)).get(resource.file.path)?.length, 0);
	}
	const generic = paper('b', { title: 'A new research paper using methods' });
	assert.equal(rankResources(context([generic], [project({ title: 'Research methods', description: '', questions: ['What methods can we use?'] })])).get(generic.file.path)?.length, 0);
});

void test('only inbox, queued, and reading resources receive suggestions', () => {
	const resources = ['inbox', 'queued', 'reading', 'read', 'archived', 'custom'].map((status) => paper(status, { status }));
	const result = rankResources(context(resources));
	assert.deepEqual([...result.keys()], ['inbox.md', 'queued.md', 'reading.md']);
});

void test('usefulness changes priority modestly and names the reviewed evidence', () => {
	const candidate = paper('candidate');
	const base = rankResources(context([candidate])).get(candidate.file.path)?.[0]?.weight ?? 0;
	for (const [usefulness, delta] of [['useful', 3], ['somewhat_useful', 1], ['not_useful', -3]] as const) {
		const review: ReviewInput = { usefulness, takeaways: '', questions: '' };
		const read = paper('read', { status: 'read', projectIds: ['project:a'], review });
		const match = rankResources(context([candidate, read])).get(candidate.file.path)?.[0];
		assert.equal(match?.weight, base + delta);
		assert.match(match?.reasons.join(' ') ?? '', new RegExp(delta > 0 ? 'Raised priority' : 'Lowered priority'));
		assert.ok(match?.reasons.some((reason) => reason.includes(read.title)));
	}
});

void test('feedback does not cross projects, use self-reviews, or infer usefulness from completion', () => {
	const candidate = paper('candidate');
	const base = rankResources(context([candidate])).get(candidate.file.path)?.[0]?.weight;
	const rated = paper('read', { status: 'read', projectIds: ['project:other'], review: { usefulness: 'useful', takeaways: '', questions: '' } });
	for (const feedback of [rated, { ...rated, arxivId: candidate.arxivId, projectIds: ['project:a'] }, { ...rated, projectIds: ['project:a'], review: undefined }]) {
		assert.equal(rankResources(context([candidate, feedback])).get(candidate.file.path)?.[0]?.weight, base);
	}
});

void test('duplicate ratings and repeated keywords do not stack weight', () => {
	const candidate = paper('candidate');
	const rated = paper('read', { status: 'read', projectIds: ['project:a'], review: { usefulness: 'useful', takeaways: '', questions: '' } });
	const baseline = rankResources(context([candidate, rated])).get(candidate.file.path)?.[0]?.weight;
	const repeated = paper('candidate', { title: candidate.title.repeat(50) });
	assert.equal(rankResources(context([repeated, rated, { ...rated, file: new TFile('copy.md') as unknown as ObsidianFile }])).get(repeated.file.path)?.[0]?.weight, baseline);
});

void test('unrelated feedback and review prose do not manufacture topic matches', () => {
	const candidate = paper('candidate');
	const unrelated = paper('read', { title: 'Marine biology', status: 'read', projectIds: ['project:a'], review: { usefulness: 'useful', takeaways: candidate.title, questions: candidate.title } });
	const match = rankResources(context([candidate, unrelated])).get(candidate.file.path)?.[0];
	assert.equal(match?.weight, 8);
	assert.equal(match?.reasons.some((reason) => reason.includes('priority')), false);
});

void test('ranking is deterministic across input order and tied project matches', () => {
	const resources = [paper('a'), paper('b')];
	const projects = [project({ id: 'project:b' }), project()];
	const a = rankResources(context(resources, projects));
	const b = rankResources(context([...resources].reverse(), [...projects].reverse()));
	for (const resource of resources) {
		assert.deepEqual(a.get(resource.file.path), b.get(resource.file.path));
		assert.equal(a.get(resource.file.path)?.[0]?.project.id, 'project:a');
	}
});

void test('relevance sorting keeps active reading first, preserves filters, and falls back to oldest first', () => {
	const resources = [paper('a', { captured: '2026-10-03' }), paper('b', { captured: '2026-10-02' }), paper('c', { status: 'reading', captured: '2026-10-04' }), paper('archived', { status: 'archived' })];
	const score = (resource: Resource): number => resource.arxivId === 'a' ? 8 : 0;
	const state = parseListState({ filter: 'active', sort: 'relevance' }, 'queue');
	assert.equal(state.sort, 'relevance');
	assert.deepEqual(selectResources(resources, state, undefined, score).map((resource) => resource.arxivId), ['c', 'a', 'b']);
	assert.deepEqual(selectResources(resources, state).map((resource) => resource.arxivId), ['c', 'b', 'a']);
	assert.deepEqual(selectResources(resources, { ...state, query: 'missing' }, undefined, score), []);
	assert.equal(resources[0]?.arxivId, 'a');
});
