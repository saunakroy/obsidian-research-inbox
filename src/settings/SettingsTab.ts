import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { validateResourceFolder } from '../utils/resourceNote';

export class ResearchSettingsTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private getFolder: () => string, private saveFolder: (folder: string) => Promise<void>) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();
		let folder = this.getFolder();
		new Setting(this.containerEl)
			.setName('Resource folder')
			.setDesc('New Markdown notes are saved here. Changing this folder does not move existing notes; they remain visible in the inbox.')
			.addText((input) => input.setValue(folder).onChange((value) => { folder = value; }))
			.addButton((button) => button.setButtonText('Save folder').onClick(async () => {
				try {
					button.setDisabled(true);
					await this.saveFolder(validateResourceFolder(folder));
					new Notice('Resource folder saved.');
				} catch (error) {
					new Notice(error instanceof Error ? error.message : 'Could not save the resource folder.');
				} finally { button.setDisabled(false); }
			}));
		this.containerEl.createEl('p', {
			text: 'Fetching metadata sends only the paper identifier to arXiv. No vault content is sent. You can save without metadata to stay offline. No API key is required.',
		});
	}
}
