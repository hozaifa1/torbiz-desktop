<!-- 630ad996-d95d-4feb-8c08-c7ee0a5b204f d1e797df-b863-45e6-8c2a-02d1db615125 -->
# Fix Petals Installation - Fix CPU Server Mode + Add Client Mode

## Root Cause Analysis

Looking at your terminal (line 419):

```
[ERROR] cannot import name 'HybridCache' from 'transformers'
```

**The problem:** You're forcing `transformers>=4.43.1,<4.44.0` (line 382 in lib.rs), but:

1. This version range might not have HybridCache in the location Petals expects
2. OR Petals needs a different transformers version entirely
3. The model loads successfully initially, then crashes when Petals tries to re-import

**The solution:** Let Petals install its own compatible transformers version instead of forcing a specific range.

## Solution: Three Changes

### Change 1: Fix CPU-Only Server Mode Installation

**File: `src-tauri/src/lib.rs`**

**Lines 371-386** - Remove the forced transformers installation for CPU-only systems:

**Current code (lines 371-386):**

```rust
if venv_exists {
    // Venv exists but packages are missing - just install the missing ones
    println!("[WSL] Upgrading existing installation with missing packages...");
    
    println!("[WSL] Installing additional required packages (peft, accelerate)...");
    execute_wsl_command("~/.torbiz_venv/bin/pip install peft accelerate")?;
    
    println!("[WSL] Uninstalling old transformers and clearing cache...");
    execute_wsl_command("~/.torbiz_venv/bin/pip uninstall -y transformers").ok();
    
    println!("[WSL] Installing compatible transformers version (4.43.1 <= version < 4.44.0)...");
    execute_wsl_command("~/.torbiz_venv/bin/pip install --no-cache-dir --force-reinstall 'transformers>=4.43.1,<4.44.0'")?;
    
    println!("[WSL] Clearing Python bytecode cache...");
    execute_wsl_command("find ~/.torbiz_venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true").ok();
    
    println!("[WSL] Packages installed successfully");
}
```

**New code:**

```rust
if venv_exists {
    // Venv exists but packages are missing - reinstall Petals to get correct dependencies
    println!("[WSL] Reinstalling Petals with correct dependencies...");
    
    println!("[WSL] Clearing Python bytecode cache...");
    execute_wsl_command("find ~/.torbiz_venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true").ok();
    
    println!("[WSL] Reinstalling Petals (this will install correct transformers version)...");
    execute_wsl_command("~/.torbiz_venv/bin/pip install --force-reinstall git+https://github.com/bigscience-workshop/petals")?;
    
    println!("[WSL] Packages installed successfully");
}
```

**Lines 388-411** - Same fix for fresh installation:

**Current code (lines 396-410):**

```rust
println!("[WSL] Installing Petals from GitHub (this will take 5-10 minutes and install all dependencies including PyTorch)...");
println!("[WSL] Please wait, this is downloading large packages (~3GB)...");
execute_wsl_command("~/.torbiz_venv/bin/python -m pip install git+https://github.com/bigscience-workshop/petals")?;

println!("[WSL] Installing additional required packages (peft, accelerate)...");
execute_wsl_command("~/.torbiz_venv/bin/pip install peft accelerate")?;

println!("[WSL] Uninstalling old transformers and clearing cache...");
execute_wsl_command("~/.torbiz_venv/bin/pip uninstall -y transformers").ok();

println!("[WSL] Installing compatible transformers version (4.43.1 <= version < 4.44.0)...");
execute_wsl_command("~/.torbiz_venv/bin/pip install --no-cache-dir --force-reinstall 'transformers>=4.43.1,<4.44.0'")?;

println!("[WSL] Clearing Python bytecode cache...");
execute_wsl_command("find ~/.torbiz_venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true").ok();
```

**New code:**

```rust
println!("[WSL] Installing Petals from GitHub (this will take 5-10 minutes and install all dependencies including PyTorch)...");
println!("[WSL] Please wait, this is downloading large packages (~3GB)...");
println!("[WSL] Petals will install its own compatible transformers version...");
execute_wsl_command("~/.torbiz_venv/bin/python -m pip install git+https://github.com/bigscience-workshop/petals")?;

println!("[WSL] Clearing Python bytecode cache...");
execute_wsl_command("find ~/.torbiz_venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true").ok();
```

### Change 2: Remove HybridCache Check from Python Script

**File: `src-tauri/py/run_petals_seeder.py`**

**Lines 112-154** - Remove the entire HybridCache pre-import block:

**Remove this entire section:**

