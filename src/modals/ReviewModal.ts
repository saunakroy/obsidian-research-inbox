import { App, ButtonComponent, DropdownComponent, Modal, Notice, Setting, TextAreaComponent } from 'obsidian';
import { USEFULNESS } from '../models/Resource';
import type { Resource, ReviewInput } from '../models/Resource';
import type { ResourceService } from '../services/ResourceService';
import { isUsefulness } from '../utils/workflow';

export class ReviewModal extends Modal {
	private closed = false;
	private busy = false;
	private review: ReviewInput;
	private controls: Array<ButtonComponent | DropdownComponent | TextAreaComponent> = [];

	constructor(app: App, private resources: ResourceService, private resource: Resource, private onClosed: () => void) {
		super(app);
		this.review = { ...(resource.review ?? { usefulness: '', takeaways: '', questions: '' }) };
	}

	onOpen(): void {
		this.titleEl.setText(this.resource.status === 'read' ? 'Edit reading review' : 'Finish reading');
		this.contentEl.addClass('research-inbox-review');
		this.contentEl.createEl('p', { text: this.resource.title });
		this.contentEl.createEl('p', {
			text: 'Feedback is optional and stays in this note’s properties. Your existing Markdown sections are preserved.',
			cls: 'research-inbox-muted',
		});
		new Setting(this.contentEl).setName('Usefulness').addDropdown((input) => {
			this.controls.push(input);
			input.addOptions(USEFULNESS).setValue(this.review.usefulness).onChange((value) => {
				if (isUsefulness(value)) this.review.usefulness = value;
			});
		});
		new Setting(this.contentEl).setName('Key takeaways').setDesc('What did you learn?')
			.addTextArea((input) => {
				this.controls.push(input);
				input.setValue(this.review.takeaways).onChange((value) => { this.review.takeaways = value; });
			});
		new Setting(this.contentEl).setName('Open questions').setDesc('What remains unanswered?')
			.addTextArea((input) => {
				this.controls.push(input);
				input.setValue(this.review.questions).onChange((value) => { this.review.questions = value; });
			});
		const status = this.contentEl.createEl('p', { attr: { role: 'status', 'aria-live': 'polite' } });
		new Setting(this.contentEl)
			.addButton((button) => { this.controls.push(button); button.setButtonText('Cancel').onClick(() => this.close()); })
			.addButton((button) => button.setButtonText(this.resource.status === 'read' ? 'Save review' : 'Mark read').setCta().onClick(async () => {
				if (this.busy) return;
				this.busy = true;
				button.setDisabled(true);
				for (const control of this.controls) control.setDisabled(true);
				status.setText('Saving review…');
				try {
					await this.resources.saveReview(this.resource, this.review);
					if (!this.closed) { new Notice('Reading review saved.'); this.close(); }
				} catch (error) {
					if (!this.closed) status.setText(error instanceof Error ? error.message : 'Could not save the review. Try again.');
				} finally {
					if (!this.closed) {
						this.busy = false;
						button.setDisabled(false);
						for (const control of this.controls) control.setDisabled(false);
					}
				}
			}));
	}

	onClose(): void {
		this.closed = true;
		this.contentEl.empty();
		this.controls = [];
		this.onClosed();
	}
}
