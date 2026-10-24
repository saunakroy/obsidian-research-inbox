import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App } from 'obsidian';
import { ResourceService } from '../src/services/ResourceService';
import { parseArxivInput } from '../src/utils/arxiv';
import { applyWorkflowChange, reviewVersion } from '../src/utils/workflow';
import { parseListState, selectResources } from '../src/utils/resourceLists';
import type { Resource, ReviewInput } from '../src/models/Resource';
import { DEFAULT_RESOURCE_FOLDER } from '../src/utils/resourceNote';
import { makeVault, TFile } from './obsidianMock';

async function setup() {
	const vault = makeVault();
	const service = new ResourceService(vault.app as unknown as App, () => DEFAULT_RESOURCE_FOLDER);
	service.load();
	const { resource } = await service.create({
		reference: parseArxivInput('1706.03762'),
		paper: { title: 'A paper', authors: ['An author'], abstract: 'An abstract', published: '2017-06-12' },
		metadataStatus: 'complete',
	}, '**Personal capture note**');
	return { ...vault, service, resource };
}

function frontmatter(text: string): Record<string, unknown> {
	return JSON.parse(/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '{}') as Record<string, unknown>;
}

function body(text: string): string { return text.replace(/^---\n[\s\S]*?\n---\n/, ''); }

function editProperties(text: string, changes: Record<string, unknown>): string {
	return `---\n${JSON.stringify({ ...frontmatter(text), ...changes }, null, 2)}\n---\n${body(text)}`;
}

const review: ReviewInput = { usefulness: 'useful', takeaways: 'One\nTwo', questions: 'Does it generalize?' };

void test('queue, start reading, and finish review preserve note body and unrelated properties', async () => {
	const { service, resource, contents } = await setup();
	const path = resource.file.path;
	const original = `${contents.get(path) ?? ''}\n## My annotations\n\nKeep [[Linked note]] and $x^2$.\n`;
	contents.set(path, editProperties(original, { tags: ['research'], custom: { keep: true } }));
	const queued = await service.setStatus(resource, 'queued');
	assert.equal(queued.status, 'queued');
	assert.ok(queued.queuedAt);
	assert.equal(service.listInbox().length, 0);
	const reading = await service.setStatus(queued, 'reading');
	assert.equal(reading.status, 'reading');
	const read = await service.saveReview(reading, review);
	const saved = contents.get(path) ?? '';
	assert.equal(read.status, 'read');
	assert.ok(read.readAt);
	assert.deepEqual(read.review, review);
	assert.equal(body(saved), body(original));
	assert.deepEqual(frontmatter(saved).custom, { keep: true });
	assert.deepEqual(frontmatter(saved).tags, ['research']);
	assert.equal(frontmatter(saved).source, frontmatter(original).source);
	service.unload();
});

void test('archiving keeps the file and duplicate identity; restoration returns it to inbox', async () => {
	const { service, resource, contents, files } = await setup();
	const archived = await service.setStatus(resource, 'archived');
	assert.equal(archived.status, 'archived');
	assert.equal(files.get(resource.file.path), resource.file);
	assert.equal(contents.size, 1);
	assert.ok(service.find(resource.arxivId));
	const restored = await service.setStatus(archived, 'inbox');
	assert.equal(restored.status, 'inbox');
	assert.equal(service.listInbox().length, 1);
	service.unload();
});

void test('defer returns queued and reading papers to inbox without a separate deferred status', async () => {
	const { service, resource } = await setup();
	const queued = await service.setStatus(resource, 'queued');
	const deferred = await service.setStatus(queued, 'inbox');
	const reading = await service.setStatus(await service.setStatus(deferred, 'queued'), 'reading');
	assert.equal((await service.setStatus(reading, 'inbox')).status, 'inbox');
	service.unload();
});

void test('mark read without feedback records no invented rating', async () => {
	const { service, resource } = await setup();
	const queued = await service.setStatus(resource, 'queued');
	const read = await service.saveReview(queued, { usefulness: '', takeaways: '', questions: '' });
	assert.equal(read.status, 'read');
	assert.equal(read.review?.usefulness, '');
	service.unload();
});

void test('editing a completed review preserves its completion date; rereading retains prior feedback', async () => {
	const { service, resource } = await setup();
	const read = await service.saveReview(await service.setStatus(resource, 'queued'), review);
	const edited = await service.saveReview(read, { ...review, usefulness: 'somewhat_useful' });
	assert.equal(edited.readAt, read.readAt);
	assert.equal(edited.review?.usefulness, 'somewhat_useful');
	const queuedAgain = await service.setStatus(edited, 'queued');
	assert.deepEqual(queuedAgain.review, edited.review);
	service.unload();
});

void test('a stale status or replaced resource identifier cannot overwrite a newer edit', async () => {
	const { service, resource, contents } = await setup();
	const path = resource.file.path;
	const changed = editProperties(contents.get(path) ?? '', { status: 'archived' });
	contents.set(path, changed);
	await assert.rejects(service.setStatus(resource, 'queued'), /changed elsewhere/);
	assert.equal(contents.get(path), changed);
	for (const id of ['arxiv:2303.08774', '1706.03762', 'ordinary-note']) {
		const replaced = editProperties(changed, { research_id: id, status: 'inbox' });
		contents.set(path, replaced);
		await assert.rejects(service.setStatus(resource, 'queued'), /different paper|no longer a recognized/);
		assert.equal(contents.get(path), replaced);
	}
	service.unload();
});

