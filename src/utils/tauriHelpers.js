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
    // Import core API
    const { invoke } = await import('@tauri-apps/api/core');
    
    // Import event API
    const { listen } = await import('@tauri-apps/api/event');
    
    // Import opener plugin - try multiple strategies
    let openFunction;
    try {
      const openerModule = await import('@tauri-apps/plugin-opener');
      
      console.log('Opener module loaded:', {
        keys: Object.keys(openerModule),
        hasOpen: !!openerModule.open,
        hasDefault: !!openerModule.default,
        defaultType: typeof openerModule.default,
        openType: typeof openerModule.open
      });
      
      // Strategy 1: Named export
      if (typeof openerModule.open === 'function') {
        openFunction = openerModule.open;
        console.log('Using opener: named export');
      } 
      // Strategy 2: Default export with open method
      else if (openerModule.default && typeof openerModule.default.open === 'function') {
        openFunction = openerModule.default.open;
        console.log('Using opener: default.open');
      }
      // Strategy 3: Default export IS the function
      else if (typeof openerModule.default === 'function') {
        openFunction = openerModule.default;
        console.log('Using opener: default function');
      }
      else {
        console.error('Could not find open function in opener module');
        console.error('Available in openerModule:', openerModule);
        throw new Error('Opener plugin loaded but open function not found');
      }
    } catch (error) {
      console.error('Failed to import opener plugin:', error);
      throw new Error(`Opener plugin import failed: ${error.message}`);
    }

    if (!openFunction) {
      throw new Error('Open function could not be loaded from opener plugin');
    }

    return {
      invoke,
      listen,
      open: openFunction
    };
  } catch (error) {
    console.error('Failed to load Tauri APIs:', error);
    throw error;
  }
}

/**
 * Open URL in system browser
 */
export async function openInBrowser(url) {
  if (!isTauriEnvironment()) {
    // Fallback for web environment
    window.open(url, '_blank');
    return;
  }

  try {
    const apis = await loadTauriApis();
    await apis.open(url);
  } catch (error) {
    console.error('Failed to open URL:', error);
    throw error;
  }
}