#!/bin/bash
# Setup script for shell-text-processing lab
# Creates sample data files for text processing exercises

set -e

echo "[setup] Setting up shell-text-processing lab environment"

cd /home/student

# Create data directory if it doesn't exist
mkdir -p data

# Create names.txt
cat > data/names.txt << 'EOF'
Zelda
Alice
Bob
Charlie
Diana
Eve
Frank
EOF

# Create duplicates.txt
cat > data/duplicates.txt << 'EOF'
apple
banana
apple
cherry
banana
apple
cherry
date
banana
EOF

# Create data.csv (space-separated for awk simplicity)
cat > data/data.csv << 'EOF'
Alice 25 Engineer
Bob 30 Designer
Charlie 28 Manager
Diana 32 Developer
Eve 27 Analyst
EOF

# Create errors.txt
cat > data/errors.txt << 'EOF'
error: connection failed
warning: timeout occurred
error: invalid input
info: processing complete
error: resource not found
warning: deprecated function
EOF

# Create text.txt for word frequency analysis
cat > data/text.txt << 'EOF'
the quick brown fox jumps over the lazy dog
the fox is quick and the dog is lazy
quick brown lazy fox jumps
the quick fox and the lazy dog
EOF

# Ensure proper ownership
chown -R student:student data

echo "[setup] Shell text processing environment ready"
echo "[setup] Data directory: /home/student/data"
