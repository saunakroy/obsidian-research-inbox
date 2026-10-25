import type { TFile } from 'obsidian';

export interface ProjectDraft {
	title: string;
	description: string;
	questions: string[];
	linkedNotes: string[];
	status: 'active' | 'archived';
}

export interface Project extends ProjectDraft {
	id: string;
	file: TFile;
	version: string;
}
