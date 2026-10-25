import { setIcon } from 'obsidian';

export function decorateButton(button: HTMLButtonElement, icon: string): void {
	const label = button.textContent ?? '';
	button.empty();
	button.addClass('research-inbox-icon-button');
	setIcon(button.createSpan({ cls: 'research-inbox-icon', attr: { 'aria-hidden': 'true' } }), icon);
	button.createSpan({ text: label });
}

export function renderEmptyState(parent: HTMLElement, icon: string, title: string, description: string): void {
	const empty = parent.createDiv({ cls: 'research-inbox-empty' });
	setIcon(empty.createSpan({ cls: 'research-inbox-empty-icon', attr: { 'aria-hidden': 'true' } }), icon);
	empty.createEl('h3', { text: title });
	empty.createEl('p', { text: description, cls: 'research-inbox-muted' });
}
