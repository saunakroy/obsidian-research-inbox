import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App, TFile as ObsidianFile } from 'obsidian';
import { parseArxivInput } from '../src/utils/arxiv';
import { createResourceNote, DEFAULT_RESOURCE_FOLDER, escapeMarkdown, resourceFromFrontmatter, validateResourceFolder } from '../src/utils/resourceNote';
import { ResourceService } from '../src/services/ResourceService';
import { CaptureService } from '../src/services/CaptureService';
import type { ArxivClient } from '../src/services/ArxivClient';
import { parseArxivFeed } from '../src/services/arxivFeed';
import type { CaptureDraft } from '../src/models/Resource';
import { makeVault, TFile } from './obsidianMock';

function draft(input = '1706.03762'): CaptureDraft {
	return { reference: parseArxivInput(input), paper: { title: 'A paper', authors: [], abstract: '', published: '' }, metadataStatus: 'unavailable' };
}
function setup() {
	const vault = makeVault();
	const service = new ResourceService(vault.app as unknown as App, () => DEFAULT_RESOURCE_FOLDER);
	service.load();
	return { ...vault, service };
}

void test('abstract, PDF, HTML, and versioned IDs share a duplicate identity', () => {
	for (const input of ['1706.03762', 'arXiv:1706.03762v2', 'https://arxiv.org/abs/1706.03762v3',
		'https://arxiv.org/pdf/1706.03762.pdf?download=1#page=2', 'https://arxiv.org/html/1706.03762v1']) {
		assert.equal(parseArxivInput(input).id, '1706.03762');
	}
	const legacy = parseArxivInput('https://arxiv.org/pdf/hep-th/9901001v2.pdf');
	assert.equal(legacy.id, 'hep-th/9901001');
	assert.equal(legacy.source, 'https://arxiv.org/abs/hep-th/9901001v2');
});

void test('rejects unrelated hosts, credentials, query injection, invalid months, and traversal', () => {
	for (const input of ['', '1700.03762', '1706.03762v0', '1706.03762&search_query=all:test',
		'https://arxiv.org.evil.test/abs/1706.03762', 'https://evil.test/abs/1706.03762',
		'https://user:secret@arxiv.org/abs/1706.03762', 'https://arxiv.org:8080/abs/1706.03762',
		'https://arxiv.org/search/1706.03762', '../../notes', 'javascript:alert(1)']) {
		assert.throws(() => parseArxivInput(input), Error, input);
	}
});

void test('folder validation rejects hidden, absolute, and unsafe paths', () => {
	assert.equal(validateResourceFolder(' Research Inbox/Resources/ '), DEFAULT_RESOURCE_FOLDER);
	for (const folder of ['', '/', '/tmp/notes', '../notes', 'Research/../notes', '.obsidian/plugins',
		'Research//notes', 'Research/.private', 'C:\\notes', 'Research/ notes', `Research/${String.fromCharCode(0)}notes`]) {
		assert.throws(() => validateResourceFolder(folder), Error, folder);
	}
});

void test('notes contain stable metadata, escaped external content, and user-authored capture text', () => {
	const paper = draft('https://arxiv.org/pdf/1706.03762v2');
	paper.paper.title = 'A: "title"\nstatus: read';
	paper.paper.abstract = '<img src=x> ![tracking](https://evil.test/pixel) [[Other note]]';
	const text = createResourceNote(paper, '**My own note**', '2026-10-24T00:00:00.000Z');
	const metadata: unknown = JSON.parse(text.split('---\n')[1] ?? '');
	assert.equal((metadata as Record<string, unknown>).status, 'inbox');
	assert.equal((metadata as Record<string, unknown>).research_id, 'arxiv:1706.03762');
	assert.equal((metadata as Record<string, unknown>).original_source, 'https://arxiv.org/pdf/1706.03762v2');
	assert.ok(text.includes(escapeMarkdown(paper.paper.abstract)));
	assert.ok(!text.includes('<img'));
	assert.ok(text.includes('**My own note**'));
	assert.equal((metadata as Record<string, unknown>).published, undefined);
});

void test('simultaneous captures create one note even before metadata cache updates', async () => {
	const { service, contents } = setup();
	const results = await Promise.all([service.create(draft(), ''), service.create(draft('1706.03762v2'), 'do not replace')]);
	assert.equal(contents.size, 1);
	assert.deepEqual(results.map((result) => result.duplicate), [false, true]);
	assert.equal(service.listInbox().length, 1);
	assert.ok(![...contents.values()][0]?.includes('do not replace'));
	service.unload();
});

void test('filename collisions preserve unrelated files', async () => {
	const { service, files, contents } = setup();
	const collision = `${DEFAULT_RESOURCE_FOLDER}/arxiv-1706.03762.md`;
	files.set(collision, new TFile(collision)); contents.set(collision, 'User annotations');
	const result = await service.create(draft(), '');
	assert.equal(result.resource.file.path, `${DEFAULT_RESOURCE_FOLDER}/arxiv-1706.03762 2.md`);
	assert.equal(contents.get(collision), 'User annotations');
	service.unload();
});

