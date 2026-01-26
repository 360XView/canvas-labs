#!/bin/bash
# Python Fundamentals Lab Setup

# This script is run inside the Docker container to set up the lab environment

set -e

echo "Setting up Python Fundamentals lab..."

# The actual lab files are already mounted by the Docker container
# Just verify Python is available
python3 --version

echo "Python Fundamentals lab setup complete!"
