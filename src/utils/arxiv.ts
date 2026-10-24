export interface ArxivReference {
	id: string;
	requestedId: string;
	source: string;
	originalInput: string;
}

export function parseArxivInput(input: string): ArxivReference {
	const originalInput = input.trim();
	let candidate = originalInput.replace(/^arxiv:\s*/i, '');
	if (/^https?:\/\//i.test(candidate)) {
		const url = new URL(candidate);
		if (!['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(url.hostname)
			|| url.username || url.password || url.port) {
			throw new Error('Enter an arXiv URL or identifier. Other websites are not supported yet.');
		}
		const path = /^\/(?:abs|pdf|html)\/(.+?)\/?$/.exec(url.pathname);
		if (!path?.[1]) throw new Error('Use an arXiv abstract or PDF URL.');
		candidate = path[1].replace(/\.pdf$/i, '');
	}
	const modern = /^(\d{2}(?:0[1-9]|1[0-2])\.\d{4,5})(v[1-9]\d*)?$/i.exec(candidate);
	const legacy = /^([a-z][a-z.-]*\/\d{2}(?:0[1-9]|1[0-2])\d{3})(v[1-9]\d*)?$/i.exec(candidate);
	const match = modern ?? legacy;
	if (!match?.[1]) throw new Error('Enter an arXiv ID such as 1706.03762 or hep-th/9901001.');
	const id = match[1].toLowerCase();
	const requestedId = id + (match[2]?.toLowerCase() ?? '');
	return { id, requestedId, source: `https://arxiv.org/abs/${requestedId}`, originalInput };
}
