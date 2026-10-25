import type { Component } from 'obsidian';
import type { Resource } from '../models/Resource';
import type { RankingService } from '../services/RankingService';

export function renderRecommendation(parent: HTMLElement, owner: Component, resource: Resource, ranking: RankingService,
	projectId?: string, openProject?: (id: string) => void, compact = false): void {
	const match = ranking.get(resource, projectId);
	if (!match) return;
	const container = parent.createDiv({ cls: 'research-inbox-relevance' });
	const label = `${match.assigned ? 'Assigned project' : 'Suggested project'}: ${match.project.title}`;
	if (openProject) {
		const button = container.createEl('button', { text: label, cls: 'research-inbox-project-link', attr: { type: 'button' } });
		owner.registerDomEvent(button, 'click', () => openProject(match.project.id));
	} else container.createEl('p', { text: label });
	if (compact) {
		container.createEl('p', { text: match.questions[0] ? `Potential question match: ${match.questions[0].question}` : match.reasons[0] ?? '', cls: 'research-inbox-muted' });
		return;
	}
	const details = container.createEl('details');
	details.createEl('summary', { text: 'Why this may be relevant' });
	const reasons = details.createEl('ul');
	for (const reason of match.reasons) reasons.createEl('li', { text: reason });
	for (const question of match.questions) reasons.createEl('li', {
		text: `Potential connection to “${question.question}”: shared terms ${question.terms.slice(0, 5).join(', ')}.`,
	});
	if (ranking.abstractUnavailable(resource)) details.createEl('p', { text: 'Could not read the saved abstract. These signals use the available context.', cls: 'research-inbox-muted' });
	details.createEl('p', { text: 'Based on local assignments and word matches. A match does not establish that this paper answers a question.', cls: 'research-inbox-muted' });
}
