import type { CaptureDraft, Resource } from '../models/Resource';
import { parseArxivInput } from '../utils/arxiv';
import { ArxivClient } from './ArxivClient';
import { ResourceService } from './ResourceService';

export class CaptureService {
	constructor(private resources: ResourceService, private client: ArxivClient) {}

	prepare(input: string): CaptureDraft | Resource {
		if (!this.resources.ready) throw new Error('The vault is still loading. Try again in a moment.');
		const reference = parseArxivInput(input);
		const duplicate = this.resources.find(reference.id);
		if (duplicate) return duplicate;
		return {
			reference,
			paper: { title: `arXiv ${reference.requestedId}`, authors: [], abstract: '', published: '' },
			metadataStatus: 'unavailable',
		};
	}

	async fetch(draft: CaptureDraft): Promise<CaptureDraft> {
		const paper = await this.client.fetch(draft.reference.requestedId);
		return {
			...draft,
			paper: { ...paper, title: paper.title || draft.paper.title },
			metadataStatus: paper.title && paper.authors.length && paper.abstract && paper.published ? 'complete' : 'partial',
		};
	}

	save(draft: CaptureDraft, whySaved: string): ReturnType<ResourceService['create']> {
		return this.resources.create(draft, whySaved);
	}
}
