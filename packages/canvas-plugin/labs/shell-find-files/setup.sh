#!/bin/bash
# Setup script for shell-find-files lab
# Creates directory structure and files for find exercises

set -e

echo "[setup] Setting up shell-find-files lab environment"

cd /home/student

# Create project structure
mkdir -p projects/{web,mobile,backend}
mkdir -p logs
mkdir -p data

# Create various file types
echo "Web project readme" > projects/web/readme.txt
echo "TODO: Add responsive design" > projects/web/todo.txt
echo "Mobile app config" > projects/mobile/config.txt
echo "TODO: Fix login bug" > projects/mobile/tasks.txt
echo "Backend API docs" > projects/backend/api.txt
echo "TODO: Add authentication" > projects/backend/todo.txt
echo "No todos here" > projects/readme.txt

# Create log files
echo "[INFO] Application started" > logs/app.log
echo "[ERROR] Connection failed" > logs/error.log
echo "[DEBUG] Processing request" > logs/debug.log

# Create files of different sizes
echo "small file" > data/small.txt

# Create a medium file (2KB+)
for i in {1..100}; do
    echo "This is line $i of the medium file with some padding text to increase size" >> data/medium.txt
done

# Create a large file (5KB+)
for i in {1..300}; do
    echo "This is line $i of the large file with extra padding text for size" >> data/large.txt
done

# Touch a recent file (for -mmin test)
touch data/recent.txt
echo "Recently modified" > data/recent.txt

# Ensure proper ownership
chown -R student:student projects logs data

echo "[setup] Shell find-files environment ready"
echo "[setup] Project directory: /home/student/projects"
echo "[setup] Log directory: /home/student/logs"
