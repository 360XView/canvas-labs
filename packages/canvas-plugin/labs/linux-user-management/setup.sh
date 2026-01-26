#!/bin/bash
# Setup script for linux-user-management lab
# Creates prerequisites that students will interact with

set -e

echo "[setup] Setting up linux-user-management lab environment"

# Create the developers group that students will add users to
if ! getent group developers > /dev/null 2>&1; then
    groupadd developers
    echo "[setup] Created 'developers' group"
else
    echo "[setup] 'developers' group already exists"
fi

echo "[setup] Setup complete"
