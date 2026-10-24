import { requestUrl } from 'obsidian';
import type { PaperMetadata } from '../models/Resource';
import { parseArxivFeed } from './arxivFeed';

export class ArxivClient {
	private inFlight = false;
	private lastRequest = 0;
	private disposed = false;
	private cancelTimeout?: () => void;

	dispose(): void { this.disposed = true; this.cancelTimeout?.(); }

	async fetch(requestedId: string): Promise<PaperMetadata> {
		if (this.disposed) throw new Error('Research Inbox has been disabled.');
		if (this.inFlight) throw new Error('An arXiv request is still running. Wait before retrying, or save without metadata.');
		if (Date.now() - this.lastRequest < 3100) throw new Error('Please wait a few seconds before requesting arXiv metadata again.');
		this.inFlight = true;
		this.lastRequest = Date.now();
		// requestUrl cannot be aborted. Keep the connection lock until the actual request settles,
		// even if the UI times out, so retries never create concurrent arXiv requests.
		const request = (async () => {
			try {
				const response = await requestUrl({
					url: `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(requestedId)}&max_results=1`,
					headers: { Accept: 'application/atom+xml' },
					throw: false,
				});
				if (response.status === 429 || response.status === 503) throw new Error('arXiv is busy. Try again later or save without metadata.');
				if (response.status !== 200) throw new Error(`arXiv returned HTTP ${response.status}. Try again later or save without metadata.`);
				return parseArxivFeed(response.text, requestedId);
			} finally {
				this.inFlight = false;
			}
		})();
		let timer: number | undefined;
		try {
			return await Promise.race([
				request,
				new Promise<never>((_, reject) => {
					this.cancelTimeout = () => reject(new Error('Research Inbox has been disabled.'));
					timer = window.setTimeout(() => reject(new Error('arXiv took too long to respond. You can save without metadata.')), 20000);
				}),
			]);
		} finally {
			if (timer !== undefined) window.clearTimeout(timer);
			this.cancelTimeout = undefined;
		}
	}
}
