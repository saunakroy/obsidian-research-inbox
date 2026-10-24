import type { TFile } from 'obsidian';
import type { ArxivReference } from '../utils/arxiv';

export interface PaperMetadata {
	title: string;
	authors: string[];
	abstract: string;
	published: string;
}

export interface CaptureDraft {
	reference: ArxivReference;
	paper: PaperMetadata;
	metadataStatus: 'complete' | 'partial' | 'unavailable';
}

export interface Resource {
	file: TFile;
	arxivId: string;
	title: string;
	authors: string[];
	captured: string;
	status: string;
	queuedAt?: string;
	readAt?: string;
	review?: ReviewInput;
	reviewVersion?: string;
}

export type ResourceStatus = 'inbox' | 'queued' | 'reading' | 'read' | 'archived';

export const USEFULNESS = {
	'': 'Not rated',
	useful: 'Useful',
	somewhat_useful: 'Somewhat useful',
	not_useful: 'Not useful',
} as const;

export interface ReviewInput {
	usefulness: keyof typeof USEFULNESS;
	takeaways: string;
	questions: string;
}
