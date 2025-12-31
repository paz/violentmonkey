/**
 * Local Folder Helper for Options Page
 *
 * Handles File System Access API operations in page context.
 * This must run in the options page, not the background script,
 * because showDirectoryPicker() requires user interaction in a page.
 */

const DB_NAME = 'violentmonkey-local-sync';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const FOLDER_HANDLE_KEY = 'syncFolder';

let db = null;

/**
 * Open IndexedDB for storing directory handle
 */
async function openDatabase() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Store directory handle in IndexedDB
 */
async function storeHandle(handle) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(handle, FOLDER_HANDLE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Get stored directory handle from IndexedDB
 */
async function getStoredHandle() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(FOLDER_HANDLE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Clear stored directory handle from IndexedDB
 */
async function clearStoredHandle() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(FOLDER_HANDLE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
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
 * Request permission for directory handle
 */
async function requestPermission(handle) {
  if (!handle) return false;
  try {
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    return permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Validate folder by attempting to write a test file
 */
async function validateFolder(handle) {
  const testFile = '.violentmonkey-test';
  try {
    const fileHandle = await handle.getFileHandle(testFile, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write('test');
    await writable.close();
    // Clean up
    await handle.removeEntry(testFile);
    return true;
  } catch (error) {
    throw new Error(`Cannot write to selected folder: ${error.message}`);
  }
}

/**
 * Show folder picker and store the selected handle
 * This MUST be called from a user interaction event (button click)
 */
export async function selectFolder() {
  // Check if API is supported
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new Error('File System Access API is not supported in this browser');
  }

  try {
    // Show folder picker - this requires user interaction
    const handle = await window.showDirectoryPicker({
      id: 'violentmonkey-sync',
      mode: 'readwrite',
      startIn: 'documents',
    });

    // Verify we can write to the folder
    await validateFolder(handle);

    // Store for persistence
    await storeHandle(handle);

    console.info('[LocalFolder] Folder selected and stored successfully');
    return {
      success: true,
      handle,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      // User cancelled picker
      console.info('[LocalFolder] Folder selection cancelled by user');
      return {
        success: false,
        cancelled: true,
      };
    }
    console.error('[LocalFolder] Failed to select folder:', error);
    throw error;
  }
}

/**
 * Check if a folder is already selected and has permission
 */
export async function checkFolderAccess() {
  try {
    const handle = await getStoredHandle();
    if (!handle) {
      return {
        hasAccess: false,
        needsSelection: true,
      };
    }

    const hasPermission = await checkPermission(handle);
    if (!hasPermission) {
      // Try to request permission
      const granted = await requestPermission(handle);
      if (!granted) {
        return {
          hasAccess: false,
          needsPermission: true,
          handle,
        };
      }
    }

    return {
      hasAccess: true,
      handle,
    };
  } catch (error) {
    console.error('[LocalFolder] Failed to check folder access:', error);
    return {
      hasAccess: false,
      error: error.message,
    };
  }
}

/**
 * Revoke folder access
 */
export async function revokeFolder() {
  try {
    await clearStoredHandle();
    console.info('[LocalFolder] Folder access revoked');
    return { success: true };
  } catch (error) {
    console.error('[LocalFolder] Failed to revoke folder access:', error);
    throw error;
  }
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
