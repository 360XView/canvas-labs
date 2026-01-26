#!/bin/bash
# Setup script for shell-log-analysis capstone lab
# Creates realistic log files for analysis exercises

set -e

echo "[setup] Setting up shell-log-analysis capstone environment"

cd /home/student

# Create directories
mkdir -p logs
mkdir -p analysis
mkdir -p scripts

# Generate realistic access.log (web server format)
cat > logs/access.log << 'EOF'
192.168.1.100 - - [22/Jan/2026:10:00:01 +0000] "GET /index.html HTTP/1.1" 200 1234
192.168.1.101 - - [22/Jan/2026:10:00:02 +0000] "GET /about.html HTTP/1.1" 200 2345
192.168.1.100 - - [22/Jan/2026:10:00:03 +0000] "GET /api/users HTTP/1.1" 404 567
192.168.1.102 - - [22/Jan/2026:10:00:04 +0000] "POST /api/login HTTP/1.1" 200 890
192.168.1.100 - - [22/Jan/2026:10:00:05 +0000] "GET /admin HTTP/1.1" 403 123
192.168.1.103 - - [22/Jan/2026:10:00:06 +0000] "GET /index.html HTTP/1.1" 200 1234
192.168.1.101 - - [22/Jan/2026:10:00:07 +0000] "GET /missing HTTP/1.1" 404 456
192.168.1.100 - - [22/Jan/2026:10:00:08 +0000] "GET /api/data HTTP/1.1" 500 789
192.168.1.104 - - [22/Jan/2026:10:00:09 +0000] "GET /index.html HTTP/1.1" 200 1234
192.168.1.100 - - [22/Jan/2026:10:00:10 +0000] "GET /index.html HTTP/1.1" 200 1234
192.168.1.105 - - [22/Jan/2026:10:00:11 +0000] "GET /style.css HTTP/1.1" 200 5678
192.168.1.100 - - [22/Jan/2026:10:00:12 +0000] "GET /script.js HTTP/1.1" 200 9012
192.168.1.101 - - [22/Jan/2026:10:00:13 +0000] "POST /api/submit HTTP/1.1" 200 345
192.168.1.102 - - [22/Jan/2026:10:00:14 +0000] "GET /products HTTP/1.1" 200 6789
192.168.1.100 - - [22/Jan/2026:10:00:15 +0000] "GET /checkout HTTP/1.1" 200 2345
192.168.1.103 - - [22/Jan/2026:10:00:16 +0000] "GET /nonexistent HTTP/1.1" 404 123
192.168.1.100 - - [22/Jan/2026:10:00:17 +0000] "GET /api/error HTTP/1.1" 500 456
192.168.1.101 - - [22/Jan/2026:10:00:18 +0000] "GET /help HTTP/1.1" 200 789
192.168.1.102 - - [22/Jan/2026:10:00:19 +0000] "GET /contact HTTP/1.1" 200 1234
192.168.1.100 - - [22/Jan/2026:10:00:20 +0000] "GET /index.html HTTP/1.1" 200 1234
EOF

# Generate auth.log with failed logins
cat > logs/auth.log << 'EOF'
Jan 22 10:00:01 server sshd[1234]: Failed password for admin from 192.168.1.50 port 22 ssh2
Jan 22 10:00:05 server sshd[1235]: Accepted password for alice from 192.168.1.51 port 22 ssh2
Jan 22 10:00:10 server sshd[1236]: Failed password for root from 192.168.1.52 port 22 ssh2
Jan 22 10:00:15 server sshd[1237]: Failed password for admin from 192.168.1.50 port 22 ssh2
Jan 22 10:00:20 server sshd[1238]: Accepted password for bob from 192.168.1.53 port 22 ssh2
Jan 22 10:00:25 server sshd[1239]: Failed password for guest from 192.168.1.54 port 22 ssh2
Jan 22 10:00:30 server sshd[1240]: Failed password for root from 192.168.1.52 port 22 ssh2
Jan 22 10:00:35 server sshd[1241]: Accepted password for charlie from 192.168.1.55 port 22 ssh2
Jan 22 10:00:40 server sshd[1242]: Failed password for admin from 192.168.1.50 port 22 ssh2
Jan 22 10:00:45 server sshd[1243]: Failed password for test from 192.168.1.56 port 22 ssh2
EOF

# Ensure proper ownership
chown -R student:student logs analysis scripts

echo "[setup] Shell log-analysis capstone environment ready"
echo "[setup] Log directory: /home/student/logs"
echo "[setup] Analysis output: /home/student/analysis"
echo "[setup] Scripts directory: /home/student/scripts"
