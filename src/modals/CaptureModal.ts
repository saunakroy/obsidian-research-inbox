import { App, ButtonComponent, Modal, Notice, Setting, TextComponent } from 'obsidian';
import type { CaptureDraft, Resource } from '../models/Resource';
import type { CaptureService } from '../services/CaptureService';

export class CaptureModal extends Modal {
	private closed = false;
	private busy = false;
	private input = '';
	private whySaved = '';
	private inputControl?: TextComponent;
	private actions: ButtonComponent[] = [];
	private statusEl!: HTMLElement;
	private previewEl!: HTMLElement;

	constructor(app: App, private capture: CaptureService, private onSaved: () => void, private onClosed: () => void) { super(app); }

	onOpen(): void {
		this.titleEl.setText('Add resource');
		this.contentEl.addClass('research-inbox-capture');
		this.contentEl.createEl('p', { text: 'Save an arXiv paper to your research inbox.' });
		new Setting(this.contentEl).setName('Paper URL or identifier')
			.setDesc('Accepts arXiv abstract, PDF, and HTML links, or an identifier.')
			.addText((input) => {
				this.inputControl = input;
				input.setPlaceholder('1706.03762').onChange((value) => {
					this.input = value;
					this.previewEl.empty();
					this.statusEl.setText('');
				});
			});
		this.contentEl.createEl('p', {
			text: 'Fetch metadata sends the paper identifier to arXiv. Your notes and vault contents stay local.',
			cls: 'research-inbox-muted',
		});
		new Setting(this.contentEl)
			.addButton((button) => {
				this.actions.push(button);
				button.setButtonText('Fetch metadata').setCta().onClick(() => this.prepare(true));
			})
			.addButton((button) => {
				this.actions.push(button);
				button.setButtonText('Save without metadata').onClick(() => this.prepare(false));
			});
		this.statusEl = this.contentEl.createEl('p', { attr: { role: 'status', 'aria-live': 'polite' } });
		this.previewEl = this.contentEl.createDiv();
		this.inputControl?.inputEl.focus();
	}

	onClose(): void {
		this.closed = true;
		this.contentEl.empty();
		this.actions = [];
		this.onClosed();
	}

	private setBusy(value: boolean): void {
		this.busy = value;
		this.inputControl?.setDisabled(value);
		for (const action of this.actions) action.setDisabled(value);
	}

	private async prepare(fetchMetadata: boolean): Promise<void> {
		if (this.busy) return;
		this.previewEl.empty();
		try {
			const prepared = this.capture.prepare(this.input);
			if ('file' in prepared) { this.showDuplicate(prepared); return; }
			this.setBusy(true);
			this.statusEl.setText(fetchMetadata ? 'Fetching metadata…' : 'Review the title before saving.');
			const draft = fetchMetadata ? await this.capture.fetch(prepared) : prepared;
			if (this.closed) return;
			this.statusEl.setText(draft.metadataStatus === 'complete' ? 'Review the paper before saving.'
				: 'Some metadata is unavailable. You can edit the Markdown note after saving.');
			this.showPreview(draft);
		} catch (error) {
			if (!this.closed) this.statusEl.setText(error instanceof Error ? error.message : 'Could not fetch metadata. Try again or save without metadata.');
		} finally { if (!this.closed) this.setBusy(false); }
	}

	private showDuplicate(resource: Resource): void {
		this.statusEl.setText('This paper is already saved. Your existing note has not been changed.');
		this.previewEl.createEl('p', { text: resource.title });
		new Setting(this.previewEl).addButton((button) => button.setButtonText('Open existing note').setCta().onClick(async () => {
			try { await this.app.workspace.getLeaf('tab').openFile(resource.file); this.close(); }
			catch { this.statusEl.setText('Could not open the note. It may have been moved or deleted.'); }
		}));
	}

	private showPreview(draft: CaptureDraft): void {
		new Setting(this.previewEl).setName('Title').addText((input) => {
			input.setValue(draft.paper.title).onChange((value) => { draft.paper.title = value; });
		});
		this.previewEl.createEl('p', { text: draft.paper.authors.join(', ') || 'Authors unavailable', cls: 'research-inbox-muted' });
		if (draft.paper.published) this.previewEl.createEl('p', { text: `Published ${draft.paper.published}`, cls: 'research-inbox-muted' });
		this.previewEl.createEl('p', { text: draft.paper.abstract || 'Abstract unavailable', cls: 'research-inbox-abstract' });
		new Setting(this.previewEl).setName('Capture note').setDesc('Optional; stored only in your Markdown note.')
			.addTextArea((input) => input.setValue(this.whySaved).onChange((value) => { this.whySaved = value; }));
		new Setting(this.previewEl).addButton((button) => button.setButtonText('Save to inbox').setCta().onClick(async () => {
			if (this.busy) return;
			this.setBusy(true);
			button.setDisabled(true);
			this.statusEl.setText('Saving…');
			try {
				const result = await this.capture.save({ ...draft, paper: { ...draft.paper, title: draft.paper.title.trim() } }, this.whySaved);
				if (this.closed) return;
				if (result.duplicate) { this.previewEl.empty(); this.showDuplicate(result.resource); }
				else { new Notice('Resource saved to inbox.'); this.onSaved(); this.close(); }
			} catch (error) {
				if (!this.closed) this.statusEl.setText(error instanceof Error ? error.message : 'Could not save the note. Check your resource folder and try again.');
			} finally {
				if (!this.closed) { this.setBusy(false); button.setDisabled(false); }
			}
		}));
	}
}
