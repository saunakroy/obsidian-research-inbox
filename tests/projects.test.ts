import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App } from 'obsidian';
import type { ProjectDraft } from '../src/models/Project';
import { ProjectService } from '../src/services/ProjectService';
import { ResourceService } from '../src/services/ResourceService';
import { parseArxivInput } from '../src/utils/arxiv';
import { DEFAULT_RESOURCE_FOLDER, resourceFromFrontmatter } from '../src/utils/resourceNote';
import { DEFAULT_PROJECT_FOLDER, projectFromFrontmatter, resolveNoteLink } from '../src/utils/projects';
import { parseListState, selectResources } from '../src/utils/resourceLists';
import { makeVault, TFile } from './obsidianMock';

const draft: ProjectDraft = { title: 'Attention research', description: 'Compare methods', questions: ['Which method helps?'], linkedNotes: [], status: 'active' };
const properties = (text: string): Record<string, unknown> => JSON.parse(/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '{}') as Record<string, unknown>;
const body = (text: string): string => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const replaceProperties = (text: string, changes: Record<string, unknown>): string => `---\n${JSON.stringify({ ...properties(text), ...changes })}\n---\n${body(text)}`;

async function setup() {
	const vault = makeVault();
	const app = vault.app as unknown as App;
	const projects = new ProjectService(app, () => DEFAULT_PROJECT_FOLDER);
	const resources = new ResourceService(app, () => DEFAULT_RESOURCE_FOLDER);
	projects.load(); resources.load();
	const { resource } = await resources.create({ reference: parseArxivInput('1706.03762'),
		paper: { title: 'Attention Is All You Need', authors: ['Vaswani'], abstract: '', published: '' }, metadataStatus: 'complete' }, 'Keep my notes');
	const project = await projects.save(draft);
	const close = (): void => { projects.unload(); resources.unload(); };
	return { ...vault, app, projects, resources, resource, project, close };
}

