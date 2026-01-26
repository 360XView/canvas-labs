#!/bin/bash
if [ -f /tmp/testfile.txt ] && grep -q "hello world" /tmp/testfile.txt; then
    /usr/local/bin/log-check-result.sh "write-content" "passed" "Content verified"
    exit 0
fi
exit 1