```python
try:
    # Force import transformers with HybridCache support
    import transformers
    import transformers.models.llama.modeling_llama  # This loads HybridCache
    
    # Import other required modules
    import peft
    import accelerate
    
    # Verify transformers has HybridCache (confirms correct version)
    try:
        from transformers.models.llama.modeling_llama import HybridCache
        logger.info("Pre-loaded transformers (with HybridCache), peft, and accelerate")
    except ImportError:
        logger.warning("HybridCache not found in transformers - version may be incorrect")
        logger.warning("Expected transformers>=4.43.1,<4.44.0 but got: %s", transformers.__version__)
    
    # Lock these modules in sys.modules to prevent re-imports
    sys.modules["transformers"] = transformers
    sys.modules["transformers.models.llama.modeling_llama"] = transformers.models.llama.modeling_llama
    sys.modules["peft"] = peft
    sys.modules["accelerate"] = accelerate
    
    # AGGRESSIVE: Monkey-patch Python's import system to prevent ANY re-imports
    # This is the nuclear option - once these modules are loaded, they CANNOT be re-imported
    import builtins
    original_import = builtins.__import__
    
    def locked_import(name, globals_dict=None, locals_dict=None, fromlist=(), level=0):
        # If it's one of our locked modules, return the cached version
        if name in ["transformers", "peft", "accelerate"] and name in sys.modules:
            logger.info("Preventing re-import of %s - using cached version", name)
            return sys.modules[name]
        # Otherwise, use normal import
        return original_import(name, globals_dict, locals_dict, fromlist, level)
    
    # Replace Python's built-in import function
    builtins.__import__ = locked_import
    logger.info("Monkey-patched Python import system to prevent re-imports")
    
except ImportError as e:
    logger.warning("Could not pre-load optional modules: %s", e)
    logger.warning("This may cause re-import issues later. Check transformers version.")
```

**Replace with just:**

```python
# Let Petals handle its own imports - it knows which versions it needs
logger.info("Petals will manage its own module imports")
```

### Change 3: Add Client-Only Functions for Direct Inference

**File: `src-tauri/src/lib.rs`**

Add these two new functions after line 428 (after `install_wsl_petals`):

```rust
fn check_wsl_petals_client_only() -> bool {
    #[cfg(target_os = "windows")]
    {
        let venv_check = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'");
        
        if let Ok(output) = venv_check {
            if output.trim() == "missing" {
                println!("[WSL] Virtual environment not found");
                return false;
            }
        }
        
        // For client mode, only check petals and torch
        match execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import petals; import torch; print(\"ok\")' 2>/dev/null || echo 'not_found'") {
            Ok(output) => {
                let trimmed = output.trim();
                println!("[WSL] Petals client check: {}", trimmed);
                trimmed == "ok"
            }
            Err(_) => false
        }
    }
    #[cfg(not(target_os = "windows"))]
    false
}

fn install_wsl_petals_client_only() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let venv_exists = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'")
            .ok()
            .map(|s| s.trim() == "exists")
            .unwrap_or(false);
        
        if !venv_exists {
            println!("[WSL] Setting up Python virtual environment...");
            execute_wsl_command("python3 -m venv ~/.torbiz_venv")?;
            
            println!("[WSL] Upgrading pip...");
            execute_wsl_command("~/.torbiz_venv/bin/pip install --upgrade pip")?;
        }
        
        println!("[WSL] Installing Petals for inference (minimal dependencies)...");
        execute_wsl_command("~/.torbiz_venv/bin/pip install git+https://github.com/bigscience-workshop/petals")?;
        
        println!("[WSL] Petals client installation completed");
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Petals installation in WSL is only supported on Windows".to_string())
}
```

Then find where direct inference is set up and use these functions instead.

## Why This Fixes the Issue

1. **Stops forcing wrong transformers version** - The 4.43.1-4.44.0 range doesn't have HybridCache where Petals expects it
2. **Lets Petals manage dependencies** - Petals knows which transformers version it needs
3. **Removes failed pre-import logic** - The monkey-patching wasn't working because the wrong version was installed
4. **GPU code untouched** - Only modifying CPU-only installation path
5. **Simpler client mode** - Direct inference gets minimal installation

## Files to Modify

1. `src-tauri/src/lib.rs` - Lines 371-411 (simplify installation), add 2 new functions after line 428
2. `src-tauri/py/run_petals_seeder.py` - Lines 112-154 (remove HybridCache logic)
3. Find and update direct inference setup to use client-only functions

## What This Preserves

- All GPU-specific device detection and configuration (untouched)
- CUDA paths and bitsandbytes configuration (untouched)
- The core server architecture (untouched)

### To-dos

- [ ] Wrap bitsandbytes/CUDA configuration in device check in run_petals_seeder.py
- [ ] Add petalsEnvStatus refresh after Direct Mode setup completes in ChatPage.jsx
- [ ] Verify CPU model sharing works without bitsandbytes error
- [ ] Verify Direct Mode chat send button works after setup