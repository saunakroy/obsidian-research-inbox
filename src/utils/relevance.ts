import type { Project } from '../models/Project';
import type { Resource } from '../models/Resource';
import type { Recommendation } from '../models/Recommendation';

const STOP_WORDS = new Set(('a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may more most my no not of on or our should so some than that the their them there these they this those through to use used using was we were what when where which who why will with without would you your paper research study method methods approach results new note notes metadata available').split(' '));
export const isRecommendationCandidate = (resource: Resource): boolean => ['inbox', 'queued', 'reading'].includes(resource.status);

export function terms(text: string): Set<string> {
	const words = text.slice(0, 20000).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	return new Set(words.filter((word) => word.length >= 2 && /\p{L}/u.test(word) && !STOP_WORDS.has(word)));
}

/** Only the saved Abstract section is used, not annotations, YAML, or review prose. */
export function extractAbstract(markdown: string): string {
	const body = markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
	const match = /^##[ \t]+Abstract[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]+|(?![\s\S]))/im.exec(body);
	const text = (match?.[1] ?? '').trim();
	return text === 'Metadata not available.' ? '' : text.slice(0, 20000).replace(/\\([\\`*_{}[\]()#!|~$])/g, '$1')
		.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

const overlap = (left: Set<string>, right: Set<string>): string[] => [...left].filter((word) => right.has(word)).sort();
const enough = (matches: string[], context: Set<string>): boolean => matches.length >= Math.min(2, context.size) && matches.length > 0;
const excerpt = (words: string[]): string => words.slice(0, 5).join(', ');
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export interface RankingContext {
	resources: Resource[];
	projects: Project[];
	abstracts: ReadonlyMap<string, string>;
	linkedNoteNames: ReadonlyMap<string, string>;
	matchesProject: (resource: Resource, projectId: string) => boolean;
}

export function rankResources(context: RankingContext): Map<string, Recommendation[]> {
	const result = new Map<string, Recommendation[]>();
	const resourceTerms = new Map(context.resources.map((resource) => [resource.file.path, terms(`${resource.title}\n${context.abstracts.get(resource.file.path) ?? ''}`)]));
	const projects = context.projects.filter((project) => project.status === 'active').map((project) => ({
		project, words: terms(`${project.title}\n${project.description}`),
		questions: project.questions.map((question) => ({ question, words: terms(question) })),
		notes: terms(context.linkedNoteNames.get(project.id) ?? ''),
		feedback: context.resources.filter((resource) => resource.review?.usefulness && context.matchesProject(resource, project.id)),
	}));
	for (const resource of context.resources) {
		if (!isRecommendationCandidate(resource)) continue;
		const words = resourceTerms.get(resource.file.path) ?? new Set<string>();
		const recommendations: Recommendation[] = [];
		for (const { project, words: projectWords, questions, notes, feedback } of projects) {
			const assigned = context.matchesProject(resource, project.id);
			let weight = assigned ? 8 : 0;
			const reasons = assigned ? ['You assigned this resource to this active project.'] : [];
			const projectTerms = overlap(words, projectWords);
			if (enough(projectTerms, projectWords)) {
				weight += 3; reasons.push(`Title or abstract shares project terms: ${excerpt(projectTerms)}.`);
			}
			const questionMatches = questions.map(({ question, words: questionWords }) => ({ question, terms: overlap(words, questionWords), context: questionWords }))
				.filter((match) => enough(match.terms, match.context)).slice(0, 3).map(({ question, terms }) => ({ question, terms }));
			if (questionMatches.length) weight += 5;
			const noteTerms = overlap(words, notes);
			if (enough(noteTerms, notes)) {
				weight += 2; reasons.push(`Shares terms with this project’s linked note names: ${excerpt(noteTerms)}.`);
			}
			if (!weight) continue;
			// One closest reviewed example per project prevents review volume from dominating.
			const example = feedback.filter((other) => other.arxivId !== resource.arxivId)
				.map((other) => ({ other, shared: overlap(words, resourceTerms.get(other.file.path) ?? new Set<string>()) }))
				.filter(({ shared }) => shared.length >= 2)
				.sort((a, b) => b.shared.length - a.shared.length || compareText(a.other.file.path, b.other.file.path))[0];
			if (example) {
				const rating = example.other.review?.usefulness;
				const delta = rating === 'useful' ? 3 : rating === 'somewhat_useful' ? 1 : -3;
				weight += delta;
				const label = rating === 'useful' ? 'useful' : rating === 'somewhat_useful' ? 'somewhat useful' : 'not useful';
				reasons.push(`${delta > 0 ? 'Raised' : 'Lowered'} priority: shares ${excerpt(example.shared)} with “${example.other.title}”, which you rated ${label} and assigned to this project.`);
			}
			recommendations.push({ project, assigned, weight: Math.max(0, weight), reasons, questions: questionMatches });
		}
		result.set(resource.file.path, recommendations.sort((a, b) => b.weight - a.weight || compareText(a.project.id, b.project.id)));
	}
	return result;
}
