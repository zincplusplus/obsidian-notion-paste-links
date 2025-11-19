import { Editor, MarkdownView, Menu, Plugin, requestUrl, Notice } from 'obsidian';
import { mentionPlugin } from './link-decoration';

export default class PasteLinksPlugin extends Plugin {
	async onload() {
		// Register CM6 Extension for Live Preview
		this.registerEditorExtension(mentionPlugin);

		// Register Markdown Post Processor for Reading Mode
		// Note: @[URL|Title] won't be rendered as a link by Obsidian, so we need to detect it in text
		this.registerMarkdownPostProcessor((element, context) => {
			const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
			const nodesToReplace: { node: Text, match: RegExpMatchArray }[] = [];

			let node;
			while (node = walker.nextNode() as Text) {
				const mentionRegex = /\@\[([^\|]+)\|([^\]]+)\]/g;
				let match;
				while ((match = mentionRegex.exec(node.textContent || ''))) {
					nodesToReplace.push({ node, match });
				}
			}

			for (const { node, match } of nodesToReplace) {
				const title = match[1];
				const url = match[2];
				const span = createEl("span", { cls: "notion-link-pill" });

				try {
					const hostname = new URL(url).hostname;
					const iconUrl = `https://www.google.com/s2/favicons?domain=${hostname}`;
					const img = span.createEl("img");
					img.src = iconUrl;
					img.onerror = () => { img.style.display = "none"; };
				} catch (e) {
					// Invalid URL
				}

				// Display title from syntax
				span.createSpan({ text: " " + title });

				span.onclick = () => window.open(url, "_blank");

				// Replace the text node
				const before = node.textContent!.substring(0, match.index);
				const after = node.textContent!.substring(match.index! + match[0].length);

				const parent = node.parentNode!;
				if (before) parent.insertBefore(document.createTextNode(before), node);
				parent.insertBefore(span, node);
				if (after) parent.insertBefore(document.createTextNode(after), node);
				parent.removeChild(node);
			}
		});

		this.registerEvent(
			this.app.workspace.on('editor-paste', this.handlePaste.bind(this))
		);

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const selection = editor.getSelection();
				let linkData = null;

				console.log('PasteLinks: Right-click detected');
				console.log('PasteLinks: Selection:', selection);
				console.log('PasteLinks: Cursor:', editor.getCursor());

				if (selection && this.isValidUrl(selection)) {
					linkData = { type: 'raw', url: selection, title: null, range: null };
				} else if (!selection) {
					linkData = this.getLinkAtCursor(editor);
					console.log('PasteLinks: getLinkAtCursor result:', linkData);
				}

