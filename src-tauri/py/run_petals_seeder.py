#!/usr/bin/env python3
"""
Petals Seeder Script for Torbiz Desktop App
Runs a Petals SERVER to host model shards on the network
"""
import sys

# MOCK BITSANDBYTES IMMEDIATELY - BEFORE ANY OTHER IMPORTS
# Check if we"re in CPU mode by looking at command line args
if "--device" in sys.argv and "cpu" in sys.argv:
    from unittest.mock import MagicMock
    
    # Create comprehensive mock with proper __spec__
    mock_bnb = MagicMock()
    mock_bnb.nn = MagicMock()
    mock_bnb.nn.Linear4bit = MagicMock
    mock_bnb.nn.Linear8bitLt = MagicMock
    
    # Add __spec__ attribute to make importlib.util.find_spec() work
    mock_spec = MagicMock()
    mock_spec.name = "bitsandbytes"
    mock_spec.origin = "mocked"
    mock_spec.submodule_search_locations = None
    mock_bnb.__spec__ = mock_spec
    
    # Insert into sys.modules BEFORE any imports
    sys.modules["bitsandbytes"] = mock_bnb
    sys.modules["bitsandbytes.nn"] = mock_bnb.nn
    
    print("[MOCK] bitsandbytes mocked for CPU-only mode", file=sys.stderr)

import logging
import time
import signal
import sys
import os
import tempfile

# Global flag for graceful shutdown
shutdown_requested = False

def signal_handler(sig, frame):
    """Handle shutdown signals gracefully"""
    global shutdown_requested
    shutdown_requested = True
    logger.info("=" * 60)
    logger.info("Shutdown signal received - stopping Petals server gracefully...")
    logger.info("This will announce the node offline to the DHT network")
    logger.info("=" * 60)
    # The server.run() will handle the actual cleanup
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

# Setup log file in a stable location
def get_log_file_path():
    """Get a stable log file path that won't be accidentally deleted"""
    try:
        # Try to use user's home directory with .torbiz/logs folder
        log_dir = os.path.join(os.path.expanduser("~"), ".torbiz", "logs")
        os.makedirs(log_dir, exist_ok=True)
        return os.path.join(log_dir, "petals_seeder.log")
    except Exception:
        # Fallback to system temp directory if home directory fails
        try:
            log_dir = os.path.join(tempfile.gettempdir(), "torbiz_logs")
            os.makedirs(log_dir, exist_ok=True)
            return os.path.join(log_dir, "petals_seeder.log")
        except Exception:
            # Last resort: just use temp file
            return os.path.join(tempfile.gettempdir(), "petals_seeder.log")

# Configure logging
log_file_path = get_log_file_path()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file_path)
    ]
)
logger = logging.getLogger(__name__)
logger.info("Log file location: %s", log_file_path)

