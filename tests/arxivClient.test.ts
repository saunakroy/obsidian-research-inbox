import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArxivClient } from '../src/services/ArxivClient';
import { setRequestHandler } from './obsidianMock';

function timerHarness() {
	const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
	let timeout: (() => void) | undefined;
	let cleared = false;
	Object.defineProperty(globalThis, 'window', { configurable: true, value: {
		setTimeout: (callback: () => void, delay: number): number => { assert.equal(delay, 20000); timeout = callback; return 1; },
		clearTimeout: (): void => { cleared = true; },
	} });
	return { expire: () => timeout?.(), cleared: () => cleared, restore: () => {
		if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
	} };
}

void test('HTTP busy and failed responses produce actionable errors and release the timer', async () => {
	const timers = timerHarness();
	try {
		for (const status of [429, 503, 404, 500]) {
			setRequestHandler((request) => {
				assert.equal(request.url, 'https://export.arxiv.org/api/query?id_list=1706.03762v2&max_results=1');
				assert.equal(request.throw, false);
				assert.deepEqual(request.headers, { Accept: 'application/atom+xml' });
				return Promise.resolve({ status, text: '' });
			});
			await assert.rejects(new ArxivClient().fetch('1706.03762v2'), status === 429 || status === 503 ? /busy/ : new RegExp(`HTTP ${status}`));
			assert.equal(timers.cleared(), true);
		}
	} finally { timers.restore(); }
});

void test('transport failures and unsupported XML fail without using a browser parser', async () => {
	const timers = timerHarness();
	try {
		setRequestHandler(() => Promise.reject(new Error('Network offline')));
		await assert.rejects(new ArxivClient().fetch('1706.03762'), /Network offline/);
		setRequestHandler(() => Promise.resolve({ status: 200, text: '<!DOCTYPE feed><feed/>' }));
		await assert.rejects(new ArxivClient().fetch('1706.03762'), /unsupported response/);
	} finally { timers.restore(); }
});

void test('concurrent requests and cooldown cannot send additional requests', async (t) => {
	const timers = timerHarness(); let now = 10000; t.mock.method(Date, 'now', () => now);
	let finish!: (value: { status: number; text: string }) => void; let requests = 0;
	setRequestHandler(() => { requests++; return new Promise((resolve) => { finish = resolve; }); });
	try {
		const client = new ArxivClient(); const pending = client.fetch('1706.03762');
		await assert.rejects(client.fetch('2303.08774'), /still running/);
		finish({ status: 503, text: '' }); await assert.rejects(pending, /busy/);
		await assert.rejects(client.fetch('2303.08774'), /wait a few seconds/);
		assert.equal(requests, 1);
		now += 3101;
		const next = client.fetch('2303.08774'); finish({ status: 503, text: '' }); await assert.rejects(next, /busy/);
		assert.equal(requests, 2);
	} finally { timers.restore(); }
});

void test('a timeout retains the connection lock until the underlying request settles', async (t) => {
	const timers = timerHarness(); let now = 10000; t.mock.method(Date, 'now', () => now);
	let finish!: (value: { status: number; text: string }) => void;
	setRequestHandler(() => new Promise((resolve) => { finish = resolve; }));
	try {
		const client = new ArxivClient(); const pending = client.fetch('1706.03762');
		timers.expire(); await assert.rejects(pending, /too long/);
		now += 21000;
		await assert.rejects(client.fetch('2303.08774'), /still running/);
		finish({ status: 503, text: '' }); await Promise.resolve(); await Promise.resolve();
		setRequestHandler(() => Promise.reject(new Error('Second request')));
		await assert.rejects(client.fetch('2303.08774'), /Second request/);
		assert.equal(timers.cleared(), true);
	} finally { timers.restore(); }
});

void test('disabling the plugin rejects pending and future lookups', async () => {
	const timers = timerHarness();
	let finish!: (value: { status: number; text: string }) => void;
	setRequestHandler(() => new Promise((resolve) => { finish = resolve; }));
	try {
		const client = new ArxivClient(); const pending = client.fetch('1706.03762'); client.dispose();
		await assert.rejects(pending, /disabled/);
		await assert.rejects(client.fetch('2303.08774'), /disabled/);
		finish({ status: 503, text: '' });
		assert.equal(timers.cleared(), true);
	} finally { timers.restore(); }
});
