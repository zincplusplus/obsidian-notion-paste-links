# Notion Paste Links for Obsidian

This plugin brings Notion-style link pasting to Obsidian.

## Features

- **Paste Interception**: When you paste a URL, it is inserted immediately, and a menu appears allowing you to transform it.
- **Transformation Options**:
    - **Mention**: Converts the URL to `[Page Title](URL)`.
    - **Preview Card**: Converts the URL to a rich Callout block with Open Graph metadata (Title, Description, Image).
    - **Keep as URL**: Leaves the raw URL as is.
- **Context Menu**: Right-click on any existing URL to convert it to a Mention or Preview Card.

## Installation

1.  Clone this repository into your vault's `.obsidian/plugins` directory.
2.  Run `npm install` and `npm run build`.
3.  Enable the plugin in Obsidian settings.

## License

GPL-3.0
