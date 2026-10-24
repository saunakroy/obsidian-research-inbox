import { USEFULNESS } from '../models/Resource';
import type { Resource, ResourceStatus, ReviewInput } from '../models/Resource';
import { parseArxivInput } from './arxiv';

const TRANSITIONS: Record<ResourceStatus, readonly ResourceStatus[]> = {
	inbox: ['queued', 'archived'],
	queued: ['reading', 'read', 'inbox', 'archived'],
	reading: ['read', 'inbox', 'archived'],
	read: ['queued', 'archived'],
	archived: ['inbox'],
};

export function isResourceStatus(value: string): value is ResourceStatus {
	return Object.prototype.hasOwnProperty.call(TRANSITIONS, value);
}

export function isUsefulness(value: string): value is ReviewInput['usefulness'] {
	return Object.prototype.hasOwnProperty.call(USEFULNESS, value);
}

export function reviewVersion(data: Record<string, unknown>): string {
	return JSON.stringify([data.review_usefulness ?? null, data.review_takeaways ?? null, data.review_questions ?? null, data.reviewed_at ?? null]);
}

export function readReview(data: Record<string, unknown>): ReviewInput {
	return {
		usefulness: typeof data.review_usefulness === 'string' && isUsefulness(data.review_usefulness) ? data.review_usefulness : '',
		takeaways: typeof data.review_takeaways === 'string' ? data.review_takeaways : '',
		questions: typeof data.review_questions === 'string' ? data.review_questions : '',
	};
}

export function applyWorkflowChange(
	data: Record<string, unknown>, expected: Resource, target: ResourceStatus, now: string, review?: ReviewInput,
): void {
	let id: string;
	try {
		if (typeof data.research_id !== 'string' || !data.research_id.startsWith('arxiv:')) throw new Error('Missing resource marker');
		id = parseArxivInput(data.research_id).id;
	}
	catch { throw new Error('This note is no longer a recognized research resource. Nothing was changed.'); }
	if (data.status != null && typeof data.status !== 'string') throw new Error('The status property must be text. Check it in the note before trying again.');
	if (id !== expected.arxivId) throw new Error('This note now refers to a different paper. Reopen it before trying again.');
	const status = typeof data.status === 'string' ? data.status : 'inbox';
	if (!isResourceStatus(status)) throw new Error('This note has an unknown reading status. Fix its status property before trying again.');
	if (!review && status === target) return; // Repeated clicks are harmless.
	if (status !== expected.status) throw new Error('The reading status changed elsewhere. Refresh the list and try again.');
	if (!(review && status === 'read' && target === 'read') && !TRANSITIONS[status].includes(target)) {
		throw new Error('This reading status change is not available. Refresh the list and try again.');
	}
	if (review) {
		if (target !== 'read' || !isUsefulness(review.usefulness)) throw new Error('Choose a valid usefulness rating.');
		if (reviewVersion(data) !== (expected.reviewVersion ?? reviewVersion({}))) {
			throw new Error('This review changed elsewhere. Close and reopen the review form to load the latest version.');
		}
		for (const field of ['review_usefulness', 'review_takeaways', 'review_questions', 'reviewed_at']) {
			if (data[field] != null && typeof data[field] !== 'string') throw new Error('Review properties must be text. Check them in the note before saving.');
		}
		if (typeof data.review_usefulness === 'string' && !isUsefulness(data.review_usefulness)) {
			throw new Error('The existing usefulness rating is unrecognized. Check it in the note before saving.');
		}
		data.review_usefulness = review.usefulness;
		data.review_takeaways = review.takeaways.trim();
		data.review_questions = review.questions.trim();
		data.reviewed_at = now;
	}
	data.status = target;
	if (target === 'queued') data.queued_at = now;
	if (target === 'reading') data.reading_started_at = now;
	if (target === 'read' && status !== 'read') data.read_at = now;
	if (target === 'archived') data.archived_at = now;
}
