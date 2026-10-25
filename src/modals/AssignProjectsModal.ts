import { App, ButtonComponent, Modal, Notice, Setting, ToggleComponent } from 'obsidian';
import type { Resource } from '../models/Resource';
import type { ProjectService } from '../services/ProjectService';
import type { ResourceService } from '../services/ResourceService';

export class AssignProjectsModal extends Modal {
	private closed = false;
	private busy = false;
	private selected = new Set<string>();
	private controls: Array<ButtonComponent | ToggleComponent> = [];

	constructor(app: App, private resource: Resource, private projects: ProjectService, private resources: ResourceService, private onClosed: () => void) { super(app); }

	onOpen(): void {
		this.titleEl.setText('Assign projects');
		this.contentEl.createEl('p', { text: this.resource.title });
		this.contentEl.createEl('p', { text: 'Choose one or more projects. References to missing projects are preserved in the note.' });
		if (!this.projects.ready) { this.contentEl.createEl('p', { text: 'Projects are still loading. Reopen this form in a moment.' }); return; }
		const projects = this.projects.list();
		if (!projects.length) this.contentEl.createEl('p', { text: 'Create a project in the projects section first.' });
		for (const project of projects) {
			if (this.projects.matches(this.resource, project.id)) this.selected.add(project.id);
			new Setting(this.contentEl).setName(project.title).setDesc(`${project.status === 'archived' ? 'Archived · ' : ''}${project.file.path}`)
				.addToggle((toggle) => {
					this.controls.push(toggle);
					toggle.setValue(this.selected.has(project.id)).onChange((value) => {
						if (value) this.selected.add(project.id); else this.selected.delete(project.id);
					});
				});
		}
		const status = this.contentEl.createEl('p', { attr: { role: 'status' } });
		new Setting(this.contentEl)
			.addButton((button) => { this.controls.push(button); button.setButtonText('Cancel').onClick(() => this.close()); })
			.addButton((button) => {
				this.controls.push(button);
				button.setButtonText('Save assignments').setCta().onClick(async () => {
					if (this.busy) return;
					this.busy = true;
					for (const control of this.controls) control.setDisabled(true);
					try {
						await this.resources.assignProjects(this.resource, [...this.selected], this.projects);
						if (!this.closed) { new Notice('Project assignments saved.'); this.close(); }
					} catch (error) {
						if (!this.closed) status.setText(error instanceof Error ? error.message : 'Could not save assignments.');
					} finally {
						if (!this.closed) { this.busy = false; for (const control of this.controls) control.setDisabled(false); }
					}
				});
			});
	}

	onClose(): void { this.closed = true; this.controls = []; this.contentEl.empty(); this.onClosed(); }
}
