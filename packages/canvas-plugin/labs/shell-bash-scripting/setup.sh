#!/bin/bash
# Setup script for shell-bash-scripting lab
# Creates directories and sample files for scripting exercises

set -e

echo "[setup] Setting up shell-bash-scripting lab environment"

cd /home/student

# Create scripts directory
mkdir -p scripts

# Create a todo.txt for the && exercise
cat > todo.txt << 'EOF'
TODO: Complete the bash scripting lab
TODO: Practice writing loops
DONE: Learned about variables
TODO: Master conditionals
EOF

# Ensure proper ownership
chown -R student:student scripts todo.txt

echo "[setup] Shell bash-scripting environment ready"
echo "[setup] Scripts directory: /home/student/scripts"
