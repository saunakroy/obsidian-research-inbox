import type { Resource } from '../models/Resource';

export type ListMode = 'inbox' | 'queue';
export type ListFilter = 'inbox' | 'archived' | 'active' | 'queued' | 'reading' | 'read';
export type ListSort = 'oldest' | 'newest' | 'title';
export interface ListState { filter: ListFilter; sort: ListSort }

export const FILTERS: Record<ListMode, Partial<Record<ListFilter, string>>> = {
	inbox: { inbox: 'Pending', archived: 'Archived' },
	queue: { active: 'Queued and reading', queued: 'Queued', reading: 'Reading', read: 'Completed' },
};

export function parseListState(value: unknown, mode: ListMode): ListState {
	const fallback: ListState = { filter: mode === 'inbox' ? 'inbox' : 'active', sort: mode === 'inbox' ? 'newest' : 'oldest' };
	if (!value || typeof value !== 'object') return fallback;
	if ('filter' in value && typeof value.filter === 'string' && Object.prototype.hasOwnProperty.call(FILTERS[mode], value.filter)) {
		fallback.filter = value.filter as ListFilter;
	}
	if ('sort' in value && (value.sort === 'oldest' || value.sort === 'newest' || value.sort === 'title')) fallback.sort = value.sort;
	return fallback;
}

export function selectResources(resources: Resource[], state: ListState): Resource[] {
	const date = (resource: Resource): string => {
		if (state.filter === 'read') return resource.readAt || resource.captured;
		if (state.filter === 'active' || state.filter === 'queued' || state.filter === 'reading') return resource.queuedAt || resource.captured;
		return resource.captured;
	};
	return resources.filter((resource) => state.filter === 'active'
		? resource.status === 'queued' || resource.status === 'reading' : resource.status === state.filter)
		.sort((a, b) => {
			if (state.filter === 'active' && a.status !== b.status) return a.status === 'reading' ? -1 : 1;
			if (state.sort === 'title') return a.title.localeCompare(b.title) || a.file.path.localeCompare(b.file.path);
			const difference = date(a).localeCompare(date(b));
			return (state.sort === 'oldest' ? difference : -difference) || a.title.localeCompare(b.title) || a.file.path.localeCompare(b.file.path);
		});
}
