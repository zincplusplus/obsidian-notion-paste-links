# Notion Paste Links for Obsidian

Transform URLs into beautiful, Notion-style link pills with favicons and page titles.

## Features

### 🔗 Smart URL Pasting
- Paste any URL and get a menu to transform it
- Automatically fetches page title
- Stores title in markdown for instant loading

### 💊 Styled Link Pills
- Renders as clean pills with favicons
- Works in Live Preview and Reading Mode
- One-line display with text overflow handling
- Hover effects for better UX

### ✏️ Easy Editing
- Pills disappear when you move cursor inside
- Edit URL or title directly in the `@[Title|URL]` syntax
- No menu interference when editing existing mentions

### 🖱️ Right-Click Menu
- Convert mentions back to regular URLs
- Copy URL to clipboard
- Works on both rendered pills and raw URLs

## Syntax

Mentions are stored as:
```
@[Page Title|https://example.com]
```

This renders as a styled pill with:
- Favicon from the domain
- Page title
- Clickable link to URL

## Usage

1. **Paste a URL** - A menu appears with "Mention" and "Keep as URL" options
2. **Click "Mention"** - URL is converted to `@[Title|URL]` format
3. **View the pill** - Styled pill appears with favicon and title
4. **Edit anytime** - Move cursor into the mention to edit URL or title
5. **Right-click** - Convert back to URL or copy link

## Installation

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css`
2. Create folder `VaultFolder/.obsidian/plugins/obsidian-notion-paste-links/`
3. Copy files to the folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

## License

GPL-3.0
