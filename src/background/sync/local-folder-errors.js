/**
 * Error Handling for Local Folder Sync
 *
 * Provides comprehensive error handling with user-friendly messages
 * and detailed error codes for debugging.
 */

export class LocalFolderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LocalFolderError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export const ErrorCodes = {
  // API Support
  NOT_SUPPORTED: 'NOT_SUPPORTED',

  // Permission
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PERMISSION_PROMPT: 'PERMISSION_PROMPT',

  // Folder Access
  FOLDER_NOT_FOUND: 'FOLDER_NOT_FOUND',
  FOLDER_NOT_SELECTED: 'FOLDER_NOT_SELECTED',
  FOLDER_READ_ONLY: 'FOLDER_READ_ONLY',

  // File Operations
  FILE_READ_FAILED: 'FILE_READ_FAILED',
  FILE_WRITE_FAILED: 'FILE_WRITE_FAILED',
  FILE_DELETE_FAILED: 'FILE_DELETE_FAILED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',

  // Storage
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  STORAGE_FAILED: 'STORAGE_FAILED',

  // Sync
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  SYNC_FAILED: 'SYNC_FAILED',

  // Script
  INVALID_SCRIPT: 'INVALID_SCRIPT',
  PARSE_ERROR: 'PARSE_ERROR',

  // Unknown
  UNKNOWN: 'UNKNOWN',
};

/**
 * Convert native errors to LocalFolderError
 */
export function handleError(error, context = '') {
  // Already a LocalFolderError
  if (error instanceof LocalFolderError) {
    return error;
  }

  const errorName = error.name || '';
  const errorMessage = error.message || '';

  // File System Access API errors
  if (errorName === 'NotAllowedError') {
    return new LocalFolderError(
      ErrorCodes.PERMISSION_DENIED,
      'Permission to access the folder was denied. Please select the folder again.',
      { originalError: error, context }
    );
  }

  if (errorName === 'NotFoundError') {
    if (context.includes('file')) {
      return new LocalFolderError(
        ErrorCodes.FILE_NOT_FOUND,
        'The script file was not found. It may have been deleted.',
        { originalError: error, context }
      );
    }
    return new LocalFolderError(
      ErrorCodes.FOLDER_NOT_FOUND,
      'The sync folder could not be found. It may have been moved or deleted.',
      { originalError: error, context }
    );
  }

  if (errorName === 'AbortError') {
    // User cancelled folder picker - not really an error
    return new LocalFolderError(
      ErrorCodes.PERMISSION_DENIED,
      'Folder selection was cancelled.',
      { originalError: error, context, cancelled: true }
    );
  }

  if (errorName === 'InvalidStateError') {
    return new LocalFolderError(
      ErrorCodes.FOLDER_NOT_SELECTED,
      'No folder has been selected for sync.',
      { originalError: error, context }
    );
  }

  // Browser storage errors
  if (errorName === 'QuotaExceededError' || errorMessage.includes('QUOTA')) {
    return new LocalFolderError(
      ErrorCodes.QUOTA_EXCEEDED,
      'browser.storage.sync quota exceeded. Consider reducing the number of scripts or metadata fields.',
      { originalError: error, context }
    );
  }

  // File operation errors
  if (errorMessage.includes('write') || errorMessage.includes('Write')) {
    return new LocalFolderError(
      ErrorCodes.FILE_WRITE_FAILED,
      'Failed to write to the sync folder. Check if you have write permissions.',
      { originalError: error, context }
    );
  }

  if (errorMessage.includes('read') || errorMessage.includes('Read')) {
    return new LocalFolderError(
      ErrorCodes.FILE_READ_FAILED,
      'Failed to read from the sync folder. The file may be corrupted or locked.',
      { originalError: error, context }
    );
  }

  // Generic error
  return new LocalFolderError(
    ErrorCodes.UNKNOWN,
    `Sync operation failed: ${errorMessage || 'Unknown error'}`,
    { originalError: error, context }
  );
}

/**
 * Get user-friendly message for error code
 */
export function getUserMessage(error) {
  const code = error.code || error;

  const messages = {
    [ErrorCodes.NOT_SUPPORTED]:
      'Local Folder sync is not supported in this browser. Try Chrome 86+, Edge 86+, or Brave.',

    [ErrorCodes.PERMISSION_DENIED]:
      'Unable to access the sync folder. Click "Authorize" to grant permission again.',

    [ErrorCodes.PERMISSION_PROMPT]:
      'Permission is needed to access the sync folder. Click "Authorize" to continue.',

    [ErrorCodes.FOLDER_NOT_FOUND]:
      'The sync folder was moved or deleted. Please select a new folder.',

    [ErrorCodes.FOLDER_NOT_SELECTED]:
      'No folder selected for sync. Click "Authorize" to select a folder.',

    [ErrorCodes.FOLDER_READ_ONLY]:
      'The sync folder is read-only. Please select a folder with write permissions.',

    [ErrorCodes.FILE_READ_FAILED]:
      'Failed to read a script file from the sync folder. The file may be corrupted.',

    [ErrorCodes.FILE_WRITE_FAILED]:
      'Failed to write to the sync folder. Check if you have write permissions.',

    [ErrorCodes.FILE_DELETE_FAILED]:
      'Failed to delete a file from the sync folder.',

    [ErrorCodes.FILE_NOT_FOUND]:
      'A script file was not found in the sync folder.',

    [ErrorCodes.QUOTA_EXCEEDED]:
      'Too many scripts to sync metadata. Try reducing the number of scripts or metadata fields.',

    [ErrorCodes.STORAGE_FAILED]:
      'Failed to access browser storage. Please try again.',

    [ErrorCodes.SYNC_CONFLICT]:
      'A sync conflict was detected. The most recently modified version was kept.',

    [ErrorCodes.SYNC_FAILED]:
      'Sync operation failed. Please check your folder permissions and try again.',

    [ErrorCodes.INVALID_SCRIPT]:
      'Invalid userscript format. The file could not be imported.',

    [ErrorCodes.PARSE_ERROR]:
      'Failed to parse script metadata. The file may be corrupted.',

    [ErrorCodes.UNKNOWN]:
      'An unknown error occurred during sync.',
  };

  return messages[code] || (error.message || 'Unknown error');
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error) {
  const recoverableCodes = [
    ErrorCodes.PERMISSION_PROMPT,
    ErrorCodes.PERMISSION_DENIED,
    ErrorCodes.FOLDER_NOT_SELECTED,
  ];

  const code = error.code || error;
  return recoverableCodes.includes(code);
}

/**
 * Check if error requires user action
 */
export function requiresUserAction(error) {
  const actionRequiredCodes = [
    ErrorCodes.NOT_SUPPORTED,
    ErrorCodes.PERMISSION_DENIED,
    ErrorCodes.FOLDER_NOT_FOUND,
    ErrorCodes.FOLDER_NOT_SELECTED,
    ErrorCodes.QUOTA_EXCEEDED,
  ];

  const code = error.code || error;
  return actionRequiredCodes.includes(code);
}

/**
 * Log error with context
 */
export function logError(error, context = '') {
  const err = error instanceof LocalFolderError ? error : handleError(error, context);

  console.error(
    `[LocalFolder] ${err.code}:`,
    err.message,
    err.details
  );

  return err;
}

/**
 * Create a recoverable error for sync conflicts
 */
export function createConflictError(scriptName, resolution) {
  return new LocalFolderError(
    ErrorCodes.SYNC_CONFLICT,
    `Sync conflict for "${scriptName}". ${resolution}`,
    { scriptName, resolution }
  );
}
