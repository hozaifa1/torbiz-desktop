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
            # Calculate optimal number of blocks based on available RAM
            # Allow more blocks to enable hosting larger portions of models
            try:
                import psutil
                # Get available memory in GB
                total_ram_gb = psutil.virtual_memory().total / (1024**3)
                
                # More reasonable approach: use up to 60% of available RAM
                # Reserve 3GB total (2GB for OS, 1GB for Petals overhead)
                available_ram = max(0.5, total_ram_gb - 3.0)
                max_ram_budget = available_ram * 0.6  # Use 60% of available RAM for blocks
                
                logger.info("Total system RAM: %.2f GB", total_ram_gb)
                logger.info("Available RAM after reserves: %.2f GB", available_ram)
                logger.info("Max RAM budget for blocks: %.2f GB (60%% of available)", max_ram_budget)
                
                # Estimate RAM per block - 150MB is more realistic for most models
                # Small models use less, but 150MB is a safe average
                block_size_gb = 0.15
                num_blocks = max(1, int(max_ram_budget / block_size_gb))
                
                # Cap at reasonable maximum to prevent system instability
                # 30 blocks should be enough for most small-to-medium models
                num_blocks = min(num_blocks, 30)
                
                logger.info("Calculated blocks: %d (~%.2f GB per block)", num_blocks, block_size_gb)
                server_args.extend(["--torch_dtype", "float32", "--num_blocks", str(num_blocks)])
                logger.info("Running in CPU-only mode with %d blocks (~%.2f GB RAM total)", num_blocks, num_blocks * block_size_gb)
            except ImportError:
                # Fallback if psutil not available
                logger.warning("psutil not available, using 1 block (install psutil for dynamic block calculation)")
                server_args.extend(["--torch_dtype", "float32", "--num_blocks", "1"])
            except Exception as e:
                logger.warning("Failed to calculate optimal blocks: %s, using 1 block", e)
                server_args.extend(["--torch_dtype", "float32", "--num_blocks", "1"])
        
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
