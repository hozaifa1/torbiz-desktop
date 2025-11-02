================================================================================
TORBIZ DOCKER IMPLEMENTATION - TECHNICAL OVERVIEW
================================================================================

PURPOSE
-------
Solve macOS GPU sharing dependency issues by containerizing the Python 
environment, similar to how Windows uses WSL.

FILES ADDED
-----------
1. Dockerfile.macos
   - Defines the Docker image with Python 3.11, PyTorch, Petals, peft, accelerate
   - Based on python:3.11-slim for smaller image size
   - Pre-installs all dependencies to avoid runtime issues

2. docker-compose.macos.yml
   - Optional: Simplifies container management
   - Defines volumes, network settings, environment variables
   - Not used by the app currently, but available for manual management

3. .dockerignore
   - Excludes unnecessary files from Docker build context
   - Speeds up image building

4. build-docker-macos.sh
   - Manual build script for users who want to rebuild the image
   - Includes checks for Docker installation and daemon status

5. DOCKER_MACOS_GUIDE.txt
   - Comprehensive user guide
   - Step-by-step installation instructions
   - Troubleshooting section

CODE CHANGES
------------
1. src-tauri/src/macos.rs
   - Added: check_docker_installed()
   - Added: check_docker_running()
   - Added: check_docker_image_exists()
   - Added: build_docker_image()
   - Modified: setup_macos_environment() to use Docker workflow

2. src-tauri/src/petals.rs
   - Modified: start_petals_seeder() macOS section to use Docker
   - Modified: stop_petals_seeder() macOS section to stop Docker container
   - Changed from direct python3 execution to docker run

HOW IT WORKS
------------
SETUP PHASE (First Time):
1. User clicks "Share GPU" in Torbiz
2. App checks if Docker is installed
3. App checks if Docker daemon is running
4. App builds Docker image (one-time, 5-10 minutes)
5. Image contains: Python 3.11 + PyTorch + Petals + peft + accelerate + all deps
6. Setup complete, ready to share GPU

GPU SHARING PHASE:
1. User selects model and clicks "Share GPU"
2. App runs: docker run --rm --name torbiz-petals-seeder \
             --network host \
             -v <py_scripts>:/app/scripts:ro \
             -v ~/.cache/huggingface:/root/.cache/huggingface \
             -v ~/.torbiz/logs:/root/.torbiz/logs \
             torbiz-petals-macos:latest \
             python3 /app/scripts/run_petals_seeder.py --model-name <model> --node-token <token>
3. Container starts, runs Python script with all dependencies
4. Connects to Petals P2P network, serves model blocks
5. Logs streamed to app UI

STOPPING:
1. User clicks "Stop Sharing"
2. App runs: docker stop torbiz-petals-seeder
3. Container stops gracefully (announces node offline to DHT)
4. Container is automatically removed (--rm flag)

VOLUMES EXPLAINED
-----------------
1. Python Scripts (read-only)
   Source: <app>/src-tauri/py/
   Mount: /app/scripts:ro
   Why: Scripts are always current, no need to rebuild image for script changes

2. HuggingFace Cache
   Source: ~/.cache/huggingface/
   Mount: /root/.cache/huggingface
   Why: Model downloads are cached on host, not re-downloaded each container run

3. Logs
   Source: ~/.torbiz/logs/
   Mount: /root/.torbiz/logs
   Why: Logs persist after container stops, accessible from host

NETWORK MODE
------------
--network host: Required for Petals P2P DHT network
- Container shares host network stack
- No port mapping needed
- DHT can bind to ports directly
- Essential for peer discovery and connection

DOCKER VS SYSTEM PYTHON
------------------------
GPU Sharing (Docker):
- Requires: Docker Desktop
- Uses: Container environment
- Dependencies: peft, accelerate, petals, torch
- Isolation: Complete
- Setup: One-time build

Direct Inference (System Python):
- Requires: Python 3.11+ (via Homebrew)
- Uses: System Python
- Dependencies: petals, torch only
- Isolation: None
- Setup: pip install

WHY THIS APPROACH?
------------------
1. Reliability: Pre-built image with verified dependencies
2. Isolation: No conflicts with system Python packages
3. Consistency: Same environment for all macOS users
4. Maintainability: Easy to update (rebuild image)
5. Parity: Similar to Windows WSL approach
6. Troubleshooting: Easy to reset (delete image, rebuild)

COMPARISON TO WINDOWS WSL
--------------------------
Windows:
- WSL provides Linux environment
- Python in ~/.torbiz_venv
- Dependencies installed via pip in WSL
- Time sync via wsl --terminate

macOS:
- Docker provides Linux container
- Python in container (pre-installed)
- Dependencies pre-built in image
- Time sync via sntp (host system)

Both achieve the same goal with platform-appropriate technology.

FUTURE IMPROVEMENTS
-------------------
1. Multi-architecture support (ARM64 + AMD64)
2. GPU passthrough (when Docker Desktop supports it)
3. Automated image updates
4. Pre-built image distribution (Docker Hub)
5. Container resource limits (CPU/RAM)

TESTING CHECKLIST
-----------------
□ Docker not installed → Error message with install link
□ Docker installed but not running → Error message to start Docker
□ Docker running, no image → Builds image successfully
□ Docker running, image exists → Uses existing image
□ GPU sharing starts → Container runs, logs stream
□ GPU sharing stops → Container stops gracefully
□ Direct inference → Works without Docker (system Python)
□ Model cache → Persists between container runs
□ Logs → Saved to ~/.torbiz/logs/ and viewable

DEBUGGING
---------
Check if Docker is running:
    docker info

Check if image exists:
    docker images torbiz-petals-macos

Check running containers:
    docker ps

View container logs:
    docker logs torbiz-petals-seeder

Enter container (if running):
    docker exec -it torbiz-petals-seeder bash

Test image manually:
    docker run --rm torbiz-petals-macos:latest python3 -c "import petals; print('ok')"

Rebuild image:
    ./build-docker-macos.sh

Clean up everything:
    docker stop torbiz-petals-seeder
    docker rmi torbiz-petals-macos:latest
    docker system prune -a

================================================================================
END OF TECHNICAL OVERVIEW
================================================================================

