import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Development-only fixtures; never imported by the runtime plugin or added to a user vault.
export async function createQaFixtures(root) {
	const resources = join(root, 'Research Inbox', 'Resources');
	const projects = join(root, 'Research Inbox', 'Projects');
	await mkdir(resources, { recursive: true });
	await mkdir(projects, { recursive: true });
	const note = (data, body) => `---\n${Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n${body}\n`;
	for (const name of ['Alpha', 'Beta']) await writeFile(join(projects, `QA ${name}.md`), note({
		research_project_id: `project:qa-${name.toLowerCase()}`, type: 'research-project', title: `QA ${name}`,
		description: 'Synthetic project for interface checks only.', project_status: 'active',
		research_questions: ['Does this fixture retain its project association after a note rename?'], related_notes: [],
	}, '# QA project\n\nPreserve this project annotation.'));
	const statuses = ['inbox', 'queued', 'reading', 'read', 'archived'];
	for (let index = 1; index <= 60; index++) {
		const id = `2401.${String(90000 + index)}`;
		const number = String(index).padStart(3, '0');
		const project = index % 2 === 0 ? 'Alpha' : 'Beta';
		const status = statuses[(index - 1) % statuses.length];
		const date = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
		const data = {
			research_id: `arxiv:${id}`, arxiv_id: id, type: 'paper', status,
			title: `QA fixture ${number} — synthetic research`, authors: [], captured: date,
			metadata_status: 'unavailable', projects: [`[[QA ${project}]]`], project_ids: [`project:qa-${project.toLowerCase()}`],
			qa_fixture: true, custom_property: 'Preserve this value',
		};
		if (status === 'queued' || status === 'reading') data.queued_at = date;
		if (status === 'read') { data.read_at = date; data.review_usefulness = 'useful'; data.review_takeaways = 'Synthetic review for QA.'; }
		await writeFile(join(resources, `QA ${number}.md`), note(data,
			`# QA fixture ${number}\n\nSynthetic test data; not metadata about the arXiv identifier. Do not cite or fetch it.\n\n## Abstract\n\nMetadata not available.\n\n## Personal Notes\n\nPreserve this **fixture annotation**.`));
	}
	await writeFile(join(root, 'QA checklist.md'), `# Synthetic QA vault

This temporary vault contains generated test data, not real papers. No development-vault notes were copied. Do not fetch or cite fixture identifiers.

- Library: 60 resources; initially 50 cards; Show more reveals all 60.
- Each project: 30 resources. Each status: 12 resources.
- Search \`QA fixture 001\`: one result. Clear search: 60 results.
- Select QA Alpha + Read + Title: six results (004, 014, 024, 034, 044, 054).
- Switch sections, close/reopen the vault: those filters and six results should return.
- Rename Research Inbox/Projects/QA Alpha.md in Obsidian: stable project membership should remain.
- Open a review/project form, change its properties in the note, then save the old form: expect a conflict error.
- Archive or review a fixture; check that its body annotation and custom_property remain.
- Compare reload with the plugin enabled/disabled; also use a --baseline --fixtures vault with no plugin installed.

Record outcomes separately; generating this vault does not mean these checks passed.
`);
}