void test('project creation stores editable Markdown, unique IDs, and distinct same-title projects', async () => {
	const { projects, project, contents, close } = await setup();
	const other = await projects.save(draft);
	assert.notEqual(other.id, project.id);
	assert.notEqual(other.file.path, project.file.path);
	const data = properties(contents.get(project.file.path) ?? '');
	assert.equal(data.title, draft.title);
	assert.deepEqual(data.research_questions, draft.questions);
	assert.equal(data.research_project_id, project.id);
	assert.match(body(contents.get(project.file.path) ?? ''), /## Notes/);
	assert.equal(projects.list().length, 2);
	close();
});

void test('project links validate existing Markdown notes and normalize raw paths', async () => {
	const { app, projects, files, cache, close } = await setup();
	const note = new TFile('Notes/Background.md');
	files.set(note.path, note); cache.set(note.path, {});
	for (const link of ['Notes/Background', '[[Background#Context|Context]]', '[Background](Notes/Background.md)']) {
		assert.equal(resolveNoteLink(app, link, 'Research Inbox/Projects/example.md'), note);
	}
	const saved = await projects.save({ ...draft, linkedNotes: [note.path], questions: ['What does [[Background]] explain?'] });
	assert.deepEqual(saved.linkedNotes, ['[[Notes/Background]]']);
	assert.deepEqual(saved.questions, ['What does [[Background]] explain?']);
	const explicit = await projects.save({ ...draft, linkedNotes: ['[[Background#Context|Context]]'] });
	assert.deepEqual(explicit.linkedNotes, ['[[Background#Context|Context]]']);
	const count = projects.list().length;
	for (const link of ['Missing', 'https://example.com', 'file:///tmp/note.md']) {
		await assert.rejects(projects.save({ ...draft, linkedNotes: [link] }), /Could not find/);
	}
	await assert.rejects(projects.save({ ...draft, questions: ['Why [[Missing]]?'] }), /Could not find/);
	await assert.rejects(projects.save({ ...draft, title: ' ' }), /title/);
	assert.equal(projects.list().length, count);
	close();
});

void test('project edits and archive preserve body, custom properties, and assignments', async () => {
	const { projects, resources, resource, project, contents, close } = await setup();
	const assigned = await resources.assignProjects(resource, [project.id], projects);
	const before = replaceProperties(`${contents.get(project.file.path) ?? ''}\nMy **writing** and [[notes]].`, { custom: { keep: true } });
	contents.set(project.file.path, before);
	const edited = await projects.save({ ...draft, title: 'Revised title', status: 'archived' }, project);
	const after = contents.get(project.file.path) ?? '';
	assert.equal(edited.status, 'archived');
	assert.equal(edited.id, project.id);
	assert.equal(body(after), body(before));
	assert.deepEqual(properties(after).custom, { keep: true });
	assert.equal(projects.matches(assigned, project.id), true);
	assert.equal((await projects.save(draft, edited)).status, 'active');
	close();
});

void test('stale project forms, changed identity, and malformed fields cannot overwrite notes', async () => {
	const { projects, project, contents, close } = await setup();
	const original = contents.get(project.file.path) ?? '';
	for (const change of [{ title: 'New external title' }, { research_project_id: 'project:other' }]) {
		const changed = replaceProperties(original, change); contents.set(project.file.path, changed);
		await assert.rejects(projects.save(draft, project), /changed elsewhere|same project/);
		assert.equal(contents.get(project.file.path), changed);
	}
	const malformed = replaceProperties(original, { research_questions: [42, 'Preserve me'] });
	contents.set(project.file.path, malformed);
	const snapshot = projectFromFrontmatter(project.file, properties(malformed));
	assert.ok(snapshot);
	await assert.rejects(projects.save(draft, snapshot), /lists of text/);
	assert.equal(contents.get(project.file.path), malformed);
	const unknown = replaceProperties(original, { project_status: 'custom' });
	contents.set(project.file.path, unknown);
	const unknownSnapshot = projectFromFrontmatter(project.file, properties(unknown)); assert.ok(unknownSnapshot);
	await assert.rejects(projects.save(draft, unknownSnapshot), /unrecognized/);
	assert.equal(contents.get(project.file.path), unknown);
	close();
});

void test('multiple assignments and removal preserve resource review, body, and unrelated properties', async () => {
	const { projects, resources, resource, project, contents, close } = await setup();
	const other = await projects.save({ ...draft, title: 'Second project' });
	const reviewed = await resources.saveReview(await resources.setStatus(resource, 'queued'), { usefulness: 'useful', takeaways: 'Insight', questions: 'Why?' });
	const before = replaceProperties(contents.get(resource.file.path) ?? '', { custom: 'retain' });
	contents.set(resource.file.path, before);
	const assigned = await resources.assignProjects(reviewed, [project.id, other.id, project.id], projects);
	assert.deepEqual(assigned.projectIds, [project.id, other.id]);
	assert.equal(assigned.projects?.length, 2);
	assert.equal(assigned.status, 'read');
	assert.deepEqual(assigned.review, reviewed.review);
	assert.equal(body(contents.get(resource.file.path) ?? ''), body(before));
	assert.equal(properties(contents.get(resource.file.path) ?? '').custom, 'retain');
	const removed = await resources.assignProjects(assigned, [], projects);
	assert.deepEqual(removed.projectIds, []);
	assert.deepEqual(removed.projects, []);
	close();
});

void test('assignments recognize legacy links while retaining unresolved references', async () => {
	const { projects, resources, resource, project, contents, close } = await setup();
	const link = `[[${project.file.path.replace(/\.md$/, '')}]]`;
	const text = replaceProperties(contents.get(resource.file.path) ?? '', { projects: [link, '[[Missing project]]'], project_ids: ['project:missing'] });
	contents.set(resource.file.path, text);
	const legacy = resourceFromFrontmatter(resource.file, properties(text)); assert.ok(legacy);
	assert.equal(projects.matches(legacy, project.id), true);
	const removed = await resources.assignProjects(legacy, [], projects);
	assert.deepEqual(removed.projectIds, ['project:missing']);
	assert.deepEqual(removed.projects, ['[[Missing project]]']);
	close();
});

void test('renaming a project keeps its resource membership through stable IDs', async () => {
	const { projects, resources, resource, project, files, contents, cache, vaultEvents, close } = await setup();
	const assigned = await resources.assignProjects(resource, [project.id], projects);
	const old = project.file.path;
	project.file.path = 'Moved project.md';
	files.delete(old); files.set(project.file.path, project.file);
	contents.set(project.file.path, contents.get(old) ?? ''); contents.delete(old);
	cache.delete(old);
	vaultEvents.emit('rename', project.file, old);
	assert.equal(projects.find(project.id)?.file.path, 'Moved project.md');
	assert.equal(projects.matches(assigned, project.id), true);
	assert.equal(selectResources([assigned], { filter: 'all', sort: 'title', project: project.id }, (item, id) => projects.matches(item, id)).length, 1);
	files.delete(project.file.path); vaultEvents.emit('delete', project.file);
	assert.equal(projects.find(project.id), undefined);
	assert.deepEqual(assigned.projectIds, [project.id]);
	close();
});

void test('assignment conflicts, replaced resources, and malformed properties reject without writes', async () => {
	const { projects, resources, resource, project, contents, close } = await setup();
	const before = contents.get(resource.file.path) ?? '';
	for (const change of [{ project_ids: ['project:external'] }, { research_id: 'arxiv:2303.08774' }]) {
		const text = replaceProperties(before, change); contents.set(resource.file.path, text);
		await assert.rejects(resources.assignProjects(resource, [project.id], projects), /changed elsewhere|same paper/);
		assert.equal(contents.get(resource.file.path), text);
	}
	const text = replaceProperties(before, { projects: ['Keep', 42] }); contents.set(resource.file.path, text);
	const malformed = resourceFromFrontmatter(resource.file, properties(text)); assert.ok(malformed);
	await assert.rejects(resources.assignProjects(malformed, [project.id], projects), /lists of text/);
	assert.equal(contents.get(resource.file.path), text);
	close();
});

void test('deleted, replaced, or duplicate project IDs cannot be assigned or edited', async () => {
	const { projects, resources, resource, project, files, contents, cacheEvents, close } = await setup();
	const before = contents.get(resource.file.path);
	files.set(project.file.path, new TFile(project.file.path));
	await assert.rejects(resources.assignProjects(resource, [project.id], projects), /unavailable/);
	await assert.rejects(projects.save(draft, project), /removed, replaced/);
	files.set(project.file.path, project.file);
	const duplicate = new TFile('Copy.md'); files.set(duplicate.path, duplicate);
	cacheEvents.emit('changed', duplicate, '', { frontmatter: properties(contents.get(project.file.path) ?? '') });
	assert.equal(projects.find(project.id), undefined);
	await assert.rejects(resources.assignProjects(resource, [project.id], projects), /duplicate/);
	await assert.rejects(projects.save(draft, project), /duplicate/);
	assert.equal(contents.get(resource.file.path), before);
	close();
});

void test('failed project and assignment writes remain retryable with no phantom results', async () => {
	const { projects, resources, resource, project, contents, setFailCreate, setFailProcess, close } = await setup();
	setFailCreate(true);
	await assert.rejects(projects.save(draft), /Disk is full/);
	assert.equal(projects.list().length, 1);
	setFailCreate(false);
	setFailProcess(true);
	const before = contents.get(project.file.path);
	await assert.rejects(projects.save({ ...draft, title: 'New' }, project), /Disk is full/);
	assert.equal(contents.get(project.file.path), before);
	await assert.rejects(resources.assignProjects(resource, [project.id], projects), /Disk is full/);
	assert.deepEqual(resources.find(resource.arxivId)?.projectIds, []);
	setFailProcess(false);
	assert.equal((await projects.save({ ...draft, title: 'New' }, project)).title, 'New');
	assert.deepEqual((await resources.assignProjects(resource, [project.id], projects)).projectIds, [project.id]);
	close();
});

void test('project startup waits for caches and unload prevents pending writes', async () => {
	const { app, projects, resources, resource, project, contents, cache, cacheEvents } = await setup();
	projects.unload();
	const reloaded = new ProjectService(app, () => DEFAULT_PROJECT_FOLDER); reloaded.load();
	assert.equal(reloaded.ready, false);
	for (const file of [project.file, resource.file]) cache.set(file.path, { frontmatter: properties(contents.get(file.path) ?? '') });
	cacheEvents.emit('resolved');
	assert.equal(reloaded.ready, true);
	assert.equal(reloaded.find(project.id)?.title, draft.title);
	const count = contents.size;
	const pending = reloaded.save(draft); reloaded.unload();
	await assert.rejects(pending, /disabled/);
	assert.equal(contents.size, count);
	resources.unload();
});

void test('a file blocking the project folder is preserved', async () => {
	const vault = makeVault(); const blocker = new TFile('Research Inbox');
	vault.files.set(blocker.path, blocker); vault.cache.set(blocker.path, {});
	const projects = new ProjectService(vault.app as unknown as App, () => DEFAULT_PROJECT_FOLDER); projects.load();
	await assert.rejects(projects.save(draft), /blocks the project folder/);
	assert.equal(vault.files.get(blocker.path), blocker);
	assert.equal(projects.list().length, 0);
	projects.unload();
});

void test('library combines case-insensitive search, status, project, type, and saved controls', async () => {
	const { resource, close } = await setup();
	const items = [{ ...resource, status: 'queued', projectIds: ['project:a'] }, { ...resource, status: 'archived', type: 'article' }];
	const state = parseListState({ filter: 'active', sort: 'title', query: 'ATTENTION vaswani 1706', project: 'project:a', resourceType: 'paper' }, 'library');
	assert.equal(selectResources(items, state).length, 1);
	assert.equal(selectResources(items, { ...state, query: 'missing' }).length, 0);
	assert.equal(selectResources(items, { filter: 'all', sort: 'title' }).length, 2);
	assert.equal(selectResources(items, { filter: 'all', sort: 'title', project: 'none' })[0]?.status, 'archived');
	assert.equal(selectResources(items, { ...state, resourceType: 'article' }).length, 0);
	assert.deepEqual(parseListState(state, 'library'), state);
	assert.deepEqual(parseListState({ filter: 'bad', sort: 'bad', query: 42, project: null }, 'library'), { filter: 'all', sort: 'newest', query: '', project: 'all', resourceType: 'all' });
	close();
});
