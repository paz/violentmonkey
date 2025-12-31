/**
 * Local Folder Sync Provider
 *
 * Uses File System Access API for script content storage
 * and browser.storage.sync for lightweight metadata.
 *
 * Enables integration with folder sync services like OneDrive for Business.
 */

import { BaseService, getItemFilename, getURI, isScriptFile, register } from './base';

const DB_NAME = 'violentmonkey-local-sync';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const FOLDER_HANDLE_KEY = 'syncFolder';

// Check if File System Access API is available
const isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const LocalFolder = BaseService.extend({
  name: 'local-folder',
  displayName: 'Local Folder',
  properties: {
    authType: 'folder', // Custom auth type - uses folder picker
  },

  /**
   * Directory handle for the sync folder
   * @type {FileSystemDirectoryHandle}
   */
  directoryHandle: null,

  /**
   * IndexedDB instance for storing the directory handle
   * @type {IDBDatabase}
   */
  db: null,

  /**
   * Initialize the sync provider
   */
  async initialize() {
    BaseService.prototype.initialize.call(this);

    if (!isSupported) {
      this.logError(new Error('File System Access API is not supported in this browser'));
      return;
    }

    // Open IndexedDB for handle persistence
    this.db = await this._openDatabase();

    // Try to restore previously granted handle
    try {
      const handle = await this._getStoredHandle();
      if (handle) {
        const hasPermission = await this._checkPermission(handle);
        if (hasPermission) {
          this.directoryHandle = handle;
        }
      }
    } catch (error) {
      console.warn('[LocalFolder] Failed to restore handle:', error);
    }
  },

  /**
   * Check if user has authorized (selected a folder)
   */
  hasAuth() {
    return !!this.directoryHandle;
  },

  /**
   * Authorize - show folder picker
   */
  async authorize() {
    if (!isSupported) {
      throw new Error('File System Access API is not supported in this browser');
    }

    try {
      // Show folder picker
      const handle = await window.showDirectoryPicker({
        id: 'violentmonkey-sync',
        mode: 'readwrite',
        startIn: 'documents',
      });

      // Verify we can write to the folder
      await this._validateFolder(handle);

      // Store for persistence
      await this._storeHandle(handle);
      this.directoryHandle = handle;

      console.info('[LocalFolder] Folder selected successfully');
    } catch (error) {
      if (error.name === 'AbortError') {
        // User cancelled picker
        console.info('[LocalFolder] Folder selection cancelled');
        return;
      }
      this.logError(error);
      throw error;
    }
  },

  /**
   * Revoke authorization - clear stored handle
   */
  async revoke() {
    await this._clearStoredHandle();
    this.directoryHandle = null;
    this.config.clear();
    console.info('[LocalFolder] Authorization revoked');
  },

  /**
   * Request authorization - called by base sync logic
   */
  async requestAuth() {
    if (!this.directoryHandle) {
      return { code: 1 }; // INIT_UNAUTHORIZED
    }

    // Check if we still have permission
    const hasPermission = await this._checkPermission(this.directoryHandle);
    if (!hasPermission) {
      // Try to request permission again
      const granted = await this._requestPermission(this.directoryHandle);
      if (!granted) {
        return { code: 1 }; // INIT_UNAUTHORIZED
      }
    }

    return { code: 0 }; // INIT_SUCCESS
  },

  /**
   * List all script files in the folder
   */
  async list() {
    if (!this.directoryHandle) {
      throw new Error('No folder selected');
    }

    const files = [];
    for await (const [name, handle] of this.directoryHandle.entries()) {
      if (handle.kind === 'file' && isScriptFile(name)) {
        files.push({
          name,
          uri: getURI(name),
        });
      }
    }
    return files;
  },

  /**
   * Get script content from file
   */
  async get(item) {
    const name = getItemFilename(item);
    try {
      const fileHandle = await this.directoryHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      if (error.name === 'NotFoundError') {
        // File doesn't exist
        return null;
      }
      throw error;
    }
  },

  /**
   * Write script content to file
   */
  async put(item, data) {
    const name = getItemFilename(item);
    try {
      const fileHandle = await this.directoryHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      return { name, uri: item.uri };
    } catch (error) {
      this.logError(error);
      throw new Error(`Failed to write script ${name}: ${error.message}`);
    }
  },

  /**
   * Delete script file
   */
  async remove(item) {
    const name = getItemFilename(item);
    try {
      await this.directoryHandle.removeEntry(name);
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        this.logError(error);
        throw error;
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // Permission Management
  // ═══════════════════════════════════════════════════════════════════

  async _checkPermission(handle) {
    try {
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      return permission === 'granted';
    } catch {
      return false;
    }
  },

  async _requestPermission(handle) {
    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      return permission === 'granted';
    } catch {
      return false;
    }
  },

  async _validateFolder(handle) {
    // Try to create a test file to verify write access
    const testFile = '.violentmonkey-test';
    try {
      const fileHandle = await handle.getFileHandle(testFile, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write('test');
      await writable.close();
      // Clean up
      await handle.removeEntry(testFile);
    } catch (error) {
      throw new Error(`Cannot write to selected folder: ${error.message}`);
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // IndexedDB Operations (for handle persistence)
  // ═══════════════════════════════════════════════════════════════════

  _openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  },

  async _storeHandle(handle) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(handle, FOLDER_HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },

  async _getStoredHandle() {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(FOLDER_HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  async _clearStoredHandle() {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(FOLDER_HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },
});

// Only register if File System Access API is supported
if (isSupported) {
  register(LocalFolder);
  console.info('[LocalFolder] Provider registered');
} else {
  console.warn('[LocalFolder] File System Access API not supported, provider not registered');
}
