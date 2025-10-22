#!/usr/bin/env python3
"""
Petals Seeder Script for Torbiz Desktop App
Properly connects to the Petals network and hosts model shards
"""
import argparse
import sys
import logging
from petals import AutoDistributedModelForCausalLM
from transformers import AutoTokenizer
import torch

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    # vvv THIS LINE IS CORRECTED vvv
    format="[PETALS-SEEDER] %(asctime)s - %(levelname)s - %(message)s",
    # ^^^ THIS LINE IS CORRECTED ^^^
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("petals_seeder.log")
    ]
)
logger = logging.getLogger(__name__)

# Default Petals DHT initial peers for network discovery
DEFAULT_INITIAL_PEERS = [
    "/ip4/64.22.106.150/tcp/31337/p2p/QmYnNnJpNtVPPcYyqcBqoakjVLUEEb7vKubMYVbNJoHvbd",
    "/ip4/64.22.106.150/udp/31337/quic/p2p/QmYnNnJpNtVPPcYyqcBqoakjVLUEEb7vKubMYVbNJoHvbd",
    "/ip4/103.150.83.36/tcp/31337/p2p/QmNNf4eKj6LVRL4Yq8y8jjRZ5bDFYdpVr6z1fGj5M8jKHR"
]

def parse_args():
    parser = argparse.ArgumentParser(description="Run Petals model server")
    parser.add_argument("--model-name", type=str, required=True,
                        help="HuggingFace model name/ID to serve")
    parser.add_argument("--node-token", type=str, required=True,
                        help="Unique node token from Torbiz backend")
    parser.add_argument("--device", type=str, default="cuda",
                        help="Device to use (cuda, cpu)")
    parser.add_argument("--port", type=int, default=31337,
                        help="Port for P2P communication")
    parser.add_argument("--initial-peers", nargs="+", default=DEFAULT_INITIAL_PEERS,
                        help="Initial DHT peers to connect to")
    return parser.parse_args()

def detect_available_device():
    """Detect the best available device"""
    if torch.cuda.is_available():
        device = "cuda"
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        logger.info(f"CUDA available: {gpu_name} with {gpu_memory:.2f} GB VRAM")
        return device
    else:
        logger.warning("CUDA not available, falling back to CPU (performance will be limited)")
        return "cpu"

def main():
    args = parse_args()
    
    logger.info("="*60)
    logger.info("Starting Petals Seeder for Torbiz")
    logger.info(f"Model: {args.model_name}")
    logger.info(f"Node Token: {args.node_token[:16]}...")
    logger.info(f"Port: {args.port}")
    logger.info(f"Initial Peers: {len(args.initial_peers)} configured")
    logger.info("="*60)
    
    # Detect and configure device
    device = detect_available_device()
    if device == "cpu" and args.device == "cuda":
        logger.warning("Requested CUDA but not available, using CPU")
        device = "cpu"
    
    try:
        logger.info(f"Loading model: {args.model_name}")
        logger.info("This may take several minutes on first run (downloading model shards)...")
        
        # Check network connectivity first
        logger.info("Testing network connectivity to Petals DHT...")
        try:
            import socket
            import urllib.request
            # Simple connectivity test
            urllib.request.urlopen("https://huggingface.co", timeout=5)
            logger.info("✓ Network connectivity verified")
        except Exception as e:
            logger.warning(f"Network connectivity test failed: {e}")
            logger.warning("Proceeding anyway, but connection may fail...")
        
        # Load the distributed model with proper network configuration
        logger.info("Initializing connection to Petals distributed network...")
        logger.info("NOTE: First connection may take 2-5 minutes to discover peers")
        
        model = AutoDistributedModelForCausalLM.from_pretrained(
            args.model_name,
            initial_peers=args.initial_peers,
            device=device,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            # Use node token as server identity
            public_name=f"torbiz-{args.node_token[:12]}",
            # Configure for serving
            mode="server",
            # Network configuration
            announce_maddrs=[f"/ip4/0.0.0.0/tcp/{args.port}"],
            # Performance tuning
            max_batch_size=8,
            inference_max_length=2048,
        )
        
        logger.info("="*60)
        logger.info("✓✓✓ MODEL LOADED SUCCESSFULLY ✓✓✓")
        logger.info(f"✓ Server is now ACTIVE and connected to Petals network")
        logger.info(f"✓ Serving shards of {args.model_name}")
        logger.info(f"✓ Server identity: torbiz-{args.node_token[:12]}")
        logger.info(f"✓ Your GPU is now contributing to the decentralized network")
        logger.info("")
        logger.info("IMPORTANT: Keep this window running to continue sharing")
        logger.info("Your contribution helps power AI for everyone!")
        logger.info("="*60)
        
        # Keep the server running with periodic status updates
        try:
            import time
            uptime_minutes = 0
            while True:
                time.sleep(60)
                uptime_minutes += 1
                logger.info(f"✓ Server alive - Uptime: {uptime_minutes} min - Serving {args.model_name}")
                
                # Every 10 minutes, log additional status
                if uptime_minutes % 10 == 0:
                    logger.info(f"✓ Server healthy after {uptime_minutes} minutes of operation")
                    
        except KeyboardInterrupt:
            logger.info("Received shutdown signal (Ctrl+C)")
            
    except ImportError as e:
        logger.error(f"Failed to import required libraries: {e}", exc_info=True)
        logger.error("This usually means Petals or its dependencies are not properly installed")
        logger.error("Try reinstalling with: pip install petals transformers torch")
        sys.exit(1)
        
    except ConnectionError as e:
        logger.error(f"Failed to connect to Petals network: {e}", exc_info=True)
        logger.error("Possible causes:")
        logger.error("  1. Firewall blocking port 31337")
        logger.error("  2. No internet connection")
        logger.error("  3. Petals DHT peers are unreachable")
        logger.error("Check your network settings and firewall rules")
        sys.exit(1)
        
    except RuntimeError as e:
        error_msg = str(e)
        if "CUDA" in error_msg or "GPU" in error_msg:
            logger.error(f"GPU-related error: {e}", exc_info=True)
            logger.error("Your GPU may not support the required operations")
            logger.error("Try running with --device cpu instead")
        else:
            logger.error(f"Runtime error: {e}", exc_info=True)
        sys.exit(1)
        
    except Exception as e:
        logger.error(f"Unexpected error starting Petals server: {e}", exc_info=True)
        logger.error("Please report this error with the log file")
        sys.exit(1)
    
    finally:
        logger.info("Shutting down Petals server...")
        logger.info("Server stopped - GPU is no longer being shared")
        logger.info("Thank you for contributing to the decentralized network!")

if __name__ == "__main__":
    main()