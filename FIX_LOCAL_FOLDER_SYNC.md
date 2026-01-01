# Fix Incomplete Local Folder Sync Implementation for Violentmonkey

## Context

A Local Folder sync provider was added to Violentmonkey but has significant quality issues:
- Support modules created but barely integrated
- Hybrid sync architecture described but not implemented
- Unused imports and incomplete features

## Current State

**Repository:** https://github.com/paz/violentmonkey (or local fork)
**Branch:** `claude/create-claude-md-yhNIY-E6lJz`

### Files Created
1. `/src/background/sync/local-folder.js` - Main provider (incomplete integration)
2. `/src/background/sync/local-folder-metadata.js` - Metadata layer (mostly unused)
3. `/src/background/sync/local-folder-watcher.js` - File watcher (started but not integrated)
4. `/src/background/sync/local-folder-errors.js` - Error handling (barely used)
5. `/src/options/utils/local-folder-helper.js` - Page context helper (works)

### Files Modified
1. `/src/background/sync/index.js` - Registers provider ✓
2. `/src/options/views/tab-settings/vm-sync.vue` - UI support ✓

## Problems to Fix

### 1. Unused Modules (Critical)
- `local-folder-metadata.js` has 15+ functions, only 2 are imported
- Functions like `loadMetadata()`, `saveMetadata()`, `buildScriptMetadata()`, `hashContent()` not used
- The hybrid storage concept is not implemented

### 2. No Custom Sync Logic (Critical)
The provider relies entirely on BaseService's sync() method. It should override `_sync()` or similar to:
- Store metadata in browser.storage.sync
- Store content in local folder
- Implement three-way conflict resolution
- Coordinate between both storage tiers

### 3. File Watcher Not Integrated
- Watcher starts/stops correctly
- But changes detected don't trigger proper reconciliation
- Should use metadata to detect conflicts

### 4. Missing browser.storage.sync Integration
- Metadata functions exist but aren't called
- No actual metadata sync happening
- Cross-browser sync not working

## Two Options

### Option A: Simplify (Recommended for MVP)
**Remove unused complexity, make it work simply:**

1. **Delete or comment out unused modules:**
   - Keep basic error handling
   - Remove metadata layer (not needed for basic sync)
   - Simplify or remove file watcher

2. **Focus on core functionality:**
   - Folder selection ✓ (already works)
   - Basic file sync via BaseService ✓ (already works)
   - Clean up code, remove unused imports

3. **Result:** Simple, working local folder sync (like Dropbox provider but for local folders)

### Option B: Complete the Hybrid Implementation (Complex)
**Properly implement the full hybrid architecture:**

1. **Override sync logic in local-folder.js:**
   ```javascript
   async _sync() {
     // Load from all three sources
     const localScripts = await this.getLocalData();
     const metadata = await loadMetadata();
     const folderFiles = await this.list();

     // Three-way reconciliation
     for (const script of localScripts) {
       const remoteMeta = metadata.scripts[script.props.id];
       const fileExists = folderFiles.find(f => f.uri === script.props.uri);

       // Compare timestamps (local, remote metadata, file)
       const action = this._resolveConflict(script, remoteMeta, fileExists);

       // Execute action: pull, push, merge, skip
       await this._executeAction(action);
     }

     // Update metadata
     await this._updateMetadata(localScripts);
   }
   ```

2. **Integrate metadata layer:**
   - Call `saveMetadata()` after syncs
   - Call `loadMetadata()` to get cross-browser state
   - Update metadata on every script change

3. **Properly use file watcher:**
   - On external change, compare with metadata
   - Detect conflicts between file and local/remote state
   - Reconcile properly

4. **Add conflict resolution:**
   - Implement `_resolveConflict()` with three-way comparison
   - Last-write-wins based on timestamps
   - Notify user of conflicts

## Recommended Approach

**Option A (Simplify)** is recommended because:
- Gets working functionality faster
- Easier to maintain
- Hybrid sync adds complexity that may not be needed
- Users can sync via OneDrive/Dropbox without browser.storage.sync

If you choose Option A:
1. Remove `local-folder-metadata.js` or keep only basic error metadata
2. Remove or simplify `local-folder-watcher.js`
3. Keep `local-folder-errors.js` for error handling
4. Clean up imports in `local-folder.js`
5. Ensure basic sync works via BaseService
6. Update documentation to match actual implementation

If you choose Option B:
1. Study existing sync providers in `/src/background/sync/`
2. Understand BaseService sync flow
3. Override `_sync()` or appropriate methods
4. Integrate all modules properly
5. Add tests
6. Update documentation

## Testing Checklist

After fixes, verify:
- [ ] No linting errors
- [ ] No unused imports
- [ ] Authorize button works (folder picker appears)
- [ ] Scripts sync to folder after clicking sync
- [ ] Files appear in correct format
- [ ] Revoke clears authorization
- [ ] No console errors
- [ ] Code is maintainable and understandable

## Key Files to Study

- `/src/background/sync/base.js` - BaseService implementation
- `/src/background/sync/dropbox.js` - Simple cloud provider example
- `/src/background/sync/onedrive.js` - More complex provider

## Success Criteria

**Option A (Simple):**
- Working folder sync with clean code
- No unused modules
- All linting passes
- Basic sync functionality works

**Option B (Hybrid):**
- Metadata stored in browser.storage.sync
- Content stored in local folder
- Three-way conflict resolution working
- File watcher integrated properly
- Cross-browser metadata sync working
- All features from original spec working

## Current Branch State

All code is on branch: `claude/create-claude-md-yhNIY-E6lJz`

Recent commits:
1. "Add Local Folder sync provider" - Initial implementation
2. "Fix Local Folder authorization" - Page context fix
3. "Complete hybrid implementation" - Added all modules (incomplete)
4. "Fix linting errors" - Removed unused imports

## Your Task

Choose Option A or B, then:
1. Fix the code quality issues
2. Make it actually work
3. Ensure no unused code
4. Test thoroughly
5. Update documentation to match reality
6. Commit and push fixes

Good luck!
