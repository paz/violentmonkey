/**
 * Local Folder Sync Provider - Complete Hybrid Implementation
 *
 * Combines browser.storage.sync for metadata with File System Access API
 * for script content, enabling integration with OneDrive for Business and
 * other enterprise file sync solutions.
 *
 * Features:
 * - Hybrid storage: metadata in browser.storage.sync, content in local folder
 * - Three-way conflict resolution (local, remote metadata, file)
 * - File watcher for detecting external changes
 * - Cross-browser metadata sync via browser profile
 * - Comprehensive error handling
 */

import { BaseService, getItemFilename, getURI, isScriptFile, register } from './base';
import {
  onMetadataChanged,
  clearMetadata,
} from './local-folder-metadata';
import {
  startFileWatcher,
  stopFileWatcher,
} from './local-folder-watcher';
import {
  handleError,
  logError,
} from './local-folder-errors';

const DB_NAME = 'violentmonkey-local-sync';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const FOLDER_HANDLE_KEY = 'syncFolder';

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
   * IndexedDB instance
   * @type {IDBDatabase}
   */
  db: null,

  /**
   * Metadata change listener unsubscribe function
   */
  metadataUnsubscribe: null,

  /**
   * File watcher active flag
   */
  watcherActive: false,

  /**
   * Initialize the sync provider
   */
  async initialize() {
    BaseService.prototype.initialize.call(this);

    console.info('[LocalFolder] Initializing hybrid sync provider');

    // Open IndexedDB
    try {
      this.db = await this._openDatabase();
    } catch (error) {
      logError(error, 'initialize:database');
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

          // Start file watcher if enabled
          if (this.config.get('watchFiles')) {
            this._startWatcher();
          }

          // Listen for metadata changes from other browsers
          this._startMetadataListener();
        } else {
          console.info('[LocalFolder] Stored handle exists but permission denied');
        }
      }
    } catch (error) {
      logError(error, 'initialize:restore');
    }
  },

  /**
   * Check if user has authorized (selected a folder)
   */
  hasAuth() {
    return this.config.get('authorized') || false;
  },

  /**
   * Get user config
   */
  getUserConfig() {
    return {
      authorized: this.config.get('authorized') || false,
      watchFiles: this.config.get('watchFiles') !== false, // Default true
    };
  },

  /**
   * Set user config
   */
  setUserConfig(config) {
    if (typeof config.authorized !== 'undefined') {
      this.config.set('authorized', config.authorized);

      // Stop watcher if unauthorized
      if (!config.authorized && this.watcherActive) {
        this._stopWatcher();
      }
    }

    if (typeof config.watchFiles !== 'undefined') {
      this.config.set('watchFiles', config.watchFiles);

      // Start/stop watcher based on setting
      if (config.watchFiles && !this.watcherActive && this.hasAuth()) {
        this._startWatcher();
      } else if (!config.watchFiles && this.watcherActive) {
        this._stopWatcher();
      }
    }
  },

  /**
   * Authorize - handled by options page
   */
  async authorize() {
    // This is handled by the options page in page context
    // Just set a flag that authorization is needed
    this.config.set('authNeeded', true);
    console.info('[LocalFolder] Authorization requested - handled by options page');
  },

  /**
   * Revoke authorization
   */
  async revoke() {
    try {
      // Stop watcher and metadata listener
      this._stopWatcher();
      this._stopMetadataListener();

      // Clear stored handle
      await this._clearStoredHandle();
      this.directoryHandle = null;

      // Clear metadata
      await clearMetadata();

      // Clear config
      this.config.set({
        authorized: false,
        authNeeded: false,
      });

      console.info('[LocalFolder] Authorization revoked successfully');
    } catch (error) {
      throw handleError(error, 'revoke');
    }
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

            // Start watcher and metadata listener
            if (this.config.get('watchFiles') !== false) {
              this._startWatcher();
            }
            this._startMetadataListener();

            return { code: 0 }; // INIT_SUCCESS
          }
        }
      } catch (error) {
        logError(error, 'requestAuth');
      }
      return { code: 1 }; // INIT_UNAUTHORIZED
    }

    // Check if we still have permission
    const hasPermission = await this._checkPermission(this.directoryHandle);
    if (!hasPermission) {
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
    try {
      if (!this.directoryHandle) {
        const handle = await this._getStoredHandle();
        if (!handle) {
          throw handleError(new Error('No folder selected'), 'list');
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
    } catch (error) {
      throw handleError(error, 'list');
    }
  },

  /**
   * Get script content from file
   */
  async get(item) {
    try {
      if (!this.directoryHandle) {
        const handle = await this._getStoredHandle();
        if (!handle) {
          throw handleError(new Error('No folder selected'), 'get');
        }
        this.directoryHandle = handle;
      }

      const name = getItemFilename(item);
      const fileHandle = await this.directoryHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      if (error.name === 'NotFoundError') {
        return null; // Normal for getMeta
      }
      throw handleError(error, `get:${item.uri}`);
    }
  },

  /**
   * Write script content to file
   */
  async put(item, data) {
    try {
      if (!this.directoryHandle) {
        const handle = await this._getStoredHandle();
        if (!handle) {
          throw handleError(new Error('No folder selected'), 'put');
        }
        this.directoryHandle = handle;
      }

      const name = getItemFilename(item);
      const fileHandle = await this.directoryHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();

      console.info(`[LocalFolder] Wrote file: ${name}`);
      return { name, uri: item.uri };
    } catch (error) {
      throw handleError(error, `put:${item.uri}`);
    }
  },

  /**
   * Delete script file
   */
  async remove(item) {
    try {
      if (!this.directoryHandle) {
        const handle = await this._getStoredHandle();
        if (!handle) {
          throw handleError(new Error('No folder selected'), 'remove');
        }
        this.directoryHandle = handle;
      }

      const name = getItemFilename(item);
      await this.directoryHandle.removeEntry(name);
      console.info(`[LocalFolder] Removed file: ${name}`);
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        throw handleError(error, `remove:${item.uri}`);
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // File Watcher Integration
  // ═══════════════════════════════════════════════════════════════════

  _startWatcher() {
    if (this.watcherActive) return;

    startFileWatcher((changes) => {
      console.info(`[LocalFolder] External changes detected: ${changes.length}`);
      // Trigger auto-sync to handle external changes
      this._handleExternalChanges(changes);
    });

    this.watcherActive = true;
    console.info('[LocalFolder] File watcher started');
  },

  _stopWatcher() {
    if (!this.watcherActive) return;

    stopFileWatcher();
    this.watcherActive = false;
    console.info('[LocalFolder] File watcher stopped');
  },

  async _handleExternalChanges() {
    // Trigger a sync to reconcile external changes
    try {
      await this.sync();
    } catch (error) {
      logError(error, 'handleExternalChanges');
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // Metadata Change Listener
  // ═══════════════════════════════════════════════════════════════════

  _startMetadataListener() {
    if (this.metadataUnsubscribe) return;

    this.metadataUnsubscribe = onMetadataChanged(() => {
      console.info('[LocalFolder] Metadata changed from another browser');
      // Trigger auto-sync to reconcile metadata changes
      this._handleMetadataChange();
    });

    console.info('[LocalFolder] Metadata listener started');
  },

  _stopMetadataListener() {
    if (this.metadataUnsubscribe) {
      this.metadataUnsubscribe();
      this.metadataUnsubscribe = null;
      console.info('[LocalFolder] Metadata listener stopped');
    }
  },

  async _handleMetadataChange() {
    // Trigger a sync to reconcile metadata changes
    try {
      await this.sync();
    } catch (error) {
      logError(error, 'handleMetadataChange');
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
  // IndexedDB Operations
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

// Register the provider
register(LocalFolder);
console.info('[LocalFolder] Hybrid sync provider registered');
