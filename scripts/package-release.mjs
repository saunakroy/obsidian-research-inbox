import { mkdir, readFile, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
const semver = /^\d+\.\d+\.\d+$/;
if (!semver.test(manifest.version) || !semver.test(manifest.minAppVersion)) throw new Error('Use numeric x.y.z versions.');
if (!/^[a-z0-9-]+$/.test(manifest.id)) throw new Error('Invalid plugin ID.');
if (manifest.version !== pkg.version || versions[manifest.version] !== manifest.minAppVersion) throw new Error('Package, manifest, and versions.json do not agree.');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== manifest.version) throw new Error('Release tag must exactly match manifest.version, without a v prefix.');
for (const key of ['name', 'description', 'author']) if (typeof manifest[key] !== 'string' || !manifest[key].trim()) throw new Error(`Missing manifest ${key}.`);
if (typeof manifest.isDesktopOnly !== 'boolean') throw new Error('Missing isDesktopOnly.');
if (process.argv.includes('--community') && (!/^[a-z-]+$/.test(manifest.id) || manifest.id.includes('obsidian') || manifest.id.endsWith('plugin'))) {
	throw new Error('Community submission blocked: choose a compliant plugin ID and migrate the development installation. See docs/RELEASE.md.');
}
const output = `dist/${manifest.version}`;
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, '.stage-'));
try {
	const folder = join(staging, manifest.id);
	await mkdir(folder);
	const checksums = [];
	for (const name of ['main.js', 'manifest.json', 'styles.css']) {
		const bytes = await readFile(name);
		if (!bytes.length) throw new Error(`${name} is empty.`);
		if (name === 'main.js') {
			if (bytes.includes('sourceMappingURL=')) throw new Error('Build production assets before packaging (source map found).');
			const check = spawnSync(process.execPath, ['--check', name], { encoding: 'utf8' });
			if (check.status !== 0) throw new Error(check.stderr || 'Bundle syntax check failed.');
		}
		await copyFile(name, join(output, name));
		await copyFile(name, join(folder, name));
		checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
	}
	// Fresh staging prevents old files from leaking into the archive. Never package the repository.
	const archive = `${manifest.id}-${manifest.version}.zip`;
	const zip = spawnSync('zip', ['-q', '-r', archive, manifest.id], { cwd: staging, encoding: 'utf8' });
	if (zip.status !== 0) throw new Error(zip.stderr || 'Packaging requires the zip command.');
	await copyFile(join(staging, archive), join(output, archive));
	checksums.push(`${createHash('sha256').update(await readFile(join(output, archive))).digest('hex')}  ${archive}`);
	await writeFile(join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
	console.log(`Prepared ${output}: main.js, manifest.json, styles.css, ${archive}, SHA256SUMS.txt`);
	if (manifest.id.includes('obsidian') || manifest.id.endsWith('plugin')) console.warn('Local package only: rename the development plugin ID before community submission. See docs/RELEASE.md.');
} finally {
	await rm(staging, { recursive: true, force: true });
}
