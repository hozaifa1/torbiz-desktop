# ⚡ Quick Start - Development Mode

## 🚀 Start Developing (Use This!)

```bash
npm run tauri:dev
```

**Wait 20-30 seconds** → App opens with hot reload enabled!

---

## ✏️ Making Changes

### React/Frontend (.jsx, .js, .css)
- **Edit** → **Save** → **Instant reload** ✨
- No restart needed!

### Python Scripts (run_petals_seeder.py)
- **Edit** → **Save** → **Stop/Start GPU sharing** ✨
- No rebuild needed!

### Rust Backend (lib.rs)
- **Edit** → **Save** → **Wait 20-30 sec for auto-recompile** ✨
- App restarts automatically!

---

## 📦 Build for Production (Only Before Release)

```bash
npm run tauri:build
```

Takes 4-5 minutes. Creates installers in `src-tauri/target/release/bundle/`

---

## 🎯 Remember

- **Development**: `npm run tauri:dev` (FAST! ⚡)
- **Production**: `npm run tauri:build` (SLOW! ⏰)

**Use dev mode 99% of the time during development!**

---

📖 **Full guide**: See [DEV_WORKFLOW.md](./DEV_WORKFLOW.md)