void test('a review edited while the form is open is not overwritten', async () => {
	const { service, resource, contents } = await setup();
	const reading = await service.setStatus(await service.setStatus(resource, 'queued'), 'reading');
	const changed = editProperties(contents.get(resource.file.path) ?? '', { review_takeaways: 'New manual feedback' });
	contents.set(resource.file.path, changed);
	await assert.rejects(service.saveReview(reading, review), /review changed elsewhere/);
	assert.equal(contents.get(resource.file.path), changed);
	assert.equal(service.find(resource.arxivId)?.status, 'reading');
	service.unload();
});

void test('failed workflow writes preserve the prior status and can be retried', async () => {
	const { service, resource, contents, setFailProcess } = await setup();
	const original = contents.get(resource.file.path);
	setFailProcess(true);
	await assert.rejects(service.setStatus(resource, 'queued'), /Disk is full/);
	assert.equal(contents.get(resource.file.path), original);
	assert.equal(service.find(resource.arxivId)?.status, 'inbox');
	setFailProcess(false);
	assert.equal((await service.setStatus(resource, 'queued')).status, 'queued');
	service.unload();
});

void test('repeated identical actions are idempotent but competing stale actions are rejected', async () => {
	const { service, resource } = await setup();
	const repeated = await Promise.all([service.setStatus(resource, 'queued'), service.setStatus(resource, 'queued')]);
	assert.equal(repeated[0]?.queuedAt, repeated[1]?.queuedAt);
	await assert.rejects(service.setStatus(resource, 'archived'), /changed elsewhere/);
	assert.equal(service.find(resource.arxivId)?.status, 'queued');
	service.unload();
});

void test('invalid transitions, deleted files, and queued actions after unload cannot write', async () => {
	const { service, resource, files, contents } = await setup();
	await assert.rejects(service.setStatus(resource, 'reading'), /not available/);
	files.set(resource.file.path, new TFile(resource.file.path));
	await assert.rejects(service.setStatus(resource, 'queued'), /deleted or replaced/);
	files.set(resource.file.path, resource.file);
	const before = contents.get(resource.file.path);
	const pending = service.setStatus(resource, 'queued');
	service.unload();
	await assert.rejects(pending, /disabled/);
	assert.equal(contents.get(resource.file.path), before);
});

void test('reload restores workflow status and review fields from note metadata', async () => {
	const { service, resource, app } = await setup();
	await service.saveReview(await service.setStatus(resource, 'queued'), review);
	service.unload();
	const reloaded = new ResourceService(app as unknown as App, () => DEFAULT_RESOURCE_FOLDER);
	reloaded.load();
	assert.equal(reloaded.find(resource.arxivId)?.status, 'read');
	assert.deepEqual(reloaded.find(resource.arxivId)?.review, review);
	assert.equal(reloaded.listInbox().length, 0);
	reloaded.unload();
});

void test('unknown status and malformed review properties are rejected without mutation', async () => {
	const { service, resource } = await setup();
	for (const status of ['custom-status', 42]) {
		const data = { research_id: 'arxiv:1706.03762', status };
		assert.throws(() => applyWorkflowChange(data, resource, 'queued', 'now'), /status/);
		assert.equal(data.status, status);
	}
	const data = { research_id: 'arxiv:1706.03762', status: 'reading', review_takeaways: ['Keep this'] };
	const snapshot: Resource = { ...resource, status: 'reading', reviewVersion: reviewVersion(data) };
	assert.throws(() => applyWorkflowChange(data, snapshot, 'read', 'now', review), /must be text/);
	assert.deepEqual(data.review_takeaways, ['Keep this']);
	service.unload();
});

void test('list filters and sorting exclude unrelated states and put active reading first', async () => {
	const { service, resource } = await setup();
	const items: Resource[] = [
		{ ...resource, title: 'Queued newer', status: 'queued', queuedAt: '2026-10-02' },
		{ ...resource, title: 'Reading', status: 'reading', queuedAt: '2026-10-03' },
		{ ...resource, title: 'Queued older', status: 'queued', queuedAt: '2026-10-01' },
		{ ...resource, title: 'Completed', status: 'read' },
		{ ...resource, title: 'Archived', status: 'archived' },
	];
	assert.deepEqual(selectResources(items, { filter: 'active', sort: 'oldest' }).map((item) => item.title), ['Reading', 'Queued older', 'Queued newer']);
	assert.deepEqual(selectResources(items, { filter: 'queued', sort: 'newest' }).map((item) => item.title), ['Queued newer', 'Queued older']);
	assert.equal(selectResources(items, { filter: 'read', sort: 'title' })[0]?.title, 'Completed');
	assert.equal(selectResources(items, { filter: 'archived', sort: 'oldest' }).length, 1);
	assert.equal(items[0]?.title, 'Queued newer'); // Selection never mutates the index array.
	assert.deepEqual(parseListState({ filter: 'archived', sort: 'invalid' }, 'queue'), { filter: 'active', sort: 'oldest' });
	assert.deepEqual(parseListState({ filter: 'archived', sort: 'title' }, 'inbox'), { filter: 'archived', sort: 'title' });
	service.unload();
});
