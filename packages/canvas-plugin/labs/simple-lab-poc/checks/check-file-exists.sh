#!/bin/bash
if [ -f /tmp/testfile.txt ]; then
    /usr/local/bin/log-check-result.sh "create-file" "passed" "File exists"
    exit 0
fi
exit 1
