#!/bin/bash
# Setup script for shell-file-operations lab
# Creates sample data files for file inspection exercises

set -e

echo "[setup] Setting up shell-file-operations lab environment"

cd /home/student

# Create data directory
mkdir -p data

# Create sample.txt
cat > data/sample.txt << 'EOF'
This is a test file
It contains multiple lines
Some lines have the word test in them
Others do not
This is another test line
The end of the sample file
EOF

# Create long.txt (20 lines for head exercise)
for i in {1..20}; do
    echo "Line $i of the long file" >> data/long.txt
done

# Create logs.txt with errors and successes
cat > data/logs.txt << 'EOF'
[INFO] Application started
[ERROR] Connection timeout
[INFO] Processing request
[ERROR] Invalid input
[SUCCESS] Task completed
[ERROR] Database connection failed
[SUCCESS] User authenticated
[INFO] Shutting down
[SUCCESS] Backup completed
EOF

# Ensure proper ownership
chown -R student:student data

echo "[setup] Shell file operations environment ready"
echo "[setup] Data directory: /home/student/data"
