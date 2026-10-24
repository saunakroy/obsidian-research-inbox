import { setIcon } from 'obsidian';

export function renderEmptyState(
	container: HTMLElement,
	icon: string,
	title: string,
	description: string,
	availability: string,
): void {
	const empty = container.createDiv({ cls: 'research-inbox-empty' });
	const iconEl = empty.createDiv({ cls: 'research-inbox-empty-icon', attr: { 'aria-hidden': 'true' } });
	setIcon(iconEl, icon);
	empty.createEl('h3', { text: title });
	empty.createEl('p', { text: description });
	empty.createEl('p', { text: availability, cls: 'research-inbox-muted' });
}
