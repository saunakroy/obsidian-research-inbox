import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'scripts/run-tests.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{ rules: { 'obsidianmd/ui/sentence-case': ['warn', { brands: ['arXiv', 'Markdown'] }] } },
	{
		// The installed Obsidian types and minimum app version use the classic settings API.
		files: ['src/settings/SettingsTab.ts'],
		rules: { 'obsidianmd/settings-tab/prefer-setting-definitions': 'off' },
	},
	{
		// Node test tooling is not bundled into the plugin. These paths are rejection fixtures.
		files: ['tests/**/*.ts'],
		rules: { 'obsidianmd/no-nodejs-modules': 'off', 'obsidianmd/hardcoded-config-path': 'off' },
	},
);
