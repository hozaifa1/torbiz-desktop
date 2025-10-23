#!/usr/bin/env python3
"""
Petals Seeder Script for Torbiz Desktop App
Runs a Petals SERVER to host model shards on the network
"""
import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("petals_seeder.log")
    ]
)
logger = logging.getLogger(__name__)

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
    parser.add_argument("--device", type=str, default="cuda",
                        help="Device to use (cuda, cpu)")
    parser.add_argument("--port", type=int, default=31337,
                        help="Port for P2P communication")
    args = parser.parse_args()
    
    logger.info("="*60)
    logger.info("Starting Petals SERVER for Torbiz")
    logger.info("Model: %s", args.model_name)
    logger.info("Node Token: %s...", args.node_token[:16])
    logger.info("Device: %s", args.device)
    logger.info("Port: %d", args.port)
    logger.info("="*60)
    
    # Check CUDA availability if requested
    if args.device == "cuda":
        try:
            import torch
            if torch.cuda.is_available():
                gpu_name = torch.cuda.get_device_name(0)
                gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
                logger.info("CUDA available: %s with %.2f GB VRAM", gpu_name, gpu_memory)
            else:
                logger.warning("CUDA requested but not available, will fall back to CPU")
                args.device = "cpu"
        except ImportError:
            logger.warning("PyTorch not found, cannot check CUDA")
    
    logger.info("Initializing Petals Server...")
    logger.info("This may take several minutes on first run (downloading model shards)...")
    
    # Save original argv before modification
    original_argv = sys.argv.copy()
    
    try:
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
            server_args.extend(["--torch_dtype", "float32"])
        
        sys.argv = server_args
        
        logger.info("="*60)
        logger.info("✓✓✓ STARTING PETALS SERVER ✓✓✓")
        logger.info("✓ Connecting to Petals DHT (this may take 2-5 minutes)...")
        logger.info("✓ Server identity: torbiz-%s", args.node_token[:12])
        logger.info("="*60)
        
        # Run the server (this will block until the server stops)
        run_server_main()
        
    except ImportError as e:
        logger.error("Failed to import Petals server: %s", e)
        logger.error("Make sure Petals is properly installed: pip install git+https://github.com/bigscience-workshop/petals")
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Received shutdown signal (Ctrl+C)")
        logger.info("Shutting down Petals server...")
    except Exception as e:
        logger.error("Unexpected error running Petals server: %s", e, exc_info=True)
        sys.exit(1)
    finally:
        # Restore original argv
        sys.argv = original_argv
        logger.info("Server stopped - GPU is no longer being shared")
        logger.info("Thank you for contributing to the decentralized network!")

if __name__ == "__main__":
    main()
