#!/bin/bash
# build-docker-macos.sh
# Manual Docker image build script for Torbiz macOS (CPU-Only Mode)
# Uses the exact same package installation methodology as Windows WSL CPU-only mode

set -e  # Exit on any error

echo "=========================================="
echo "Torbiz macOS Docker Image Builder"
echo "CPU-Only Mode (WSL-Compatible)"
echo "=========================================="
echo ""
echo "This script builds a Docker image for hosting"
echo "Petals model shards on macOS devices."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo ""
    echo "Please install Docker Desktop from:"
    echo "https://www.docker.com/products/docker-desktop"
    echo ""
    echo "After installation:"
    echo "1. Open Docker Desktop app"
    echo "2. Wait for whale icon in menu bar (🐳)"
    echo "3. Run this script again"
    exit 1
fi

echo "✓ Docker found: $(docker --version)"
echo ""

# Check if Docker daemon is running with retries
echo "Checking if Docker daemon is running..."
DOCKER_RUNNING=false
for i in {1..3}; do
    if docker info &> /dev/null; then
        DOCKER_RUNNING=true
        break
    fi
    if [ $i -lt 3 ]; then
        echo "  Attempt $i/3: Docker not responding, waiting 3 seconds..."
        sleep 3
    fi
done

if [ "$DOCKER_RUNNING" = false ]; then
    echo ""
    echo "❌ Error: Docker daemon is not running"
    echo ""
    echo "Please start Docker Desktop:"
    echo "1. Open Docker Desktop app from Applications"
    echo "2. Wait for whale icon in menu bar (should be steady, not animated)"
    echo "3. Run this script again"
    echo ""
    echo "💡 Tip: You can check Docker status by running:"
    echo "   docker info"
    exit 1
fi

echo "✓ Docker daemon is running"
echo ""

# Build the Docker image
echo "Building Docker image with WSL-compatible package order..."
echo "This will take 5-10 minutes on first build..."
echo ""
echo "Installation order (same as WSL):"
echo "  1. Petals (installs its own PyTorch + transformers)"
echo "  2. peft, accelerate, psutil"
echo ""

docker build \
    -f Dockerfile.macos \
    -t torbiz-petals-macos:latest \
    .

echo ""
echo "=========================================="
echo "✓ Docker image built successfully!"
echo "=========================================="
echo ""
echo "You can now use 'Share GPU' in Torbiz"
echo "(macOS users will host models using CPU)"
echo ""

# Verify the image
echo "Image details:"
docker images torbiz-petals-macos:latest
echo ""

# Test the image - verify all dependencies (same as WSL checks)
echo "Testing image dependencies..."
docker run --rm torbiz-petals-macos:latest python3 -c "import petals; import peft; import accelerate; import psutil; print('✓ All dependencies verified')"
echo ""

# Verify package versions
echo "Dependency versions:"
docker run --rm torbiz-petals-macos:latest python3 -c "import petals; import torch; print(f'Petals: {petals.__version__}, PyTorch: {torch.__version__}')"
echo ""
echo "Done!"

