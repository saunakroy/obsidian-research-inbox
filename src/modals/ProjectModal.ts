import { App, ButtonComponent, DropdownComponent, Modal, Notice, Setting, TextAreaComponent, TextComponent } from 'obsidian';
import type { Project, ProjectDraft } from '../models/Project';
import type { ProjectService } from '../services/ProjectService';

export class ProjectModal extends Modal {
	private closed = false;
	private busy = false;
	private controls: Array<ButtonComponent | DropdownComponent | TextAreaComponent | TextComponent> = [];
	private draft: ProjectDraft;

	constructor(app: App, private projects: ProjectService, private onSaved: (project: Project) => void, private onClosed: () => void, private project?: Project) {
		super(app);
		this.draft = project ? { ...project, questions: [...project.questions], linkedNotes: [...project.linkedNotes] }
			: { title: '', description: '', questions: [], linkedNotes: [], status: 'active' };
	}

	onOpen(): void {
		this.titleEl.setText(this.project ? 'Edit project' : 'Create project');
		this.contentEl.addClass('research-inbox-review');
		new Setting(this.contentEl).setName('Title').addText((input) => {
			this.controls.push(input); input.setValue(this.draft.title).onChange((value) => { this.draft.title = value; });
		});
		new Setting(this.contentEl).setName('Description').addTextArea((input) => {
			this.controls.push(input); input.setValue(this.draft.description).onChange((value) => { this.draft.description = value; });
		});
		new Setting(this.contentEl).setName('Research questions').setDesc('One question per line. Include [[note name]] to link an existing note.')
			.addTextArea((input) => {
				this.controls.push(input); input.setValue(this.draft.questions.join('\n')).onChange((value) => { this.draft.questions = value.split('\n'); });
			});
		new Setting(this.contentEl).setName('Linked notes').setDesc('One existing Markdown note path or [[link]] per line.')
			.addTextArea((input) => {
				this.controls.push(input); input.setValue(this.draft.linkedNotes.join('\n')).onChange((value) => { this.draft.linkedNotes = value.split('\n'); });
			});
		new Setting(this.contentEl).setName('Status').setDesc('Archiving a project retains its note and resource assignments.')
			.addDropdown((input) => {
				this.controls.push(input); input.addOptions({ active: 'Active', archived: 'Archived' }).setValue(this.draft.status)
					.onChange((value) => { this.draft.status = value === 'archived' ? 'archived' : 'active'; });
			});
		const status = this.contentEl.createEl('p', { attr: { role: 'status' } });
		new Setting(this.contentEl)
			.addButton((button) => { this.controls.push(button); button.setButtonText('Cancel').onClick(() => this.close()); })
			.addButton((button) => {
				this.controls.push(button);
				button.setButtonText('Save project').setCta().onClick(async () => {
					if (this.busy) return;
					this.busy = true;
					for (const control of this.controls) control.setDisabled(true);
					status.setText('Saving project…');
					try {
						const saved = await this.projects.save(this.draft, this.project);
						if (!this.closed) { this.onSaved(saved); new Notice('Project saved.'); this.close(); }
					} catch (error) {
						if (!this.closed) status.setText(error instanceof Error ? error.message : 'Could not save the project. Try again.');
					} finally {
						if (!this.closed) { this.busy = false; for (const control of this.controls) control.setDisabled(false); }
					}
				});
			});
	}

	onClose(): void { this.closed = true; this.controls = []; this.contentEl.empty(); this.onClosed(); }
}
