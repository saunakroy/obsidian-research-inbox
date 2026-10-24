export const SECTIONS = [
	{
		id: 'inbox', label: 'Inbox', icon: 'inbox',
		description: 'A place to review newly captured research.',
		emptyTitle: 'Your research starts here',
		emptyDescription: 'Captured resources will appear here for you to review, queue, or archive.',
		availability: 'Add an arXiv resource to start your inbox.',
	},
	{
		id: 'reading-queue', label: 'Reading queue', icon: 'list-ordered',
		description: 'Keep the research you want to read next in one place.',
		emptyTitle: 'Make room for your next read',
		emptyDescription: 'Resources selected from your inbox will appear here as a reading queue.',
		availability: 'Queue papers from the inbox, track reading, and record a review.',
	},
	{
		id: 'projects', label: 'Projects', icon: 'folder-open',
		description: 'Organize research around your projects and questions.',
		emptyTitle: 'Give your research a direction',
		emptyDescription: 'Your projects will bring research questions, related resources, and notes together.',
		availability: 'Project creation and research questions are not available yet.',
	},
	{
		id: 'library', label: 'Library', icon: 'library',
		description: 'A home for all of your retained research.',
		emptyTitle: 'Build a library you can return to',
		emptyDescription: 'Browse your resources here and open their underlying Markdown notes.',
		availability: 'Library browsing, search, and filters are not available yet. Open captured notes from the inbox.',
	},
] as const;

export type SectionId = typeof SECTIONS[number]['id'];

export function isSectionId(value: unknown): value is SectionId {
	return SECTIONS.some((section) => section.id === value);
}
