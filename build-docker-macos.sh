#!/bin/bash
# build-docker-macos.sh
# Manual Docker image build script for Torbiz macOS

set -e  # Exit on any error

echo "=================================="
echo "Torbiz macOS Docker Image Builder"
echo "=================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo ""
    echo "Please install Docker Desktop from:"
    echo "https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✓ Docker found: $(docker --version)"
echo ""

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Error: Docker daemon is not running"
    echo ""
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo "✓ Docker daemon is running"
echo ""

# Build the Docker image
echo "Building Docker image..."
echo "This will take 5-10 minutes..."
echo ""

docker build \
    -f Dockerfile.macos \
    -t torbiz-petals-macos:latest \
    .

echo ""
echo "=================================="
echo "✓ Docker image built successfully!"
echo "=================================="
echo ""
echo "You can now use 'Share GPU' in Torbiz"
echo ""

# Verify the image
echo "Image details:"
docker images torbiz-petals-macos:latest
echo ""

# Test the image
echo "Testing image..."
docker run --rm torbiz-petals-macos:latest python3 -c "import petals; import peft; import accelerate; print('✓ All dependencies verified')"
echo ""
echo "Done!"

