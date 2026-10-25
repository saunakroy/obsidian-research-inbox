export const SECTIONS = [
	{
		id: 'inbox', label: 'Inbox', icon: 'inbox',
		description: 'A place to review newly captured research.',
	},
	{
		id: 'reading-queue', label: 'Reading queue', icon: 'list-ordered',
		description: 'Keep the research you want to read next in one place.',
	},
	{
		id: 'projects', label: 'Projects', icon: 'folder-open',
		description: 'Organize research around your projects and questions.',
	},
	{
		id: 'library', label: 'Library', icon: 'library',
		description: 'A home for all of your retained research.',
	},
] as const;

export type SectionId = typeof SECTIONS[number]['id'];

export function isSectionId(value: unknown): value is SectionId {
	return SECTIONS.some((section) => section.id === value);
}
