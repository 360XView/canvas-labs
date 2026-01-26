#!/bin/bash
# Setup script for user-drill lab
# Runs as root before student session starts

# Clean slate - remove any existing drill users
for user in user1 user2 user3; do
    userdel -r "$user" 2>/dev/null || true
done
