/**
 * File Watcher for Local Folder Sync
 *
 * Periodically checks for external file changes in the sync folder.
 * This catches edits made by external editors or synced from other devices.
 *
 * Since File System Access API doesn't provide native file watching,
 * we poll the directory periodically to detect changes.
 */

import { hashContent } from './local-folder-metadata';

const CHECK_INTERVAL = 30000; // 30 seconds
const FOLDER_HANDLE_KEY = 'syncFolder';
const DB_NAME = 'violentmonkey-local-sync';

let intervalId = null;
let lastKnownState = new Map(); // filename -> { hash, mtime, size }
let directoryHandle = null;
let onChange = null;

/**
 * Start watching for file changes
 */
export async function startFileWatcher(changeCallback) {
  if (intervalId) {
    console.warn('[LocalFolder] Watcher already running');
    return;
  }

  onChange = changeCallback;

  // Get directory handle from IndexedDB
  try {
    directoryHandle = await getStoredHandle();
    if (!directoryHandle) {
      console.warn('[LocalFolder] Watcher: No folder selected');
      return;
    }

    // Check permission
    const hasPermission = await checkPermission(directoryHandle);
    if (!hasPermission) {
      console.warn('[LocalFolder] Watcher: No permission to access folder');
      return;
    }

    // Initial state snapshot
    await captureState();

    // Start polling
    intervalId = setInterval(checkForChanges, CHECK_INTERVAL);
    console.info('[LocalFolder] Watcher started (interval: 30s)');
  } catch (error) {
    console.error('[LocalFolder] Failed to start watcher:', error);
  }
}

/**
 * Stop watching for file changes
 */
export function stopFileWatcher() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.info('[LocalFolder] Watcher stopped');
  }
}

/**
 * Capture current state of all script files
 */
async function captureState() {
  lastKnownState.clear();

  if (!directoryHandle) return;

  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'file' && isScriptFile(name)) {
      try {
        const file = await handle.getFile();
        const content = await file.text();
        const hash = await hashContent(content);

        lastKnownState.set(name, {
          hash,
          mtime: file.lastModified,
          size: file.size,
        });
      } catch (error) {
        console.error(`[LocalFolder] Failed to capture state for ${name}:`, error);
      }
    }
  }

  console.info(`[LocalFolder] Captured state of ${lastKnownState.size} files`);
}

/**
 * Check for file changes
 */
async function checkForChanges() {
  if (!directoryHandle) return;

  // Check permission before accessing
  const hasPermission = await checkPermission(directoryHandle);
  if (!hasPermission) {
    console.warn('[LocalFolder] Lost permission to access folder');
    stopFileWatcher();
    return;
  }

  const changes = [];
  const currentFiles = new Set();

  // Check for new and modified files
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'file' && isScriptFile(name)) {
      currentFiles.add(name);

      try {
        const file = await handle.getFile();
        const known = lastKnownState.get(name);

        if (!known) {
          // New file
          const content = await file.text();
          changes.push({
            type: 'added',
            filename: name,
            content,
            mtime: file.lastModified,
          });

          // Update state
          lastKnownState.set(name, {
            hash: await hashContent(content),
            mtime: file.lastModified,
            size: file.size,
          });
        } else {
          // Check if modified
          const modified = file.lastModified > known.mtime || file.size !== known.size;

          if (modified) {
            const content = await file.text();
            const hash = await hashContent(content);

            if (hash !== known.hash) {
              changes.push({
                type: 'modified',
                filename: name,
                content,
                mtime: file.lastModified,
              });

              // Update state
              lastKnownState.set(name, {
                hash,
                mtime: file.lastModified,
                size: file.size,
              });
            }
          }
        }
      } catch (error) {
        console.error(`[LocalFolder] Failed to check file ${name}:`, error);
      }
    }
  }

  // Check for deleted files
  for (const [filename] of lastKnownState) {
    if (!currentFiles.has(filename)) {
      changes.push({
        type: 'deleted',
        filename,
      });
      lastKnownState.delete(filename);
    }
  }

  // Notify changes
  if (changes.length > 0) {
    console.info(`[LocalFolder] Detected ${changes.length} external changes`);
    if (onChange) {
      onChange(changes);
    }
  }
}

/**
 * Check if filename is a script file
 */
function isScriptFile(name) {
  return /^vm(?:@\d+)?-/.test(name);
}

/**
 * Check permission for directory handle
 */
async function checkPermission(handle) {
  if (!handle) return false;
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    return permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Get directory handle from IndexedDB
 */
async function getStoredHandle() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const getRequest = store.get(FOLDER_HANDLE_KEY);

      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => resolve(getRequest.result);
    };
  });
}