void test('a write failure can be retried and does not add a phantom inbox item', async () => {
	const { service, setFailCreate } = setup();
	setFailCreate(true);
	await assert.rejects(service.create(draft(), ''), /Disk is full/);
	assert.equal(service.listInbox().length, 0);
	setFailCreate(false);
	assert.equal((await service.create(draft(), '')).duplicate, false);
	service.unload();
});

void test('a file blocking the resource folder is never overwritten', async () => {
	const { service, files, contents } = setup();
	files.set('Research Inbox', new TFile('Research Inbox'));
	await assert.rejects(service.create(draft(), ''), /file already exists/);
	assert.equal(contents.size, 0);
	service.unload();
});

void test('moved notes remain deduplicated, edits refresh the inbox, and deletions remove entries', async () => {
	const { service, vaultEvents, cacheEvents } = setup();
	const { resource } = await service.create(draft(), '');
	const oldPath = resource.file.path;
	resource.file.path = 'Moved/Paper.md';
	vaultEvents.emit('rename', resource.file, oldPath);
	assert.equal((await service.create(draft(), '')).duplicate, true);
	cacheEvents.emit('changed', resource.file, '', { frontmatter: { research_id: 'arxiv:1706.03762', title: 'Edited title', status: 'inbox' } });
	assert.equal(service.listInbox()[0]?.title, 'Edited title');
	cacheEvents.emit('changed', resource.file, '', { frontmatter: { research_id: 'arxiv:1706.03762', status: 'archived' } });
	assert.equal(service.listInbox().length, 0);
	assert.ok(service.find('1706.03762'));
	vaultEvents.emit('delete', resource.file);
	assert.equal(service.find('1706.03762'), undefined);
	service.unload();
});

void test('startup waits for metadata cache, then finds resources anywhere in the vault', async () => {
	const { app, files, cache, cacheEvents, contents } = makeVault();
	const file = new TFile('Moved/Paper.md'); files.set(file.path, file);
	const service = new ResourceService(app as unknown as App, () => DEFAULT_RESOURCE_FOLDER);
	service.load();
	assert.equal(service.ready, false);
	await assert.rejects(service.create(draft(), ''), /still loading/);
	cache.set(file.path, { frontmatter: { research_id: 'arxiv:1706.03762', title: 'Existing paper', status: 'inbox' } });
	cacheEvents.emit('resolved');
	assert.equal(service.ready, true);
	assert.equal((await service.create(draft(), '')).duplicate, true);
	assert.equal(contents.size, 0);
	service.unload();
});

void test('unload prevents queued writes and removes subscriptions', async () => {
	const { service, cacheEvents, contents } = setup();
	let notifications = 0;
	service.subscribe(() => { notifications++; });
	const pending = service.create(draft(), '');
	service.unload();
	await assert.rejects(pending, /disabled/);
	cacheEvents.emit('changed', new TFile('test.md'), '', { frontmatter: { research_id: 'arxiv:1706.03762' } });
	assert.equal(notifications, 0);
	assert.equal(contents.size, 0);
});

void test('unrelated or malformed frontmatter is not treated as a research resource', () => {
	const file = new TFile('test.md') as unknown as ObsidianFile;
	for (const data of [null, {}, { title: 'Normal note' }, { research_id: 'arxiv:../../test' }]) {
		assert.equal(resourceFromFrontmatter(file, data), null);
	}
});

void test('XML with entity declarations is rejected before parsing', () => {
	assert.throws(() => parseArxivFeed('<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]><feed/>', '1706.03762'), /unsupported response/);
});

void test('failed lookup does not save; an explicit offline save remains available', async () => {
	const { service, contents } = setup();
	const client = { fetch: () => Promise.reject(new Error('Offline')) } as unknown as ArxivClient;
	const capture = new CaptureService(service, client);
	const prepared = capture.prepare('1706.03762');
	assert.ok('reference' in prepared);
	await assert.rejects(capture.fetch(prepared), /Offline/);
	assert.equal(contents.size, 0);
	const result = await capture.save(prepared, 'Keep for later');
	assert.equal(result.duplicate, false);
	assert.equal(contents.size, 1);
	assert.ok([...contents.values()][0]?.includes('unavailable'));
	service.unload();
});

void test('incomplete metadata is marked partial and keeps a usable title', async () => {
	const { service } = setup();
	const client = { fetch: () => Promise.resolve({ title: '', authors: [], abstract: 'An abstract', published: '' }) } as unknown as ArxivClient;
	const capture = new CaptureService(service, client);
	const result = await capture.fetch(draft());
	assert.equal(result.metadataStatus, 'partial');
	assert.equal(result.paper.title, 'A paper');
	assert.equal(result.paper.published, '');
	service.unload();
});

void test('preparing a duplicate returns the existing note without fetching metadata', async () => {
	const { service } = setup();
	const saved = await service.create(draft(), '');
	let requests = 0;
	const client = { fetch: () => { requests++; return Promise.reject(new Error('Unexpected network request')); } } as unknown as ArxivClient;
	const capture = new CaptureService(service, client);
	const prepared = capture.prepare('https://arxiv.org/pdf/1706.03762v5');
	assert.ok('file' in prepared);
	assert.equal(prepared.file.path, saved.resource.file.path);
	assert.equal(requests, 0);
	service.unload();
});
