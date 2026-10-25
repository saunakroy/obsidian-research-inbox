import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQaFixtures } from './qa-fixtures.mjs';

const options = new Set(process.argv.slice(2));
for (const option of options) if (!['--fixtures', '--baseline'].includes(option)) throw new Error(`Unknown option: ${option}`);
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
// Validate packaged assets before creating a vault. Baseline mode installs no plugin.
const assets = new Map();
if (!options.has('--baseline')) {
	for (const name of ['main.js', 'manifest.json', 'styles.css']) assets.set(name, await readFile(`dist/${manifest.version}/${name}`));
	const packaged = JSON.parse(assets.get('manifest.json').toString('utf8'));
	if (packaged.id !== manifest.id || packaged.version !== manifest.version) throw new Error('Package is stale. Run npm run package first.');
}
const root = await mkdtemp(join(tmpdir(), 'research-inbox-qa-'));
await mkdir(join(root, '.obsidian'));
if (!options.has('--baseline')) {
	const plugin = join(root, '.obsidian', 'plugins', manifest.id);
	await mkdir(plugin, { recursive: true });
	for (const [name, bytes] of assets) await writeFile(join(plugin, name), bytes);
}
// No settings, projects, or resource notes are copied from the development vault.
await writeFile(join(root, '.obsidian', 'community-plugins.json'), JSON.stringify(options.has('--baseline') ? [] : [manifest.id]));
await writeFile(join(root, '.obsidian', 'appearance.json'), JSON.stringify({ theme: 'obsidian' }));
if (options.has('--fixtures')) await createQaFixtures(root);
console.log(root);
console.log(options.has('--baseline') ? 'Baseline vault: no community plugin installed.' : 'Open this existing folder in Obsidian. If prompted, enable this locally built plugin.');
if (options.has('--fixtures')) console.log('Synthetic QA data only: 60 resources, 2 projects, and a checklist. Do not use these as research citations.');
