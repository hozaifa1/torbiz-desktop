// src/utils/updateService.js
import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { platform } from "@tauri-apps/plugin-os";
import { open } from "@tauri-apps/plugin-shell";
import { downloadDir } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";

/**
 * Check for updates and handle them based on the platform
 * Windows: Fully automatic update via Tauri updater
 * macOS: Download .dmg and prompt user to manually install
 */
export async function checkForUpdates() {
  try {
    console.log("[UPDATE] Starting update check...");
    const currentPlatform = platform();
    console.log("[UPDATE] Detected platform:", currentPlatform);
    
    if (currentPlatform === "windows") {
      console.log("[UPDATE] Using Windows updater");
      await handleWindowsUpdate();
    } else if (currentPlatform === "macos") {
      console.log("[UPDATE] Using macOS updater");
      await handleMacOSUpdate();
    } else {
      console.log("[UPDATE] Update checking not supported on this platform:", currentPlatform);
    }
  } catch (error) {
    console.error("[UPDATE] Error checking for updates:", error);
    throw error; // Re-throw to let caller handle it
  }
}

/**
 * Windows: Use Tauri's built-in updater for seamless updates
 */
async function handleWindowsUpdate() {
  try {
    console.log("[UPDATE-WIN] Calling Tauri updater check()...");
    const update = await check();
    console.log("[UPDATE-WIN] Check result:", update);
    
    if (update?.available) {
      console.log(`[UPDATE-WIN] Update available: ${update.version}`);
      console.log(`[UPDATE-WIN] Current version:`, await getVersion());
      
      const yes = await ask(
        `A new version (${update.version}) is available!\n\nWould you like to update now?`,
        {
          title: "Update Available",
          kind: "info",
          okLabel: "Update Now",
          cancelLabel: "Later"
        }
      );
      
      if (yes) {
        console.log("[UPDATE-WIN] User accepted, downloading and installing update...");
        
        try {
          // Download and install the update (automatically restarts the app)
          await update.downloadAndInstall();
          console.log("[UPDATE-WIN] Update installed successfully");
        } catch (installError) {
          console.error("[UPDATE-WIN] Installation failed:", installError);
          await ask(
            "Failed to install the update. Please try again later or download manually from GitHub.",
            {
              title: "Update Failed",
              kind: "error",
              okLabel: "OK"
            }
          );
        }
      } else {
        console.log("[UPDATE-WIN] User declined update");
      }
    } else {
      console.log("[UPDATE-WIN] No updates available - app is up to date");
    }
  } catch (error) {
    console.error("[UPDATE-WIN] Error during Windows update check:", error);
    console.error("[UPDATE-WIN] Error details:", JSON.stringify(error));
    throw error;
  }
}

/**
 * macOS: Custom implementation - download .dmg and prompt user to install manually
 */
async function handleMacOSUpdate() {
  try {
    console.log("[UPDATE-MAC] Checking GitHub for latest release...");
    
    // Check GitHub API for latest release
    const response = await fetch(
      "https://api.github.com/repos/hozaifa1/torbiz-desktop/releases/latest"
    );
    
    if (!response.ok) {
      console.error("[UPDATE-MAC] GitHub API returned error:", response.status, response.statusText);
      return;
    }
    
    const release = await response.json();
    const latestVersion = release.tag_name.replace("v", "");
    
    // Get current version from Tauri app
    const currentVersion = await getVersion();
    
    console.log(`[UPDATE-MAC] Current version: ${currentVersion}, Latest version: ${latestVersion}`);
    console.log(`[UPDATE-MAC] Release assets:`, release.assets.map(a => a.name));
    
    // Compare versions (simple string comparison for now)
    if (latestVersion > currentVersion) {
      console.log(`[UPDATE-MAC] Update available: ${latestVersion}`);
      
      // Find the .dmg asset for ARM64
      const dmgAsset = release.assets.find(
        asset => asset.name.includes(".dmg") && asset.name.includes("aarch64")
      );
      
      if (!dmgAsset) {
        console.error("[UPDATE-MAC] No compatible .dmg found in release");
        console.log("[UPDATE-MAC] Available assets:", release.assets.map(a => a.name));
        return;
      }
      
      console.log("[UPDATE-MAC] Found compatible asset:", dmgAsset.name);
      
      const yes = await ask(
        `A new version (${latestVersion}) is available!\n\nWould you like to download it? The installer will open in your Downloads folder.`,
        {
          title: "Update Available",
          kind: "info",
          okLabel: "Download Now",
          cancelLabel: "Later"
        }
      );
      
      if (yes) {
        console.log("[UPDATE-MAC] User accepted, starting download...");
        
        try {
          // Open the download URL in browser which will trigger download
          console.log("[UPDATE-MAC] Opening download URL:", dmgAsset.browser_download_url);
          await open(dmgAsset.browser_download_url);
          
          // Get Downloads directory path
          const downloadsPath = await downloadDir();
          const fileName = dmgAsset.name;
          
          // Wait a moment then show instructions
          setTimeout(async () => {
            console.log("[UPDATE-MAC] Showing installation instructions");
            await ask(
              `Update is downloading to your Downloads folder.\n\nOnce downloaded, please:\n1. Close this app\n2. Open the ${fileName} file\n3. Install the new version`,
              {
                title: "Installation Instructions",
                kind: "info",
                okLabel: "Open Downloads Folder",
                cancelLabel: "OK"
              }
            ).then(async (openFolder) => {
              if (openFolder) {
                console.log("[UPDATE-MAC] Opening Downloads folder");
                // Open Downloads folder
                await open(downloadsPath);
              }
            });
          }, 2000);
          
        } catch (error) {
          console.error("[UPDATE-MAC] Error downloading update:", error);
          await ask(
            "Failed to download the update automatically.\n\nYou can download it manually from GitHub releases.",
            {
              title: "Download Failed",
              kind: "error",
              okLabel: "Open GitHub",
              cancelLabel: "Cancel"
            }
          ).then(async (openGitHub) => {
            if (openGitHub) {
              console.log("[UPDATE-MAC] Opening GitHub releases page");
              await open("https://github.com/hozaifa1/torbiz-desktop/releases/latest");
            }
          });
        }
      } else {
        console.log("[UPDATE-MAC] User declined update");
      }
    } else {
      console.log("[UPDATE-MAC] No updates available - app is up to date");
    }
  } catch (error) {
    console.error("[UPDATE-MAC] Error during macOS update check:", error);
    console.error("[UPDATE-MAC] Error details:", JSON.stringify(error));
    throw error;
  }
}

