# Torbiz Desktop

Torbiz Desktop is a cross‑platform Tauri application (React + TypeScript frontend, Rust backend) that lets users chat with LLMs while participating in a decentralized inference network. It coordinates a network of seeders that host model shards, dispatches inference tasks, and streams aggregated results back to the user. Internally, the sharding/hosting approach aligns with the open‑source Petals project by BigScience.

## Features
- Chat interface with streaming responses
- Auth (email/password and Google OAuth)
- Hardware information retrieval (CPU, memory, GPU, OS)
- NVIDIA GPU sharing toggle (working and not to be altered)
- Local and network (Petals‑style) inference helpers
- Auto‑update support via Tauri updater

## Prerequisites
- Node.js 18+ and npm
- Rust (stable) with Cargo
- Tauri prerequisites per OS
  - Windows: Visual Studio Build Tools (MSVC), WebView2 Runtime
  - macOS: Xcode Command Line Tools
  - Linux: libgtk-3, webkit2gtk, libsoup, and development headers

Refer to Tauri’s official setup docs for exact OS packages.

## Install
```bash
npm install
```

## Develop
- Start the Vite dev server:
```bash
npm run dev
```

- Run the Tauri app (development window):
```bash
npm run tauri dev
```

## Build
- Build frontend assets only:
```bash
npm run build
```

- Build the desktop app (bundled):
```bash
npm run tauri build
```

## Project Structure
- `src/`: React app (pages, components, hooks, services, utils)
- `src-tauri/`: Rust side (commands, platform integrations, Petals helpers, config)
- `public/`: Static assets
- `dist/`: Built frontend assets

Key frontend areas:
- `src/pages/`: `HomePage.jsx`, `ChatPage.jsx`, `SettingsPage.jsx`, etc.
- `src/components/`: `ShareGpuModal.jsx`, `HardwareInfoDisplay.jsx`, auth components, etc.
- `src/services/`: `inferenceService.js`, `localInferenceService.js`, `directInferenceService.js`, `modelService.js`, `api.js`
- `src/utils/`: hardware and update helpers

Key Rust areas:
- `src-tauri/src/`: platform bridges (`hardware.rs`, `petals.rs`, `oauth.rs`, etc.)
- `src-tauri/py/`: Python helpers for local/Petals runs

## Notes
- Do not modify the NVIDIA GPU sharing logic; it is known‑good and relied upon.
- New features should be additive and must not disrupt existing flows.
- Petals reference: see BigScience’s Petals project for conceptual alignment.

## Troubleshooting
- If the desktop window doesn’t launch, ensure Tauri prerequisites are installed for your OS.
- On Windows, verify WebView2 Runtime and MSVC Build Tools are present.
- If Rust build errors occur, run `rustup update` to get the latest stable toolchain.

## License
Proprietary. All rights reserved.
