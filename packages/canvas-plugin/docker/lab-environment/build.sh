#!/bin/bash
# Build script for lab environment Docker image
# Copies labs/ to build context since Docker can't access parent directories

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Clean up any previous build artifacts
rm -rf ./labs

# Copy labs from the project root
echo "Copying labs to build context..."
cp -r ../../labs ./labs

# Build the Docker image
echo "Building Docker image..."
docker build -t canvas-lab:latest .

# Clean up
rm -rf ./labs

echo "Done! Image: canvas-lab:latest"
