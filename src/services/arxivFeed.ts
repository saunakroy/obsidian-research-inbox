import type { PaperMetadata } from '../models/Resource';
import { parseArxivInput } from '../utils/arxiv';

const ATOM = 'http://www.w3.org/2005/Atom';

export function parseArxivFeed(xml: string, requestedId: string): PaperMetadata {
	if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('arXiv returned an unsupported response.');
	const doc = new DOMParser().parseFromString(xml, 'application/xml');
	if (doc.getElementsByTagName('parsererror').length) throw new Error('arXiv returned unreadable metadata. Try again later.');
	const entry = doc.getElementsByTagNameNS(ATOM, 'entry')[0];
	if (!entry) throw new Error('No paper was found for this identifier. Check the ID or save without metadata.');
	const text = (name: string): string => entry.getElementsByTagNameNS(ATOM, name)[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
	let returnedId: string;
	try {
		returnedId = parseArxivInput(text('id')).requestedId;
	} catch {
		throw new Error('arXiv could not find this paper. Check the identifier and try again.');
	}
	const expected = parseArxivInput(requestedId);
	if (parseArxivInput(returnedId).id !== expected.id
		|| (expected.requestedId !== expected.id && returnedId !== expected.requestedId)) {
		throw new Error('arXiv returned metadata for a different paper or version. Nothing was saved.');
	}
	const published = text('published');
	return {
		title: text('title'),
		authors: Array.from(entry.getElementsByTagNameNS(ATOM, 'author'))
			.map((author) => author.getElementsByTagNameNS(ATOM, 'name')[0]?.textContent?.trim() ?? '').filter(Boolean),
		abstract: text('summary'),
		published: /^\d{4}-\d{2}-\d{2}T/.test(published) && !Number.isNaN(Date.parse(published)) ? published.slice(0, 10) : '',
	};
}
