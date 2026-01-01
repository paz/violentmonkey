/**
 * Metadata Utilities for Local Folder Sync
 *
 * Provides basic metadata operations for the local folder sync provider.
 * This is a simplified version - the full hybrid sync with browser.storage.sync
 * was not implemented.
 */

const METADATA_KEY = '_localFolderMeta';

/**
 * Clear all metadata from browser.storage.sync
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
 * Note: This is set up but not actively used since hybrid sync is not implemented
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
 * Calculate hash of script content for change detection
 */
export async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
