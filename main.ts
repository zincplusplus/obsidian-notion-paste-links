import { Editor, MarkdownView, Menu, Plugin, requestUrl, Notice } from 'obsidian';

export default class PasteLinksPlugin extends Plugin {
	async onload() {
		this.registerEvent(
			this.app.workspace.on('editor-paste', this.handlePaste.bind(this))
		);

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const selection = editor.getSelection();
				if (this.isValidUrl(selection)) {
					menu.addSeparator();
					menu.addItem((item) =>
						item
							.setTitle('Convert to Mention')
							.setIcon('link')
							.onClick(async () => {
								new Notice('Fetching title...');
								const title = await this.fetchPageTitle(selection);
								editor.replaceSelection(`[${title}](${selection})`);
							})
					);
					menu.addItem((item) =>
						item
							.setTitle('Convert to Preview Card')
							.setIcon('image-file')
							.onClick(async () => {
								new Notice('Fetching metadata...');
								const metadata = await this.fetchMetadata(selection);
								const callout = `> [!example] [${metadata.title}](${selection})\n> ${metadata.description || 'No description'}\n> ![](${metadata.image || ''})`;
								editor.replaceSelection(callout);
							})
					);
				}
			})
		);
	}

	async handlePaste(evt: ClipboardEvent, editor: Editor, view: MarkdownView) {
		const clipboardText = evt.clipboardData?.getData('text/plain');
		if (!clipboardText) return;

		if (this.isValidUrl(clipboardText)) {
			evt.preventDefault();

			// Insert the URL immediately
			const from = editor.getCursor();
			editor.replaceSelection(clipboardText);
			const to = editor.getCursor();

			// Show menu to transform the inserted URL
			this.showLinkMenu(clipboardText, editor, { from, to });
		}
	}

	isValidUrl(text: string): boolean {
		try {
			const url = new URL(text);
			return ['http:', 'https:'].includes(url.protocol);
		} catch (_) {
			return false;
		}
	}

	showLinkMenu(url: string, editor: Editor, range?: { from: any, to: any }) {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle('Mention')
				.setIcon('link')
				.onClick(async () => {
					new Notice('Fetching title...');
					const title = await this.fetchPageTitle(url);
					const replacement = `[${title}](${url})`;
					if (range) {
						editor.replaceRange(replacement, range.from, range.to);
					} else {
						editor.replaceSelection(replacement);
					}
				})
		);

		menu.addItem((item) =>
			item
				.setTitle('Keep as URL')
				.setIcon('globe')
				.onClick(() => {
					// Do nothing, URL is already there
				})
		);

		menu.addItem((item) =>
			item
				.setTitle('Preview Card')
				.setIcon('image-file')
				.onClick(async () => {
					new Notice('Fetching metadata...');
					const metadata = await this.fetchMetadata(url);
					const callout = `> [!example] [${metadata.title}](${url})\n> ${metadata.description || 'No description'}\n> ![](${metadata.image || ''})`;
					if (range) {
						editor.replaceRange(callout, range.from, range.to);
					} else {
						editor.replaceSelection(callout);
					}
				})
		);

		let coords;

		// Try to get coordinates from CodeMirror instance (works for CM6)
		const cm = (editor as any).cm;
		if (cm && cm.coordsAtPos) {
			// We want the menu at the end of the inserted URL (current cursor)
			const cursor = editor.getCursor();
			const pos = editor.posToOffset(cursor);
			coords = cm.coordsAtPos(pos);
		}

		// Fallback to window selection if CM method fails
		if (!coords) {
			const selection = window.getSelection();
			if (selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0);
				const rect = range.getBoundingClientRect();
				// Check if rect is valid (not 0,0)
				if (rect.width > 0 || rect.height > 0 || rect.left > 0 || rect.top > 0) {
					coords = { left: rect.left, bottom: rect.bottom };
				}
			}
		}

		if (coords) {
			menu.showAtPosition({ x: coords.left, y: coords.bottom });
		} else {
			console.warn('Could not get cursor coordinates');
			new Notice('Could not determine menu position');
		}
	}

	async fetchPageTitle(url: string): Promise<string> {
		try {
			const html = await requestUrl({ url }).text;
			const doc = new DOMParser().parseFromString(html, 'text/html');
			return doc.title || url;
		} catch (error) {
			console.error('Failed to fetch title:', error);
			return url;
		}
	}

	async fetchMetadata(url: string): Promise<{ title: string, description: string, image: string }> {
		try {
			const html = await requestUrl({ url }).text;
			const doc = new DOMParser().parseFromString(html, 'text/html');

			const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || url;
			const description = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
			const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

			return { title, description, image };
		} catch (error) {
			console.error('Failed to fetch metadata:', error);
			return { title: url, description: '', image: '' };
		}
	}
}
