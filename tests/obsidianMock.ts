// Minimal host boundary for storage tests. No test writes touch the real vault.
export class Component {
	private cleanup: Array<() => void> = [];
	onload(): void {}
	onunload(): void {}
	load(): void { this.onload(); }
	unload(): void { this.onunload(); for (const off of this.cleanup) off(); }
	register(off: () => void): void { this.cleanup.push(off); }
	registerEvent(off: () => void): void { this.cleanup.push(off); }
}

export class TFile {
	stat = { mtime: 1, ctime: 1, size: 0 };
	constructor(public path: string) {}
	get basename(): string { return this.path.split('/').pop()?.replace(/\.md$/, '') ?? ''; }
	get extension(): string { return this.path.split('.').pop() ?? ''; }
}
export class TFolder { constructor(public path: string) {} }

export function parseLinktext(text: string): { path: string; subpath: string } {
	const offset = text.indexOf('#');
	return offset < 0 ? { path: text, subpath: '' } : { path: text.slice(0, offset), subpath: text.slice(offset) };
}

// JSON is valid YAML. Obsidian's own YAML serializer is outside this test boundary.
export function stringifyYaml(value: unknown): string { return JSON.stringify(value, null, 2); }

export class MockEvents {
	private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	on(name: string, callback: (...args: unknown[]) => void): () => void {
		const listeners = this.listeners.get(name) ?? new Set();
		listeners.add(callback);
		this.listeners.set(name, listeners);
		return () => { listeners.delete(callback); };
	}
	emit(name: string, ...args: unknown[]): void {
		for (const callback of this.listeners.get(name) ?? []) callback(...args);
	}
}

export function makeVault() {
	const files = new Map<string, TFile | TFolder>();
	const contents = new Map<string, string>();
	const cache = new Map<string, { frontmatter?: unknown }>();
	const vaultEvents = new MockEvents();
	const cacheEvents = new MockEvents();
	let failCreate = false;
	let failProcess = false;
	const app = {
		workspace: { onLayoutReady: (callback: () => void): void => { callback(); } },
		metadataCache: {
			on: cacheEvents.on.bind(cacheEvents),
			getFileCache: (file: TFile) => cache.get(file.path) ?? null,
			getFirstLinkpathDest: (path: string, source: string): TFile | null => {
				const parent = source.slice(0, source.lastIndexOf('/') + 1);
				for (const candidate of [path, `${path}.md`, `${parent}${path}`, `${parent}${path}.md`]) {
					const file = files.get(candidate);
					if (file instanceof TFile) return file;
				}
				return [...files.values()].find((file): file is TFile => file instanceof TFile && file.basename === path) ?? null;
			},
		},
		fileManager: {
			generateMarkdownLink: (file: TFile, _source: string): string => `[[${file.path.replace(/\.md$/, '')}]]`,
			processFrontMatter: (file: TFile, fn: (data: Record<string, unknown>) => void): Promise<void> => {
				try {
					if (files.get(file.path) !== file) throw new Error('File not found');
					const text = contents.get(file.path) ?? '';
					const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
					if (!match?.[1]) throw new Error('Invalid frontmatter');
					const data = JSON.parse(match[1]) as Record<string, unknown>;
					fn(data);
					if (failProcess) throw new Error('Disk is full');
					contents.set(file.path, `---\n${stringifyYaml(data)}\n---\n${text.slice(match[0].length)}`);
					cache.set(file.path, { frontmatter: data });
					cacheEvents.emit('changed', file, '', { frontmatter: data });
					return Promise.resolve();
				} catch (error) { return Promise.reject(error instanceof Error ? error : new Error(String(error))); }
			},
		},
		vault: {
			on: vaultEvents.on.bind(vaultEvents),
			cachedRead: (file: TFile): Promise<string> => contents.has(file.path) ? Promise.resolve(contents.get(file.path) ?? '') : Promise.reject(new Error('File not found')),
			getMarkdownFiles: () => [...files.values()].filter((file): file is TFile => file instanceof TFile),
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			createFolder: (path: string): Promise<TFolder> => {
				if (files.has(path)) return Promise.reject(new Error('Path exists'));
				const folder = new TFolder(path); files.set(path, folder); return Promise.resolve(folder);
			},
			create: (path: string, text: string): Promise<TFile> => {
				if (failCreate) return Promise.reject(new Error('Disk is full'));
				if (files.has(path)) return Promise.reject(new Error('Path exists'));
				const file = new TFile(path); files.set(path, file); contents.set(path, text);
				return Promise.resolve(file);
			},
		},
	};
	return {
		app, files, contents, cache, vaultEvents, cacheEvents,
		setFailCreate: (value: boolean) => { failCreate = value; },
		setFailProcess: (value: boolean) => { failProcess = value; },
	};
}

export interface MockRequest { url: string; headers?: Record<string, string>; throw?: boolean }
let requestHandler: (request: MockRequest) => Promise<{ status: number; text: string }> = () => Promise.reject(new Error('No mock request configured'));
export function setRequestHandler(handler: typeof requestHandler): void { requestHandler = handler; }
export function requestUrl(request: MockRequest): ReturnType<typeof requestHandler> { return requestHandler(request); }
