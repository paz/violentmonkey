# Local Folder Sync for Violentmonkey

## Overview

This document describes the new **Local Folder** sync provider for Violentmonkey, which enables syncing userscripts to a local folder on your computer. This feature is designed to work seamlessly with folder synchronization services like OneDrive for Business, Dropbox Desktop, Syncthing, and other file sync solutions.

## Implementation Details

### Architecture

The Local Folder sync provider uses the **File System Access API** to write scripts to a user-selected folder. This provides several advantages:

1. **No cloud service integration required** - Works with any folder sync solution
2. **Full user control** - Scripts are stored as plain `.user.js` files
3. **Enterprise-friendly** - Compatible with OneDrive for Business and SharePoint
4. **Editable externally** - Scripts can be edited with any text editor

### Files Added/Modified

#### New Files

- `/src/background/sync/local-folder.js` - The LocalFolder sync provider implementation

#### Modified Files

- `/src/background/sync/index.js` - Registers the local-folder provider
- `/src/options/views/tab-settings/vm-sync.vue` - UI support for folder auth type

### Technical Implementation

#### File System Access API Integration

The provider uses the File System Access API with the following key features:

1. **Directory Handle Persistence**: The selected folder handle is stored in IndexedDB to persist across browser restarts
2. **Permission Management**: Automatically checks and requests permissions when needed
3. **File Operations**: Implements `list()`, `get()`, `put()`, and `remove()` operations for script files

#### Script Storage Format

Scripts are stored using Violentmonkey's standard file naming convention:
- Format: `vm@2-{encodedUri}`
- Example: `vm@2-https%3A%2F%2Fexample.com%2Fscript.user.js`

Each script is stored as a JSON file containing:
```json
{
  "version": 1,
  "code": "// ==UserScript==...",
  "more": {
    "custom": {},
    "enabled": true,
    "update": true,
    "lastUpdated": 1234567890
  }
}
```

## Usage Guide

### Browser Compatibility

The Local Folder sync provider is available in:
- ✅ Chrome 86+
- ✅ Edge 86+
- ✅ Brave
- ❌ Firefox (File System Access API not supported)

### Setting Up Local Folder Sync

1. **Open Violentmonkey Settings**
   - Click the Violentmonkey icon in your browser toolbar
   - Click the gear icon to open settings

2. **Navigate to Sync Tab**
   - In the settings page, select the "Sync" tab

3. **Select Local Folder Provider**
   - In the "Sync to" dropdown, select "Local Folder"

4. **Authorize (Select Folder)**
   - Click the "Authorize" button
   - A folder picker dialog will appear
   - Navigate to and select your desired sync folder
   - Click "Select" to grant permission

5. **Sync Your Scripts**
   - Click the sync button to perform your first sync
   - Your scripts will be saved to the selected folder

### OneDrive for Business Integration

For enterprise users who need to sync scripts across work devices:

1. **Prepare OneDrive Folder**
   ```
   C:\Users\YourName\OneDrive - Company Name\Violentmonkey\
   ```

2. **Select Folder in Violentmonkey**
   - Follow the setup steps above
   - Select the `Violentmonkey` folder in your OneDrive

3. **Automatic Sync**
   - OneDrive Desktop will automatically sync files
   - Install Violentmonkey on other devices
   - Select the same OneDrive folder
   - Your scripts will sync automatically

### Using with Other Sync Solutions

#### Dropbox Desktop
```
C:\Users\YourName\Dropbox\Violentmonkey\
```

#### Syncthing
```
Any folder configured in Syncthing
```

#### Google Drive Desktop
```
C:\Users\YourName\Google Drive\Violentmonkey\
```

## Folder Structure

After syncing, your folder will contain:

```
/Your-Sync-Folder/
├── vm@2-https%3A%2F%2Fexample.com%2Fscript1
├── vm@2-https%3A%2F%2Fexample.com%2Fscript2
├── vm@2-https%3A%2F%2Fexample.com%2Fscript3
└── ...
```

Each file contains the full script data in JSON format.

## Limitations and Known Issues

1. **File System Access API Required**
   - Not available in Firefox
   - Requires Chromium-based browser version 86+

2. **Permission Persistence**
   - Browser may require re-granting permission after restart
   - Simply click "Authorize" again to restore access

3. **File Naming**
   - Files use encoded URIs, not human-readable names
   - This ensures compatibility with Violentmonkey's internal structure

4. **No Real-time Sync**
   - Syncing happens when you click the sync button or when auto-sync triggers
   - External file changes are not detected in real-time

## Future Enhancements

Potential improvements for future versions:

1. **File Watching** - Detect external file changes automatically
2. **browser.storage.sync Integration** - Store lightweight metadata in browser sync
3. **Human-readable Filenames** - Optional setting for cleaner file names
4. **Conflict Resolution UI** - Better handling of sync conflicts
5. **Sync Status Indicators** - Visual feedback for sync state

## Development Notes

### Testing the Implementation

To test locally:

1. Build Violentmonkey:
   ```bash
   npm install
   npm run dev
   ```

2. Load the extension in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

3. Test the Local Folder sync:
   - Go to Violentmonkey settings → Sync
   - Select "Local Folder"
   - Click "Authorize" and select a test folder
   - Create/edit a script and sync

### Code Structure

```javascript
LocalFolder extends BaseService {
  // Core methods
  initialize()     // Setup IndexedDB, restore handle
  authorize()      // Show folder picker
  revoke()         // Clear authorization
  hasAuth()        // Check if folder selected

  // Sync operations (inherited from BaseService)
  list()           // List files in folder
  get(item)        // Read file content
  put(item, data)  // Write file content
  remove(item)     // Delete file

  // Permission management
  _checkPermission()
  _requestPermission()

  // IndexedDB operations
  _openDatabase()
  _storeHandle()
  _getStoredHandle()
  _clearStoredHandle()
}
```

## Security Considerations

1. **User Control** - User must explicitly grant folder access
2. **No Cloud Credentials** - No passwords or API keys stored
3. **Local Storage** - All data remains on user's device
4. **Permission Prompt** - Browser shows permission prompt on first use

## Credits

Implementation by Claude (Anthropic) for the Violentmonkey project.

## License

This implementation follows the Violentmonkey project license (MIT).
