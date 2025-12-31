/**
 * Local Folder Sync Provider
 *
 * Uses File System Access API for script content storage.
 * Enables integration with folder sync services like OneDrive for Business.
 */

import { BaseService, getItemFilename, getURI, isScriptFile, register } from './base';

const DB_NAME = 'violentmonkey-local-sync';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const FOLDER_HANDLE_KEY = 'syncFolder';

// Check if File System Access API is available (only in page context)
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

    // Open IndexedDB for handle persistence
    try {
      this.db = await this._openDatabase();
    } catch (error) {
      console.warn('[LocalFolder] Failed to open database:', error);
      return;
    }

    // Try to restore previously granted handle
    try {
      const handle = await this._getStoredHandle();
      if (handle) {
        const hasPermission = await this._checkPermission(handle);
        if (hasPermission) {
          this.directoryHandle = handle;
          console.info('[LocalFolder] Restored folder handle with permissions');
        } else {
          console.info('[LocalFolder] Stored handle exists but permission denied');
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
    // Check config for auth flag (set by options page)
    return this.config.get('authorized') || false;
  },

  /**
   * Get user config
   */
  getUserConfig() {
    return {
      authorized: this.config.get('authorized') || false,
    };
  },

  /**
   * Set user config
   */
  setUserConfig(config) {
    if (typeof config.authorized !== 'undefined') {
      this.config.set('authorized', config.authorized);
    }
  },

  /**
   * Authorize - signal that user needs to select folder in page context
   * This is called from background, so we just set a flag
   */
  async authorize() {
    // This will be handled by the options page directly
    // Just set a flag that authorization is needed
    this.config.set('authNeeded', true);
    console.info('[LocalFolder] Authorization requested - user should select folder in settings');
  },

  /**
   * Revoke authorization - clear stored handle
   */
  async revoke() {
    await this._clearStoredHandle();
    this.directoryHandle = null;
    this.config.set({
      authorized: false,
      authNeeded: false,
    });
    console.info('[LocalFolder] Authorization revoked');
  },

  /**
   * Request authorization - called by base sync logic
   */
  async requestAuth() {
    if (!this.directoryHandle) {
      // Try to restore handle
      try {
        const handle = await this._getStoredHandle();
        if (handle) {
          const hasPermission = await this._checkPermission(handle);
          if (hasPermission) {
            this.directoryHandle = handle;
            return { code: 0 }; // INIT_SUCCESS
          }
        }
      } catch (error) {
        console.warn('[LocalFolder] Failed to restore handle:', error);
      }
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
      const handle = await this._getStoredHandle();
      if (!handle) {
        throw new Error('No folder selected');
      }
      this.directoryHandle = handle;
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
    if (!this.directoryHandle) {
      const handle = await this._getStoredHandle();
      if (!handle) {
        throw new Error('No folder selected');
      }
      this.directoryHandle = handle;
    }

    const name = getItemFilename(item);
    try {
      const fileHandle = await this.directoryHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      if (error.name === 'NotFoundError') {
        // File doesn't exist - this is normal for getMeta
        return null;
      }
      throw error;
    }
  },

  /**
   * Write script content to file
   */
  async put(item, data) {
    if (!this.directoryHandle) {
      const handle = await this._getStoredHandle();
      if (!handle) {
        throw new Error('No folder selected');
      }
      this.directoryHandle = handle;
    }

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
    if (!this.directoryHandle) {
      const handle = await this._getStoredHandle();
      if (!handle) {
        throw new Error('No folder selected');
      }
      this.directoryHandle = handle;
    }

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
    if (!handle) return false;
    try {
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      return permission === 'granted';
    } catch {
      return false;
    }
  },

  async _requestPermission(handle) {
    if (!handle) return false;
    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      return permission === 'granted';
    } catch {
      return false;
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
    if (!this.db) {
      this.db = await this._openDatabase();
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(handle, FOLDER_HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },

  async _getStoredHandle() {
    if (!this.db) {
      this.db = await this._openDatabase();
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(FOLDER_HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  async _clearStoredHandle() {
    if (!this.db) {
      this.db = await this._openDatabase();
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(FOLDER_HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },
});

// Only register if running in a browser context
// The File System Access API will only work in page context, not background
register(LocalFolder);
console.info('[LocalFolder] Provider registered');