				if (linkData) {
					menu.addSeparator();

					// Check if it's already a mention
					const isMention = linkData.type === 'mention';
					const menuTitle = isMention ? 'Convert to Regular Link' : 'Convert to Mention';
					const menuIcon = isMention ? 'link' : 'link';

					menu.addItem((item) =>
						item
							.setTitle(menuTitle)
							.setIcon(menuIcon)
							.onClick(async () => {
								let title = linkData.title;
								let replacement;

								if (isMention) {
									// Convert to Regular Link: Remove @[]
									replacement = linkData.url;
								} else {
									// Convert to Mention: Use @[URL]
									replacement = `@[${linkData.url}]`;
								}

								if (linkData.range) {
									editor.replaceRange(replacement, linkData.range.from, linkData.range.to);
								} else {
									editor.replaceSelection(replacement);
								}
							})
					);

				}
			})
		);
	}

	getLinkAtCursor(editor: Editor): { type: 'raw' | 'markdown' | 'mention', url: string, title: string | null, range: { from: any, to: any } } | null {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);

		// 1. Check for @[Title|URL] mentions
		const mentionRegex = /\@\[([^\|]+)\|([^\]]+)\]/g;
		let match;
		while ((match = mentionRegex.exec(line))) {
			const start = match.index;
			const end = start + match[0].length;

			if (cursor.ch >= start && cursor.ch <= end) {
				return {
					type: 'mention',
					url: match[2],
					title: match[1],
					range: {
						from: { line: cursor.line, ch: start },
						to: { line: cursor.line, ch: end }
					}
				};
			}
		}

		// 2. Check for Markdown links [Title](URL)
		const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
		while ((match = linkRegex.exec(line))) {
			const start = match.index;
			const end = start + match[0].length;

			if (cursor.ch >= start && cursor.ch <= end) {
				return {
					type: 'markdown',
					url: match[2],
					title: match[1],
					range: {
						from: { line: cursor.line, ch: start },
						to: { line: cursor.line, ch: end }
					}
				};
			}
		}

		// 2. Check for Raw URLs
		// Find the word boundaries around the cursor
		const leftPart = line.substring(0, cursor.ch);
		const rightPart = line.substring(cursor.ch);

		const startMatch = leftPart.match(/([^\s()\[\]]+)$/);
		const endMatch = rightPart.match(/^([^\s()\[\]]+)/);

		if (startMatch || endMatch) {
			const start = startMatch ? cursor.ch - startMatch[0].length : cursor.ch;
			const end = endMatch ? cursor.ch + endMatch[0].length : cursor.ch;

			let potentialUrl = line.substring(start, end);

			// Strip trailing punctuation often found in text (.,;:)
			const punctuationMatch = potentialUrl.match(/[.,;:!]+$/);
			let endOffset = 0;
			if (punctuationMatch) {
				potentialUrl = potentialUrl.substring(0, potentialUrl.length - punctuationMatch[0].length);
				endOffset = punctuationMatch[0].length;
			}

			if (this.isValidUrl(potentialUrl)) {
				return {
					type: 'raw',
					url: potentialUrl,
					title: null,
					range: {
						from: { line: cursor.line, ch: start },
						to: { line: cursor.line, ch: end - endOffset }
					}
				};
			}
		}

		return null;
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
			this.showLinkMenu(clipboardText, editor, { from, to }, evt);
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

	showLinkMenu(url: string, editor: Editor, range?: { from: any, to: any }, evt?: ClipboardEvent | MouseEvent) {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle('Mention')
				.setIcon('link')
				.onClick(async () => {
					// Fetch title for the URL
					new Notice('Fetching metadata...');
					const metadata = await this.fetchMetadata(url);

					// Use @[Title|URL] format
					const replacement = `@[${metadata.title}|${url}]`;

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

		// If we have a mouse/clipboard event, use its position
		if (evt && 'clientX' in evt && 'clientY' in evt) {
			menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
			return;
		}

		// Otherwise fall back to cursor-based positioning
		let coords;

		// Try to get coordinates from CodeMirror instance
		const cm = (editor as any).cm;
		if (cm && cm.coordsAtPos && range) {
			// Use the START of the range for more consistent positioning
			const pos = editor.posToOffset(range.from);
			coords = cm.coordsAtPos(pos);
		} else if (cm && cm.coordsAtPos) {
			const cursor = editor.getCursor();
			const pos = editor.posToOffset(cursor);
			coords = cm.coordsAtPos(pos);
		}

		if (coords) {
			// Add a small offset and ensure it doesn't go off-screen
			const menuWidth = 200; // Approximate menu width
			const menuHeight = 100; // Approximate menu height

			let x = coords.left;
			let y = coords.bottom + 5; // Small offset below cursor

			// Check if menu would go off right edge
			if (x + menuWidth > window.innerWidth) {
				x = window.innerWidth - menuWidth - 10;
			}

			// Check if menu would go off bottom edge
			if (y + menuHeight > window.innerHeight) {
				y = coords.top - menuHeight - 5; // Show above instead
			}

			menu.showAtPosition({ x, y });
		} else {
			console.warn('Could not get cursor coordinates');
			new Notice('Could not determine menu position');
		}
	}

	showMenuFallback(menu: Menu, editor: Editor, range?: { from: any, to: any }) {
		let coords;

		// Try to get coordinates from CodeMirror instance (works for CM6)
		const cm = (editor as any).cm;
		if (cm && cm.coordsAtPos && range) {
			// Use the END of the range (where the URL ends) for positioning
			const pos = editor.posToOffset(range.to);
			coords = cm.coordsAtPos(pos);
		} else if (cm && cm.coordsAtPos) {
			// Fallback to current cursor
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

	async fetchMetadata(url: string): Promise<{ title: string, description: string, image: string, icon: string }> {
		try {
			const html = await requestUrl({ url }).text;
			const doc = new DOMParser().parseFromString(html, 'text/html');

			const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || url;
			const description = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
			const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

			let icon = doc.querySelector('link[rel="icon"]')?.getAttribute('href') ||
				doc.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') || '';

			// Resolve relative URLs
			if (icon && !icon.startsWith('http')) {
				try {
					icon = new URL(icon, url).href;
				} catch (e) {
					console.warn('Failed to resolve icon URL:', icon);
					icon = '';
				}
			}

			return { title, description, image, icon };
		} catch (error) {
			console.error('Failed to fetch metadata:', error);
			return { title: url, description: '', image: '', icon: '' };
		}
	}
}
