/**
 * browser.storage.sync Metadata Layer for Local Folder Sync
 *
 * Stores lightweight script metadata in browser.storage.sync (~100KB quota)
 * for cross-browser sync via browser profiles. The actual script content
 * is stored in the local folder.
 *
 * This enables:
 * - Quick script state restoration across browsers
 * - Enabled/disabled state sync
 * - Script metadata without full content
 * - Integration with browser's built-in sync
 */

const METADATA_KEY = '_localFolderMeta';
const MAX_SIZE_BYTES = 8192; // Per-item limit in browser.storage.sync
const VERSION = '1.0.0';

/**
 * Load metadata from browser.storage.sync
 */
export async function loadMetadata() {
  try {
    const result = await browser.storage.sync.get(METADATA_KEY);
    return result[METADATA_KEY] || createEmptyMetadata();
  } catch (error) {
    console.error('[LocalFolder] Failed to load metadata:', error);
    return createEmptyMetadata();
  }
}

/**
 * Save metadata to browser.storage.sync
 */
export async function saveMetadata(metadata) {
  // Validate size
  const serialized = JSON.stringify(metadata);
  const sizeBytes = new Blob([serialized]).size;

  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new Error(
      `Metadata too large (${sizeBytes} bytes, limit ${MAX_SIZE_BYTES}). ` +
      `Consider reducing the number of scripts or metadata fields.`
    );
  }

  try {
    await browser.storage.sync.set({ [METADATA_KEY]: metadata });
    console.info(`[LocalFolder] Metadata saved (${sizeBytes} bytes)`);
  } catch (error) {
    if (error.message && error.message.includes('QUOTA_BYTES')) {
      throw new Error(
        'browser.storage.sync quota exceeded. Try reducing metadata or number of scripts.'
      );
    }
    throw error;
  }
}

/**
 * Create empty metadata structure
 */
function createEmptyMetadata() {
  return {
    version: VERSION,
    lastSync: null,
    scripts: {},
    settings: {},
  };
}

/**
 * Build metadata for a script (without code)
 */
export function buildScriptMetadata(script) {
  return {
    // Script identification
    uri: script.props.uri,
    position: script.props.position,

    // Configuration
    enabled: script.config.enabled,
    shouldUpdate: script.config.shouldUpdate,

    // Essential metadata only (not full meta block)
    name: script.meta.name,
    namespace: script.meta.namespace,
    version: script.meta.version,

    // Update URLs
    updateURL: script.meta.updateURL,
    downloadURL: script.meta.downloadURL,

    // Timestamps
    lastModified: script.props.lastModified || Date.now(),

    // File reference
    filename: getScriptFilename(script),

    // Content hash for conflict detection
    contentHash: null, // Will be set during sync
  };
}

/**
 * Get filename for a script
 */
function getScriptFilename(script) {
  // Use the same format as getItemFilename in base.js
  const uri = script.props.uri;
  return `vm@2-${uri}`;
}

/**
 * Update metadata for a single script
 */
export async function updateScriptMetadata(scriptId, scriptData, contentHash) {
  const metadata = await loadMetadata();

  metadata.scripts[scriptId] = {
    ...buildScriptMetadata(scriptData),
    contentHash,
  };

  metadata.lastSync = Date.now();

  await saveMetadata(metadata);
}

/**
 * Remove script from metadata
 */
export async function removeScriptMetadata(scriptId) {
  const metadata = await loadMetadata();

  delete metadata.scripts[scriptId];
  metadata.lastSync = Date.now();

  await saveMetadata(metadata);
}

/**
 * Get metadata for a specific script
 */
export async function getScriptMetadata(scriptId) {
  const metadata = await loadMetadata();
  return metadata.scripts[scriptId] || null;
}

/**
 * Check if metadata exists for a script
 */
export async function hasScriptMetadata(scriptId) {
  const metadata = await loadMetadata();
  return scriptId in metadata.scripts;
}

/**
 * Rebuild all metadata from local scripts
 */
export async function rebuildMetadata(allScripts, contentHashes = {}) {
  const metadata = createEmptyMetadata();

  for (const [scriptId, script] of Object.entries(allScripts)) {
    metadata.scripts[scriptId] = {
      ...buildScriptMetadata(script),
      contentHash: contentHashes[scriptId] || null,
    };
  }

  metadata.lastSync = Date.now();

  await saveMetadata(metadata);
  return metadata;
}

/**
 * Clear all metadata
 */
export async function clearMetadata() {
  try {
    await browser.storage.sync.remove(METADATA_KEY);
    console.info('[LocalFolder] Metadata cleared');
  } catch (error) {
    console.error('[LocalFolder] Failed to clear metadata:', error);
  }
}

/**
 * Listen for metadata changes from other browsers
 */
export function onMetadataChanged(callback) {
  const listener = (changes, areaName) => {
    if (areaName !== 'sync') return;
    if (!changes[METADATA_KEY]) return;

    const change = changes[METADATA_KEY];
    if (change.newValue) {
      console.info('[LocalFolder] Metadata changed from another browser');
      callback(change.newValue, change.oldValue);
    }
  };

  browser.storage.onChanged.addListener(listener);

  // Return unsubscribe function
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}

/**
 * Calculate hash of script content for conflict detection
 */
export async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get estimated metadata size
 */
export async function getMetadataSize() {
  const metadata = await loadMetadata();
  const serialized = JSON.stringify(metadata);
  const sizeBytes = new Blob([serialized]).size;

  return {
    bytes: sizeBytes,
    maxBytes: MAX_SIZE_BYTES,
    percentUsed: (sizeBytes / MAX_SIZE_BYTES) * 100,
    scriptCount: Object.keys(metadata.scripts || {}).length,
  };
}
