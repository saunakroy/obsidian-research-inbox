import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import type { App } from 'obsidian';
import { RankingService } from '../src/services/RankingService';
import { ResourceService } from '../src/services/ResourceService';
import { ProjectService } from '../src/services/ProjectService';
import { DEFAULT_RESOURCE_FOLDER } from '../src/utils/resourceNote';
import { DEFAULT_PROJECT_FOLDER } from '../src/utils/projects';
import { parseArxivInput } from '../src/utils/arxiv';
import { makeVault, TFile } from './obsidianMock';

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
async function setup() {
	const vault = makeVault(); const app = vault.app as unknown as App;
	const resources = new ResourceService(app, () => DEFAULT_RESOURCE_FOLDER);
	const projects = new ProjectService(app, () => DEFAULT_PROJECT_FOLDER);
	resources.load(); projects.load();
	const { resource } = await resources.create({ reference: parseArxivInput('1706.03762'), paper: { title: 'A paper', authors: [], abstract: 'Spatial editing and Gaussian splatting', published: '' }, metadataStatus: 'complete' }, 'Personal notes');
	const project = await projects.save({ title: 'Spatial editing', description: '', questions: ['How can spatial editing preserve consistency?'], linkedNotes: [], status: 'active' });
	const ranking = new RankingService(app, resources, projects);
	const close = (): void => { ranking.unload(); projects.unload(); resources.unload(); };
	return { ...vault, resources, projects, resource, project, ranking, close };
}

void test('ranking reads only recognized resource notes, caches abstracts, and never writes notes', async () => {
	const state = await setup(); const { app, ranking, resource, projects, project, contents, files, cache, close } = state;
	const unrelated = new TFile('Private.md'); files.set(unrelated.path, unrelated); contents.set(unrelated.path, 'Private content'); cache.set(unrelated.path, {});
	const before = [...contents]; const reads: string[] = [];
	const read = app.vault.cachedRead;
	app.vault.cachedRead = (file) => { reads.push(file.path); return read(file); };
	ranking.load(); await flush();
	assert.equal(ranking.ready, true);
	assert.equal(ranking.get(resource)?.questions.length, 1);
	assert.deepEqual(reads, [resource.file.path]);
	assert.deepEqual([...contents], before);
	await projects.save({ ...project, description: 'More project context' }, project); await flush();
	assert.equal(reads.length, 1);
	close();
});

void test('abstract edits and project changes refresh suggestions without stale results', async () => {
	const { ranking, resource, projects, project, contents, vaultEvents, close } = await setup();
	ranking.load(); await flush(); assert.ok(ranking.get(resource));
	contents.set(resource.file.path, '## Abstract\nMarine biology\n## Notes\nSpatial editing');
	vaultEvents.emit('modify', resource.file); await flush();
	assert.equal(ranking.get(resource), undefined);
	await projects.save({ ...project, title: 'Marine biology', questions: [] }, project); await flush();
	assert.match(ranking.get(resource)?.reasons[0] ?? '', /biology, marine/);
	close();
});

void test('archived projects, read resources, and duplicate project IDs stop producing suggestions', async () => {
	const { ranking, resource, resources, projects, project, cacheEvents, contents, close } = await setup();
	ranking.load(); await flush(); assert.ok(ranking.get(resource));
	const archived = await projects.save({ ...project, status: 'archived' }, project); await flush();
	assert.equal(ranking.get(resource), undefined);
	await projects.save({ ...project, status: 'active' }, archived); await flush(); assert.ok(ranking.get(resource));
	const read = await resources.saveReview(await resources.setStatus(resource, 'queued'), { usefulness: 'useful', takeaways: '', questions: '' }); await flush();
	assert.equal(ranking.get(read), undefined);
	const requeued = await resources.setStatus(read, 'queued'); await flush(); assert.ok(ranking.get(requeued));
	const data = JSON.parse(/^---\n([\s\S]*?)\n---/.exec(contents.get(project.file.path) ?? '')?.[1] ?? '{}') as Record<string, unknown>;
	cacheEvents.emit('changed', new TFile('Copy.md'), '', { frontmatter: data }); await flush();
	assert.equal(ranking.get(requeued), undefined);
	close();
});

void test('failed reads fall back to available assignment signals and recover after a modification', async () => {
	const { app, ranking, resource, resources, projects, project, vaultEvents, close } = await setup();
	const assigned = await resources.assignProjects(resource, [project.id], projects);
	const read = app.vault.cachedRead;
	app.vault.cachedRead = () => Promise.reject(new Error('Unavailable'));
	ranking.load(); await flush();
	assert.equal(ranking.ready, true);
	assert.equal(ranking.get(assigned)?.assigned, true);
	assert.equal(ranking.abstractUnavailable(assigned), true);
	app.vault.cachedRead = read; vaultEvents.emit('modify', resource.file); await flush();
	assert.equal(ranking.abstractUnavailable(assigned), false);
	assert.equal(ranking.get(assigned)?.questions.length, 1);
	close();
});

void test('a stale asynchronous abstract read cannot overwrite a newer edit', async () => {
	const { app, ranking, resource, contents, vaultEvents, close } = await setup();
	let resolve!: (text: string) => void;
	const pending = new Promise<string>((done) => { resolve = done; });
	const read = app.vault.cachedRead; let calls = 0;
	app.vault.cachedRead = (file) => ++calls === 1 ? pending : read(file);
	ranking.load(); await flush(); assert.equal(ranking.ready, false);
	contents.set(resource.file.path, '## Abstract\nMarine biology'); vaultEvents.emit('modify', resource.file);
	resolve('## Abstract\nSpatial editing'); await flush();
	assert.equal(ranking.ready, true);
	assert.equal(ranking.get(resource), undefined);
	assert.equal(calls, 2);
	close();
});

void test('unload discards pending reads and removes event subscriptions', async () => {
	const { app, ranking, resource, vaultEvents, close } = await setup();
	let resolve!: (text: string) => void; let reads = 0; let notifications = 0;
	app.vault.cachedRead = () => { reads++; return new Promise((done) => { resolve = done; }); };
	ranking.subscribe(() => { notifications++; }); ranking.load(); await flush(); ranking.unload();
	resolve('## Abstract\nSpatial editing'); await flush();
	vaultEvents.emit('modify', resource.file); await flush();
	assert.equal(ranking.get(resource), undefined);
	assert.equal(ranking.ready, false);
	assert.equal(reads, 1);
	assert.equal(notifications, 0);
	close();
});

void test('project-scoped relevance cannot borrow a higher score from another project', async () => {
	const { ranking, resource, projects, close } = await setup();
	const other = await projects.save({ title: 'Marine biology', description: '', questions: [], linkedNotes: [], status: 'active' });
	ranking.load(); await flush();
	assert.ok(ranking.get(resource));
	assert.equal(ranking.get(resource, other.id), undefined);
	close();
});
