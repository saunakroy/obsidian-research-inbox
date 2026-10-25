import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { validateResourceFolder } from '../utils/resourceNote';

interface FolderSettings { resourceFolder: string; projectFolder: string }

export class ResearchSettingsTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private getFolders: () => FolderSettings, private saveFolders: (folders: FolderSettings) => Promise<void>) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();
		const folders = { ...this.getFolders() };
		new Setting(this.containerEl)
			.setName('Resource folder')
			.setDesc('New Markdown notes are saved here. Changing this folder does not move existing notes; they remain visible in the inbox.')
			.addText((input) => input.setValue(folders.resourceFolder).onChange((value) => { folders.resourceFolder = value; }));
		new Setting(this.containerEl).setName('Project folder').setDesc('New project notes are saved here. Existing project notes are not moved.')
			.addText((input) => input.setValue(folders.projectFolder).onChange((value) => { folders.projectFolder = value; }));
		new Setting(this.containerEl).addButton((button) => button.setButtonText('Save folders').onClick(async () => {
				try {
					button.setDisabled(true);
					await this.saveFolders({ resourceFolder: validateResourceFolder(folders.resourceFolder), projectFolder: validateResourceFolder(folders.projectFolder) });
					new Notice('Folders saved.');
				} catch (error) {
					new Notice(error instanceof Error ? error.message : 'Could not save the folders.');
				} finally { button.setDisabled(false); }
			}));
		this.containerEl.createEl('p', {
			text: 'Fetching metadata sends only the paper identifier to arXiv. No vault content is sent. You can save without metadata to stay offline. No API key is required.',
		});
		this.containerEl.createEl('p', {
			text: 'Relevance is calculated locally from active projects, questions, linked note names, saved resource titles and abstracts, and usefulness ratings. Suggestions do not change your notes or project assignments.',
		});
	}
}
