import type { Resource } from '../models/Resource';

export type ListMode = 'inbox' | 'queue' | 'library';
export type ListFilter = 'inbox' | 'archived' | 'active' | 'queued' | 'reading' | 'read' | 'all';
export type ListSort = 'oldest' | 'newest' | 'title' | 'relevance';
export interface ListState { filter: ListFilter; sort: ListSort; query?: string; project?: string; resourceType?: string }

export const FILTERS: Record<ListMode, Partial<Record<ListFilter, string>>> = {
	inbox: { inbox: 'Pending', archived: 'Archived' },
	queue: { active: 'Queued and reading', queued: 'Queued', reading: 'Reading', read: 'Completed' },
	library: { all: 'All statuses', inbox: 'Inbox', active: 'Queued and reading', queued: 'Queued', reading: 'Reading', read: 'Read', archived: 'Archived' },
};

export function parseListState(value: unknown, mode: ListMode): ListState {
	const fallback: ListState = { filter: mode === 'library' ? 'all' : mode === 'inbox' ? 'inbox' : 'active', sort: mode === 'queue' ? 'oldest' : 'newest' };
	if (mode === 'library') Object.assign(fallback, { query: '', project: 'all', resourceType: 'all' });
	if (!value || typeof value !== 'object') return fallback;
	if ('filter' in value && typeof value.filter === 'string' && Object.prototype.hasOwnProperty.call(FILTERS[mode], value.filter)) {
		fallback.filter = value.filter as ListFilter;
	}
	if ('sort' in value && (value.sort === 'oldest' || value.sort === 'newest' || value.sort === 'title' || value.sort === 'relevance')) fallback.sort = value.sort;
	if (mode === 'library') {
		const data = value as Record<string, unknown>;
		for (const key of ['query', 'project', 'resourceType'] as const) if (typeof data[key] === 'string') fallback[key] = data[key];
	}
	return fallback;
}

export function selectResources(resources: Resource[], state: ListState, matchesProject?: (resource: Resource, project: string) => boolean, relevance?: (resource: Resource) => number): Resource[] {
	const date = (resource: Resource): string => {
		if (state.filter === 'read') return resource.readAt || resource.captured;
		if (state.filter === 'active' || state.filter === 'queued' || state.filter === 'reading') return resource.queuedAt || resource.captured;
		return resource.captured;
	};
	const words = state.query?.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean) ?? [];
	return resources.filter((resource) => {
		if (state.filter !== 'all' && (state.filter === 'active'
			? resource.status !== 'queued' && resource.status !== 'reading' : resource.status !== state.filter)) return false;
		if (state.resourceType && state.resourceType !== 'all' && (resource.type ?? 'paper') !== state.resourceType) return false;
		if (state.project === 'none' && (resource.projectIds?.length || resource.projects?.length)) return false;
		if (state.project && state.project !== 'all' && state.project !== 'none'
			&& !(matchesProject ? matchesProject(resource, state.project) : resource.projectIds?.includes(state.project))) return false;
		const text = [resource.title, ...resource.authors, resource.arxivId, resource.file.path].join(' ').toLocaleLowerCase();
		return words.every((word) => text.includes(word));
	})
		.sort((a, b) => {
			if (state.filter === 'active' && a.status !== b.status) return a.status === 'reading' ? -1 : 1;
			if (state.sort === 'relevance') {
				const difference = (relevance?.(b) ?? 0) - (relevance?.(a) ?? 0);
				if (difference) return difference;
			}
			if (state.sort === 'title') return a.title.localeCompare(b.title) || a.file.path.localeCompare(b.file.path);
			const difference = date(a).localeCompare(date(b));
			return (state.sort === 'oldest' || state.sort === 'relevance' ? difference : -difference) || a.title.localeCompare(b.title) || a.file.path.localeCompare(b.file.path);
		});
}
