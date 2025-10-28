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
    console.log("Checking for updates...");
    const currentPlatform = platform();
    
    if (currentPlatform === "windows") {
      await handleWindowsUpdate();
    } else if (currentPlatform === "macos") {
      await handleMacOSUpdate();
    } else {
      console.log("Update checking not supported on this platform");
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
  }
}

/**
 * Windows: Use Tauri's built-in updater for seamless updates
 */
async function handleWindowsUpdate() {
  try {
    const update = await check();
    
    if (update?.available) {
      console.log(`Update available: ${update.version}`);
      
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
        console.log("Downloading and installing update...");
        
        // Download and install the update (automatically restarts the app)
        await update.downloadAndInstall();
      }
    } else {
      console.log("No updates available");
    }
  } catch (error) {
    console.error("Error during Windows update:", error);
  }
}

/**
 * macOS: Custom implementation - download .dmg and prompt user to install manually
 */
async function handleMacOSUpdate() {
  try {
    // Check GitHub API for latest release
    const response = await fetch(
      "https://api.github.com/repos/torbiz-project/torbiz-desktop/releases/latest"
    );
    
    if (!response.ok) {
      console.log("Failed to check for updates from GitHub");
      return;
    }
    
    const release = await response.json();
    const latestVersion = release.tag_name.replace("v", "");
    
    // Get current version from Tauri app
    const currentVersion = await getVersion();
    
    console.log(`Current version: ${currentVersion}, Latest version: ${latestVersion}`);
    
    // Compare versions (simple string comparison for now)
    if (latestVersion > currentVersion) {
      console.log(`Update available: ${latestVersion}`);
      
      // Find the .dmg asset for ARM64
      const dmgAsset = release.assets.find(
        asset => asset.name.includes(".dmg") && asset.name.includes("aarch64")
      );
      
      if (!dmgAsset) {
        console.log("No compatible .dmg found in release");
        return;
      }
      
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
        console.log("Downloading update...");
        
        try {
          // Download the .dmg file
          const downloadResponse = await fetch(dmgAsset.browser_download_url);
          const blob = await downloadResponse.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Get Downloads directory path
          const downloadsPath = await downloadDir();
          const fileName = dmgAsset.name;
          const filePath = `${downloadsPath}${fileName}`;
          
          // Write file using Tauri's fs (we'll need to use the invoke command)
          // For now, let's just open the download URL in browser which will trigger download
          await open(dmgAsset.browser_download_url);
          
          // Wait a moment then open Downloads folder
          setTimeout(async () => {
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
                // Open Downloads folder
                await open(downloadsPath);
              }
            });
          }, 2000);
          
        } catch (error) {
          console.error("Error downloading update:", error);
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
              await open("https://github.com/torbiz-project/torbiz-desktop/releases/latest");
            }
          });
        }
      }
    } else {
      console.log("No updates available");
    }
  } catch (error) {
    console.error("Error during macOS update check:", error);
  }
}

