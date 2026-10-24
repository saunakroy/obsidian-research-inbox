import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const temp = await mkdtemp(join(tmpdir(), 'research-inbox-tests-'));
try {
	const outfile = join(temp, 'tests.cjs');
	await build({
		stdin: { contents: "import './tests/capture.test.ts'; import './tests/workflow.test.ts';", resolveDir: process.cwd(), loader: 'ts' },
		outfile, bundle: true,
		platform: 'node', format: 'cjs', target: 'node20',
		alias: { obsidian: resolve('tests/obsidianMock.ts') },
	});
	const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
} finally {
	await rm(temp, { recursive: true, force: true });
}