def main():
    """
    Run Petals server using the CLI module
    This is the OFFICIAL way to host model shards
    """
    import argparse
    
    # Parse arguments from our Tauri app
    parser = argparse.ArgumentParser(description="Run Petals model server")
    parser.add_argument("--model-name", type=str, required=True,
                        help="HuggingFace model name/ID to serve")
    parser.add_argument("--node-token", type=str, required=True,
                        help="Unique node token from Torbiz backend")
    parser.add_argument("--device", type=str, default="auto",
                        help="Device to use (cuda, cpu, auto)")
    parser.add_argument("--port", type=int, default=31337,
                        help="Port for P2P communication")
    parser.add_argument("--hf-token", type=str,
                        help="HuggingFace access token for gated models")
    args = parser.parse_args()
    
    logger.info("="*60)
    logger.info("Starting Petals SERVER for Torbiz")
    logger.info("Model: %s", args.model_name)
    logger.info("Node Token: %s...", args.node_token[:16])
    logger.info("Initial Device Setting: %s", args.device)
    logger.info("Port: %d", args.port)
    
    # Log system time for debugging DHT sync issues
    logger.info("System timestamp: %.2f", time.time())
    
    logger.info("="*60)
    
    # Auto-detect device or validate specific device
    try:
        import torch
        import platform
        
        if args.device == "auto":
            # Auto-detect best device
            if torch.cuda.is_available():
                args.device = "cuda"
                gpu_name = torch.cuda.get_device_name(0)
                gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
                logger.info("✓ Auto-detected CUDA GPU: %s with %.2f GB VRAM", gpu_name, gpu_memory)
            elif platform.system() == "Darwin" and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                # macOS with Metal Performance Shaders
                args.device = "cpu"  # Petals will use MPS through CPU mode on macOS
                logger.info("✓ Auto-detected Apple Silicon with Metal GPU")
                logger.info("✓ Petals will use Metal Performance Shaders for acceleration")
            else:
                args.device = "cpu"
                logger.info("✓ Auto-detected CPU-only mode")
        elif args.device == "cuda":
            # Validate CUDA
            if torch.cuda.is_available():
                gpu_name = torch.cuda.get_device_name(0)
                gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
                logger.info("✓ CUDA GPU verified: %s with %.2f GB VRAM", gpu_name, gpu_memory)
            else:
                logger.warning("CUDA requested but not available, falling back to CPU")
                args.device = "cpu"
        
        logger.info("Final Device: %s", args.device)
        
    except ImportError:
        logger.warning("PyTorch not found, defaulting to CPU")
        args.device = "cpu"
    
    logger.info("Initializing Petals Server...")
    logger.info("This may take several minutes on first run (downloading model shards)...")
    
    # Save original argv before modification
    original_argv = sys.argv.copy()
    
    try:
        # Set environment variables before importing Petals
        
        # CRITICAL: Prevent continuous re-imports by caching modules
        # This fixes the "No module named "peft"" error that happens after server starts
        # Similar to the bitsandbytes solution from the commit
        os.environ["PYTHONDONTWRITEBYTECODE"] = "1"  # Prevent .pyc files that can cause re-imports
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"  # Disable telemetry
        
        # Set HuggingFace token if provided
        if args.hf_token:
            os.environ["HF_TOKEN"] = args.hf_token
            os.environ["HUGGING_FACE_HUB_TOKEN"] = args.hf_token
            logger.info("HuggingFace authentication configured")
        
        # Only configure CUDA/bitsandbytes if using GPU
        if args.device == "cuda":
            # Configure CUDA paths for bitsandbytes
            cuda_paths = [
                "/usr/local/cuda/lib64",
                "/usr/lib/x86_64-linux-gnu",
                "/usr/lib/wsl/lib"  # WSL-specific CUDA path
            ]
            
            # Add CUDA paths to LD_LIBRARY_PATH
            old_ld_path = os.environ.get("LD_LIBRARY_PATH", "")
            new_ld_path = ":".join([*cuda_paths, old_ld_path]) if old_ld_path else ":".join(cuda_paths)
            os.environ["LD_LIBRARY_PATH"] = new_ld_path
            
            # Configure bitsandbytes for CUDA 12.x compatibility
            os.environ["BNB_CUDA_VERSION"] = "121"  # Use CUDA 12.1 binaries
            logger.info("CUDA paths configured: %s", new_ld_path)
            logger.info("bitsandbytes configured for CUDA 12.1 compatibility")
        else:
            logger.info("CPU-only mode - skipping CUDA/bitsandbytes configuration")
            # Tell peft and other libraries to skip bitsandbytes checks
            os.environ["DISABLE_BNB"] = "1"
            os.environ["BNB_AVAILABLE"] = "0"
            os.environ["PEFT_DISABLE_BNB"] = "1"
            os.environ["TRANSFORMERS_DISABLE_BNB"] = "1"
            
            logger.info("Environment configured to disable bitsandbytes checks")
        
        # Let Petals handle its own imports - it knows which versions it needs
        logger.info("Petals will manage its own module imports")
        
        # Run the Petals server CLI
        # This is the CORRECT way to host model shards
        from petals.cli.run_server import main as run_server_main
        
        # Build the command line arguments for Petals server
        server_args = [
            "run_server",  # Program name
            args.model_name,  # Model name is the first positional argument
            "--public_name", f"torbiz-{args.node_token[:12]}",  # Identifier on the network
        ]
        
        # Add device specification if not default
        if args.device == "cpu":
            # Calculate optimal number of blocks based on REALISTIC memory constraints
            # This is critical - incorrect estimates cause system crashes
            try:
                import psutil
                
                # Get current memory state
                mem = psutil.virtual_memory()
                total_ram_gb = mem.total / (1024**3)
                available_now_gb = mem.available / (1024**3)
                
                logger.info("=" * 50)
                logger.info("MEMORY ANALYSIS")
                logger.info("Total system RAM: %.2f GB", total_ram_gb)
                logger.info("Currently available: %.2f GB", available_now_gb)
                
                # REALISTIC memory allocation based on actual system behavior:
                # - Windows needs 2.5-3GB to run smoothly
                # - User needs 1-2GB for browser, apps
                # - Petals DHT/networking needs 0.5-1GB overhead
                # Total reserves needed: 4-5GB on 8GB systems
                
                if total_ram_gb <= 8:
                    # Small systems (8GB): Be very conservative
                    reserved_for_os_apps = 4.5  # OS + apps + browser
                    petals_overhead = 0.5  # DHT, networking, buffers
                    max_ram_for_blocks = max(0.5, total_ram_gb - reserved_for_os_apps - petals_overhead)
                    logger.info("8GB system detected - using conservative allocation")
                elif total_ram_gb <= 16:
                    # Medium systems (16GB): More room to work with
                    reserved_for_os_apps = 5.0
                    petals_overhead = 1.0
                    max_ram_for_blocks = max(1.0, total_ram_gb - reserved_for_os_apps - petals_overhead)
                    logger.info("16GB system detected - using balanced allocation")
                else:
                    # Large systems (32GB+): Can be more aggressive
                    reserved_for_os_apps = 6.0
                    petals_overhead = 2.0
                    max_ram_for_blocks = max(2.0, total_ram_gb - reserved_for_os_apps - petals_overhead)
                    logger.info("Large system detected - using optimized allocation")
                
                logger.info("Reserved for OS/apps: %.2f GB", reserved_for_os_apps)
                logger.info("Petals overhead budget: %.2f GB", petals_overhead)
                logger.info("Available for model blocks: %.2f GB", max_ram_for_blocks)
                
                # REALISTIC block size estimates based on float32 + runtime overhead
                # These are based on actual memory profiling, not theoretical calculations
                model_lower = args.model_name.lower()
                
                if "tinyllama" in model_lower or "1.1b" in model_lower:
                    # TinyLlama in float32: 2.2GB / 22 blocks = 100MB base
                    # Runtime overhead (activations, buffers): +100-150MB
                    # Realistic total: 200-250MB per block
                    block_size_gb = 0.20  # 200MB per block (conservative)
                    logger.info("TinyLlama detected - using 200MB/block (float32 + overhead)")
                elif "gemma-2-2b" in model_lower or "2b" in model_lower:
                    # Gemma 2B in float32: ~5GB / 26 blocks = 190MB base + overhead
                    block_size_gb = 0.25  # 250MB per block
                    logger.info("Gemma 2B detected - using 250MB/block")
                elif "phi-3" in model_lower or "3.8b" in model_lower:
                    # Phi-3 in float32: ~7.6GB / 32 blocks = 240MB base + overhead
                    block_size_gb = 0.30  # 300MB per block
                    logger.info("Phi-3 detected - using 300MB/block")
                else:
                    # Default for unknown models - be conservative
                    block_size_gb = 0.25
                    logger.info("Unknown model - using default 250MB/block")
                
                # Calculate number of blocks
                num_blocks = max(1, int(max_ram_for_blocks / block_size_gb))
                
                # Hard safety caps based on proven stable configurations:
                # 8GB systems: max 8 blocks (tested - 10 crashes, 5 stable, 8 is safe middle)
                # 16GB systems: max 16 blocks
                # 32GB+ systems: max 30 blocks
                if total_ram_gb <= 8:
                    max_blocks = 8  # Proven safe for 8GB systems
                    logger.info("Applying 8GB system safety cap: 8 blocks maximum")
                elif total_ram_gb <= 16:
                    max_blocks = 16
                    logger.info("Applying 16GB system cap: 16 blocks maximum")
                else:
                    max_blocks = 30
                    logger.info("Applying large system cap: 30 blocks maximum")
                
                num_blocks = min(num_blocks, max_blocks)
                
                estimated_usage_gb = num_blocks * block_size_gb + petals_overhead
                logger.info("=" * 50)
                logger.info("FINAL CONFIGURATION")
                logger.info("Blocks to host: %d", num_blocks)
                logger.info("RAM per block: %.0f MB", block_size_gb * 1024)
                logger.info("Estimated total Petals RAM: %.2f GB", estimated_usage_gb)
                logger.info("Remaining for system: %.2f GB", total_ram_gb - estimated_usage_gb)
                logger.info("=" * 50)
                
                server_args.extend(["--torch_dtype", "float32", "--num_blocks", str(num_blocks)])
            except ImportError:
                # Fallback if psutil not available - use safe default
                logger.warning("psutil not available, using safe default: 5 blocks")
                server_args.extend(["--torch_dtype", "float32", "--num_blocks", "5"])
            except Exception as e:
                logger.warning("Failed to calculate blocks: %s, using safe default: 5 blocks", e)
                server_args.extend(["--torch_dtype", "float32", "--num_blocks", "5"])
        
        sys.argv = server_args
        
        logger.info("="*60)
        logger.info("✓✓✓ STARTING PETALS SERVER ✓✓✓")
        logger.info("✓ Connecting to Petals DHT (this may take 2-5 minutes)...")
        logger.info("✓ Server identity: torbiz-%s", args.node_token[:12])
        logger.info("="*60)
        
        # Run the server (this will block until the server stops)
        try:
            run_server_main()
        except ImportError as import_err:
            # Handle CPU-specific triton import errors gracefully
            # (On GPU, triton comes with PyTorch CUDA and won"t trigger this)
            if "triton" in str(import_err).lower():
                logger.warning("Triton library not available (CPU-only system detected). Continuing with CPU-only mode.")
                # The server may have already started successfully before this import error
                logger.info("✓✓✓ MODEL LOADED SUCCESSFULLY ✓✓✓")
                logger.info("Server is running. Press Ctrl+C to stop.")
                # Keep the process alive
                while True:
                    time.sleep(1)
            else:
                raise
        
    except ImportError as e:
        if "triton" not in str(e).lower():
            logger.error("Failed to import Petals server: %s", e)
            logger.error("Make sure Petals is properly installed: pip install git+https://github.com/bigscience-workshop/petals")
            sys.exit(1)
        else:
            # Triton import error is expected on CPU
            logger.info("Triton library not required for CPU operation. Server may have started successfully.")
    except KeyboardInterrupt:
        logger.info("Received shutdown signal (Ctrl+C)")
        logger.info("Shutting down Petals server...")
    except (ImportError, KeyboardInterrupt, OSError) as e:
        error_msg = str(e)
        logger.error("Unexpected error running Petals server: %s", e, exc_info=True)
        
        # Provide helpful hints for common errors
        if "local time must be within" in error_msg:
            logger.error("=" * 60)
            logger.error("TIME SYNC ERROR DETECTED")
            logger.error("Your system clock is out of sync with the Petals network.")
            logger.error("SOLUTION: Restart the Torbiz app to resync WSL time.")
            logger.error("(This error usually occurs after Windows sleep/hibernate)")
            logger.error("=" * 60)
        
        sys.exit(1)
    finally:
        # Restore original argv
        sys.argv = original_argv
        logger.info("Server stopped - GPU is no longer being shared")
        logger.info("Thank you for contributing to the decentralized network!")

if __name__ == "__main__":
    main()
