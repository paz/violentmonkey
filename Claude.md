# Claude.md

This document contains mandatory rules and guidelines for AI agents working on the Violentmonkey codebase.

## Mandatory Rules

### Code Style - MUST Follow

You MUST strictly adhere to these code style requirements:

- **Indentation**: 2 spaces (never tabs)
- **Line endings**: LF only
- **Quotes**: Single quotes for strings
- **Semicolons**: Required at end of statements
- **Trailing whitespace**: Remove all trailing whitespace
- **Final newline**: Every file must end with a newline
- **ESLint**: All code must pass `yarn lint` without errors

### Before ANY Code Changes

1. **MUST read existing files** before editing them - never propose changes to unread code
2. **MUST run `yarn ci`** before committing - this runs linting and tests
3. **MUST preserve existing patterns** - study how similar features are implemented
4. **MUST check ESLint rules** in `.eslintrc.js` for context-specific restrictions

### Commit Messages

Follow the repository's commit message style (check `git log` for examples):

- Use imperative mood: "fix bug" not "fixed bug"
- Be concise and descriptive
- Reference issue numbers when applicable
- Examples from this repo:
  - `fix #2407: render all scripts after closing editor`
  - `chore: update locale files from Transifex`

### Testing Requirements

- **MUST write tests** for new features
- **MUST run `yarn test`** and ensure all tests pass
- **MUST NOT commit** if `yarn ci` fails
- Tests live in `test/` directory
- Use Jest with custom JSDOM environment

### File Organization - Critical Rules

#### Injected Scripts (`src/injected/**`)

- **NEVER import from `*/common`** - this is enforced by ESLint and will break the extension
- Only use safe globals defined in `src/common/safe-globals-shared.js`
- Web context (`src/injected/web/**`) has additional RegExp restrictions
- These scripts run in untrusted page context - security is paramount

#### Common Files (`src/common/**`)

- Shared between background, content, and options pages
- Must work in all contexts (background, content, popup, options)
- No browser-specific APIs that aren't available everywhere

#### Vue Components

- Use Vue 3 Composition API with `<script setup>`
- Single-word component names are allowed (unlike default Vue rules)
- Icons: Import from `~icons/mdi/{icon-name}` using unplugin-icons
- Example:
  ```vue
  <script setup>
  import IconSync from '~icons/mdi/sync';
  </script>
  ```

### Internationalization (i18n)

- **ALWAYS add i18n keys** for user-facing strings
- Keys go in `src/_locales/en/messages.yml`
- Run `yarn i18n` to update locale files
- Never hardcode English strings in UI components
- Use `i18n()` function to get translated strings

### Security - Non-Negotiable

When working with injected scripts:

1. **NEVER expose browser APIs** to userscripts
2. **ALWAYS use safe globals** to prevent page script tampering
3. **VALIDATE all user input** especially script metadata
4. **SANITIZE before rendering** user-provided content
5. **ASSUME page context is hostile** in web injected scripts

### Build System

- **Gulp** handles icons, i18n, and manifest generation
- **Webpack** bundles JavaScript and Vue components
- `src/manifest.yml` is source of truth for manifest - never edit `dist/manifest.json` directly
- Run `yarn dev` for development with auto-rebuild
- Run `yarn build` for production builds

### Dependencies

- **Node.js**: Must use version >=20 (check `package.json` engines)
- **Package Manager**: Yarn v1.x only
- **NEVER use npm** - this project uses `yarn.lock`
- Install dependencies: `yarn` (not `yarn install`)

## Architecture Understanding Required

Before making changes, understand these concepts:

### Three Execution Contexts

1. **Background** (`src/background/`): Service worker, full extension API, manages storage/sync/updates
2. **Content** (`src/injected/content/`): Bridges page and background, limited extension API
3. **Web** (`src/injected/web/`): Runs userscripts in page context, no extension API access

Message passing flows: Background ↔ Content ↔ Web

### Directory Purpose

- `src/background/`: Extension background logic, storage, sync, updates
- `src/injected/content/`: Content script bridge
- `src/injected/web/`: Userscript execution environment
- `src/options/`: Dashboard and script editor
- `src/popup/`: Browser action popup
- `src/confirm/`: Script installation confirmation
- `src/common/`: Shared utilities and Vue components

## Common Mistakes to Avoid

### DO NOT:

- ❌ Use tabs for indentation (use 2 spaces)
- ❌ Import common modules in injected scripts
- ❌ Edit files without reading them first
- ❌ Skip running `yarn ci` before committing
- ❌ Hardcode English strings (use i18n)
- ❌ Use npm or npm commands
- ❌ Edit `dist/manifest.json` directly
- ❌ Expose browser APIs to userscripts
- ❌ Commit without testing
- ❌ Add double quotes (use single quotes)
- ❌ Skip semicolons
- ❌ Use RegExp in web context without understanding restrictions

### DO:

- ✅ Read existing code to understand patterns
- ✅ Follow ESLint rules strictly
- ✅ Run `yarn ci` before every commit
- ✅ Add tests for new features
- ✅ Use i18n for all user-facing strings
- ✅ Check git log for commit message style
- ✅ Use safe globals in injected contexts
- ✅ Import icons from `~icons/mdi/`
- ✅ Use Vue 3 Composition API
- ✅ Validate security in injected scripts

## Development Workflow

1. **Setup**: `yarn` to install dependencies
2. **Develop**: `yarn dev` for auto-rebuild during development
3. **Lint**: `yarn lint` to check code style
4. **Test**: `yarn test` to run test suite
5. **Verify**: `yarn ci` to run full CI checks
6. **Build**: `yarn build` for production build

## Required Knowledge

### Vue 3 Patterns Used

- Composition API with `<script setup>`
- Reactivity: `ref()`, `computed()`, `watch()`
- Component communication via props and emits
- Shared state via composition functions

### WebExtensions APIs Used

- `browser.runtime`: Message passing, extension info
- `browser.storage.local`: Persistent storage
- `browser.tabs`: Tab information and management
- `browser.webRequest`: Request interception
- `browser.notifications`: User notifications

### Build Tools

- Webpack 5 with Vue Loader
- Babel for transpilation
- PostCSS for CSS processing
- Gulp for task automation
- Jest for testing

## When in Doubt

1. **Check existing code** - find similar features and follow those patterns
2. **Check git history** - `git log` shows how things were done before
3. **Check ESLint config** - `.eslintrc.js` has context-specific rules explained
4. **Check manifest** - `src/manifest.yml` shows extension structure
5. **Ask questions** - don't assume, verify by reading relevant files

## Critical Files to Understand

- `.editorconfig`: Code formatting rules
- `.eslintrc.js`: Linting rules and context restrictions
- `package.json`: Scripts, dependencies, Node version requirement
- `src/manifest.yml`: Extension manifest source
- `src/common/safe-globals-shared.js`: Secure globals for injected context

## Quality Standards

All code changes must:

1. Pass `yarn lint` without errors or warnings
2. Pass `yarn test` with all tests passing
3. Follow existing code style exactly
4. Include tests for new functionality
5. Use i18n for user-facing strings
6. Preserve security in injected contexts
7. Work in all supported browsers (Chrome >=61, Firefox >=58)

## Remember

This is a **browser extension** that executes **untrusted userscripts**. Security is paramount. When modifying injected scripts, always assume the page context is hostile and guard against tampering.
