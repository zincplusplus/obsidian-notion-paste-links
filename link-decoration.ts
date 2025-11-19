import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, EditorState } from "@codemirror/state";
import { editorLivePreviewField, requestUrl } from "obsidian";

// Regex to match @[URL]
const MENTION_REGEX = /\@\[([^\]]+)\]/g;

// Cache for fetched titles
const titleCache = new Map<string, string>();

// Function to fetch title for a URL
async function fetchTitle(url: string): Promise<string> {
  if (titleCache.has(url)) {
    return titleCache.get(url)!;
  }

  try {
    const html = await requestUrl({ url }).text;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || url;
    titleCache.set(url, title);
    return title;
  } catch (error) {
    console.error('Failed to fetch title:', error);
    const fallbackTitle = url;
    titleCache.set(url, fallbackTitle);
    return fallbackTitle;
  }
}

class MentionWidget extends WidgetType {
  constructor(readonly url: string) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "notion-link-pill";

    // Icon
    try {
      const hostname = new URL(this.url).hostname;
      const iconUrl = `https://www.google.com/s2/favicons?domain=${hostname}`;
      const img = span.createEl("img");
      img.src = iconUrl;
      img.onerror = () => { img.style.display = "none"; };
    } catch (e) {
      // Invalid URL, no icon
    }

    // Title placeholder
    const titleSpan = span.createSpan({ text: " Loading..." });

    // Fetch title asynchronously
    fetchTitle(this.url).then(title => {
      titleSpan.textContent = " " + title;
    });

    // Handle click to open link
    span.onclick = (e) => {
      e.preventDefault();
      window.open(this.url, "_blank");
    };

    // Handle right-click for context menu
    span.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Import Menu from obsidian
      const { Menu } = require('obsidian');
      const menu = new Menu();

      menu.addItem((item: any) =>
        item
          .setTitle('Convert to Regular Link')
          .setIcon('link')
          .onClick(() => {
            // Find the position of this @[URL] in the document
            const doc = view.state.doc;
            const docText = doc.toString();
            const searchPattern = `@[${this.url}]`;
            const index = docText.indexOf(searchPattern);

            if (index !== -1) {
              const from = index;
              const to = index + searchPattern.length;
              const replacement = this.url;

              view.dispatch({
                changes: { from, to, insert: replacement }
              });
            }
          })
      );

      menu.addItem((item: any) =>
        item
          .setTitle('Copy URL')
          .setIcon('copy')
          .onClick(() => {
            navigator.clipboard.writeText(this.url);
          })
      );

      menu.showAtMouseEvent(e);
    };

    return span;
  }

  ignoreEvent() {
    return false;
  }
}

export const mentionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const isLivePreview = update.state.field(editorLivePreviewField);
      const wasLivePreview = update.startState.field(editorLivePreviewField);
      const hasDecorations = this.decorations.size > 0;

      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet || // Rebuild when cursor moves
        isLivePreview !== wasLivePreview ||
        (isLivePreview && !hasDecorations) ||
        (!isLivePreview && hasDecorations)
      ) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      // Check if Live Preview is active
      // We check both the state field and the DOM class for robustness
      const isLivePreview = view.state.field(editorLivePreviewField);
      const hasLivePreviewClass = !!view.dom.closest('.is-live-preview');

      if (!isLivePreview || !hasLivePreviewClass) {
        return Decoration.none;
      }

      const builder = new RangeSetBuilder<Decoration>();
      const ranges: { from: number, to: number, decoration: Decoration }[] = [];

      // Get cursor position
      const cursorPos = view.state.selection.main.head;

      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        let match;
        while ((match = MENTION_REGEX.exec(text))) {
          const start = from + match.index;
          const end = start + match[0].length;
          const url = match[1];

          // Skip decoration if cursor is inside this mention
          // This allows the user to edit the raw @[URL] text
          if (cursorPos >= start && cursorPos <= end) {
            continue;
          }

          ranges.push({
            from: start,
            to: end,
            decoration: Decoration.replace({
              widget: new MentionWidget(url),
              block: false,
              inclusive: false,
              side: 1,
            })
          });
        }
      }

      // Sort ranges to ensure they are added in order (required by RangeSetBuilder)
      ranges.sort((a, b) => a.from - b.from);

      for (const range of ranges) {
        builder.add(range.from, range.to, range.decoration);
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const mentionExtensions = [mentionPlugin];
