// Helper utilities for Tauri API interactions

/**
 * Check if running in Tauri environment
 */
export function isTauriEnvironment() {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
}

/**
 * Dynamically load all Tauri APIs
 */
export async function loadTauriApis() {
  if (!isTauriEnvironment()) {
    throw new Error('Not running in Tauri environment');
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');
    const { openUrl } = await import('@tauri-apps/plugin-opener');

    return {
      invoke,
      listen,
      open: openUrl
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Open URL in system browser
 */
export async function openInBrowser(url) {
  if (!isTauriEnvironment()) {
    window.open(url, '_blank');
    return;
  }

  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch (error) {
    throw error;
  }
}