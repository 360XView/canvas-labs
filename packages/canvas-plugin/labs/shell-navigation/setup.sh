#!/bin/bash
# Setup script for shell-navigation lab
# Creates practice directory structure for navigation exercises

set -e

echo "[setup] Setting up shell-navigation lab environment"

# Create practice directory structure
mkdir -p /home/student/practice/{projects,documents,downloads}
mkdir -p /home/student/practice/projects/{web,mobile,backend}

# Create some practice files
touch /home/student/practice/documents/readme.txt
touch /home/student/practice/downloads/data.csv
echo "Welcome to Shell Navigation!" > /home/student/practice/welcome.txt

# Create a hidden file for ls -a exercise
echo "This is a hidden file" > /home/student/practice/.hidden

# Ensure proper ownership
chown -R student:student /home/student/practice

echo "[setup] Shell navigation environment ready"
echo "[setup] Practice directory: /home/student/practice"
