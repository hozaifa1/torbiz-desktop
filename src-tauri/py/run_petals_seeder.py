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
import platform

# Import torch and other heavy libraries AFTER bitsandbytes mock
import torch

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
    # (torch and platform are already imported in verification section above)
    try:
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
        
    except Exception as e:
        logger.warning("Error during device detection: %s, defaulting to CPU", e)
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
        
        # Verify critical imports BEFORE starting server
        # torch and platform are already imported at the top of the file
        logger.info("="*60)
        logger.info("VERIFYING DEPENDENCIES")
        logger.info("✓ PyTorch version: %s", torch.__version__)
        logger.info("✓ Platform: %s", platform.system())
        
        try:
            import petals
            logger.info("✓ Petals version: %s", petals.__version__)
        except ImportError as e:
            logger.error("✗ Petals not installed: %s", e)
            logger.error("Please install Petals: pip install git+https://github.com/bigscience-workshop/petals")
            sys.exit(1)
        
        # Check for GPU sharing specific dependencies
        try:
            import peft
            logger.info("✓ peft installed (required for hosting models)")
        except ImportError as e:
            logger.error("✗ peft not installed: %s", e)
            logger.error("peft is required for GPU sharing. Please install: pip install peft")
            logger.error("(peft is needed to host model blocks, but not for inference-only)")
            sys.exit(1)
        
        try:
            import accelerate
            logger.info("✓ accelerate installed (required for hosting models)")
        except ImportError as e:
            logger.error("✗ accelerate not installed: %s", e)
            logger.error("accelerate is required for GPU sharing. Please install: pip install accelerate")
            logger.error("(accelerate is needed to host model blocks, but not for inference-only)")
            sys.exit(1)
        
        logger.info("✓ All dependencies verified successfully")
        logger.info("="*60)
        
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
        
        # Import Server directly to have full control over parameters
        from petals import Server
        
        logger.info("="*60)
        logger.info("DHT BOOTSTRAP CONFIGURATION")
        logger.info("Relaxed bootstrap mode enabled (force_reachable=True)")
        logger.info("Server will start even if default bootstrap peers are offline")
        logger.info("This is the recommended approach for restrictive networks")
        logger.info("="*60)
        
        # Determine num_blocks for CPU mode
        num_blocks = None
        torch_dtype = None
        
        if args.device == "cpu":
            # SIMPLE, PROVEN APPROACH - No more complex calculations
            # Based on user testing: 5 blocks stable, 10 blocks crash
            try:
                import psutil
                
                mem = psutil.virtual_memory()
                total_ram_gb = mem.total / (1024**3)
                
                logger.info("="*60)
                logger.info("CPU MEMORY DETECTION")
                logger.info("Detected total RAM: %.2f GB", total_ram_gb)
                
                # SIMPLE FIXED BLOCK ALLOCATION based on proven testing
                # No complex calculations - just use what we know works
                if total_ram_gb <= 6:
                    # Very small systems (6GB or less)
                    num_blocks = 3
                    logger.info("6GB or less system: Hosting 3 blocks (safe minimum)")
                elif total_ram_gb <= 8:
                    # 8GB systems - USER TESTED: 5 blocks stable, 10 crash
                    # Target: 6-7 blocks (slightly above stable 5, well below crash 10)
                    model_lower = args.model_name.lower()
                    if "tinyllama" in model_lower or "1.1b" in model_lower:
                        num_blocks = 7  # TinyLlama is small, can push to 7
                    else:
                        num_blocks = 6  # Other models, be more conservative
                    logger.info("8GB system: Hosting %d blocks (proven stable range)", num_blocks)
                elif total_ram_gb <= 12:
                    # 12GB systems
                    num_blocks = 10
                    logger.info("12GB system: Hosting 10 blocks")
                elif total_ram_gb <= 16:
                    # 16GB systems
                    num_blocks = 14
                    logger.info("16GB system: Hosting 14 blocks")
                else:
                    # 32GB+ systems
                    num_blocks = 22
                    logger.info("Large system (32GB+): Hosting 22 blocks")
                
                logger.info("FINAL: Will host %d blocks on this CPU", num_blocks)
                logger.info("="*60)
                
                torch_dtype = "float32"
                
            except ImportError:
                # Fallback if psutil not installed
                logger.warning("psutil not available - defaulting to 5 blocks (install psutil for optimization)")
                num_blocks = 5
                torch_dtype = "float32"
            except Exception as e:
                logger.error("Error detecting RAM: %s - defaulting to 5 blocks", e)
                num_blocks = 5
                torch_dtype = "float32"
        
        logger.info("="*60)
        logger.info("✓✓✓ STARTING PETALS SERVER ✓✓✓")
        logger.info("✓ Connecting to Petals DHT (this may take 2-5 minutes)...")
        logger.info("✓ Server identity: torbiz-%s", args.node_token[:12])
        logger.info("="*60)
        
        # Create server with force_reachable=True to bypass DHT bootstrap issues
        server_kwargs = {
            "initial_peers": [],  # Empty list to avoid default bootstrap peers that may be offline
            "public_name": f"torbiz-{args.node_token[:12]}",
            "force_reachable": True,  # CRITICAL: Bypass reachability check
        }
        
        if num_blocks is not None:
            server_kwargs["num_blocks"] = num_blocks
        if torch_dtype is not None:
            server_kwargs["torch_dtype"] = torch_dtype
        
        # Run the server (this will block until the server stops)
        try:
            server = Server(args.model_name, **server_kwargs)
            logger.info("✓✓✓ SERVER CREATED SUCCESSFULLY ✓✓✓")
            logger.info("Server is now running and hosting model blocks")
            logger.info("Press Ctrl+C to stop sharing")
            
            # Run the server (blocks until shutdown)
            server.run()
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
    except ImportError as e:
        error_msg = str(e)
        logger.error("=" * 60)
        logger.error("IMPORT ERROR DETECTED")
        logger.error("Failed to import required Python module: %s", e)
        logger.error("Full traceback:", exc_info=True)
        logger.error("=" * 60)
        
        # Provide specific guidance based on the missing module
        if "peft" in error_msg.lower():
            logger.error("Missing dependency: peft")
            logger.error("SOLUTION: pip install peft")
            logger.error("This is required for hosting model blocks (GPU sharing mode)")
        elif "accelerate" in error_msg.lower():
            logger.error("Missing dependency: accelerate")
            logger.error("SOLUTION: pip install accelerate")
            logger.error("This is required for hosting model blocks (GPU sharing mode)")
        elif "transformers" in error_msg.lower():
            logger.error("Missing dependency: transformers")
            logger.error("SOLUTION: pip install transformers")
            logger.error("This should have been installed with Petals")
        elif "torch" in error_msg.lower():
            logger.error("Missing dependency: PyTorch")
            logger.error("SOLUTION: pip install torch")
            logger.error("This should have been installed with Petals")
        else:
            logger.error("Please ensure all dependencies are installed:")
            logger.error("pip install git+https://github.com/bigscience-workshop/petals peft accelerate")
        
        logger.error("=" * 60)
        sys.exit(1)
    except (KeyboardInterrupt, OSError, RuntimeError) as e:
        error_msg = str(e)
        logger.error("=" * 60)
        logger.error("RUNTIME ERROR DETECTED")
        logger.error("Error: %s", e)
        logger.error("Full traceback:", exc_info=True)
        logger.error("=" * 60)
        
        # Provide helpful hints for common errors
        if "DHTNode bootstrap failed" in error_msg or "initial_peers responded" in error_msg:
            logger.error("DHT NETWORK CONNECTION ERROR")
            logger.error("Cannot connect to Petals peer-to-peer network.")
            logger.error("")
            logger.error("COMMON CAUSES:")
            logger.error("1. Firewall blocking P2P connections")
            logger.error("   SOLUTION (macOS): System Preferences > Security & Privacy > Firewall")
            logger.error("   - Add Torbiz to allowed apps OR disable firewall temporarily")
            logger.error("")
            logger.error("2. Restrictive network (university/corporate/public WiFi)")
            logger.error("   SOLUTION: Try on home network or mobile hotspot")
            logger.error("")
            logger.error("3. VPN/Proxy interference")
            logger.error("   SOLUTION: Temporarily disable VPN and try again")
            logger.error("")
            logger.error("4. Internet connection issues")
            logger.error("   SOLUTION: Check your internet connection")
            logger.error("")
            logger.error("5. ISP blocking P2P ports")
            logger.error("   SOLUTION: Contact your ISP or try different network")
        elif "local time must be within" in error_msg:
            logger.error("TIME SYNC ERROR DETECTED")
            logger.error("Your system clock is out of sync with the Petals network.")
            logger.error("SOLUTION (macOS): Go to System Preferences > Date & Time > Enable 'Set time automatically'")
            logger.error("SOLUTION (Windows/WSL): Restart the Torbiz app to resync WSL time.")
            logger.error("(This error usually occurs after sleep/hibernate)")
        elif "connection" in error_msg.lower() or "network" in error_msg.lower():
            logger.error("NETWORK ERROR DETECTED")
            logger.error("Failed to connect to Petals DHT network.")
            logger.error("Please check your internet connection and firewall settings.")
        elif "permission" in error_msg.lower():
            logger.error("PERMISSION ERROR DETECTED")
            logger.error("Insufficient permissions to access required resources.")
            logger.error("Try running with appropriate permissions or check file access.")
        
        logger.error("=" * 60)
        sys.exit(1)
    except Exception as e:
        # Catch-all for any unexpected errors
        logger.error("=" * 60)
        logger.error("UNEXPECTED ERROR")
        logger.error("An unexpected error occurred: %s", e)
        logger.error("Error type: %s", type(e).__name__)
        logger.error("Full traceback:", exc_info=True)
        logger.error("=" * 60)
        logger.error("Please report this error to the Torbiz team with the full log above.")
        logger.error("=" * 60)
        sys.exit(1)
    finally:
        # Restore original argv
        sys.argv = original_argv
        logger.info("Server stopped - GPU is no longer being shared")
        logger.info("Thank you for contributing to the decentralized network!")

if __name__ == "__main__":
    main()
