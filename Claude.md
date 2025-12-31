# Claude.md

This document provides context about the Violentmonkey project to assist AI-powered development tools.

## Project Overview

Violentmonkey is a browser extension that provides userscripts support for browsers using the WebExtensions API. It allows users to install, manage, and run userscripts that modify web page behavior.

## Technology Stack

- **Frontend Framework**: Vue 3 (Composition API)
- **Build Tools**: Webpack 5, Gulp 4
- **Testing**: Jest with custom test environment
- **Code Quality**: ESLint, Prettier
- **Package Manager**: Yarn v1.x
- **Node Version**: >=20 (specified in package.json engines)
- **Icons**: Iconify MDI set via unplugin-icons
- **Editor**: CodeMirror 5 for script editing

## Architecture

### Directory Structure

```
src/
├── background/       # Background page scripts (service workers)
│   ├── plugin/      # Plugin system and event handling
│   ├── sync/        # Cloud sync integrations (Google Drive, Dropbox, OneDrive, WebDAV)
│   └── utils/       # Background utilities (update, requests, database, etc.)
├── injected/        # Content scripts injected into web pages
│   ├── content/     # Scripts running in content script context
│   └── web/         # Scripts running in page context
├── options/         # Options page (dashboard and settings)
│   └── views/       # Vue components for settings, script editor, etc.
├── popup/           # Browser action popup
├── confirm/         # Script installation confirmation dialog
├── common/          # Shared utilities and components
│   └── ui/          # Reusable Vue components
└── _locales/        # Internationalization files
```

### Key Components

- **Background**: Manages script storage, updates, sync, and message passing
- **Injected Content**: Bridges between web page and background
- **Injected Web**: Executes userscripts in page context
- **Options**: Full-featured dashboard for managing scripts
- **Popup**: Quick access to enable/disable scripts per tab

## Code Style

Following `.editorconfig` and `.eslintrc.js`:

- **Indentation**: 2 spaces
- **Line endings**: LF
- **Charset**: UTF-8
- **Quotes**: Single quotes (enforced by editorconfig quote_type)
- **Semicolons**: Required (ESLint rule)
- **Trailing whitespace**: Removed
- **Final newline**: Required

### ESLint Rules

- `no-shadow`: Error
- `no-unused-expressions`: Error
- `no-use-before-define`: Error (functions allowed, classes/variables restricted)
- `object-curly-newline`: Min 8 properties before requiring newlines
- `semi`: Required

### File-Specific Rules

- **Injected scripts**: Restricted imports, no common modules
- **Web context**: Additional restrictions on RegExp usage
- **Vue files**: Multi-word component names not required

## Development Workflow

### Setup

```sh
yarn                    # Install dependencies
yarn dev               # Watch and compile (auto-rebuild)
```

Load extension from `dist/` directory in browser.

### Building

```sh
yarn build             # Production build
yarn build:selfHosted  # Self-hosted build with update_url
```

### Testing

```sh
yarn test              # Run Jest tests
yarn lint              # Lint JavaScript and YAML
yarn ci                # Run lint + test (CI pipeline)
```

### Internationalization

```sh
yarn i18n              # Update locale files from templates
yarn copyI18n          # Copy locales to dist/
```

### Version Management

```sh
yarn bump              # Increment beta, commit, and tag
```

See `RELEASE.md` for release workflow.

## Key Concepts

### Userscripts

JavaScript programs that run on web pages matching specified URL patterns. Defined by metadata block with directives like `@match`, `@require`, `@grant`.

### WebExtensions

Cross-browser extension API. Violentmonkey uses:
- `browser_action`: Extension icon and popup
- `background`: Service worker for persistent logic
- `content_scripts`: Scripts injected into pages
- Permissions: tabs, webRequest, storage, cookies, etc.

### Injection Contexts

1. **Background**: Full extension API access, no page access
2. **Content**: Limited extension API, isolated from page globals
3. **Web**: Full page access, no extension API, where userscripts run

### Safe Globals

`src/common/safe-globals-shared.js` defines globals safe from page tampering. Critical for security in injected context.

### Build System

- **Gulp**: Orchestrates tasks (icons, i18n, manifest)
- **Webpack**: Bundles JavaScript, handles Vue SFC, transpiles with Babel
- **Manifest**: YAML source (`src/manifest.yml`) converted to JSON

## Common Patterns

### Vue Components

```vue
<script setup>
import { ref, computed } from 'vue';
import IconSync from '~icons/mdi/sync';

const count = ref(0);
</script>

<template>
  <IconSync />
  <div>{{ count }}</div>
</template>
```

### Message Passing

Background and content scripts communicate via `browser.runtime.sendMessage` / `onMessage`.

### Storage

Uses `browser.storage.local` for scripts and settings. Sync integrations for cloud backup.

## Testing

- **Environment**: Custom JSDOM-based environment (`test/mock/env.js`)
- **Setup**: `test/mock/index.js` for global mocks
- **Location**: Tests in `test/` directory

## Security Considerations

- **Sandboxing**: Injected scripts avoid exposing browser APIs to userscripts
- **Safe Globals**: Defensive coding against page script tampering
- **CSP**: Content Security Policy restrictions in web context
- **Input Validation**: Sanitize user-provided script metadata

## Build Artifacts

Generated in `dist/`:
- `manifest.json`: Extension manifest
- `public/`: Icons and static assets
- `*.js`: Bundled scripts
- `_locales/`: Locale files

## Contributing

1. Follow existing code style (enforced by ESLint)
2. Update tests for new features
3. Run `yarn ci` before committing
4. Maintain i18n keys in `src/_locales/en/messages.yml`
5. Use conventional commit messages matching repository history

## External Dependencies

- **@violentmonkey/shortcut**: Keyboard shortcut handling
- **@zip.js/zip.js**: ZIP archive handling for import/export
- **CodeMirror**: Script editor with syntax highlighting
- **tldts**: Top-level domain parsing
- **vue/vueleton**: UI framework and utilities

## Browser Compatibility

- **Chrome**: >= 61.0
- **Firefox**: >= 58.0
- **Edge**: Chromium-based versions
- **Manifest Version**: 2 (v3 migration planned)

## Resources

- **Homepage**: https://violentmonkey.github.io/
- **Repository**: https://github.com/violentmonkey/violentmonkey
- **Discord**: https://discord.gg/XHtUNSm6Xc
- **Chrome Web Store**: violentmonkey extension
- **Firefox AMO**: violentmonkey add-on
- **Edge Add-ons**: violentmonkey extension
