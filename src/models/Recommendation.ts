import type { Project } from './Project';

export interface QuestionMatch { question: string; terms: string[] }
export interface Recommendation {
	project: Project;
	assigned: boolean;
	/** Internal ordering weight, never a probability or displayed percentage. */
	weight: number;
	reasons: string[];
	questions: QuestionMatch[];
}
